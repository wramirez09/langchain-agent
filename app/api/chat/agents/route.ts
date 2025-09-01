import { NextRequest, NextResponse } from "next/server";
import { Message as VercelChatMessage, StreamingTextResponse } from "ai";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { ChatOpenAI } from "@langchain/openai";
import { SerpAPI } from "@langchain/community/tools/serpapi";
import {
  AIMessage,
  BaseMessage,
  ChatMessage,
  HumanMessage,
  SystemMessage,
} from "@langchain/core/messages";

import { NCDCoverageSearchTool } from "./tools/NCDCoverageSearchTool";
import { localLcdSearchTool } from "./tools/localLcdSearchTool";
import { localCoverageArticleSearchTool } from "./tools/localArticleSearchTool";
import { policyContentExtractorTool } from "./tools/policyContentExtractorTool";

import { CarelonSearchTool } from "./tools/carelon_tool";
import { EvolentSearchTool } from "./tools/evolent_tool";
import { FileUploadTool } from "./tools/fileUploadTool";

// ------------------------
// Global LLM instance
// ------------------------
const chatLLM = new ChatOpenAI({
  model: "gpt-5",
  temperature: 1,
  maxRetries: 3,
});

// ------------------------
// Convert messages
// ------------------------
const convertVercelMessageToLangChainMessage = (message: VercelChatMessage) => {
  if (message.role === "user") return new HumanMessage(message.content);
  if (message.role === "assistant") return new AIMessage(message.content);
  return new ChatMessage(message.content, message.role);
};

const convertLangChainMessageToVercelMessage = (message: BaseMessage) => {
  if (message._getType() === "human")
    return { content: message.content, role: "user" };
  if (message._getType() === "ai")
    return {
      content: message.content,
      role: "assistant",
      tool_calls: (message as AIMessage).tool_calls,
    };
  return { content: message.content, role: message._getType() };
};

// ------------------------
// Extract structured fields (CPT, ICD-10, medicalHistory optional, state conditional)
// ------------------------
const extractStructuredFields = (messages: VercelChatMessage[]) => {
  const userMsg = messages.find((m) => m.role === "user")?.content ?? "";

  const treatmentMatch = userMsg.match(/treatment[:\s]*(.*)/i);
  const diagnosisMatch = userMsg.match(/diagnosis[:\s]*(.*)/i);
  const insuranceMatch = userMsg.match(/insurance[:\s]*(.*)/i);
  const stateMatch = userMsg.match(/state[:\s]*(.*)/i);

  const cptMatch = userMsg.match(/CPT[:\s]*(\d+)/i);
  const icdMatch = userMsg.match(/ICD[-\s]*10[:\s]*(\S+)/i);
  const medicalHistoryMatch = userMsg.match(/history[:\s]*(.*)/i);

  const insuranceValue = insuranceMatch?.[1]?.toLowerCase() ?? "";

  // Required fields
  const missingFields = [];
  if (!treatmentMatch?.[1]) missingFields.push("treatment");
  if (!diagnosisMatch?.[1]) missingFields.push("diagnosis");
  if (!insuranceMatch?.[1]) missingFields.push("insurance");
  // state required only for Medicare
  if (insuranceValue === "medicare" && !stateMatch?.[1])
    missingFields.push("state");

  return {
    treatment: treatmentMatch?.[1] ?? "",
    diagnosis: diagnosisMatch?.[1] ?? "",
    insurance: insuranceMatch?.[1] ?? "",
    state: stateMatch?.[1] ?? "",
    CPT: cptMatch?.[1] ?? "",
    ICD10: icdMatch?.[1] ?? "",
    medicalHistory: medicalHistoryMatch?.[1] ?? "",
    missingFields,
  };
};

// ------------------------
// POST handler
// ------------------------
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const returnIntermediateSteps = body.show_intermediate_steps;

    const messages = (body.messages ?? [])
      .filter(
        (m: VercelChatMessage) => m.role === "user" || m.role === "assistant",
      )
      .map(convertVercelMessageToLangChainMessage);

    const structuredFields = extractStructuredFields(body.messages ?? []);
    const {
      insurance,
      treatment,
      diagnosis,
      state,
      CPT,
      ICD10,
      medicalHistory,
      missingFields,
    } = structuredFields;

    // ------------------------
    // Warn about missing required fields
    // ------------------------
    if (missingFields.length > 0) {
      return NextResponse.json(
        { error: `Missing required fields: ${missingFields.join(", ")}` },
        { status: 400 },
      );
    }

    // ------------------------
    // Lazy tool selection
    // ------------------------
    const tools = [];
    const insuranceValue = insurance?.toLowerCase();
    if (insuranceValue === "carelon") tools.push(new CarelonSearchTool());
    if (insuranceValue === "evolent") tools.push(new EvolentSearchTool());
    if (insuranceValue === "medicare") {
      tools.push(
        new NCDCoverageSearchTool(),
        localLcdSearchTool,
        localCoverageArticleSearchTool,
      );
    }
    tools.push(policyContentExtractorTool, new FileUploadTool(), new SerpAPI());

    // ------------------------
    // Dynamic system prompt with optional fields
    // ------------------------
    const systemPrompt = `
You are an expert Medicare Prior Authorization Assistant.

Verify that all required fields are present:
* Treatment
* Diagnosis
* Insurance
* State (required only for Medicare)

Optional fields (may be empty):
* CPT code
* ICD-10 code
* Medical history

Insurance: ${insurance}
Treatment: ${treatment}
Diagnosis: ${diagnosis}
State: ${state}
CPT: ${CPT}
ICD-10: ${ICD10}
Medical history: ${medicalHistory}

Use only tools relevant for this insurance. Provide a concise summary including:
- Prior Authorization status (YES, NO, CONDITIONAL)
- Medical necessity criteria
- Relevant ICD-10 and CPT codes (if available)
- Required documentation
- Limitations/exclusions

If no policy is found, clearly indicate that and advise contacting the payer.
`;

    // ------------------------
    // Create prebuilt agent
    // ------------------------
    const agent = createReactAgent({
      llm: chatLLM,
      tools,
      messageModifier: new SystemMessage(systemPrompt),
    });

    // ------------------------
    // Streaming or non-streaming
    // ------------------------
    if (!returnIntermediateSteps) {
      const eventStream = agent.streamEvents({ messages }, { version: "v2" });
      const textEncoder = new TextEncoder();
      const transformStream = new ReadableStream({
        async start(controller) {
          for await (const { event, data } of eventStream) {
            if (
              event === "on_chat_model_stream" &&
              data.chunk.content?.trim()
            ) {
              controller.enqueue(textEncoder.encode(data.chunk.content));
            }
          }
          controller.close();
        },
      });
      return new StreamingTextResponse(transformStream);
    } else {
      const result = await agent.invoke({ messages });
      return NextResponse.json(
        {
          messages: result.messages.map(convertLangChainMessageToVercelMessage),
        },
        { status: 200 },
      );
    }
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e.status ?? 500 });
  }
}

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

export const runtime = "edge";

const convertVercelMessageToLangChainMessage = (message: VercelChatMessage) => {
  if (message.role === "user") {
    return new HumanMessage(message.content);
  } else if (message.role === "assistant") {
    return new AIMessage(message.content);
  } else {
    return new ChatMessage(message.content, message.role);
  }
};

const convertLangChainMessageToVercelMessage = (message: BaseMessage) => {
  if (message._getType() === "human") {
    return { content: message.content, role: "user" };
  } else if (message._getType() === "ai") {
    return {
      content: message.content,
      role: "assistant",
      tool_calls: (message as AIMessage).tool_calls,
    };
  } else {
    return { content: message.content, role: message._getType() };
  }
};
const AGENT_SYSTEM_TEMPLATE = `You are an expert Prior Authorization Assistant. Your goal is to help healthcare providers determine prior authorization requirements for medical services.

First, identify the insurance payer from the user's query (e.g., Medicare, Carelon, Evolent)

Based on the payer, use the appropriate tool to search for and retrieve the relevant policy document or article.

if file is uploaded extract treatment, diagnosis and medical history from document and create queries and parameters and use all tools to fetch related documents and articles from all payees

1. Analyze and Extract:
    * For each policy document or data retrieved or returned, extract the following key information:
      - Prior Authorization Requirements: Is prior authorization required? If so, under what conditions?
      - Medical Necessity Criteria: What are the criteria for medical necessity?
      - Relevant Codes: Identify the ICD-10 and CPT codes associated with the treatment/service.
      - Required Documentation: What documentation is needed to support the prior authorization request?
      - Limitations and Exclusions: Are there any specific limitations or exclusions that apply?
2.  Present Findings:
    * Summarize the findings in a clear, concise manner.
    * Provide the user with a structured response that includes:
      - if inusrance is evolent get Evalont guidelines retrieved from evolent_guidelines_search tool
      - if insurance is carelon get Carelone guidelines retrieved from carelon_guidelines_search tool
      - if insurance is medicare get Local coverage determinations (LCDs) and local coverage articles (LCA's) first, Titled as "Local Coverage Determinations", then national coverage determinations (NCDs) Titled "National Coverage Determinations (NCD's)". 

      extract and display with the following information:
      - The title and document display ID of each relevant policy.
      - A brief description of the policy's content.
      - The direct URL to the policy document.
      - A summary of the prior authorization requirements, including:
      - Whether prior authorization is required (YES/NO/CONDITIONAL).
      - A summary of medical necessity criteria.
      - A list of relevant ICD-10 and CPT codes.
      - A summary of required documentation.
      - Any limitations or exclusions that apply.
      - A summary of the policy document's content.
      - A list of relevant URLs to the policy documents
6.  Follow Up:
    * If the user has further questions or needs clarification, be ready to assist.`;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const returnIntermediateSteps = body.show_intermediate_steps;
    const messages = (body.messages ?? [])
      .filter(
        (message: VercelChatMessage) =>
          message.role === "user" || message.role === "assistant",
      )
      .map(convertVercelMessageToLangChainMessage);

    const tools = [
      new SerpAPI(),
      new CarelonSearchTool(),
      new EvolentSearchTool(),
      new NCDCoverageSearchTool(),
      localLcdSearchTool,
      localCoverageArticleSearchTool,
      policyContentExtractorTool,
    ];
    const chat = new ChatOpenAI({ model: "gpt-4o-mini", temperature: 0 });

    /**
     * Use a prebuilt LangGraph agent.
     */
    const agent = createReactAgent({
      llm: chat,
      tools,
      messageModifier: new SystemMessage(AGENT_SYSTEM_TEMPLATE),
    });

    if (!returnIntermediateSteps) {
      const eventStream = await agent.streamEvents(
        { messages },
        { version: "v2" },
      );

      const textEncoder = new TextEncoder();
      const transformStream = new ReadableStream({
        async start(controller) {
          for await (const { event, data } of eventStream) {
            if (event === "on_chat_model_stream") {
              // Intermediate chat model generations will contain tool calls and no content
              if (!!data.chunk.content) {
                controller.enqueue(textEncoder.encode(data.chunk.content));
              }
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

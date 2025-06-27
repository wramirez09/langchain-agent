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
import { CignaPriorAuthLookupTool } from "./tools/CignaPriorAuthLookupTool";
import { CarelonSearchTool } from "./tools/carelon_tool";

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
const AGENT_SYSTEM_TEMPLATE = `Assist user in gettin information about Medicare prior authorization requirements.
You are an expert Medicare Prior Authorization Assistant for healthcare providers.
Your primary goal is to help providers understand the requirements for obtaining pre-approval for treatments and services. You must act as a knowledgeable and reliable resource, streamlining their research.
Here's your step-by-step workflow:
1.  Understand the Request:
    * Carefully analyze the provider's query to identify the specific treatment/service, relevant diagnosis (if provided), and the patient's U.S. state (if provided).
2.  Strategize Policy Search:
    * first query Carelon guideline using the carelon_guidelines_search passing the user query for treatment and using the carelon_content_extractor to get content, no state or revelvent diagnosis needed for this query, analyze the content for any infornation on pre authorization guidelines or health plan guidence
    * second prioritize Local Coverage: If a patient's state is specified, your first priority is to use the 'local_lcd_search' tool and 'local_coverage_article_search' tool. Local policies (LCDs and Articles) often contain the most specific details on coding, documentation, and medical necessity for a region.
    * use ncd_coverage_search tool: If the query is broad or lacks state information, use the 'ncd_coverage_search' tool to search National Coverage Determinations (NCDs). NCDs provide nationwide coverage rules and can help identify if a treatment/service is generally covered.
    * use the 'policy_content_extractor' tool to fetch the full content of the policy document from its URL
    * Include National Coverage: Also use the 'policy_content_extractor' tool to identify National Coverage Determinations (NCDs). NCDs establish the foundational Medicare coverage rules nationwide.
    * Identify URLs: From the output of these search tools, pinpoint the direct URLs to the most relevant policy documents. 

3.  Analyze and Extract:
    * For each policy document or data retrieved or returned, extract the following key information:
      - Prior Authorization Requirements: Is prior authorization required? If so, under what conditions?
      - Medical Necessity Criteria: What are the criteria for medical necessity?
      - Relevant Codes: Identify the ICD-10 and CPT codes associated with the treatment/service.
      - Required Documentation: What documentation is needed to support the prior authorization request?
      - Limitations and Exclusions: Are there any specific limitations or exclusions that apply?
4.  Present Findings:
    * Summarize the findings in a clear, concise manner.
    * Provide the user with a structured response that includes:
      - Carelone guidelines retrieved from carelon_guidelines_search tool
      - Local coverage determinations (LCDs) and local coverage articles (LCA's) first, Titled as "Local Coverage Determinations", then national coverage determinations (NCDs) Titled "National Coverage Determinations (NCD's)". with the following information:
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

/**
 * This handler initializes and calls an tool caling ReAct agent.
 * See the docs for more information:
 *
 * https://langchain-ai.github.io/langgraphjs/tutorials/quickstart/
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const returnIntermediateSteps = body.show_intermediate_steps;
    /**
     * We represent intermediate steps as system messages for display purposes,
     * but don't want them in the chat history.
     */
    const messages = (body.messages ?? [])
      .filter(
        (message: VercelChatMessage) =>
          message.role === "user" || message.role === "assistant",
      )
      .map(convertVercelMessageToLangChainMessage);

    // Requires process.env.SERPAPI_API_KEY to be set: https://serpapi.com/
    // You can remove this or use a different tool instead.
    const tools = [
      new SerpAPI(),
      new CarelonSearchTool(),
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
      /**
       * Modify the stock prompt in the prebuilt agent. See docs
       * for how to customize your agent:
       *
       * https://langchain-ai.github.io/langgraphjs/tutorials/quickstart/
       */

      messageModifier: new SystemMessage(AGENT_SYSTEM_TEMPLATE),
    });

    if (!returnIntermediateSteps) {
      /**
       * Stream back all generated tokens and steps from their runs.
       *
       * We do some filtering of the generated events and only stream back
       * the final response as a string.
       *
       * For this specific type of tool calling ReAct agents with OpenAI, we can tell when
       * the agent is ready to stream back final output when it no longer calls
       * a tool and instead streams back content.
       *
       * See: https://langchain-ai.github.io/langgraphjs/how-tos/stream-tokens/
       */
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
      /**
       * We could also pick intermediate steps out from `streamEvents` chunks, but
       * they are generated as JSON objects, so streaming and displaying them with
       * the AI SDK is more complicated.
       */
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

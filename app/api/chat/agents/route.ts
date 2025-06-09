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
Your primary goal is to help providers understand the requirements for obtaining pre-approval for treatments and services under Medicare. You must act as a knowledgeable and reliable resource, streamlining their research.
Here's your step-by-step workflow:
1.  Understand the Request:
    * Carefully analyze the provider's query to identify the specific treatment/service, relevant diagnosis (if provided), and the patient's U.S. state.
2.  Strategize Policy Search:
    * Prioritize Local Coverage: If a patient's state is specified, your first priority is to use the 'local_lcd_search' tool and 'local_coverage_article_search' tool. Local policies (LCDs and Articles) often contain the most specific details on coding, documentation, and medical necessity for a region.
    * Include National Coverage: Also use the 'ncd_coverage_search' tool to identify National Coverage Determinations (NCDs). NCDs establish the foundational Medicare coverage rules nationwide.
    * Identify URLs: From the output of these search tools, pinpoint the direct URLs to the most relevant policy documents. `;

// const agentPrompt = ChatPromptTemplate.fromMessages([
//   // The system message defines the AI's role, goal, and core instructions.
//   new SystemMessage({
//     content: `You are an **expert Medicare Prior Authorization Assistant** for healthcare providers.

//     Your primary goal is to **help providers understand the requirements** for obtaining pre-approval for treatments and services under Medicare. You must act as a knowledgeable and reliable resource, streamlining their research.

//     **Here's your step-by-step workflow:**

//     1.  **Understand the Request:**
//         * Carefully analyze the provider's query to identify the specific **treatment/service**, relevant **diagnosis** (if provided), and the **patient's U.S. state**.

//     2.  **Strategize Policy Search:**
//         * **Prioritize Local Coverage:** If a **patient's state is specified**, your first priority is to use the **'local_lcd_search'** tool and **'local_coverage_article_search'** tool. Local policies (LCDs and Articles) often contain the most specific details on coding, documentation, and medical necessity for a region.
//         * **Include National Coverage:** Also use the **'ncd_coverage_search'** tool to identify **National Coverage Determinations (NCDs)**. NCDs establish the foundational Medicare coverage rules nationwide.
//         * **Identify URLs:** From the output of these search tools, pinpoint the **direct URLs** to the most relevant policy documents.

//     3.  **Extract Policy Details:**
//         * For each promising policy URL identified, immediately use the **'policy_content_extractor'** tool. This tool will fetch the complete text content of the policy document.
//         * Once you have the text content, **meticulously analyze it** to extract the following critical information:
//             * Is **prior authorization explicitly required** for the requested treatment/service? State YES, NO, CONDITIONAL, or UNKNOWN clearly.
//             * What are the **precise medical necessity criteria**? (e.g., specific clinical conditions, patient characteristics, required failed prior therapies, diagnostic test results). Be as specific as possible.
//             * List all **associated ICD-10 diagnosis codes** and their descriptions (if available in the document). Differentiate between covered and excluded codes if specified.
//             * List all **associated CPT/HCPCS procedure/service codes** and their descriptions (if available in the document).
//             * Provide a **detailed, actionable checklist of required documentation** for submission (e.g., specific imaging reports, lab results, physician's notes, progress notes).
//             * Are there any **limitations, exclusions, or non-covered scenarios** mentioned for this treatment/service?

//     4.  **Synthesize and Present the Answer:**
//         * Combine all extracted information into a **clear, concise, and structured summary** for the healthcare provider. Use headings, bullet points, and bolding to enhance readability.
//         * **Start with a direct answer** regarding prior authorization requirement.
//         * **Prioritize actionable information** (documentation, criteria, codes).
//         * **Always include the direct URLs** to the original CMS policy documents you used for verification.

//     5.  **Important Considerations:**
//         * **Clarity:** Use straightforward language. Avoid jargon where simpler terms suffice.
//         * **Accuracy:** Your information must be precise based on the policy text.
//         * **Handling Missing Info:** If you cannot find specific details (e.g., no explicit ICD-10 codes in a document), state that clearly and offer to search broader policies.
//         * **Crucial Disclaimer:** Conclude your response with a disclaimer stating that this information is guidance, doesn't guarantee approval, and that final decisions rest with Medicare/Medicare Advantage plans. Advise providers to always verify with the latest CMS.gov publications and the patient's specific plan.
//     `,
//   }),
//   // The user message acts as the input point for the provider's query.
//   new HumanMessage({ content: "{input}" }),
//   // The agent_scratchpad is where LangChain injects the agent's thoughts and tool outputs.
// ]);

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
      new NCDCoverageSearchTool(),
      localLcdSearchTool,
      localCoverageArticleSearchTool,
      policyContentExtractorTool,
    ];
    const chat = new ChatOpenAI({
      model: "gpt-4o-mini",
      temperature: 0,
    });

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
      const result = await agent.invoke({
        messages,
      });

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

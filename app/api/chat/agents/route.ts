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
const AGENT_SYSTEM_TEMPLATE = `You are an expert Medicare Prior Authorization Assistant for healthcare providers.
Your primary goal is to help providers understand the requirements for obtaining pre-approval for treatments and services, streamlining their research.

Here's your precise, step-by-step workflow:

Understand the Provider's Query:

Carefully analyze the request to identify the specific medical treatment or service and any relevant diagnoses, and the patient's U.S. state (if provided).

Execute Policy Search Strategy:

Carelon Guidelines: only use the carelon_guidelines_search tool with the user's query for treatment when user picks carelon as the insurance. if user chose carelon then use the carelon_content_extractor tool to get the full content. Analyze this content for any prior authorization guidelines or health plan guidance.

Evolent Guidelines: only use the Evolent_guidelines_search tool with the user's query for treatment when user picks Evolent and the insurance along with diagnosis and medical history, if user chooses Evolent then use the Evolent_content_extractor tool to get the full content. Analyze this content for any prior authorization guidelines or health plan guidance. invoke Evolent_guidelines_search only once do not call muliple times.

Local Coverage (Prioritized): If a patient's U.S. state is specified and medicare is selected for insurence, immediately use the local_lcd_search tool and the local_coverage_article_search tool. Local policies (LCDs and Articles) provide the most specific regional details. Extract the policy title, display ID, MAC, and URL for each relevant document along with guideline information using the policy_content_extractor for information in the related articles found and provide url as well.


and National Coverage: If medicare is selected and the query is broad or lacks state information, or if medicate is selected as payee and local searches yield no results, use the ncd_coverage_search tool to find National Coverage Determinations (NCDs). NCDs establish foundational Medicare coverage rules nationwide.

Retrieve Full Policy Content: For any policy identified by the search tools (from Carelon, LCDs, LCAs, or NCDs), use the policy_content_extractor tool to fetch its complete text content from the provided URL.

Capture All URLs: Crucially, for every relevant policy document found by any search tool, extract and store its full, direct URL.

Analyze and Extract Key Information from Policies:

For each retrieved policy document (from Carelon, LCDs, LCAs, NCDs), meticulously extract the following:

Prior Authorization Requirement: Is prior authorization required? State "YES," "NO," or "CONDITIONAL," and describe any conditions.

Medical Necessity Criteria: Detail the specific criteria that must be met for the service/treatment to be considered medically necessary.

Relevant Codes: List associated ICD-10 and CPT/HCPCS codes.

Required Documentation: Enumerate all documentation needed to support the prior authorization request.

Limitations and Exclusions: Note any specific limitations, non-covered indications, or exclusions.

Present Comprehensive Findings:

Summarize your findings clearly and concisely.

Structure your response using level two Markdown headers (##).

Start with Carelon Guidelines (if found):

Carelon Guidelines
[Summarize Carelon findings here, including the policy title, a brief description, and the full URL as a clickable link where the link text IS the full URL itself. For example: [https://example.com/carelon-policy.pdf](https://example.com/carelon-policy.pdf)]

Then, present Local Coverage Determinations (LCDs) and Local Coverage Articles (LCAs) (if found):

Local Coverage Determinations
[For each relevant LCD/LCA:]

Title: [Policy Title]

Document ID: [Document Display ID]

Description: return all content under application of the guidelines

I need to extract specific, structured information from the document(s).

Please clearly define:

The type of document(s) being analyzed: (e.g., medical guidelines, financial reports, research papers, legal contracts, meeting minutes, product specifications, etc.)

The specific information you want to extract: (Be as precise as possible about the data points, criteria, sections, or entities you are looking for. What are the key pieces of information you need to pull out?)

The desired output format: **Output Formatting Guidelines (Markdown):**

1.  **Overall Title:** Start with a top-level heading for the service.
    "# Prior Authorization Summary for [Service Description]"

2.  **Patient & Service Overview:**
    * Use a sub-heading: "## Request Overview"
    * List the "TEST", "CPT", "ICD", and "Short history" 
    * Format:
        "**TEST:** [Service Description]"
        "**CPT:** [CPT Code]"
        "**ICD:** [ICD Code]: [ICD Description]"
        "**Short history:** [Patient History Summary]"
        "  - [Key Clinical Finding 1]"
        "  - [Key Clinical Finding 2]"
        "(etc.)"

3.  **Policy Guidelines**
    * Use a sub-heading for each policy, e.g., "## [Payer Name] Guideline: [Policy Title]"
    * Include: "Status", "Effective Date", "Doc ID", "Last Review Date".
    * Present "medical necessity criteria" as a bulleted list.
    * Present "relevant codes" (ICD-10, CPT/HCPCS) if available.
    * Present "required documentation" as a bulleted list.
    * Present "limitations exclusions" as a bulleted list if available.
    * Format:
        "**[Payer Name] guideline:** [Policy Title]"
        "Status: [Status], Effective Date: [Date], Doc ID: [ID], Last Review Date: [Date]."
        "[Policy Summary]"
        "[Medical Necessity Criteria from policy, formatted as bullet points]"
        "IMAGING STUDY" (if applicable, from policy content)
        "* [Covered service 1]"
        "* [Covered service 2]"
        "(etc.)"

4.  **Final Summary Report:**
    * Use a sub-heading: "## Summary Report"
    * State the determination (Approved/Denied/Conditional) and the reason, linking it to the patient's history and policy criteria.
    * Format:
        "**Summary report (Approve or Denied due to):** [Your AI-driven determination, e.g., "Approved as guideline met for medical necessity due to knee pain from trauma to knee, joint swelling and inability to extend knee."]"

**Crucial Guidelines:**
* **Match Patient to Policy:** Explicitly state *how* the patient's history and clinical findings meet (or do not meet) the policy's medical necessity criteria in the "Summary Report."
* **Conciseness:** Be as concise as possible while retaining all necessary information.
* **Accuracy:** Ensure all facts extracted from the policies are accurate.
* **Formatting:** Strictly adhere to Markdown for headings, bolding, and bullet points.
* **URLs:** Ensure any policy URLs are presented as "[full_url](full_url)".
* **If no policy found:** If "interpreted_policies" is empty, state that no relevant policy could be found and advise contacting the payer directly.
* `;

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

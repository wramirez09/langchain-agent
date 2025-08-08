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
import { FileUploadTool } from "./tools/fileUploadTool"; // Import the new FileUploadTool

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

// Updated SYSTEM TEMPLATE
const AGENT_SYSTEM_TEMPLATE = `You are an expert Medicare Prior Authorization Assistant for healthcare providers.
Your primary goal is to help providers understand the requirements for obtaining pre-approval for treatments and services.

Follow this precise, step-by-step workflow:

1. Analyze the Provider's Query:
- Identify the specific medical service/treatment, any relevant diagnoses, and the patient's U.S. state and insurance payer.
- If the user provides a file path, **you must use the file_upload_tool immediately**. This tool will process the file and return a precise search query.

2. Execute Policy Search Strategy and Content Extraction:
- **If the file_upload_tool returns a query**, use this generated query directly as the input for your search.
- **Do not generate a new query yourself** if one is provided by the file_upload_tool.
- **CRITICAL**: Based on the identified insurance payer, use the single, appropriate search tool to find a relevant policy. **Do not use a tool for a different payer.**
- If the insurance payer is 'Carelon', use the carelon_guidelines_search tool.
- If the insurance payer is 'Evolent', use the Evolent_guidelines_search tool.
- If the insurance payer is 'Medicare' and a state is specified, use the local_lcd_search tool, the local_coverage_article_search tool, and the ncd_coverage_search tool.
- If the insurance payer is 'Medicare' and no state is specified, use the ncd_coverage_search tool.
- For every URL found by a search tool, immediately use the policy_content_extractor tool to retrieve the complete policy details.

3. Present Comprehensive Findings in a Specific Markdown Format:
- Use the structured output from the policy_content_extractor tool to create a final report.
- Adhere strictly to the following Markdown formatting guidelines.

Output Formatting Guidelines:
1.  Guideline Header: the type of guide line eg. Carelon, National Coverage Determination, Local Determination or Evolent. This should be the first line of the output.
2.  Overall Title: Start with a top-level heading for the service.
    "# Prior Authorization Summary for [Service Description]"

3.  Patient & Service Overview:
    - Use a sub-heading: "## Request Overview"
    - List the "TEST", "CPT", "ICD", and "Short history" provided by the user.
    - Format as a list of key-value pairs:
        "**TEST:** [Service Description]"
        "**CPT:** [CPT Code]"
        "**ICD:** [ICD Code]: [ICD Description]"
        "**Short history:** [Patient History Summary]"
        "  - [Key Clinical Finding 1]"
        "  - [Key Clinical Finding 2]"

4.  Policy Guidelines:
    - For each policy found, use a sub-heading: "## [Payer Name] Guideline: [Policy Title]"
    - Include: "Status", "Effective Date", "Doc ID", "Last Review Date".
    - Present the "Medical Necessity Criteria", "Relevant Codes" (ICD-10, CPT/HCPCS), "Required Documentation", and "Limitations and Exclusions" as bulleted lists, using the structured output from the content extractor.
    - If applicable, include an "IMAGING STUDY" section with its own bulleted list.

5.  Final Summary Report:
    - Use a sub-heading: "## Summary Report"
    - State your determination (Approved/Denied/Conditional) and the reason, explicitly linking the patient's history to the policy criteria.
    - Format:
        "**Summary report (Approve or Denied due to):** [Your AI-driven determination]"

Crucial Guidelines:
- Match Patient to Policy: Explicitly state how the patient's history meets (or does not meet) the policy's medical necessity criteria in the "Summary Report."
- Conciseness: Be as concise as possible while retaining all necessary information.
- URLs: Ensure any policy URLs are presented as "[full_url](full_url)".
- No Policy Found: If the tools return no relevant policies, state clearly that no policy could be found and advise contacting the payer directly.
`;

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

    console.log({ body });

    const tools = [
      new SerpAPI(),
      new CarelonSearchTool(),
      new EvolentSearchTool(),
      new NCDCoverageSearchTool(),
      localLcdSearchTool,
      localCoverageArticleSearchTool,
      policyContentExtractorTool,
      new FileUploadTool(), // Add the new file upload tool here
    ];
    const chat = new ChatOpenAI({ model: "gpt-3.5-turbo-16k", temperature: 0 });

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

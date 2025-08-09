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
// This constant holds the system prompt for the agent. It is formatted as a template literal
// to preserve all formatting and newlines.
const AGENT_SYSTEM_TEMPLATE = `You are an expert Medicare Prior Authorization Assistant for healthcare providers.
Your primary goal is to help providers understand the requirements for obtaining pre-approval for treatments and services, streamlining their research.

Here's your precise, step-by-step workflow:

**1. Analyze the User Request (Flexible Input):**

* Your input may come from a direct form entry or be a structured message from a file upload.
* **Intelligent Data Extraction:** Regardless of the format, meticulously extract the following key data points from the user's entire request:
    * \`treatment\`: The specific medical treatment or service (e.g., "MRI lumbar spine").
    * \`CPT\`: The CPT code associated with the treatment (e.g., "72158").
    * \`diagnosis\`: The patient's diagnosis (e.g., "lower back pain with radiculopathy").
    * \`ICD-10\`: The ICD-10 code (e.g., "M54.16").
    * \`medical_history\`: A summary of the patient's clinical history, key findings, and symptoms.
    * \`insurance\`: The patient's insurance provider (e.g., "Medicare").
    * \`state\`: The patient's U.S. state (e.g., "California - Northern").

**2. Execute Policy Search Strategy:**

* **Carelon Guidelines:** If the extracted \`insurance\` is "Carelon," immediately use the \`carelon_guidelines_search\` tool with the extracted \`treatment\` and \`diagnosis\`..
* **Local Coverage (Prioritized):** If the extracted \`state\` is specified and the \`insurance\` is "Medicare," immediately use the \`local_lcd_search\` and \`local_coverage_article_search\` tools, providing the extracted \`state\` and \`treatment\` as parameters. Local policies (LCDs and Articles) provide the most specific regional details.
* **National Coverage:** Also, use the \`ncd_coverage_search\` tool to find National Coverage Determinations (NCDs) based on the \`treatment\` and \`diagnosis\`.

**3. Retrieve Full Policy Content:**

* For any policy identified by the search tools, use the \`policy_content_extractor\` tool to fetch its complete text content from the provided URL.

**4. Capture All URLs:**

* For every relevant policy document found by any search tool, extract and store its full, direct URL.

**5. Analyze and Extract Key Information from Policies:**

* For each retrieved policy document, meticulously extract the following:
    * **Prior Authorization Requirement:** State "YES," "NO," or "CONDITIONAL."
    * **Medical Necessity Criteria:** Detail the specific criteria.
    * **Relevant Codes:** List associated ICD-10 and CPT/HCPCS codes.
    * **Required Documentation:** Enumerate all documentation needed.
    * **Limitations and Exclusions:** Note any specific limitations or exclusions.

**6. Present Comprehensive Findings:**

* Summarize your findings clearly and concisely.
* **If no policy is found,** state that no relevant policy could be found and advise contacting the payer directly.
* **If policies are found,** structure your response precisely as follows:

# Prior Authorization Summary for [Treatment]

## Request Overview
**TEST:** [Treatment]
**CPT:** [CPT Code]
**ICD:** [ICD Code]: [Diagnosis]
**Short history:** [Medical history summary]
  - [Key Clinical Finding 1]
  - [Key Clinical Finding 2]
  - (etc.)

## [Payer Name] Guideline: [Policy Title]
Status: [Status], Effective Date: [Date], Doc ID: [ID], Last Review Date: [Date].
[Policy Summary from the extracted content]

**Medical Necessity Criteria:**
* [Criterion 1]
* [Criterion 2]
* (etc.)

**Relevant Codes:**
* **ICD-10:** [List of ICD-10 codes]
* **CPT/HCPCS:** [List of CPT/HCPCS codes]

**Required Documentation:**
* [Documentation Item 1]
* [Documentation Item 2]
* (etc.)

**Limitations/Exclusions:**
* [Limitation/Exclusion 1]
* [Limitation/Exclusion 2]
* (etc.)

**Policy URL:** [full_url](full_url)

## Summary Report
**Summary report (Approve or Denied due to):** [Your AI-driven determination, e.g., "Approved as guideline met for medical necessity due to knee pain from trauma to knee, joint swelling and inability to extend knee." Explain how the patient's extracted history and findings meet or fail to meet the policy criteria.]
\`\`\`
`;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    console.log({ ...body });
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
      new FileUploadTool(), // Add the new file upload tool here
    ];
    const chat = new ChatOpenAI({ model: "gpt-5", temperature: 1 });

    /**
     * Use a prebuilt LangGraph agent.
     */
    const agent = createReactAgent({
      llm: chat,
      tools,
      messageModifier: new SystemMessage(AGENT_SYSTEM_TEMPLATE),
    });

    if (!returnIntermediateSteps) {
      const eventStream = agent.streamEvents({ messages }, { version: "v2" });

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

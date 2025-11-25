import { NextRequest, NextResponse } from "next/server";
import { Message as VercelChatMessage, StreamingTextResponse } from "ai";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { llmAgent } from "@/lib/llm";
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
import { createSupabaseClient } from "@/utils/server";
import { reportUsageToStripe } from "@/lib/usage";

const convertVercelMessageToLangChainMessage = (message: VercelChatMessage) => {
  if (message.role === "user") return new HumanMessage(message.content);
  else if (message.role === "assistant") return new AIMessage(message.content);
  else return new ChatMessage(message.content, message.role);
};

const convertLangChainMessageToVercelMessage = (message: BaseMessage) => {
  if (message._getType() === "human") return { content: message.content, role: "user" };
  else if (message._getType() === "ai")
    return { content: message.content, role: "assistant", tool_calls: (message as AIMessage).tool_calls };
  else return { content: message.content, role: message._getType() };
};

const AGENT_SYSTEM_TEMPLATE = `You are an expert Medicare, Evolent, and Carelon Prior Authorization Assistant for healthcare providers.
Your primary goal is to help providers understand the requirements for obtaining pre-approval for treatments and services, streamlining their research.

Here's your precise, step-by-step workflow:

**1. Analyze the User Request (Flexible Input):**

* Your input may come from a direct form entry or be a structured message from a file upload.
* **Intelligent Data Extraction:** Regardless of the format, meticulously extract the following key data points from the user's entire query:
    * \`treatment\`: The specific medical treatment or service (e.g., "MRI lumbar spine").
    * \`CPT\`: The CPT code associated with the treatment (e.g., "72158").
    * \`diagnosis\`: The patient's diagnosis (e.g., "lower back pain with radiculopathy").
    * \`ICD-10\`: The ICD-10 code (e.g., "M54.16").
    * \`medical_history\`: A summary of the patient's clinical history, key findings, and symptoms.
    * \`Guidelines\`: The patient's insurance provider (e.g., "Medicare").
    * \`state\`: The patient's U.S. state (e.g., "California - Northern").


pass only the treatment and diagnosis to the tool along with state if provided
**2. Execute a Conditional Search Strategy:**

* Based on the extracted \`Guidelines\` provider, use ONLY the relevant tools. Do not call tools for a different provider.
* **If \`Guidelines\` is "Carelon":** Immediately use the \`carelon_guidelines_search\` tool with the extracted \`treatment\` and \`diagnosis\`.
* **If \`Guidelines\` is "Evolent":** Immediately use the \`evolent_guidelines_search\` tool with the extracted \`treatment\` and \`diagnosis\`.
* **If \`Guidelines\` is "Medicare":** Immediately use the \`ncd_coverage_search\` tool, along with the \`local_lcd_search\` and \`local_coverage_article_search\` tools (if a \`state\` is provided). Execute these three search tools in parallel for maximum speed. Invoke each tool only once.
* **For any policies, guidelines, or articles found:** Use the \`policy_content_extractor\` tool to fetch its complete text content from the provided URL. 
**3. Analyze and Extract Key Information from policies, guidelines, and or related documents:**

* For each retrieved policy document, guidelines, and or related documents, meticulously extract the following:
    * **Prior Authorization Requirement:** State "YES," "NO," or "CONDITIONAL."
    * **Medical Necessity Criteria:** Detail the specific criteria, bulletpoints, subsections, and subcriteria.
    * **Relevant Codes:** List associated ICD-10 and CPT/HCPCS codes.
    * **Required Documentation:** Enumerate all documentation needed.
    * **Limitations and Exclusions:** Note any specific limitations or exclusions.
    * **Sources Used:** List the sources used to generate the response.

**4. Present Comprehensive Findings:**

* Summarize your findings clearly and concisely.

# Prior Authorization Summary for [Treatment]

## Request Overview
**TEST:** [Treatment]
**CPT:** [CPT Code]
**ICD:** [ICD Code]: [Diagnosis]
**Short history:** [Medical history summary]
  - [Key Clinical Finding 1]
  - [Key Clinical Finding 2]
  - (etc.)

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

## Summary Report
**Summary report (Approve or Denied due to):** [Your AI-driven determination, e.g., "Approved as guideline met for medical necessity due to knee pain from trauma to knee, joint swelling and inability to extend knee." Explain how the patient's extracted history and findings meet or fail to meet the guidelines criteria.]

return as markdown
\`\`\`
`;

export async function POST(req: NextRequest) {


  try {
    // 1️⃣ Get authenticated user


    // 2️⃣ Parse request body
    const body = await req.json();
    const returnIntermediateSteps = false; // as in your original code
    const messages = (body.messages ?? [])
      .filter((message: VercelChatMessage) => message.role === "user" || message.role === "assistant")
      .map(convertVercelMessageToLangChainMessage);


    // 4️⃣ Initialize tools
    const tools = [
      new SerpAPI(),
      new CarelonSearchTool(),
      new EvolentSearchTool(),
      new NCDCoverageSearchTool(),
      localLcdSearchTool,
      localCoverageArticleSearchTool,
      policyContentExtractorTool,
      new FileUploadTool(),
    ];

    // 5️⃣ Create LangGraph agent
    const agent = createReactAgent({
      llm: llmAgent,
      tools,
      messageModifier: new SystemMessage(AGENT_SYSTEM_TEMPLATE),
    });
    // usage reporting
    const supabase = await createSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = user.id;
    void reportUsageToStripe({
      userId,
      usageType: "orchestrator_usage",
      quantity: 1,
    }).catch((err) => {
      console.error("Usage report failed (non-fatal):", err);
    });
    // end usage reporting


    let responseData: any;

    if (!returnIntermediateSteps) {
      // 6️⃣ Streaming response
      const eventStream = agent.streamEvents({ messages }, { version: "v2" });
      const textEncoder = new TextEncoder();
      const transformStream = new ReadableStream({
        async start(controller) {
          for await (const { event, data } of eventStream) {
            if (event === "on_chat_model_stream" && !!data.chunk.content) {
              controller.enqueue(textEncoder.encode(data.chunk.content));
            }
          }
          controller.close();
        },
      });

      responseData = new StreamingTextResponse(transformStream);
    } else {
      // 7️⃣ Non-streaming response
      const result = await agent.invoke({ messages });
      responseData = {
        messages: result.messages.map(convertLangChainMessageToVercelMessage),
      };


      return NextResponse.json(responseData, { status: 200 });
    }


    return responseData;
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e.status ?? 500 });
  }
}

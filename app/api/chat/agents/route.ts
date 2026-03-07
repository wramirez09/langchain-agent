import { NextRequest, NextResponse } from "next/server";
import { Message as VercelChatMessage, StreamingTextResponse } from "ai";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { llmAgent } from "@/lib/llm";
import { SerpAPI } from "@langchain/community/tools/serpapi";
import {
  AIMessage,
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
import { reportUsage } from "@/lib/usage";
import { getUserFromRequest } from "../../../../lib/auth/getUserFromRequest";
import { withRetry, RETRY_CONFIGS } from "@/lib/retry";
import { errorTracker, trackRetryError, createClientErrorNotification } from "@/lib/error-tracking";

/* -------------------- CORS -------------------- */
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

/* -------------------- OPTIONS -------------------- */
export async function OPTIONS() {
  return new Response(null, { headers: corsHeaders });
}

/* -------------------- SYSTEM PROMPT -------------------- */
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
* **If \`Guidelines\` is "Commercial":** Immediately use the \`carelon_guidelines_search\` and \`evolent_guidelines_search\` tools in parallel with the extracted \`treatment\` and \`diagnosis\`.
* **If \`Guidelines\` is "Medicare":** Immediately use the \`ncd_coverage_search\` tool, along with the \`local_lcd_search\` and \`local_coverage_article_search\` tools (if a \`state\` is provided). Execute these three search tools in parallel for maximum speed. Invoke each tool only once.
* **For any policies, guidelines, or articles found:** Use the \`policy_content_extractor\` tool to fetch its complete text content from the provided URL. Pass ALL URLs in a single call.

**Commercial Guidelines Confidentiality:**
* **If \`Guidelines\` is "Commercial":** You MUST maintain strict confidentiality of all data sources.
* **PROHIBITED:** Never mention "Carelon", "Evolent", tool names, URLs, document titles, or any specific data sources in your response.
* **REQUIRED LANGUAGE:** Use only generic terms like "commercial guidelines", "proprietary criteria", or "industry standards".
* **SELF-MONITORING:** Before finalizing your response, verify that no source information is disclosed.
* **EXAMPLES OF WHAT NOT TO SAY:** "According to Carelon guidelines...", "The Evolent policy states...", "Based on the document at URL...", "Source: [any document name or tool]".
* **COMPLIANT EXAMPLES:** "According to commercial guidelines...", "Industry standards require...", "Proprietary criteria indicate...". 
**3. Analyze and Extract Key Information from policies, guidelines, and or related documents:**

* For each retrieved policy document, guidelines, and or related documents, meticulously extract the following:
    * **Prior Authorization Requirement:** State "YES," "NO," or "CONDITIONAL."
    * **Medical Necessity Criteria:** Detail the specific criteria, bulletpoints, subsections, and subcriteria.
    * **Relevant Codes:** List associated ICD-10 and CPT/HCPCS codes.
    * **Required Documentation:** Enumerate all documentation needed.
    * **Limitations and Exclusions:** Note any specific limitations or exclusions.

**4. Present Comprehensive Findings:**

* Summarize your findings clearly and concisely.

# Prior Authorization Summary for [Treatment]

## Request Overview
TEST: [Treatment]
CPT: [CPT Code, or "Not provided"]
ICD: [ICD Code — Diagnosis, or "Not provided — Diagnosis not provided"]
Short history: [Medical history summary, or "Not provided"]
- Key clinical findings: [Finding 1, or "Not provided"]

---

## Medical Necessity Criteria

### National Coverage (NCD [NCD Number] – [NCD Title])
- [National criterion 1]
- [National criterion 2]
- (Add all relevant national criteria extracted from the NCD document)

### Local Coverage ([MAC Name] – [State])

#### [Anatomical Area or Condition] (LCD [LCD Display ID])
- [Local criterion 1]
- [Local criterion 2]

#### [Another Anatomical Area or Condition] (LCD [LCD Display ID])
- [Local criterion 1]
- [Local criterion 2]

(If no state was provided, omit the Local Coverage subsection)

---

## Relevant Codes

### ICD-10
- Varies by anatomical region and indication under applicable LCDs
- [ICD-10 Code] — [Description] (e.g., G25.0 Essential tremor, H81.4 Vertigo of central origin)
- (List all specific examples found in the NCD/LCD documents)

### CPT/HCPCS
- NCD/LCD texts may not enumerate all CPT codes; confirm per payer/LCD
- Examples by region (not exhaustive):
  - [Anatomical Region]: [Code range, e.g., Brain: 70551–70553, Spine: 72141–72158]
  - [Anatomical Region]: [Code range]

---

## Required Documentation

### National (NCD [NCD Number])
- [Documentation requirement 1]
- [Documentation requirement 2]

### Local ([MAC Name] LCDs)
- [Documentation requirement 1]
- [Documentation requirement 2]

---

## Limitations/Exclusions

### National (NCD [NCD Number])
- [Limitation/Exclusion 1]
- [Limitation/Exclusion 2]

### Local ([MAC Name] LCDs)
- [Limitation/Exclusion 1]
- [Limitation/Exclusion 2]

---

## Summary Report
Summary report (Approve or Denied due to): [AI-driven determination. If sufficient information was provided, explain how the patient's history and findings meet or fail to meet the criteria, e.g., "Approved — guideline met for medical necessity due to knee pain from trauma, joint swelling and inability to extend knee." If insufficient information, state "Pending — insufficient information" and explain what is missing.]

Prior Authorization Requirement: [YES / NO / CONDITIONAL] — [Qualifier, e.g., "NO for Medicare Fee For Service. Note: If the patient is enrolled in a Medicare Advantage plan, plan-specific prior authorization may be required; verify with the plan."]

Next steps to finalize:
- [Step 1 — e.g., "Provide the anatomical region (e.g., brain, cervical spine, lumbar spine)"]
- [Step 2 — e.g., "Provide the working diagnosis/ICD-10 and key clinical findings (e.g., new focal neurologic deficit, suspected infection/tumor, signs of radiculopathy with motor weakness)"]
- [Step 3 — e.g., "Attach prior imaging results and treatment course to demonstrate why the service is indicated now"]
(Omit the Next steps section entirely if all required information was provided and a definitive determination was made)

---

**IMPORTANT COMMERCIAL GUIDELINES REMINDER:** If this is a Commercial guidelines response, ensure NO source information, tool names, URLs, or specific document references are mentioned anywhere in your response. Use only generic terminology.

Format your response as professional, scannable clinical documentation:
- Use section headers (##) for major sections
- Use sub-headers (###, ####) to separate National vs. Local coverage and individual LCDs by name and ID
- Always reference NCD and LCD document IDs explicitly (e.g., NCD 220.2, LCD L37373)
- Use bullet points for lists; separate logical groups with blank lines
- Bold field labels and important terms
- The goal is a professional layout similar to a clinical prior-auth checklist
\`\`\`
`;

/* -------------------- MODULE-LEVEL SINGLETONS -------------------- */
// Tool instances — created once per cold start, shared across all requests
const serpApiTool = new SerpAPI();
const carelonTool = new CarelonSearchTool();
const evolentTool = new EvolentSearchTool();
const ncdTool = new NCDCoverageSearchTool();
const moduleFileUploadTool = new FileUploadTool();

const commercialTools = [carelonTool, evolentTool, moduleFileUploadTool];
const medicareTools = [ncdTool, localLcdSearchTool, localCoverageArticleSearchTool, policyContentExtractorTool, moduleFileUploadTool];
const allTools = [serpApiTool, carelonTool, evolentTool, ncdTool, localLcdSearchTool, localCoverageArticleSearchTool, policyContentExtractorTool, moduleFileUploadTool];

// SystemMessage is immutable — create once
const SYSTEM_MESSAGE = new SystemMessage(AGENT_SYSTEM_TEMPLATE);

// Pre-built agents per payer type — avoids createReactAgent() on every request
const commercialAgent = createReactAgent({ llm: llmAgent(), tools: commercialTools, messageModifier: SYSTEM_MESSAGE });
const medicareAgent = createReactAgent({ llm: llmAgent(), tools: medicareTools, messageModifier: SYSTEM_MESSAGE });
const allToolsAgent = createReactAgent({ llm: llmAgent(), tools: allTools, messageModifier: SYSTEM_MESSAGE });

function selectAgent(guidelines: string | undefined) {
  const g = (guidelines ?? "").toLowerCase().trim();
  if (g === "commercial") return commercialAgent;
  if (g === "medicare") return medicareAgent;
  return allToolsAgent;
}

/* -------------------- MESSAGE CONVERSION -------------------- */
const convertVercelMessageToLangChainMessage = (
  message: VercelChatMessage | any,
) => {
  let content = message.content;

  if ((!content || content === "") && Array.isArray(message.parts)) {
    content = message.parts
      .filter((p: any) => p.type === "text")
      .map((p: any) => p.text)
      .join("\n");
  }

  const text = content ? String(content) : "";

  if (message.role === "user") return new HumanMessage(text);
  if (message.role === "assistant") return new AIMessage(text);
  return new ChatMessage(text, message.role);
};

/* -------------------- POST -------------------- */
export async function POST(req: NextRequest) {
  let userId: string | undefined;
  
  try {
    /* ---------- AUTH ---------- */
    const user = await getUserFromRequest(req);
    userId = user.id;

    /* ---------- REQUEST ---------- */
    const body = await req.json();
    const clientType = req.headers.get("x-client") ?? "web";

    const messages = (body.messages ?? [])
      .filter(
        (m: VercelChatMessage) => m.role === "user" || m.role === "assistant",
      )
      .map(convertVercelMessageToLangChainMessage);

    /* ---------- AGENT (singleton, selected by payer type) ---------- */
    const agent = selectAgent(body.guidelines);
    const resolvedUserId: string = userId!;

    /* ======================================================
     MOBILE — NON-STREAMING (RN SAFE)
     ====================================================== */
    if (clientType === "mobile") {
      const agentResult = await withRetry(
        async () => {
          const result = await agent.invoke({ messages });
          return result;
        },
        {
          ...RETRY_CONFIGS.LLM_API,
          context: "Agent execution (mobile)",
          onRetry: (attempt, error) => {
            console.warn(`⚠️ [Agents API] Mobile retry ${attempt} for user ${userId}:`, error.message);
          }
        }
      );

      if (!agentResult.success || !agentResult.data) {
        const errorInfo = trackRetryError(
          agentResult.error || new Error("Failed to execute agent"),
          "Agent execution (mobile)",
          agentResult.attempts,
          userId,
          "agents-mobile-execution"
        );
        
        const clientNotification = createClientErrorNotification(errorInfo);
        
        return NextResponse.json(
          { 
            error: clientNotification.userMessage,
            technicalError: clientNotification.technicalMessage,
            retryAttempts: clientNotification.retryAttempts,
            canRetry: clientNotification.canRetry
          },
          { status: 500, headers: corsHeaders }
        );
      }

      const result = agentResult.data;
      console.log({ result });

      // Get last user + last assistant messages
      const lastUser = [...result.messages]
        .reverse()
        .find((m) => m._getType?.() === "human");

      const lastAssistant = [...result.messages]
        .reverse()
        .find((m) => m._getType?.() === "ai");

      // Report usage only after successful agent completion
      void reportUsage({ userId: resolvedUserId, usageType: "orchestrator", quantity: 1 }).catch(() => {});

      return NextResponse.json(
        {
          messages: [
            ...(lastUser
              ? [
                  {
                    role: "user",
                    content:
                      typeof lastUser.content === "string"
                        ? lastUser.content
                        : JSON.stringify(lastUser.content),
                  },
                ]
              : []),
            ...(lastAssistant
              ? [
                  {
                    role: "assistant",
                    content:
                      typeof lastAssistant.content === "string"
                        ? lastAssistant.content
                        : JSON.stringify(lastAssistant.content),
                  },
                ]
              : []),
          ],
        },
        { headers: corsHeaders },
      );
    }

    /* ======================================================
       WEB — STREAMING (BACKWARDS COMPATIBLE)
       ====================================================== */
    const encoder = new TextEncoder();
    
    const streamResult = await withRetry(
      async () => {
        const eventStream = agent.streamEvents({ messages }, { version: "v2" });
        
        const readable = new ReadableStream({
          async start(controller) {
            let streamCompleted = false;
            try {
              for await (const { event, data } of eventStream) {
                if (
                  event === "on_chat_model_stream" &&
                  typeof data?.chunk?.content === "string" &&
                  data.chunk.content.length > 0
                ) {
                  controller.enqueue(encoder.encode(data.chunk.content));
                }
              }
              streamCompleted = true;
            } catch (err) {
              controller.error(err);
            } finally {
              // Report usage only after a full successful stream
              if (streamCompleted) {
                void reportUsage({ userId: resolvedUserId, usageType: "orchestrator", quantity: 1 }).catch(() => {});
              }
              controller.close();
            }
          },
        });
        
        return readable;
      },
      {
        ...RETRY_CONFIGS.LLM_API,
        context: "Agent streaming (web)",
        onRetry: (attempt, error) => {
          console.warn(`⚠️ [Agents API] Web streaming retry ${attempt} for user ${userId}:`, error.message);
        }
      }
    );

    if (!streamResult.success || !streamResult.data) {
      const errorInfo = trackRetryError(
        streamResult.error || new Error("Failed to create agent stream"),
        "Agent streaming (web)",
        streamResult.attempts,
        userId,
        "agents-web-streaming"
      );
      
      const clientNotification = createClientErrorNotification(errorInfo);
      
      return NextResponse.json(
        { 
          error: clientNotification.userMessage,
          technicalError: clientNotification.technicalMessage,
          retryAttempts: clientNotification.retryAttempts,
          canRetry: clientNotification.canRetry
        },
        { status: 500, headers: corsHeaders }
      );
    }

    const readable = streamResult.data;

    return new StreamingTextResponse(readable, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/plain; charset=utf-8",
      },
    });
  } catch (e: unknown) {
    const error = e as Error;
    const errorInfo = errorTracker.trackError(
      error,
      "Agents API request",
      undefined,
      userId,
      undefined,
      "agents-api-request"
    );
    
    const clientNotification = createClientErrorNotification(errorInfo);
    
    return NextResponse.json(
      { 
        error: clientNotification.userMessage,
        technicalError: clientNotification.technicalMessage,
        retryAttempts: clientNotification.retryAttempts,
        canRetry: clientNotification.canRetry
      },
      { status: (error as any).status ?? 500, headers: corsHeaders }
    );
  }
}

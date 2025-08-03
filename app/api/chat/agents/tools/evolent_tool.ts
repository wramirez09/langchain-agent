import { z } from "zod"; // For input schema validation
import { StructuredTool, ToolRunnableConfig } from "@langchain/core/tools"; // Or from 'langchain/tools' in older versions
import { cleanRegex } from "./utils";
import { ChatOpenAI } from "@langchain/openai";
import { RunnableSequence } from "@langchain/core/runnables";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { replace } from "lodash";

// Define the input schema for the tool using Zod
const NCDSearchInputSchema = z.object({
  query: z
    .string()
    .describe(
      "The disease or treatment query to search for in Evolent guidelines.",
    ),
});

const PolicyRelevanceFilterSchema = z.object({
  content: z
    .string()
    .describe(
      "exctract information directly related to treatment and diagnosis",
    ),
});

// Implement the tool class
export class EvolentSearchTool extends StructuredTool<
  typeof NCDSearchInputSchema
> {
  name = "Evolent_guidelines_search";
  description = "Querys Evolent Guidelines search API and returns payload";
  schema = NCDSearchInputSchema;

  // Define the LLM for the internal filtering step
  // Using a faster, cheaper model for this task is a good optimization
  private relevanceFilterLLM = new ChatOpenAI({
    model: "gpt-4o-mini",
    temperature: 0,
  });

  // Define the internal LLM chain for filtering
  private relevanceFilterChain = RunnableSequence.from([
    ChatPromptTemplate.fromMessages([]),
    this.relevanceFilterLLM.withStructuredOutput(PolicyRelevanceFilterSchema),
  ]);

  constructor() {
    super();

    // Create the runnable sequence for the filtering logic.
    // The prompt is updated to use the new structured input from the tool's `_call` method.
  }

  // Public call method for LangChain LLM
  async call<
    TArg extends unknown,
    TConfig extends ToolRunnableConfig | undefined,
  >(input: any, configArg?: TConfig): Promise<any> {
    try {
      // Parse and validate the input using the schema

      const parsedInput = this.schema.parse({ query: input.query });
      return await this._call(parsedInput);
    } catch (error: any) {
      console.error("Error in EvolentSearchTool call method:", error);
      return `Error: ${error.message}`;
    }
  }

  // Internal method for processing the query
  protected async _call(
    input: z.infer<typeof NCDSearchInputSchema>,
  ): Promise<string> {
    const evolentApiQuery = encodeURI(
      "https://ai-aug-carelon-hxdxaeczd9b4fdfc.canadacentral-01.azurewebsites.net/api/evolent/search?" +
        `q=${input.query.toLowerCase()}`,
    );

    console.log({ evolentApiQuery: true });
    this.relevanceFilterChain = RunnableSequence.from([
      ChatPromptTemplate.fromMessages([
        [
          "system",
          `You are a policy filtering expert. Your task is to filter throught the data and return only relevent information related to ${input.query} return only relevent and related information in a clear and concise manner`,
        ],
        [
          "human",
          `Retrieve Full Policy Content: For any policy identified by the search tools (from Carelon, LCDs, LCAs, or NCDs), use the policy_content_extractor tool to fetch its complete text content from the provided URL.

          Capture All URLs: Crucially, for every relevant policy document found by any search tool, extract and store its full, direct URL.

          Analyze and Extract Key Information from Policies:

          For each retrieved policy document meticulously extract the following:

          Prior Authorization Requirement: Is prior authorization required? State "YES," "NO," or "CONDITIONAL," and describe any conditions.

          Medical Necessity Criteria: Detail the specific criteria that must be met for the service/treatment to be considered medically necessary.

          Relevant Codes: List associated ICD-10 and CPT/HCPCS codes.

          Required Documentation: Enumerate all documentation needed to support the prior authorization request.

          Limitations and Exclusions: Note any specific limitations, non-covered indications, or exclusions.

          Present Comprehensive Findings:

          Summarize your findings clearly and concisely.`,
        ],
      ]),
      this.relevanceFilterLLM.withStructuredOutput(PolicyRelevanceFilterSchema),
    ]);

    try {
      const response = await fetch(evolentApiQuery, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const relevantData = await response.json();
      const body: any[] = relevantData.value;
      const outputResults = body.map((c) => {
        return c.content
          .replace(
            /auer BG, Long MD\. ACG Clinical Guideline: UlcerativeColitis in Adults\.[\s\S]*?DISCLAIMER\s*\.{5}\s*\d+/g,
            "",
          )
          .replace(/\.{25}[\s\S]*?\.{25}/g, "")
          .replace(
            /\s*Page \d+ of \d+ Evolent Clinical Guideline[\s\S]*?Implementation Date: \w+ \d+\.\.\. \d+[\s\S]*?DISCLAIMER\s*\.{5}\s*\d+/g,
            "",
          )
          .replace(/\\nSTATEMENT[\s\S]*?\.\{4\} 4/g, "")
          .replace(/TABLE OF CONTENTS STATEMENT[\s\S]*?CODING \.\. 2/g, "")
          .replace(/[A-Z\s]+\.{9}[\s\S]*?[A-Z\s]+\.{9}/g, "")
          .replace(cleanRegex, "")
          .replace(/\r/g, "")
          .replace(/\n/g, "")
          .replace(/\b[A-Z]+\b|[^a-zA-Z0-9 ]/g, "")
          .replace(/\b\d{9,}\b/g, "")
          .slice(0, -10817);
      });

      // Invoke the internal LLM chain with the correct input object.
      const filterResult = await this.relevanceFilterLLM.invoke(outputResults);

      console.log("filtered", { data: filterResult.content });

      if (!relevantData || outputResults.length === 0) {
        return `No Evolent data found for '${input.query}'.`;
      }

      return `${filterResult.content}`;
    } catch (error: any) {
      return `Error calling Evolent API or processing data: ${error.message}`;
    }
  }
}

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
  is_relevant: z
    .boolean()
    .describe(
      "true if the policy content is directly relevant to the patient's service and payer, false otherwise.",
    ),
  reasoning: z
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
  private relevanceFilterChain: RunnableSequence<
    any,
    z.infer<typeof PolicyRelevanceFilterSchema>
  >;

  constructor() {
    super();

    // Create the runnable sequence for the filtering logic
    this.relevanceFilterChain = RunnableSequence.from([
      ChatPromptTemplate.fromMessages([
        [
          "system",
          "You are a policy filtering expert. Your task is to determine if a raw policy document is relevant to a specific medical service. " +
            "Output your decision as a structured JSON object with a 'is_relevant' boolean and a 'reasoning' string.",
        ],
        [
          "human",
          "Is the following policy content relevant to a policy lookup for:\n" +
            "**Service:** {description_refined}\n" +
            "**CPT Code:** {verified_cpt_code}\n" +
            "**Policy Content:**\n" +
            "```\n{raw_policy_content}\n```\n",
        ],
      ]),
      this.relevanceFilterLLM.withStructuredOutput(PolicyRelevanceFilterSchema),
    ]);
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

      // Invoke the internal LLM chain
      // const filterResult = await this.relevanceFilterChain.invoke(
      //   outputResults[0],
      // );

      console.log("filtered", { data: outputResults[0] });

      if (!relevantData || outputResults.length === 0) {
        return `No Evolent data found for '${input.query}'.`;
      }

      return `Found ${outputResults.length} Evolent Coverage Guideline(s) for '${input.query}'. ${outputResults[0]}`;
    } catch (error: any) {
      return `Error calling Evolent API or processing data: ${error.message}`;
    }
  }
}

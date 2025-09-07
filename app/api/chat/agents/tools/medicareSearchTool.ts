import { StructuredTool, Tool } from "@langchain/core/tools";
import { z } from "zod";
import { NCDCoverageSearchTool } from "./NCDCoverageSearchTool";
import { localLcdSearchTool } from "./localLcdSearchTool";
import { localCoverageArticleSearchTool } from "./localArticleSearchTool";

const MedicareSearchInputSchema = z.object({
    query: z
        .string()
        .describe("The disease or treatment query to search for."),
    state: z
        .object({ state_id: z.number(), description: z.string() })
        .describe("The state to filter local coverage results."),
});

class ParallelMedicareSearchTool extends StructuredTool<typeof MedicareSearchInputSchema> {
    name = "medicare_search_tool";
    description = "Searches NCD, LCD, and Local Coverage Articles in parallel for a given medical query and state. Use this for all Medicare-related searches.";
    schema = MedicareSearchInputSchema;

    tools: Tool[];

    constructor() {
        super();
        this.tools = [
            new NCDCoverageSearchTool(),
            localLcdSearchTool,
            localCoverageArticleSearchTool,
        ];
    }

    async _call(input: z.infer<typeof MedicareSearchInputSchema>): Promise<string> {
        try {
            const promises = this.tools.map(tool => {
                if (tool.name === 'ncd_coverage_search') {
                    // NCD search only needs the query string
                    return tool.invoke(input.query);
                } else {
                    // Local search tools need the full structured input
                    return tool.invoke(input);
                }
            });
            const results = await Promise.allSettled(promises);

            const formattedResults = results.map((result, index) => {
                const toolName = this.tools[index].name;
                if (result.status === 'fulfilled') {
                    return `--- Results from ${toolName} ---\n${result.value}`;
                }
                return `--- Error from ${toolName} ---\n${result.reason}`;
            });

            return formattedResults.join('\n\n');
        } catch (error) {
            console.error("Error in ParallelMedicareSearchTool:", error);
            return "An error occurred while performing the parallel Medicare search.";
        }
    }
}

export const medicareSearchTool = new ParallelMedicareSearchTool();

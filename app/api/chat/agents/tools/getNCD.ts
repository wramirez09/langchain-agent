import { Tool } from "@langchain/core/tools";


export class GetNCDArticlesTool extends Tool {
  name = "get_ncd_articles";
  description = "Fetches National Coverage Determination (NCD) articles from the CMS API.";

  async _call(input: string): Promise<string> {
    const endpoint = "https://api.coverage.cms.gov/v1/reports/national-coverage-ncd/";

    try {
      const data = await fetch(endpoint, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
      });

      if (!data.ok) {
        throw new Error(`Error fetching NCD articles: ${data.statusText}`);
      }

      const response = await data.json();
      console.log("NCD Articles fetched successfully:", response);
      return JSON.stringify(response); // Return the response as a string
    } catch (error: any) {
      console.error("Error fetching NCD articles:", error);
      return `Error: ${error.message}`;
    }
  }
}
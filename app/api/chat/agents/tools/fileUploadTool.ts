// A LangChain tool to interact with the Next.js file upload API.

import { Tool } from "langchain/tools";
import { promises as fs } from "fs";
import path from "path";
import FormData from "form-data";
import fetch from "cross-fetch";

/**
 * A LangChain Tool that uploads a file to a retrieval agent for temporary
 * processing and retrieval. The data is not permanently stored.
 */
export class FileUploadTool extends Tool {
  // The name the LLM will use to reference this tool.
  name = "file_upload_tool";

  // A descriptive summary of the tool's functionality for the LLM.
  // The description now specifies that the input includes a query.
  description =
    "A tool for uploading files (e.g., PDF) for temporary retrieval. " +
    "The input to this tool must be a string containing a file path " +
    "and a query, separated by '::'. " +
    'Example: "/path/to/my_document.pdf::What is the main topic?"';

  /**
   * @description The main logic of the tool. It takes a file path and a query,
   * reads the file, and sends both to the Next.js API route.
   * @param {string} input - The combined file path and query, e.g., "path/to/file::query".
   * @returns {Promise<string>} A message indicating the success or failure of the upload
   * and the retrieved information.
   */
  async _call(input: string) {
    try {
      // 1. Parse the input to get the file path and the query.
      const [filePath, query] = input.split("::");

      if (!filePath || !query) {
        throw new Error(
          "Input must contain both a file path and a query separated by '::'.",
        );
      }

      // 2. Check if the file exists at the given path.
      await fs.access(filePath);

      // 3. Read the file into a buffer.
      const fileBuffer = await fs.readFile(filePath);

      // 4. Create a FormData object, adding both the file and the query.
      const formData = new FormData();
      formData.append("file", fileBuffer, {
        filename: path.basename(filePath),
        contentType: "application/pdf",
      });
      formData.append("query", query); // Add the query to the form data

      // 5. Send the POST request to the Next.js API endpoint.
      const apiUrl = "http://localhost:3000/api/retrieval/ingest";
      const response = await fetch(apiUrl, {
        method: "POST",
        body: formData.getBuffer(),
        headers: {
          ...formData.getHeaders(),
        },
      });

      // 6. Handle the API response.
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `API request failed with status ${response.status}: ${errorText}`,
        );
      }

      const result = await response.json();

      // 7. Format the retrieved documents into a useful string for the agent.
      const retrievedDocs = result.docs
        .map((doc: any) => doc.pageContent)
        .join("\n---\n");

      // 8. Return a success message with the retrieved data.
      return `File successfully processed. Retrieved information:\n${retrievedDocs}`;
    } catch (error) {
      console.error("An error occurred during file upload:", error);

      // Return a descriptive error message for the agent.
      return `Failed to process file. Error: ${(error as Error).message}`;
    }
  }
}

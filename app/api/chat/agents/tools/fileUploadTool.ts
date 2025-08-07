// A LangChain tool to interact with the Next.js file upload API.

import { Tool } from "langchain/tools";
import { promises as fs } from "fs";
import path from "path";
import FormData from "form-data";
import fetch from "cross-fetch";

/**
 * A LangChain Tool that uploads a file to the Next.js API for processing.
 * This tool is designed to be used by a LangChain agent.
 */
export class FileUploadTool extends Tool {
  // The name the LLM will use to reference this tool.
  name = "file_upload_tool";

  // A descriptive summary of the tool's functionality for the LLM.
  description =
    "A tool for uploading files (e.g., PDF) to a retrieval agent. " +
    "The input to this tool is the file path of the document to upload. " +
    'Example: "/path/to/my_document.pdf"';

  /**
   * @description The main logic of the tool. It takes a file path as input,
   * reads the file, and sends it to the Next.js API route via a POST request.
   * @param {string} filePath - The local path to the file to be uploaded.
   * @returns {Promise<string>} A message indicating the success or failure of the upload.
   */
  async _call(filePath: string) {
    try {
      // 1. Check if the file exists at the given path.
      await fs.access(filePath);

      // 2. Read the file into a buffer.
      const fileBuffer = await fs.readFile(filePath);

      // 3. Create a FormData object, which is needed for multipart/form-data POST requests.
      const formData = new FormData();
      formData.append("file", fileBuffer, {
        filename: path.basename(filePath),
        contentType: "application/pdf", // Assuming a PDF for this example.
      });

      // 4. Send the POST request to the Next.js API endpoint.
      // Make sure to replace this URL if your app is hosted elsewhere.
      const apiUrl = "http://localhost:3000/api/retrieval/ingest";
      const response = await fetch(apiUrl, {
        method: "POST",
        body: formData.getBuffer(),
        headers: {
          ...formData.getHeaders(),
        },
      });

      // 5. Handle the API response.
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `API request failed with status ${response.status}: ${errorText}`,
        );
      }

      const result = await response.json();

      // 6. Return a success message that the agent can use.
      return `File successfully uploaded and processed. API response: ${JSON.stringify(result)}`;
    } catch (error) {
      console.error("An error occurred during file upload:", error);

      // Return a descriptive error message for the agent.
      return `Failed to upload file. Error: ${(error as Error).message}`;
    }
  }
}

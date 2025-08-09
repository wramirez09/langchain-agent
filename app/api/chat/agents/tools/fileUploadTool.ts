// A LangChain tool to interact with the Next.js file upload API.

import { z } from "zod";
import { StructuredTool } from "@langchain/core/tools";
import { promises as fs } from "fs";
import path from "path";
import FormData from "form-data";
import fetch from "cross-fetch";

// The schema for the tool's input.
const FileUploadToolInputSchema = z.object({
  input: z
    .string()
    .describe(
      "A string containing a file path and a query, separated by '::'. Example: '/path/to/my_document.pdf::What is the main topic?'",
    ),
});

/**
 * A helper function to call the Gemini API for text summarization.
 * @param content The text content to be summarized.
 * @param query The user's original query.
 * @returns A string containing the summary or an error message.
 */
async function getSummaryFromDocs(
  content: string,
  query: string,
): Promise<string> {
  const chatHistory = [];
  chatHistory.push({
    role: "user",
    parts: [
      {
        text: `Summarize the following document content based on the user's query. The summary should be concise and directly address the query.

        User's Query: ${query}

        Document Content:
        ${content}`,
      },
    ],
  });

  const payload = { contents: chatHistory };
  const apiKey = process.env.GOOGLE_LM_API;
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;

  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const result = await response.json();
    if (
      result.candidates &&
      result.candidates.length > 0 &&
      result.candidates[0].content &&
      result.candidates[0].content.parts &&
      result.candidates[0].content.parts.length > 0
    ) {
      return result.candidates[0].content.parts[0].text;
    }
    console.error("Gemini API response structure is unexpected.");
    return "Failed to generate a summary.";
  } catch (error) {
    console.error("Error calling Gemini API for summarization:", error);
    return `An error occurred during summarization: ${(error as Error).message}`;
  }
}

/**
 * A LangChain Tool that uploads a file to a retrieval agent for temporary
 * processing and retrieval. The data is not permanently stored. The tool now
 * also summarizes the retrieved documents to prevent token limit errors.
 */
export class FileUploadTool extends StructuredTool<
  typeof FileUploadToolInputSchema
> {
  // The name the LLM will use to reference this tool.
  name = "file_upload_tool";

  // A descriptive summary of the tool's functionality for the LLM.
  // The description now specifies that the tool returns a summary.
  description =
    "A tool for uploading a file (e.g., PDF) and retrieving a concise summary of the most relevant information " +
    "based on a specific query. The input to this tool must be a string containing a file path " +
    "and a query, separated by '::'. " +
    'Example: "/path/to/my_document.pdf::What is the main topic?"';

  schema = FileUploadToolInputSchema;

  /**
   * @description The main logic of the tool. It takes a file path and a query,
   * reads the file, and sends both to the Next.js API route. It then summarizes
   * the retrieved documents before returning them.
   * @param {z.infer<typeof FileUploadToolInputSchema>} input - The combined file path and query, e.g., "path/to/file::query".
   * @returns {Promise<string>} A message indicating the success or failure of the upload,
   * along with a concise summary of the retrieved information.
   */
  async _call({
    input,
  }: z.infer<typeof FileUploadToolInputSchema>): Promise<string> {
    try {
      // 1. Parse the input to get the file path and the query.
      const [filePath, query] = input.split("::");

      if (!filePath || !query) {
        throw new Error(
          "Input must contain both a file path and a query separated by '::'.",
        );
      }

      // 2. Read the file into a buffer.
      const fileBuffer = await fs.readFile(filePath);

      // 3. Create a FormData object, adding both the file and the query.
      const formData = new FormData();
      formData.append("file", fileBuffer, {
        filename: path.basename(filePath),
        contentType: "application/pdf",
      });
      formData.append("query", query); // Add the query to the form data

      // 4. Send the POST request to the Next.js API endpoint.
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

      // 6. Check if documents were retrieved.
      if (!result.docs || result.docs.length === 0) {
        return `No relevant information found in the document for the query: "${query}".`;
      }

      // 7. Concatenate the retrieved documents for summarization.
      const retrievedDocsContent = result.docs
        .map((doc: any) => doc.pageContent)
        .join("\n---\n");

      // 8. Use an internal LLM call to get a concise summary.
      const summary = await getSummaryFromDocs(retrievedDocsContent, query);

      // 9. Return a success message with the summary.
      return `File processed. Summary of retrieved information:\n${summary}`;
    } catch (error) {
      console.error("An error occurred during file upload:", error);

      // Return a descriptive error message for the agent.
      return `Failed to process file. Error: ${(error as Error).message}`;
    }
  }
}

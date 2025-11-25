// A LangChain tool to interact with the Next.js file upload API.

import { z } from "zod";
import { StructuredTool } from "@langchain/core/tools";
import { promises as fs } from "fs";
import path from "path";
import FormData from "form-data";
import fetch from "cross-fetch";
import { createSupabaseClient } from "@/utils/server";
import { reportUsageToStripe } from "@/lib/usage";

// The schema for the tool's input.
const FileUploadToolInputSchema = z.object({
  input: z
    .string()
    .describe(
      "A string containing a file path and a query, separated by '::'. Example: '/path/to/my_document.pdf::What is the main topic?'",
    ),
});


async function getSummaryFromDocs(
  content: string,
  query: string,
): Promise<string> {

  const chatHistory = [
    {
      role: "system",
      content: `You are an expert healthcare documentation analyst. Your task is to analyze uploaded medical documents and extract the following key information in a structured format:
      1. Treatment/Service: The specific medical treatment or procedure mentioned
      2. CPT Code: Any CPT or HCPCS codes found
      3. Diagnosis: The patient's diagnosis or condition
      4. ICD-10 Code: Any ICD-10 diagnosis codes
      5. Medical History: Summary of relevant clinical history and findings
      6. Insurance: Mentioned insurance provider (if any)
      7. State: Patient's state of residence (if mentioned)

      Format your response as a clear, well-structured markdown document. If information is missing, note it as "Not specified".`
    },
    {
      role: "user",
      content: `Please analyze the following document and extract the relevant information as specified. 
      Document Content:
      ${content}

      User's Query: ${query}

      Provide a detailed analysis including:
      - All relevant medical codes
      - Treatment details
      - Diagnosis information
      - Any prior authorization requirements
      - Supporting clinical evidence
      - Any other pertinent details

      Format your response in clear, well-structured markdown with appropriate headings.`
    }
  ];


  const apiKey = process.env.OPENAI_API_KEY; // Make sure this is set in your .env.local
  const apiUrl = "https://api.openai.com/v1/chat/completions";

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000); // 60 second timeout for LLM

  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-4-turbo-preview", // or "gpt-3.5-turbo" for a more cost-effective option
        messages: chatHistory,
        temperature: 0.7,
        max_tokens: 1000
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    const result = await response.json();
    if (
      result.candidates &&
      result.candidates.length > 0 &&
      result.candidates[0].content &&
      result.candidates[0].content.parts &&
      result.candidates[0].content.parts.length > 0
    ) {

      const supabase = await createSupabaseClient();
      const { data: { user } } = await supabase.auth.getUser();
      const userId = user?.id;
      console.log("[FileUploadTool] User ID:", userId);
      void reportUsageToStripe({
        userId: userId!,
        usageType: "file_upload_tool",
        quantity: 1,
      }).catch((err) => {
        console.error("Usage report failed (non-fatal):", err);
      });
      return result.candidates[0].content.parts[0].text;
    }
    console.error("openAI response structure is unexpected.");
    return "Failed to generate a summary.";
  } catch (error) {
    console.error("Error calling openAI for summarization:", error);
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
      const apiUrl = "/api/retrieval/ingest";
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);

      const response = await fetch(apiUrl, {
        method: "POST",
        body: formData.getBuffer() as any,
        headers: {
          ...formData.getHeaders(),
        },
        signal: controller.signal,
      });

      clearTimeout(timeout);

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

import { NextRequest, NextResponse } from "next/server";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { OpenAIEmbeddings } from "@langchain/openai";
import { SupabaseVectorStore } from "@langchain/community/vectorstores/supabase";
import { createClient } from "@supabase/supabase-js";
import { mkdir, rm } from "fs/promises";
import path from "path";
import { headers } from "next/headers";
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";

function cleanText(text: string): string {
  // Replace multiple newlines or spaces with a single one
  return text
    .replace(/\n\s*\n/g, "\n")
    .replace(/\s+/g, " ")
    .trim();
}

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_PRIVATE_KEY;
const openApiKey = process.env.OPENAI_API_KEY;

if (!supabaseUrl || !supabaseServiceKey || !openApiKey) {
  throw new Error(
    "Supabase URL, Service Key, and/or OpenAI API key not found in environment variables.",
  );
}

// This API route handles the file upload, text extraction, chunking,
// and storage of embeddings in Supabase.
export async function POST(req: NextRequest) {
  let filePath: string | undefined;

  try {
    // Parse the incoming request data as a FormData object.
    const formData = await req.formData();
    const file = formData.get("file") as File;

    // Check if a file was actually uploaded and if it's a Blob.
    if (!file || !(file instanceof Blob)) {
      console.error("No file uploaded or file is not a Blob.");
      return NextResponse.json(
        { message: "No file uploaded" },
        { status: 400 },
      );
    }

    // Get the file content as a Buffer. The Blob object is converted to an
    // ArrayBuffer via a Response, which is the most reliable method in this context.
    const arrayBuffer = await new Response(file).arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Get the file name from the File object, or provide a default name.
    const fileName =
      file instanceof File ? file.name : `uploaded_file_${Date.now()}`;
    console.log(`Received file: ${fileName}, size: ${file.size} bytes`);

    // Create a temporary directory to store the file.
    const uploadDir = path.join(process.cwd(), "public", "uploads");
    await mkdir(uploadDir, { recursive: true });

    const blob = new Blob([new Uint8Array(await file.arrayBuffer())], {
      type: "application/pdf",
    });
    const loader = new PDFLoader(blob);
    const docs = await loader.load();

    const textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200,
    });
    const splitDocs = await textSplitter.splitDocuments(docs);
    const client = createClient(supabaseUrl!, supabaseServiceKey!);
    const embeddings = new OpenAIEmbeddings();

    await SupabaseVectorStore.fromDocuments(splitDocs, embeddings, {
      client,
      tableName: "documents",
      queryName: "match_documents",
    });

    console.log(
      `Successfully embedded and stored ${splitDocs.length} documents in Supabase.`,
    );

    const vectorStore = new SupabaseVectorStore(embeddings, {
      client: client,
      tableName: "documents", // Your table name
      queryName: "match_documents", // Your RPC function name
    });

    async function retrieveAllFromSupabase(
      tableName: string | any,
      columns = "*",
    ) {
      try {
        const { data, error } = await client.from(tableName).select(columns);

        if (error) {
          console.error("Error retrieving all documents from Supabase:", error);
          return [];
        }

        return data || [];
      } catch (error) {
        console.error("Unexpected error during Supabase retrieval:", error);
        return []; // Return an empty array on error to prevent the app from crashing.
      }
    }

    const allDocs = await retrieveAllFromSupabase("documents");
    const { data, error } = await client
      .from("documents")
      .select("content, metadata");

    let combinedContent = data?.map((doc) => doc.content).join("\n\n---\n\n");

    if (combinedContent) {
      combinedContent = cleanText(combinedContent);
    }

    const headersList = headers();
    const domain = (await headersList).get("host");

    fetch(`http://${domain}/api/chat/agents`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        upload: true,
        messages: [{ role: "user", content: combinedContent ?? "" }],
      }),
    });

    // Check if the agent's response was successful

    // const errorBody = await agentResponse.json();
    console.error("Agent API route error:");
    return NextResponse.json(
      {
        message: "An internal server error occurred in the agent.",
        details: "error",
      },
      { status: 200 },
    );

    // const agentData = await agentResponse.json();
  } catch (error) {
    console.error("API route error:", error);
    return NextResponse.json(
      {
        message: "An internal server error occurred.",
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  } finally {
    if (filePath) {
      await rm(filePath).catch((err) =>
        console.error(`Error deleting file at ${filePath}:`, err),
      );
      console.log(`Cleaned up temporary file at ${filePath}`);
    }
  }
}

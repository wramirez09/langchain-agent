import { NextRequest, NextResponse } from "next/server";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { OpenAIEmbeddings } from "@langchain/openai";
import { SupabaseVectorStore } from "@langchain/community/vectorstores/supabase";
import { createClient } from "@supabase/supabase-js";
import { mkdir, rm } from "fs/promises";
import path from "path";

import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SERPAPI_API_KEY;
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

    // Initialize the text splitter. This will break down the large document
    // into smaller, more digestible chunks.
    const textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200,
    });
    const splitDocs = await textSplitter.splitDocuments(docs);

    console.log({ supabaseServiceKey });
    // Initialize the Supabase client with the URL and service key.
    const client = createClient(supabaseUrl!, supabaseServiceKey!);

    // Create a new instance of the OpenAI embeddings model.
    const embeddings = new OpenAIEmbeddings();

    // Embed the documents and store them in the specified Supabase table.
    // This process converts text chunks into vector representations.
    await SupabaseVectorStore.fromDocuments(splitDocs, embeddings, {
      client,
      tableName: "documents",
      queryName: "match_documents",
    });

    console.log(
      `Successfully embedded and stored ${splitDocs.length} documents in Supabase.`,
    );

    // Return a success response to the client.
    return NextResponse.json(
      {
        message: `Successfully processed and stored file: ${fileName}`,
        docs: splitDocs,
      },
      { status: 200 },
    );
  } catch (error) {
    // Log and return an error response if anything goes wrong.
    console.error("API route error:", error);
    return NextResponse.json(
      { message: "An internal server error occurred." },
      { status: 500 },
    );
  } finally {
    // This block ensures the temporary file is deleted, whether the
    // process succeeded or failed.
    if (filePath) {
      await rm(filePath).catch((err) =>
        console.error(`Error deleting file at ${filePath}:`, err),
      );
      console.log(`Cleaned up temporary file at ${filePath}`);
    }
  }
}

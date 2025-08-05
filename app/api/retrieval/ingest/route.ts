import { NextResponse } from "next/server";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { OpenAIEmbeddings } from "@langchain/openai";
import { SupabaseVectorStore } from "@langchain/community/vectorstores/supabase";
import { createClient } from "@supabase/supabase-js";
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";

function cleanText(text: any) {
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

export async function POST(req: any) {
  try {
    const formData = await req.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof Blob)) {
      console.error("No file uploaded or file is not a Blob.");
      return NextResponse.json(
        { message: "No file uploaded" },
        { status: 400 },
      );
    }

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

    // Retrieve the content of the newly ingested documents
    const { data, error } = await client
      .from("documents")
      .select("content, metadata");

    if (error) {
      console.error("Error retrieving documents from Supabase:", error);
      return NextResponse.json(
        { message: "Failed to retrieve documents from Supabase" },
        { status: 500 },
      );
    }

    // Combine all document content into a single string
    let combinedContent = data?.map((doc) => doc.content).join("\n\n---\n\n");

    if (combinedContent) {
      combinedContent = cleanText(combinedContent);
    }

    // Return the extracted content to the client
    return NextResponse.json(
      {
        message: "Document ingested successfully.",
        docs: combinedContent,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("API route error:", error);
    return NextResponse.json(
      {
        message: "An internal server error occurred.",
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}

import { NextResponse } from "next/server";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { ChatOpenAI, OpenAIEmbeddings } from "@langchain/openai";
import { SupabaseVectorStore } from "@langchain/community/vectorstores/supabase";
import { createClient } from "@supabase/supabase-js";
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { HumanMessage } from "@langchain/core/messages";

const queryGenerationAgent = new ChatOpenAI({
  model: "gpt-5",
});

function cleanText(text: any) {
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

    let combinedContent = data?.map((doc) => doc.content).join("\n\n---\n\n");

    if (combinedContent) {
      combinedContent = cleanText(combinedContent);
    }

    // HIGHLIGHT START
    // This is the new agent-based query generation logic.
    const queryPrompt = `
      You are a medical information extraction assistant. Your task is to analyze the following document content from a patient's medical record or a prior authorization form.

      Extract the core medical information and format it into a concise, focused search query. The query should be designed to help a Prior Authorization Assistant find relevant guidelines and policies.

      The query should include:
      - The primary treatment or medical service (e.g., "Insulin pump therapy")
      - The diagnosis or condition (e.g., "Type 1 diabetes")
      - Any relevant CPT or ICD-10 codes found (e.g., "ICD-10: E10.9")
      - Key medical history points that might impact coverage.

      Combine these points into a single, natural-language question. Do not include any filler text, just the query.
      Document Content to Analyze:
      ${combinedContent}
    `;

    // Invoke the agent with the prompt
    const result = await queryGenerationAgent.invoke([
      new HumanMessage({ content: queryPrompt }),
    ]);

    const generatedQuery = result.content;
    // HIGHLIGHT END

    return NextResponse.json(
      {
        message: "Document ingested successfully.",
        docs: combinedContent,
        generatedQuery: generatedQuery,
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

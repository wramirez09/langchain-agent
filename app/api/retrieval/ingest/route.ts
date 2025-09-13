import { NextResponse } from "next/server";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { OpenAIEmbeddings } from "@langchain/openai";
import { llmAgent } from "@/lib/llm";
import { SupabaseVectorStore } from "@langchain/community/vectorstores/supabase";
import { createClient } from "@supabase/supabase-js";
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { HumanMessage } from "@langchain/core/messages";


const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_PRIVATE_KEY;
const openApiKey = process.env.OPENAI_API_KEY;

if (!supabaseUrl || !supabaseServiceKey || !openApiKey) {
  throw new Error(
    "Supabase URL, Service Key, and/or OpenAI API key not found in environment variables.",
  );
}

export async function POST(req: Request) {
  try {

    console.log('Received file upload request');

    const formData = await req.formData();
    const file = formData.get("file");

    if (!file) {
      console.error('No file found in form data');
      return NextResponse.json(
        {
          success: false,
          error: "No file uploaded"
        },
        { status: 400 }
      );
    }

    if (!(file instanceof Blob)) {
      console.error('Invalid file format:', file);
      return NextResponse.json(
        {
          success: false,
          error: "Invalid file format"
        },
        { status: 400 }
      );
    }

    // Verify file type
    if (file.type !== 'application/pdf') {
      console.error('Unsupported file type:', file.type);
      return NextResponse.json(
        {
          success: false,
          error: "Only PDF files are supported"
        },
        { status: 400 }
      );
    }

    // Verify file size (10MB max)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      console.error('File size exceeds limit:', file.size);
      return NextResponse.json(
        { error: "File size exceeds 10MB limit" },
        { status: 400 }
      );
    }

    // Process the PDF file
    console.log('Processing PDF file...');

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const blob = new Blob([buffer], { type: file.type });
    const loader = new PDFLoader(blob);

    const docs = await loader.load().catch(error => {
      console.error("Error loading PDF:", error);
      throw new Error("Failed to process PDF file. The file may be corrupted or not a valid PDF.");
    });

    if (!docs || docs.length === 0) {
      throw new Error("No content could be extracted from the PDF.");
    }

    // Split documents into chunks
    const textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200,
    });

    const splitDocs = await textSplitter.splitDocuments(docs).catch(error => {
      console.error("Error splitting document:", error);
      throw new Error("Failed to process document content.");
    });

    // Store documents in vector store
    const embeddings = new OpenAIEmbeddings({
      openAIApiKey: openApiKey,
    });

    await SupabaseVectorStore.fromDocuments(
      splitDocs,
      embeddings,
      {
        client: createClient(supabaseUrl!, supabaseServiceKey!),
        tableName: 'documents',
      }
    );

    // Generate a query from the document
    const queryPrompt = `You are a medical information extraction assistant. Your task is to analyze the following document content from a patient's medical record or a prior authorization form.

Extract the core medical information and format it into a concise, focused search query. The query should be designed to help a Prior Authorization Assistant find relevant guidelines and policies.

The query should include:
- The primary treatment or medical service (e.g., "Insulin pump therapy")
- The diagnosis or condition (e.g., "Type 1 diabetes")
- Any relevant CPT or ICD-10 codes found (e.g., "ICD-10: E10.9")
- Key medical history points that might impact coverage.

Combine these points into a single, natural-language question. Do not include any filler text, just the query.
Document Content to Analyze:

${splitDocs.slice(0, 5).map(doc => doc.pageContent).join("\n\n---\n\n")}`;

    // Invoke the agent with the prompt
    const result = await llmAgent.invoke([
      new HumanMessage({ content: queryPrompt }),
    ]);

    const generatedQuery = result.content;

    console.log('Successfully processed PDF and generated query');
    return NextResponse.json(
      {
        success: true,
        generatedQuery: generatedQuery,
        documentId: `doc_${Date.now()}`
      },
      { status: 200 }
    );
    // Error handling is done in the catch block above
  } catch (error: any) {
    console.error("Error in ingest API:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Internal server error"
      },
      {
        status: error.status || 500,
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );
  }
}

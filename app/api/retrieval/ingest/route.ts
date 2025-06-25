import { NextRequest, NextResponse } from "next/server";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";

import { SearchClient, AzureKeyCredential } from "@azure/search-documents";
import { AzureAISearchVectorStore } from "@langchain/community/vectorstores/azure-aisearch";
import { OpenAIEmbeddings } from "@langchain/openai";

export const runtime = "edge";

// Before running, follow set-up instructions at
// https://js.langchain.com/docs/integrations/vectorstores/azure_aisearch

/**
 * This handler takes input text, splits it into chunks, and embeds those chunks
 * into a vector store for later retrieval. See the following docs for more information:
 *
 * https://js.langchain.com/v0.2/docs/how_to/recursive_text_splitter
 * https://js.langchain.com/docs/integrations/vectorstores/azure_aisearch
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const text = body.text;

  if (process.env.NEXT_PUBLIC_DEMO === "true") {
    return NextResponse.json(
      {
        error: [
          "Ingest is not supported in demo mode.",
          "Please set up your own version of the repo here: https://github.com/langchain-ai/langchain-nextjs-template",
        ].join("\n"),
      },
      { status: 403 },
    );
  }

  try {
    const client = new SearchClient(
      process.env.AZURE_AI_SEARCH_ENDPOINT!,
      process.env.AZURE_AI_SEARCH_INDEX_NAME!,
      new AzureKeyCredential(process.env.AZURE_AI_SEARCH_ADMIN_KEY!),
    );

    const splitter = RecursiveCharacterTextSplitter.fromLanguage("markdown", {
      chunkSize: 256,
      chunkOverlap: 20,
    });

    const splitDocuments = await splitter.createDocuments([text]);

    const vectorstore = await AzureAISearchVectorStore.fromDocuments(
      splitDocuments,
      new OpenAIEmbeddings(),
      {
        client,
        indexName: process.env.AZURE_AI_SEARCH_INDEX_NAME!,
      },
    );

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

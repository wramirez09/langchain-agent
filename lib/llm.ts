import { ChatOpenAI } from "@langchain/openai";

// For the main agent - creative and conversational
export const llmAgent = new ChatOpenAI({ model: "gpt-5", temperature: 1 });

// For summarization and data extraction - factual and deterministic
export const llmSummarizer = new ChatOpenAI({
  model: "gpt-4o-mini",
  temperature: 0,
  maxRetries: 3,
});

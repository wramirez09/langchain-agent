import { ChatOpenAI } from "@langchain/openai";

// For the main agent - optimized for performance with GPT-5
export const llmAgent = () => new ChatOpenAI({
  model: "gpt-5",
  maxRetries: 2,
  maxConcurrency: 3,
  timeout: 60000,
  streaming: true,
});

// For summarization and data extraction - using GPT-4o for consistency
export const llmSummarizer = () => new ChatOpenAI({
  model: "gpt-4o",
  temperature: 0.2,
  maxRetries: 2,
  timeout: 60000,
});

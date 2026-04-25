import { ChatOpenAI } from "@langchain/openai";

// For the main agent - GPT-5 with low reasoning effort to reduce 45-65s latency to ~10-15s
export const llmAgent = () => new ChatOpenAI({
  model: "gpt-5",
  reasoningEffort: "low",
  maxRetries: 2,
  maxConcurrency: 3,
  timeout: 60000,
  streaming: true,
});

// For summarization and structured extraction - gpt-4o for accurate code/criteria extraction
export const llmSummarizer = () => new ChatOpenAI({
  model: "gpt-4o",
  temperature: 0.2,
  maxRetries: 2,
  timeout: 60000,
});

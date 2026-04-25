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

// For summarization and structured extraction - gpt-4o-mini is 3-5x faster than gpt-4o for this task
export const llmSummarizer = () => new ChatOpenAI({
  model: "gpt-4o-mini",
  temperature: 0.2,
  maxRetries: 2,
  timeout: 60000,
});

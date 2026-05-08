import { ChatOpenAI } from "@langchain/openai";

// For the main agent - GPT-5 with low reasoning effort to reduce 45-65s latency to ~10-15s.
// timeout: per-completion ceiling. Was 60s; production saw repeated 60s timeouts
// on long tool-heavy runs (3 internal retries × 60s = 180s lost before failing).
// 120s gives a single completion enough room to finish; whole-run is still bounded
// by maxDuration=300 in the route.
export const llmAgent = () => new ChatOpenAI({
  model: "gpt-5",
  reasoningEffort: "low",
  maxRetries: 2,
  maxConcurrency: 3,
  timeout: 120000,
  streaming: true,
});

// For summarization and structured extraction - gpt-4o for accurate code/criteria extraction
export const llmSummarizer = () => new ChatOpenAI({
  model: "gpt-4o",
  temperature: 0.2,
  maxRetries: 2,
  timeout: 90000,
});

import { ChatOpenAI } from "@langchain/openai";

// For the main agent - GPT-5 with low reasoning effort to reduce 45-65s latency to ~10-15s

// Main agent model. Default to gpt-5 — gpt-4o-mini was faster but regressed
// extraction quality on the 12KB clinical prompt (missing fields, wrong tool
// routing). Override via AGENT_MODEL ("gpt-4o-mini", "gpt-4o") to A/B without
// a code change. timeout: per-completion ceiling; whole-run still bounded by
// maxDuration=300 in the route.
export const llmAgent = () => {
  const model = process.env.AGENT_MODEL ?? "gpt-5.5";
  // Reasoning-family detection. Covers gpt-5, gpt-5.x, and o-series (o1, o3, o4...).
  // Non-reasoning models (gpt-4o, gpt-4o-mini) get `temperature: 0` instead —
  // passing `reasoningEffort` to them errors at the OpenAI API.
  const isReasoningModel = /^gpt-5(\.|$|-)/.test(model) || /^o\d/.test(model);
  return new ChatOpenAI({
    model,
    ...(isReasoningModel ? { reasoningEffort: "medium" as const } : { temperature: 0 }),
    maxRetries: 2,
    maxConcurrency: 3,
    timeout: 120000,
    streaming: true,
  });
};


// For summarization and structured extraction - gpt-4o for accurate code/criteria extraction
export const llmSummarizer = () => new ChatOpenAI({
  model: "gpt-4o",
  temperature: 0.2,
  maxRetries: 2,
  timeout: 90000,
});

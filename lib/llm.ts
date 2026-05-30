import { ChatOpenAI } from "@langchain/openai";

type ReasoningEffort = "low" | "medium" | "high";

// Reasoning-family detection. Covers gpt-5, gpt-5.x, and o-series (o1, o3, o4...).
const isReasoningModel = (model: string): boolean =>
  /^gpt-5(\.|$|-)/.test(model) || /^o\d/.test(model);

// Reasoning models take `reasoningEffort` and reject `temperature`; non-reasoning
// models (gpt-4o, gpt-4o-mini) take `temperature` and reject `reasoningEffort`.
// Passing the wrong one errors at the OpenAI API, so each caller supplies both
// and we spread in only the param the chosen model accepts.
const samplingParams = (
  model: string,
  reasoningEffort: ReasoningEffort,
  temperature: number,
) => (isReasoningModel(model) ? { reasoningEffort } : { temperature });

// Main agent model. Default to gpt-5.5 — gpt-4o-mini was faster but regressed
// extraction quality on the 12KB clinical prompt (missing fields, wrong tool
// routing). Override via AGENT_MODEL ("gpt-4o-mini", "gpt-4o") to A/B without
// a code change. reasoningEffort "medium" trades a little latency for fewer
// dropped fields; timeout is the per-completion ceiling (whole run is bounded
// by maxDuration=300 in the route).
export const llmAgent = () => {
  const model = process.env.AGENT_MODEL ?? "gpt-5.5";
  return new ChatOpenAI({
    model,
    ...samplingParams(model, "medium", 0),
    maxRetries: 2,
    maxConcurrency: 3,
    timeout: 120000,
    streaming: true,
  });
};

// For summarization and structured extraction — needs accurate code/criteria
// extraction. Override via SUMMARIZER_MODEL to A/B without a code change.
// Routed through samplingParams so a reasoning-family model gets reasoningEffort
// and a non-reasoning model keeps the 0.2 temperature; passing temperature to a
// reasoning model would error at the API.
export const llmSummarizer = () => {
  const model = process.env.SUMMARIZER_MODEL ?? "gpt-5.5";
  return new ChatOpenAI({
    model,
    ...samplingParams(model, "medium", 0.2),
    maxRetries: 2,
    timeout: 90000,
  });
};

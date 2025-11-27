import { ChatOpenAI } from "@langchain/openai";

// Counter to track the number of calls
let openAICallCount = 0;
let totalTokensUsed = 0;

// For the main agent - optimized for performance with GPT-4o
export const llmAgent = new ChatOpenAI({
  model: "gpt-5",               // Using GPT-4o for optimal performance
  maxRetries: 2,                 // Limit retries to reduce latency
  maxConcurrency: 3,             // Reduced concurrency to avoid rate limits
  timeout: 60000,                // Increased timeout for larger documents
  streaming: false,              // Disable streaming for document processing to avoid timeouts
  callbacks: [
    {
      handleLLMStart: async () => {
        openAICallCount++;
        console.log(`OpenAI gpt-5 model called. Total calls so far: ${openAICallCount}`);
      },
      handleLLMEnd: async (output) => {
        const tokensUsed = (output as any)?.usage?.total_tokens || 0;
        totalTokensUsed += tokensUsed;
        console.log(`OpenAI gpt-5 model call completed. Tokens used: ${tokensUsed}. Total tokens used so far: ${totalTokensUsed}`);
      },
    },
  ],
});

// For summarization and data extraction - using GPT-4o for consistency
export const llmSummarizer = new ChatOpenAI({
  model: "gpt-4o",               // Using GPT-4o for all operations
  temperature: 0.2,              // More deterministic for summarization
  maxRetries: 2,
  timeout: 60000,                // 60 second timeout for longer operations
  callbacks: [
    {
      handleLLMStart: async () => {
        openAICallCount++;
        console.log(`OpenAI gpt-4o model called. Total calls so far: ${openAICallCount}`);
      },
      handleLLMEnd: async (output) => {
        const tokensUsed = (output as any)?.usage?.total_tokens || 0;
        totalTokensUsed += tokensUsed;
        console.log(`OpenAI gpt-4o model call completed. Tokens used: ${tokensUsed}. Total tokens used so far: ${totalTokensUsed}`);
      },
    },
  ],
});

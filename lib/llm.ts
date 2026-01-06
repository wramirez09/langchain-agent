import { ChatOpenAI } from "@langchain/openai";
import { reportUsage } from "./usage";

import { createClient } from "@/utils/server";
// Counter to track the number of calls
let openAICallCount = 0;
let totalTokensUsed = 0;

// For the main agent - optimized for performance with GPT-4o
export const llmAgent = (usageType?: string) => new ChatOpenAI({
  model: "gpt-5",
  maxRetries: 2,
  maxConcurrency: 3,
  timeout: 60000,
  streaming: false,
  callbacks: [
    {
      handleLLMStart: async () => {
        openAICallCount++;
        console.log(`OpenAI gpt-5 model called. Total calls so far: ${openAICallCount}`);
      },
      handleLLMEnd: async (output) => {
        const tokensUsed = (output as any)?.usage?.total_tokens || 0;
        totalTokensUsed += tokensUsed;
        console.log(`OpenAI gpt-5 model call completed. Tokens used: ${tokensUsed}. Total tokens used so far: ${totalTokensUsed} and total llm calls ${openAICallCount}`);

        // Report usage to Stripe
        try {
          // Get the user ID from the context or session
          // This assumes you have a way to get the current user
          const supabase = await createClient();
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) {
            console.log(`llmAgent - No user found to report usage`);
            return
          };
          if (user) {
            console.log(`llmAgent - Reporting usage for user ${user.id} with ${openAICallCount} calls`);
            await reportUsage({
              userId: user.id,
              usageType: 'orchestrator',
              quantity: openAICallCount, // Or calculate based on tokens if needed
            });
          }
        } catch (error) {
          console.error('Failed to report LM usage:', error);
          // Don't throw to avoid breaking the main functionality
        }
      },
    },
  ],
});

// For summarization and data extraction - using GPT-4o for consistency
export const llmSummarizer = (usageType?: string) => new ChatOpenAI({
  model: "gpt-4o",
  temperature: 0.2,
  maxRetries: 2,
  timeout: 60000,
  callbacks: [
    {
      handleLLMStart: async () => {
        openAICallCount++;
        console.log(`OpenAI gpt-4o model called. Total calls so far: ${openAICallCount}`);
      },
      handleLLMEnd: async (output) => {
        const tokensUsed = (output as any)?.usage?.total_tokens || 0;
        totalTokensUsed += tokensUsed;
        console.log(`OpenAI gpt-4o model call completed. Tokens used: ${tokensUsed}. Total tokens used so far: ${totalTokensUsed} & total llm call ${openAICallCount}`);

        // Report usage to Stripe
        try {
          const supabase = await createClient();
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) {
            console.log("no user found")
            return
          }
          if (user) {
            console.log(`llmSummarizer - Reporting usage for user ${user.id} with ${openAICallCount} calls`);
            await reportUsage({
              userId: user.id,
              usageType: 'summerizer', // Different event type for summarization
              quantity: openAICallCount, // Or calculate based on tokens if needed
            });
          }
        } catch (error) {
          console.error('Failed to report summary usage:', error);
          // Don't throw to avoid breaking the main functionality
        }
      },
    },
  ],
});

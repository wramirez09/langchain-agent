// lib/retry.ts
export interface RetryOptions {
  maxAttempts?: number;
  initialDelay?: number;
  backoffMultiplier?: number;
  retryableErrors?: string[];
  nonRetryableErrors?: string[];
  onRetry?: (attempt: number, error: Error) => void;
  context?: string;
}

export interface RetryResult<T> {
  success: boolean;
  data?: T;
  error?: Error;
  attempts: number;
  totalDuration: number;
}

export class RetryError extends Error {
  constructor(
    message: string,
    public readonly attempts: number,
    public readonly originalError: Error,
    public readonly context?: string
  ) {
    super(message);
    this.name = 'RetryError';
  }
}

export function isRetryableError(error: Error, options: RetryOptions): boolean {
  const errorMessage = error.message.toLowerCase();
  
  // Check for non-retryable errors first
  if (options.nonRetryableErrors) {
    for (const nonRetryable of options.nonRetryableErrors) {
      if (errorMessage.includes(nonRetryable.toLowerCase())) {
        return false;
      }
    }
  }
  
  // Check for retryable errors
  if (options.retryableErrors) {
    for (const retryable of options.retryableErrors) {
      if (errorMessage.includes(retryable.toLowerCase())) {
        return true;
      }
    }
    return false; // If specific retryable errors are defined, only retry those
  }
  
  // Default retryable conditions
  const defaultRetryablePatterns = [
    'timeout',
    'network',
    'connection',
    'rate limit',
    'temporary',
    'service unavailable',
    'internal server error',
    'bad gateway',
    'gateway timeout',
    'etimedout',
    'enotfound',
    'econnrefused',
    'econnreset'
  ];
  
  return defaultRetryablePatterns.some(pattern => errorMessage.includes(pattern));
}

export async function withRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {}
): Promise<RetryResult<T>> {
  const startTime = Date.now();
  const maxAttempts = options.maxAttempts ?? 3;
  const initialDelay = options.initialDelay ?? 1000;
  const backoffMultiplier = options.backoffMultiplier ?? 2;
  const context = options.context ?? 'Unknown operation';
  
  let lastError: Error;
  let totalDuration = 0;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await operation();
      totalDuration = Date.now() - startTime;
      
      if (attempt > 1) {
        console.log(`✅ [${context}] Operation succeeded on attempt ${attempt}/${maxAttempts} after ${totalDuration}ms`);
      }
      
      return {
        success: true,
        data: result,
        attempts: attempt,
        totalDuration
      };
    } catch (error) {
      lastError = error as Error;
      
      // Log the attempt
      console.error(`❌ [${context}] Attempt ${attempt}/${maxAttempts} failed:`, {
        error: lastError.message,
        stack: lastError.stack,
        attempt,
        maxAttempts
      });
      
      // Check if we should retry
      if (attempt === maxAttempts || !isRetryableError(lastError, options)) {
        totalDuration = Date.now() - startTime;
        
        const finalError = new RetryError(
          `Operation failed after ${attempt} attempts: ${lastError.message}`,
          attempt,
          lastError,
          context
        );
        
        console.error(`🔴 [${context}] Final failure after ${attempt} attempts and ${totalDuration}ms:`, {
          error: lastError.message,
          attempts: attempt,
          totalDuration,
          context
        });
        
        return {
          success: false,
          error: finalError,
          attempts: attempt,
          totalDuration
        };
      }
      
      // Call retry callback if provided
      if (options.onRetry) {
        options.onRetry(attempt, lastError);
      }
      
      // Calculate delay and wait
      const delay = initialDelay * Math.pow(backoffMultiplier, attempt - 1);
      console.log(`⏳ [${context}] Retrying in ${delay}ms... (attempt ${attempt + 1}/${maxAttempts})`);
      
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  // This should never be reached, but TypeScript requires it
  return {
    success: false,
    error: lastError!,
    attempts: maxAttempts,
    totalDuration: Date.now() - startTime
  };
}

// Predefined retry configurations for different operation types
export const RETRY_CONFIGS = {
  LLM_API: {
    maxAttempts: 3,
    initialDelay: 1000,
    backoffMultiplier: 2,
    retryableErrors: ['rate limit', 'timeout', 'network', 'temporary', 'service unavailable'],
    nonRetryableErrors: ['invalid api key', 'authentication', 'permission', 'not found'],
    context: 'LLM API Call'
  },
  
  DATABASE: {
    maxAttempts: 3,
    initialDelay: 500,
    backoffMultiplier: 2,
    retryableErrors: ['connection', 'timeout', 'deadlock', 'temporary', 'service unavailable'],
    nonRetryableErrors: ['invalid query', 'permission', 'not found', 'constraint'],
    context: 'Database Operation'
  },
  
  EXTERNAL_API: {
    maxAttempts: 3,
    initialDelay: 2000,
    backoffMultiplier: 2,
    retryableErrors: ['timeout', 'network', 'rate limit', 'temporary', 'service unavailable'],
    nonRetryableErrors: ['authentication', 'permission', 'not found', 'invalid'],
    context: 'External API Call'
  },
  
  CRITICAL: {
    maxAttempts: 5,
    initialDelay: 1000,
    backoffMultiplier: 1.5,
    retryableErrors: ['timeout', 'network', 'connection', 'temporary'],
    nonRetryableErrors: ['authentication', 'permission'],
    context: 'Critical Operation'
  }
};

// Helper function to create a retryable wrapper for common operations
export function createRetryableOperation<T>(
  operation: () => Promise<T>,
  configKey: keyof typeof RETRY_CONFIGS,
  customOptions?: Partial<RetryOptions>
) {
  return withRetry(operation, { ...RETRY_CONFIGS[configKey], ...customOptions });
}

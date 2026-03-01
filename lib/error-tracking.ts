// lib/error-tracking.ts
export interface ErrorInfo {
  id: string;
  timestamp: Date;
  severity: 'low' | 'medium' | 'high' | 'critical';
  category: 'llm' | 'database' | 'external_api' | 'validation' | 'network' | 'unknown';
  message: string;
  context?: string;
  attempts?: number;
  originalError?: Error;
  userId?: string;
  requestId?: string;
  operation?: string;
  resolved?: boolean;
  resolutionTime?: Date;
}

export interface ClientErrorNotification {
  id: string;
  timestamp: Date;
  severity: 'warning' | 'error' | 'critical';
  userMessage: string;
  technicalMessage?: string;
  retryAttempts?: number;
  operation?: string;
  canRetry?: boolean;
}

class ErrorTracker {
  private errors: Map<string, ErrorInfo> = new Map();
  private clientNotifications: ClientErrorNotification[] = [];
  
  generateErrorId(): string {
    return `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  categorizeError(error: Error): ErrorInfo['category'] {
    const message = error.message.toLowerCase();
    
    if (message.includes('openai') || message.includes('llm') || message.includes('model')) {
      return 'llm';
    }
    if (message.includes('database') || message.includes('supabase') || message.includes('sql')) {
      return 'database';
    }
    if (message.includes('stripe') || message.includes('api') || message.includes('external')) {
      return 'external_api';
    }
    if (message.includes('validation') || message.includes('invalid') || message.includes('schema')) {
      return 'validation';
    }
    if (message.includes('network') || message.includes('timeout') || message.includes('connection')) {
      return 'network';
    }
    
    return 'unknown';
  }

  determineSeverity(error: Error, attempts: number = 1): ErrorInfo['severity'] {
    const message = error.message.toLowerCase();
    
    // Critical errors that should never be retried
    if (message.includes('authentication') || message.includes('permission') || message.includes('invalid api key')) {
      return 'critical';
    }
    
    // High severity for multiple failures
    if (attempts >= 3) {
      return 'high';
    }
    
    // Medium severity for network/database issues
    if (message.includes('timeout') || message.includes('connection') || message.includes('database')) {
      return 'medium';
    }
    
    // Low severity for temporary issues
    if (message.includes('temporary') || message.includes('rate limit')) {
      return 'low';
    }
    
    return 'medium';
  }

  trackError(error: Error, context?: string, attempts?: number, userId?: string, requestId?: string, operation?: string): ErrorInfo {
    const errorId = this.generateErrorId();
    const errorInfo: ErrorInfo = {
      id: errorId,
      timestamp: new Date(),
      severity: this.determineSeverity(error, attempts),
      category: this.categorizeError(error),
      message: error.message,
      context,
      attempts,
      originalError: error,
      userId,
      requestId,
      operation
    };
    
    this.errors.set(errorId, errorInfo);
    
    // Log to console with structured format
    console.error(`🔴 [${errorInfo.category.toUpperCase()}] ${errorInfo.severity.toUpperCase()}:`, {
      id: errorId,
      message: error.message,
      severity: errorInfo.severity,
      category: errorInfo.category,
      attempts,
      context,
      userId,
      operation,
      timestamp: errorInfo.timestamp
    });
    
    return errorInfo;
  }

  createClientNotification(errorInfo: ErrorInfo): ClientErrorNotification {
    const userMessage = this.generateUserFriendlyMessage(errorInfo);
    const canRetry = errorInfo.attempts! < 3 && errorInfo.severity !== 'critical';
    
    const notification: ClientErrorNotification = {
      id: errorInfo.id,
      timestamp: errorInfo.timestamp,
      severity: errorInfo.severity === 'critical' ? 'critical' : 
               errorInfo.severity === 'high' ? 'error' : 'warning',
      userMessage,
      technicalMessage: errorInfo.message,
      retryAttempts: errorInfo.attempts,
      operation: errorInfo.operation,
      canRetry
    };
    
    this.clientNotifications.push(notification);
    
    // Keep only last 50 notifications
    if (this.clientNotifications.length > 50) {
      this.clientNotifications = this.clientNotifications.slice(-50);
    }
    
    return notification;
  }

  private generateUserFriendlyMessage(errorInfo: ErrorInfo): string {
    const { category, severity, attempts } = errorInfo;
    
    switch (category) {
      case 'llm':
        if (severity === 'critical') {
          return 'AI service is temporarily unavailable. Please try again in a few minutes.';
        }
        return `AI assistant encountered an issue after ${attempts} attempts. Please try rephrasing your question.`;
        
      case 'database':
        if (severity === 'critical') {
          return 'Data service is currently unavailable. Our team has been notified.';
        }
        return `Unable to retrieve information after ${attempts} attempts. Please try again.`;
        
      case 'external_api':
        if (severity === 'critical') {
          return 'External service is unavailable. Please try again later.';
        }
        return `Third-party service issue after ${attempts} attempts. Please try again.`;
        
      case 'validation':
        return 'Invalid request format. Please check your input and try again.';
        
      case 'network':
        return `Network connection issue after ${attempts} attempts. Please check your connection and try again.`;
        
      default:
        return `An error occurred after ${attempts} attempts. Please try again or contact support if the issue persists.`;
    }
  }

  getErrorById(id: string): ErrorInfo | undefined {
    return this.errors.get(id);
  }

  getClientNotifications(userId?: string, limit: number = 10): ClientErrorNotification[] {
    const notifications = this.clientNotifications;
    
    // Filter by user if specified (would need to add userId to notifications)
    // if (userId) {
    //   notifications = notifications.filter(n => n.userId === userId);
    // }
    
    return notifications.slice(-limit);
  }

  resolveError(id: string): void {
    const error = this.errors.get(id);
    if (error) {
      error.resolved = true;
      error.resolutionTime = new Date();
      console.log(`✅ Error resolved: ${id}`);
    }
  }

  getErrorStats(): {
    total: number;
    byCategory: Record<string, number>;
    bySeverity: Record<string, number>;
    unresolved: number;
  } {
    const errors = Array.from(this.errors.values());
    
    return {
      total: errors.length,
      byCategory: errors.reduce((acc, err) => {
        acc[err.category] = (acc[err.category] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      bySeverity: errors.reduce((acc, err) => {
        acc[err.severity] = (acc[err.severity] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      unresolved: errors.filter(err => !err.resolved).length
    };
  }
}

// Singleton instance
export const errorTracker = new ErrorTracker();

// Helper function to track errors from retry operations
export function trackRetryError(error: Error, context?: string, attempts?: number, userId?: string, operation?: string): ErrorInfo {
  return errorTracker.trackError(error, context, attempts, userId, undefined, operation);
}

// Helper function to create client notification from retry result
export function createClientErrorNotification(errorInfo: ErrorInfo): ClientErrorNotification {
  return errorTracker.createClientNotification(errorInfo);
}

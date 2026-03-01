"use client";

import React, { useState, useRef, useMemo } from "react";
import { AlertCircle, RefreshCw, X } from "lucide-react";
import { Button } from "./ui/button";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "./ui/alert";

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

interface ErrorNotificationProps {
  error: ClientErrorNotification;
  onRetry?: () => void;
  onDismiss?: (errorId: string) => void;
}

export function ErrorNotification({ error, onRetry, onDismiss }: ErrorNotificationProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const getSeverityColor = (severity: ClientErrorNotification['severity']) => {
    switch (severity) {
      case 'warning':
        return "border-yellow-200 bg-yellow-50 text-yellow-800";
      case 'error':
        return "border-red-200 bg-red-50 text-red-800";
      case 'critical':
        return "border-red-300 bg-red-100 text-red-900";
      default:
        return "border-gray-200 bg-gray-50 text-gray-800";
    }
  };

  const getIconColor = (severity: ClientErrorNotification['severity']) => {
    switch (severity) {
      case 'warning':
        return "text-yellow-600";
      case 'error':
        return "text-red-600";
      case 'critical':
        return "text-red-700";
      default:
        return "text-gray-600";
    }
  };

  return (
    <Alert className={`mb-4 ${getSeverityColor(error.severity)}`}>
      <AlertCircle className={`h-4 w-4 ${getIconColor(error.severity)}`} />
      <div className="flex-1">
        <AlertTitle className="flex items-center justify-between">
          <span>
            {error.severity === 'critical' ? 'Critical Error' : 
             error.severity === 'error' ? 'Error' : 'Warning'}
            {error.retryAttempts && error.retryAttempts > 1 && (
              <span className="ml-2 text-sm opacity-75">
                (Failed after {error.retryAttempts} attempts)
              </span>
            )}
          </span>
          <div className="flex items-center space-x-2">
            {error.canRetry && onRetry && (
              <Button
                variant="outline"
                size="sm"
                onClick={onRetry}
                className="h-6 px-2 text-xs"
              >
                <RefreshCw className="h-3 w-3 mr-1" />
                Retry
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsExpanded(!isExpanded)}
              className="h-6 px-2 text-xs"
            >
              {isExpanded ? 'Hide' : 'Details'}
            </Button>
            {onDismiss && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onDismiss(error.id)}
                className="h-6 w-6 p-0"
              >
                <X className="h-3 w-3" />
              </Button>
            )}
          </div>
        </AlertTitle>
        <AlertDescription className="mt-2">
          <p>{error.userMessage}</p>
          
          {isExpanded && (
            <div className="mt-3 space-y-2 text-sm opacity-90">
              {error.operation && (
                <p><strong>Operation:</strong> {error.operation}</p>
              )}
              {error.technicalMessage && (
                <p><strong>Technical Details:</strong> {error.technicalMessage}</p>
              )}
              <p><strong>Time:</strong> {error.timestamp.toLocaleTimeString()}</p>
              {error.retryAttempts && (
                <p><strong>Retry Attempts:</strong> {error.retryAttempts}</p>
              )}
            </div>
          )}
        </AlertDescription>
      </div>
    </Alert>
  );
}

interface ErrorNotificationManagerProps {
  errors: ClientErrorNotification[];
  onRetry?: (errorId: string) => void;
  onDismiss?: (errorId: string) => void;
  maxVisible?: number;
}

export function ErrorNotificationManager({ 
  errors, 
  onRetry, 
  onDismiss, 
  maxVisible = 3 
}: ErrorNotificationManagerProps) {
  // Sort errors by severity and timestamp, show most recent/severe
  const visibleErrors = useMemo(() => {
    const sortedErrors = [...errors]
      .sort((a, b) => {
        // First by severity (critical > error > warning)
        const severityOrder = { critical: 3, error: 2, warning: 1 };
        const aSeverity = severityOrder[a.severity];
        const bSeverity = severityOrder[b.severity];
        
        if (aSeverity !== bSeverity) {
          return bSeverity - aSeverity;
        }
        
        // Then by timestamp (most recent first)
        return b.timestamp.getTime() - a.timestamp.getTime();
      })
      .slice(0, maxVisible);
    
    return sortedErrors;
  }, [errors, maxVisible]);

  if (visibleErrors.length === 0) {
    return null;
  }

  return (
    <div className="fixed top-4 right-4 z-50 max-w-md space-y-2">
      {visibleErrors.map((error) => (
        <ErrorNotification
          key={error.id}
          error={error}
          onRetry={() => onRetry?.(error.id)}
          onDismiss={onDismiss}
        />
      ))}
    </div>
  );
}

// Hook for managing error notifications in components
export function useErrorNotifications() {
  const [errors, setErrors] = useState<ClientErrorNotification[]>([]);
  const errorIdCounter = useRef(0);

  const addError = (error: Omit<ClientErrorNotification, 'id' | 'timestamp'>) => {
    // Generate ID using a counter instead of random
    errorIdCounter.current += 1;
    const timestamp = new Date();
    
    const newError: ClientErrorNotification = {
      ...error,
      id: `error_${timestamp.getTime()}_${errorIdCounter.current}`,
      timestamp,
    };
    
    setErrors(prev => [...prev, newError]);
    
    // Auto-dismiss warnings after 10 seconds, errors after 30 seconds
    const dismissTime = error.severity === 'warning' ? 10000 : 30000;
    setTimeout(() => {
      dismissError(newError.id);
    }, dismissTime);
  };

  const dismissError = (errorId: string) => {
    setErrors(prev => prev.filter(e => e.id !== errorId));
  };

  const retryError = (errorId: string) => {
    const error = errors.find(e => e.id === errorId);
    if (error && error.canRetry) {
      // This would be implemented by the specific component
      // For now, just dismiss the error
      dismissError(errorId);
    }
  };

  const clearAllErrors = () => {
    setErrors([]);
  };

  return {
    errors,
    addError,
    dismissError,
    retryError,
    clearAllErrors,
  };
}

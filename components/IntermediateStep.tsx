import { useState } from "react";
import type { Message } from "ai/react";
import { ChevronDown, ChevronUp } from "lucide-react";

interface StepAction {
  name?: string;
  args?: Record<string, unknown>;
  [key: string]: unknown;
}

interface StepData {
  action?: StepAction;
  observation?: string | Record<string, unknown>;
  [key: string]: unknown;
}

function parseStepContent(content: string): StepData {
  if (!content) return { action: { name: 'Processing...' } };
  
  // If content is already an object
  if (typeof content === 'object') {
    return content as StepData;
  }

  // If content is a string that looks like JSON
  if (typeof content === 'string') {
    try {
      // Remove any non-JSON content before parsing
      const jsonStart = content.indexOf('{');
      const jsonEnd = content.lastIndexOf('}') + 1;
      const jsonContent = content.slice(jsonStart, jsonEnd);
      
      if (jsonStart >= 0 && jsonEnd > 0) {
        return JSON.parse(jsonContent) as StepData;
      }
      
      // If no JSON found, treat the whole content as observation
      return { 
        action: { name: 'Step' },
        observation: content 
      };
    } catch (error) {
      console.error('Error parsing step content:', error);
      return { 
        action: { name: 'Step' },
        observation: content 
      };
    }
  }

  // Fallback for any other case
  return { 
    action: { name: 'Processing...' },
    observation: String(content)
  };
}

export function IntermediateStep({ message }: { message: Message }) {
  const [expanded, setExpanded] = useState(false);
  const stepData = parseStepContent(message.content);
  const action = stepData?.action || {};
  const observation = stepData?.observation;

  const renderContent = (content: unknown): React.ReactNode => {
    if (content === null || content === undefined) return null;
    if (typeof content === 'string') return content;
    if (typeof content === 'object') {
      try {
        return <pre className="text-xs overflow-x-auto p-2 bg-gray-50 rounded">
          {JSON.stringify(content, null, 2)}
        </pre>;
      } catch {
        return String(content);
      }
    }
    return String(content);
  };

  return (
    <div className="mr-auto bg-gray-50 p-3 w-full mb-4 rounded-lg border border-gray-200">
      <button
        type="button"
        className="w-full text-left flex items-center justify-between"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="font-medium text-sm">
          {action?.name || 'Processing step...'}
        </span>
        {expanded ? (
          <ChevronUp className="w-4 h-4 text-gray-500" />
        ) : (
          <ChevronDown className="w-4 h-4 text-gray-500" />
        )}
      </button>

      {expanded && (
        <div className="mt-3 space-y-3 text-sm">
          {Object.keys(action).length > 1 && (
            <div className="bg-white p-3 rounded border">
              <h4 className="font-medium text-gray-700 text-xs uppercase tracking-wider mb-2">
                Action Details
              </h4>
              <div className="space-y-2">
                {Object.entries(action).map(([key, value]) => {
                  if (key === 'name' || !value) return null;
                  return (
                    <div key={key} className="grid grid-cols-1 sm:grid-cols-3 gap-1 sm:gap-2">
                      <span className="text-gray-500 text-xs font-medium">{key}:</span>
                      <div className="sm:col-span-2 break-words">
                        {renderContent(value)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {observation && (
            <div className="bg-blue-50 p-3 rounded border border-blue-100">
              <h4 className="font-medium text-blue-700 text-xs uppercase tracking-wider mb-2">
                Result
              </h4>
              <div className="whitespace-pre-wrap break-words">
                {renderContent(observation)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

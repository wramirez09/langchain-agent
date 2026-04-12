import { cn } from "@/utils/cn";
import type { Message } from "ai/react";
import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import ReactMarkdown from "react-markdown";
import { Loader2 } from "lucide-react";

interface MarkdownRendererProps {
  content: string;
}
const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content }) => {
  // Helper to detect section context from content
  const getSectionContext = (position: number): 'required-documentation' | 'medical-necessity' | 'exclusions' | 'summary' | 'relevant-codes' | null => {
    const beforeText = content.substring(Math.max(0, position - 1500), position).toLowerCase();
    
    // Find the last occurrence of each section marker
    const lastSummaryIndex = Math.max(
      beforeText.lastIndexOf('summary report'),
      beforeText.lastIndexOf('## summary')
    );
    const lastMedNecIndex = beforeText.lastIndexOf('medical necessity criteria');
    const lastReqDocIndex = beforeText.lastIndexOf('required documentation');
    const lastExclIndex = Math.max(
      beforeText.lastIndexOf('limitations and exclusions'),
      beforeText.lastIndexOf('limitations/exclusions'),
      beforeText.lastIndexOf('exclusions:'),
      beforeText.lastIndexOf('limitations:')
    );
    const lastRelevantCodesIndex = beforeText.lastIndexOf('relevant codes');
    
    // Determine which section we're in based on the most recent section header
    const sectionIndices: Array<{ index: number; type: 'required-documentation' | 'medical-necessity' | 'exclusions' | 'summary' | 'relevant-codes' | null }> = [
      { index: lastSummaryIndex, type: 'summary' },
      { index: lastMedNecIndex, type: 'medical-necessity' },
      { index: lastReqDocIndex, type: 'required-documentation' },
      { index: lastExclIndex, type: 'exclusions' },
      { index: lastRelevantCodesIndex, type: 'relevant-codes' },
    ];
    
    // Sort by index descending to find the most recent section
    const mostRecent = sectionIndices
      .filter(s => s.index >= 0)
      .sort((a, b) => b.index - a.index)[0];
    
    return mostRecent?.type ?? null;
  };

  return (
    <div className="prose max-w-none">
      <ReactMarkdown
        components={{
          a: (props) => (
            <a
              {...props}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:text-blue-800 underline break-all"
            />
          ),
          strong: ({ children, ...props }) => {
            const text = String(children).toLowerCase();
            
            // Style Medical Necessity Criteria header in green
            if (text.includes('medical necessity criteria')) {
              return <strong {...props} className="text-green-700 font-semibold">{children}</strong>;
            }
            
            // Style Limitations and Exclusions header in red
            if (text.includes('limitations and exclusions') || text.includes('limitations') && text.includes('exclusions')) {
              return <strong {...props} className="text-red-700 font-semibold">{children}</strong>;
            }
            
            // Render all other strong/bold text as default markdown
            return <strong {...props}>{children}</strong>;
          },
          ul: ({ children, ...props }) => {
            // Pass through ul elements with default styling
            return <ul {...props}>{children}</ul>;
          },
          ol: ({ children, ...props }) => {
            // Pass through ol elements with default styling
            return <ol {...props}>{children}</ol>;
          },
          li: ({ children, ...props }) => {
            // Extract text from children, handling React elements
            const extractText = (node: React.ReactNode): string => {
              if (typeof node === 'string') return node;
              if (typeof node === 'number') return String(node);
              if (Array.isArray(node)) return node.map(extractText).join(' ');
              if (node && typeof node === 'object' && 'props' in node) {
                const element = node as { props?: { children?: React.ReactNode } };
                if (element.props?.children) {
                  return extractText(element.props.children);
                }
              }
              return '';
            };
            
            const childText = extractText(children).toLowerCase();
            const contentLower = content.toLowerCase();
            
            // Find approximate position of this list item in content
            // Use first meaningful text for matching (minimum 5 chars)
            const meaningfulText = childText.trim();
            let position = -1;
            
            if (meaningfulText.length >= 5) {
              // Try to find the text in content, using progressively shorter search strings
              const searchLength = Math.min(30, meaningfulText.length);
              const searchText = meaningfulText.substring(0, searchLength);
              position = contentLower.indexOf(searchText);
              
              // If not found, try first few words
              if (position === -1) {
                const firstWords = meaningfulText.split(' ').slice(0, 3).join(' ');
                if (firstWords.length >= 5) {
                  position = contentLower.indexOf(firstWords);
                }
              }
            }
            
            const context = position >= 0 ? getSectionContext(position) : null;
            
            // Required Documentation section - checkboxes only
            if (context === 'required-documentation') {
              return (
                <li {...props} className="flex items-start gap-2">
                  <input 
                    type="checkbox" 
                    className="mt-1 h-4 w-4 flex-shrink-0 rounded border-gray-300 focus:ring-blue-500"
                    disabled
                  />
                  <span>{children}</span>
                </li>
              );
            }
            
            // Medical Necessity Criteria section - green text with checkboxes (until Relevant Codes)
            if (context === 'medical-necessity') {
              return (
                <li {...props} className="flex items-start gap-2 text-green-700">
                  <input 
                    type="checkbox" 
                    className="mt-1 h-4 w-4 flex-shrink-0 rounded border-gray-300 focus:ring-blue-500"
                    disabled
                  />
                  <span>{children}</span>
                </li>
              );
            }
            
            // Limitations/Exclusions section - red text with red X (until Summary Report)
            if (context === 'exclusions') {
              return (
                <li {...props} className="flex items-start gap-2 text-red-700">
                  <span className="mt-0.5 font-bold text-red-700 flex-shrink-0">✗</span>
                  <span>{children}</span>
                </li>
              );
            }
            
            // All other sections - render as default markdown (no modifications)
            return <li {...props}>{children}</li>;
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div >
  );
};

const LOADING_MESSAGES = [
  "Analyzing authorization criteria...",
  "Reviewing documentation requirements...",
  "Evaluating coding alignment...",
  "Checking authorization readiness...",
  "Cross-referencing payer guidelines...",
  "Validating submission criteria...",
];

export function ChatMessageBubble(props: {
  message: Message;
  aiEmoji?: string;
  sources?: any[];
  isLastMessage?: boolean;
  isLoading?: boolean;
}) {
  const isUser = props.message.role === "user";
  const [displayContent, setDisplayContent] = useState("");
  const [loadingMsgIndex, setLoadingMsgIndex] = useState(0);

  // Handle streaming content for AI messages
  useEffect(() => {
    if (isUser) {
      setDisplayContent(props.message.content);
      return;
    }
    setDisplayContent(props.message.content);
  }, [props.message.content, isUser]);

  // Rotate loading messages every 3 seconds while waiting for initial response
  useEffect(() => {
    if (!props.isLoading || !props.isLastMessage || displayContent) return;
    const interval = setInterval(() => {
      setLoadingMsgIndex((prev) => (prev + 1) % LOADING_MESSAGES.length);
    }, 3000);
    return () => {
      clearInterval(interval);
      setLoadingMsgIndex(0);
    };
  }, [props.isLoading, props.isLastMessage, displayContent]);

  // Skip rendering if there's no content and it's not a loading state
  if (!displayContent && !props.isLoading) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className={cn(
        "group relative mb-3 flex w-full",
        isUser ? "ml-auto" : "mr-auto",
      )}
    >
      {!isUser && (
        <div className="hidden md:flex mr-3 mt-1 flex-shrink-0">
          <div className="h-8 w-8 rounded-full bg-[#358cee] flex items-center justify-center text-white font-medium">
            <span className="text-sm">ND</span>
          </div>
        </div>
      )}

      <div className="flex-1">
        <div
          className={cn(
            "rounded-2xl px-4 py-2.5 shadow-sm transition-all duration-200",
            isUser
              ? "bg-gray-100 text-white rounded-tr-none hover:bg-gray-200"
              : "bg-white border border-blue-100 rounded-tl-none text-gray-900 hover:bg-blue-50",
          )}
        >
          <div className="prose prose-sm max-w-none leading-snug">
            {props.isLoading && props.isLastMessage && !displayContent ? (
              <div className="flex items-center space-x-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />
                <span className="text-sm">{LOADING_MESSAGES[loadingMsgIndex]}</span>
              </div>
            ) : (
              <MarkdownRenderer content={props.message.content} />
            )}
          </div>

          {!isUser && props.isLastMessage && displayContent && !props.isLoading && (
            <div className="mt-3 p-2 bg-blue-50 border border-blue-100 rounded-md">
              <div className="text-xs text-blue-700 italic">
                Always verify with payer portal guidelines prior to submission. This analysis is based on publicly available information.
              </div>
            </div>
          )}

          {!isUser && props.sources && props.sources.length > 0 && (
            <div className="mt-1.5 text-xs text-gray-500">
              <div className="font-medium mb-0.5">Sources:</div>
              <div className="space-y-0.5">
                {props.sources.map((source, index) => (
                  <div key={index} className="flex items-center">
                    <svg
                      className="w-2.5 h-2.5 mr-1 flex-shrink-0"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path d="M11 3a1 1 0 10-2 0v1H8a1 1 0 100 2h1v1a1 1 0 102 0V6h1a1 1 0 100-2h-1V3z" />
                      <path d="M3 5a2 2 0 012-2h1a1 1 0 010 2H5v7h2v1H5a2 2 0 01-2-2V5zm12 0v10a2 2 0 01-2 2H7a2 2 0 01-2-2V5h10z" />
                    </svg>
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline truncate max-w-xs inline-block text-xs"
                    >
                      {source.title || source.url}
                    </a>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>

      </div>

      {isUser && (
        <div className="ml-2 mt-1 flex-shrink-0">
          <div className="h-8 w-8 rounded-full bg-[#358cee] hidden md:flex items-center justify-center text-white font-medium text-sm">
            {"U"}
          </div>
        </div>
      )}

    </motion.div>
  );
}

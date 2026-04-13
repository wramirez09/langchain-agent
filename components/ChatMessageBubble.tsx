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
  // Track current section as we render (using object to allow mutation during render)
  const sectionTracker = { current: null as 'medical-necessity-zone' | 'exclusions' | 'summary' | 'relevant-codes' | null };
  
  // Helper to detect section context from content
  const getSectionContext = (position: number): 'medical-necessity-zone' | 'exclusions' | 'summary' | 'relevant-codes' | null => {
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
    
    // Medical Necessity Zone: from "Medical Necessity Criteria" OR "Required Documentation" until "Relevant Codes"
    const medNecZoneStart = Math.max(lastMedNecIndex, lastReqDocIndex);
    
    // Determine which section we're in based on the most recent section header
    const sectionIndices: Array<{ index: number; type: 'medical-necessity-zone' | 'exclusions' | 'summary' | 'relevant-codes' | null }> = [
      { index: lastSummaryIndex, type: 'summary' },
      { index: medNecZoneStart, type: 'medical-necessity-zone' },
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
            
            // Update section tracking and style Medical Necessity Criteria header in green
            if (text.includes('medical necessity criteria')) {
              sectionTracker.current = 'medical-necessity-zone';
              return <strong {...props} className="text-green-700 font-semibold">{children}</strong>;
            }
            
            // Update section tracking and style Required Documentation header in green
            if (text.includes('required documentation')) {
              sectionTracker.current = 'medical-necessity-zone';
              return <strong {...props} className="text-green-700 font-semibold">{children}</strong>;
            }
            
            // Update section tracking for Relevant Codes
            if (text.includes('relevant codes')) {
              sectionTracker.current = 'relevant-codes';
            }
            
            // Update section tracking and style Limitations and Exclusions header in red
            if (text.includes('limitations and exclusions') || text.includes('limitations') && text.includes('exclusions')) {
              sectionTracker.current = 'exclusions';
              return <strong {...props} className="text-red-700 font-semibold">{children}</strong>;
            }
            
            // Update section tracking for Summary
            if (text.includes('summary report') || text.includes('summary')) {
              sectionTracker.current = 'summary';
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
              
              // If still not found, try first two words
              if (position === -1) {
                const firstTwoWords = meaningfulText.split(' ').slice(0, 2).join(' ');
                if (firstTwoWords.length >= 5) {
                  position = contentLower.indexOf(firstTwoWords);
                }
              }
            }
            
            // Try to detect context from position, ALWAYS fallback to sectionTracker.current if position fails
            let context = position >= 0 ? getSectionContext(position) : null;
            
            // If position-based detection failed or returned null, use sectionTracker
            if (!context) {
              context = sectionTracker.current;
            }
            
            // Debug logging for nested bullets
            if (childText.includes('intra-articular') || childText.includes('mechanical symptoms')) {
              console.log('List item debug:', {
                text: childText.substring(0, 50),
                position,
                context,
                trackerCurrent: sectionTracker.current
              });
            }
            
            // Medical Necessity Zone (Medical Necessity Criteria + Required Documentation until Relevant Codes)
            // Green text with green checkboxes
            if (context === 'medical-necessity-zone') {
              return (
                <li {...props} className="flex items-start gap-2">
                  <input 
                    type="checkbox" 
                    className="mt-1 h-4 w-4 flex-shrink-0 rounded border-green-400 text-green-600 focus:ring-green-500"
                    disabled
                  />
                  <span className="text-green-700">{children}</span>
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
  const displayContent = props.message.content;
  const [loadingMsgIndex, setLoadingMsgIndex] = useState(0);

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

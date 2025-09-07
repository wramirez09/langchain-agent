import { cn } from "@/utils/cn";
import type { Message } from "ai/react";
import React, { useState, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import { motion, AnimatePresence } from "framer-motion";
import { IconChevronDown, IconChevronUp, IconExternalLink } from "@tabler/icons-react";

interface Source {
  pageContent: string;
  metadata?: {
    loc?: {
      lines?: {
        from: number;
        to: number;
      };
    };
    [key: string]: any;
  };
}

export function ChatMessageBubble(props: {
  message: Message;
  aiEmoji?: string;
  sources: Source[];
}) {
  const [isSourcesExpanded, setIsSourcesExpanded] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    return () => setIsMounted(false);
  }, []);

  const hasSources = props.sources && props.sources.length > 0;
  const isUser = props.message.role === "user";

  const formatSourceContent = (content: string) => {
    // Remove markdown formatting and trim long content
    const plainText = content.replace(/[#*_`]/g, '').trim();
    return plainText.length > 120
      ? `${plainText.substring(0, 120)}...`
      : plainText;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className={cn(
        "group relative mb-6 flex w-full max-w-[calc(100%-1.5rem)] md:max-w-[85%]",
        isUser ? "ml-auto" : "mr-auto"
      )}
    >
      {!isUser && props.aiEmoji && (
        <div className="hidden md:flex mr-3 mt-1 flex-shrink-0">
          <div className="h-8 w-8 rounded-full bg-white flex items-center justify-center shadow-sm border border-blue-200">
            <span className="text-lg">{props.aiEmoji}</span>
          </div>
        </div>
      )}

      <div className="flex-1">
        <div
          className={cn(
            "rounded-2xl px-4 py-3 shadow-sm transition-all duration-200",
            isUser
              ? "bg-[#1e7dbf] text-white rounded-tr-none hover:bg-[#1a6da8]"
              : "bg-white border border-blue-200 rounded-tl-none text-gray-900 hover:bg-blue-50"
          )}
        >
          <div className="prose prose-sm max-w-none">
            <ReactMarkdown className="whitespace-pre-wrap break-words">
              {props.message.content}
            </ReactMarkdown>
          </div>
        </div>

        {hasSources && (
          <motion.div
            className="mt-2 ml-2"
            initial={false}
            animate={{ opacity: isSourcesExpanded ? 1 : 0.8 }}
          >
            <button
              onClick={() => setIsSourcesExpanded(!isSourcesExpanded)}
              className={cn(
                "text-xs font-medium flex items-center gap-1 px-2 py-1 rounded-full transition-colors",
                isUser
                  ? "bg-blue-100 text-blue-900 hover:bg-blue-200"
                  : "text-blue-700 hover:bg-blue-50"
              )}
            >
              {isSourcesExpanded ? (
                <>
                  <IconChevronUp size={14} />
                  <span>Hide sources</span>
                </>
              ) : (
                <>
                  <IconChevronDown size={14} />
                  <span>{props.sources.length} source{props.sources.length > 1 ? 's' : ''}</span>
                </>
              )}
            </button>

            <AnimatePresence>
              {isSourcesExpanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className={cn(
                    "mt-2 space-y-2 p-3 rounded-lg text-sm",
                    isUser ? "bg-blue-50/30" : "bg-blue-200/70"
                  )}>
                    {props.sources.map((source, i) => (
                      <div
                        key={`source-${i}`}
                        className={cn(
                          "p-2 rounded-lg border text-xs",
                          isUser
                            ? "border-blue-100 bg-white/20"
                            : "border-blue-200 bg-blue-100"
                        )}
                      >
                        <div className="font-medium flex items-center gap-1 text-blue-700">
                          <IconExternalLink size={12} />
                          Source {i + 1}
                        </div>
                        <div className="mt-1 text-gray-700 line-clamp-2">
                          {formatSourceContent(source.pageContent)}
                        </div>
                        {source.metadata?.loc?.lines && (
                          <div className="mt-1 text-xs text-gray-500">
                            Lines {source.metadata.loc.lines.from}–{source.metadata.loc.lines.to}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </div>

      {isUser && (
        <div className="ml-2 mt-1 flex-shrink-0">
          <div className="h-8 w-8 rounded-full bg-[#1e7dbf] flex items-center justify-center text-white font-medium">
            {props.message.name?.charAt(0).toUpperCase() || 'U'}
          </div>
        </div>
      )}
    </motion.div>
  );
}

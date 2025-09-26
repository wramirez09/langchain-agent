import { cn } from "@/utils/cn";
import type { Message } from "ai/react";
import React, { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";

// Custom components for markdown rendering
const MarkdownComponents = {
  ul: ({ node, ...props }: any) => (
    <ul className="list-disc pl-5 space-y-0" {...props} />
  ),
  ol: ({ node, ...props }: any) => (
    <ol className="list-decimal pl-5 space-y-0" {...props} />
  ),
  li: ({ node, ...props }: any) => (
    <li className="my-0" {...props} />
  ),
  p: ({ node, ...props }: any) => (
    <p className="my-1 font-normal" {...props} />
  ),

  h1: ({ node, ...props }: any) => (
    <p className="my-1 font-bold" {...props} />
  ),
  h2: ({ node, ...props }: any) => (
    <p className="my-1 font-semi-bold" {...props} />
  ),

};

export function ChatMessageBubble(props: {
  message: Message;
  aiEmoji?: string;
  sources?: any[];
  isLastMessage?: boolean;
  isLoading?: boolean;
}) {
  const isUser = props.message.role === "user";
  const [displayContent, setDisplayContent] = useState("");
  const messageEndRef = useRef<HTMLDivElement>(null);

  // Handle streaming content for AI messages
  useEffect(() => {
    if (isUser) {
      setDisplayContent(props.message.content);
      return;
    }
    setDisplayContent(props.message.content);
  }, [props.message.content, isUser]);

  // Auto-scroll to bottom when new content arrives
  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [displayContent]);

  // Skip rendering if there's no content and it's not a loading state
  if (!displayContent && !props.isLoading) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className={cn(
        "group relative mb-3 flex w-full",
        isUser ? "ml-auto" : "mr-auto"
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
              ? "bg-[#358cee] text-white rounded-tr-none hover:bg-[#1a6da8]"
              : "bg-white border border-blue-100 rounded-tl-none text-gray-900 hover:bg-blue-50"
          )}
        >
          <div className="prose prose-sm max-w-none leading-snug">
            {props.isLoading && props.isLastMessage && !displayContent ? (
              <div className="flex items-center space-x-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />
                <span className="text-sm">Thinking...</span>
              </div>
            ) : (
              <ReactMarkdown
                components={MarkdownComponents}
                className="whitespace-pre-wrap break-words"
              >
                {displayContent}
              </ReactMarkdown>
            )}
          </div>

          {!isUser && props.sources && props.sources.length > 0 && (
            <div className="mt-1.5 text-xs text-gray-500">
              <div className="font-medium mb-0.5">Sources:</div>
              <div className="space-y-0.5">
                {props.sources.map((source, index) => (
                  <div key={index} className="flex items-center">
                    <svg className="w-2.5 h-2.5 mr-1 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
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

          {props.isLoading && props.isLastMessage && displayContent && (
            <div className="absolute -bottom-4 right-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />
            </div>
          )}
        </div>

      </div>

      {isUser && (
        <div className="ml-2 mt-1 flex-shrink-0">
          <div className="h-8 w-8 rounded-full bg-[#358cee] hidden md:flex items-center justify-center text-white font-medium text-sm">
            {'U'}
          </div>
        </div>
      )}

      <div ref={messageEndRef} />
    </motion.div>
  );
}

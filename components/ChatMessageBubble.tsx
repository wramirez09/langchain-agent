import { cn } from "@/utils/cn";
import type { Message } from "ai/react";
import React from "react";
import ReactMarkdown from "react-markdown";
import { motion } from "framer-motion";

export function ChatMessageBubble(props: {
  message: Message;
  aiEmoji?: string;
  sources?: any[];
}) {
  const isUser = props.message.role === "user";

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
          <div className="h-8 w-8 rounded-full bg-[#358cee] flex items-center justify-center text-white font-medium p-2">
            <span className="text-lg">ND</span>
          </div>
        </div>
      )}

      <div className="flex-1">
        <div
          className={cn(
            "rounded-2xl px-4 py-3 shadow-sm transition-all duration-200 mt-5",
            isUser
              ? "bg-[#358cee] text-white rounded-tr-none hover:bg-[#1a6da8]"
              : "bg-white border border-blue-200 rounded-tl-none text-gray-900 hover:bg-blue-50"
          )}
        >
          <div className="prose prose-sm max-w-none">
            <ReactMarkdown className="whitespace-pre-wrap break-words">
              {props.message.content}
            </ReactMarkdown>
          </div>

          {!isUser && props.sources && props.sources.length > 0 && (
            <div className="mt-2 text-xs text-gray-500">
              <div className="font-medium mb-1">Sources:</div>
              <div className="space-y-1">
                {props.sources.map((source, index) => (
                  <div key={index} className="flex items-center">
                    <svg className="w-3 h-3 mr-1.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M11 3a1 1 0 10-2 0v1H8a1 1 0 100 2h1v1a1 1 0 102 0V6h1a1 1 0 100-2h-1V3z" />
                      <path d="M3 5a2 2 0 012-2h1a1 1 0 010 2H5v7h2v1H5a2 2 0 01-2-2V5zm12 0v10a2 2 0 01-2 2H7a2 2 0 01-2-2V5h10z" />
                    </svg>
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline truncate max-w-xs inline-block"
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
          <div className="h-8 w-8 rounded-full bg-[#358cee] flex items-center justify-center text-white font-medium">
            {props.message.name?.charAt(0).toUpperCase() || 'U'}
          </div>
        </div>
      )}
    </motion.div>
  );
}

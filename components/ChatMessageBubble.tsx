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
          <div className="h-8 w-8 rounded-full bg-white flex items-center justify-center shadow-sm border border-blue-200">
            <span className="text-lg">{props.aiEmoji}</span>
          </div>
        </div>
      )}

      <div className="flex-1">
        <div
          className={cn(
            "rounded-2xl px-4 py-3 shadow-sm transition-all duration-200 mt-5",
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

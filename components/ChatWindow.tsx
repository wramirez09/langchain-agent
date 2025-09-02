"use client";

import { type Message } from "ai";
import { useChat } from "ai/react";
import { useCallback, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { toast } from "sonner";

import { ChatMessageBubble } from "@/components/ChatMessageBubble";
import { IntermediateStep } from "./IntermediateStep";
import { Button } from "./ui/button";
import { ArrowDown, LoaderCircle, Paperclip } from "lucide-react";
import { Checkbox } from "./ui/checkbox";

import { cn } from "@/utils/cn";
import FormInputs from "@/components/ui/forms/Form";
import { LeadGrid } from "./layouts/LeadGrid";
import React from "react";
// import { FileUploadForm } from "./ui/FileUpload";
import { StickToBottom, useStickToBottomContext } from "use-stick-to-bottom";
import UploadDocumentsForm from "./UploadDocumentsForm";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./ui/dialog";
import {
  IconFileSearch,
  IconFileTypePdf,
  IconSend2,
} from "@tabler/icons-react";
import FlyoutForm from "./ui/FlyoutForm";
import { PDFDownloadLink } from "@react-pdf/renderer";
import PdfDoc from "./PdfDoc";
import Link from "next/link";

function ChatMessages(props: {
  messages: Message[];
  emptyStateComponent: ReactNode;
  sourcesForMessages: Record<string, any>;
  aiEmoji?: any;
  className?: string;
}) {
  return (
    <div className="flex flex-col max-w-[768px] mx-auto pb-12 w-full">
      {props.messages.map((m, i) => {
        if (m.role === "system") {
          return <IntermediateStep key={m.id} message={m} />;
        }

        const sourceKey = (props.messages.length - 1 - i).toString();
        return (
          <ChatMessageBubble
            key={m.id}
            message={m}
            aiEmoji={props.aiEmoji}
            sources={props.sourcesForMessages[sourceKey]}
          />
        );
      })}
    </div>
  );
}

function ScrollToBottom(props: { className?: string }) {
  const { isAtBottom, scrollToBottom } = useStickToBottomContext();

  if (isAtBottom) return null;
  return (
    <Button
      variant="outline"
      className={props.className}
      onClick={() => scrollToBottom()}
    >
      <ArrowDown className="w-4 h-4" />
      <span>Scroll to bottom</span>
    </Button>
  );
}

function StickyToBottomContent(props: {
  content: ReactNode;
  footer?: ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  const context = useStickToBottomContext();

  // scrollRef will also switch between overflow: unset to overflow: auto
  return (
    <div
      ref={context.scrollRef}
      className={cn("grid grid-rows-[1fr,auto]", props.className)}
    >
      <div ref={context.contentRef} className={props.contentClassName}>
        {props.content}
      </div>

      {props.footer}
    </div>
  );
}

export function ChatInput(props: {
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  onStop?: () => void;
  value: any;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  loading?: boolean;
  placeholder?: string;
  children?: ReactNode;
  className?: string;
  actions?: ReactNode;
  onStateFormStateChange?: (key: string, value: string) => void;
  onUpload?: (file: File) => Promise<void>;
  messages: Message[];
}) {
  const disabled = props.loading && props.onStop == null;
  const [sheetOpen, setSheetOpen] = React.useState(false);

  return (
    <>
      <form
        onSubmit={(e) => {
          e.stopPropagation();
          e.preventDefault();

          if (props.loading) {
            props.onStop?.();
          } else {
            props.onSubmit(e);
          }
        }}
        className={cn("flex w-full flex-col", props.className)}
      >
        <div className="border border-[#a8afba] bg-gray-300 rounded-lg flex flex-col gap-2 max-w-[768px] w-full mx-auto align-middle">
          <input
            name="chat"
            value={props.value}
            placeholder={props.placeholder}
            onChange={props.onChange}
            className="border-none outline-none bg-transparent ml-3 pt-3 text-gray-800
          "
          />

          <div className="flex justify-between ml-4 mr-2 ">
            <div className="flex items-center gap-5">
              <div className="flex gap-1 justify-between">{props.children}</div>

              <Button
                variant="ghost"
                className="pl-2 pr-3 -ml-2 -mr-2 hover:bg-[#e1e8f3] bg-gray-300  mr-2"
                onClick={() => setSheetOpen((open) => !open)}
              >
                <IconFileSearch stroke={1.25} color="#238dd2" />
                <span className="text-[#238dd2]">PreAuth Form</span>
              </Button>

              <Button
                variant={"ghost"}
                className="pl-2 pr-3 -ml-2 -mr-2 hover:bg-[#e1e8f3] bg-gray-300 text-[#238dd2] mr-2"
              >
                <IconFileTypePdf stroke={2} color="#238dd2" />
                <Link
                  target="_blank"
                  className="text-[#238dd2]"
                  href={{
                    pathname: "/pdf",
                    query: { data: JSON.stringify(props.messages) },
                  }}
                >
                  Export
                </Link>
              </Button>
            </div>

            <div className="flex gap-2 self-end pb-2">
              {props.actions}
              <Button
                type="submit"
                className="self-end bg-transparent hover:bg-[#e1e8f3]"
                disabled={disabled}
              >
                {props.loading ? (
                  <span role="status" className="flex justify-center">
                    <LoaderCircle className="animate-spin" />
                    <span className="sr-only">Loading...</span>
                  </span>
                ) : (
                  <span>
                    <IconSend2 className="text-[#238dd2] hover:text-white" />
                  </span>
                )}
              </Button>
            </div>
          </div>
        </div>
      </form>
      <FlyoutForm
        openSheet={sheetOpen}
        setOpenSheet={setSheetOpen}
        submitAction={props.onSubmit}
        onStateFormStateChange={props.onStateFormStateChange!}
        chatOnChange={props.onChange}
      />
    </>
  );
}

export function ChatLayout(props: { content: ReactNode; form: ReactNode }) {
  return (
    <>
      <StickToBottom>
        <StickyToBottomContent
          className="absolute inset-0"
          contentClassName="py-8 px-2"
          content={props.content}
          footer={
            <div className="sticky bottom-8 px-2">
              <ScrollToBottom className="absolute bottom-full left-1/2 -translate-x-1/2 mb-4 bg-gray-200" />
              {props.form}
            </div>
          }
        />
      </StickToBottom>
    </>
  );
}

export function ChatWindow(props: {
  endpoint: string;
  emptyStateComponent?: ReactNode | JSX.Element | any;
  placeholder?: string;
  emoji?: any;
  showIngestForm?: boolean;
  showIntermediateStepsToggle?: boolean;
}) {
  const [showIntermediateSteps, setShowIntermediateSteps] = useState(
    !!props.showIntermediateStepsToggle,
  );
  const [intermediateStepsLoading, setIntermediateStepsLoading] =
    useState(false);

  const [sourcesForMessages, setSourcesForMessages] = useState<
    Record<string, any>
  >({});

  const [formContent, setFormContet] = React.useState<Map<string, string>>(
    new Map(),
  );

  const chat = useChat({
    api: props.endpoint,
    onResponse(response) {
      const sourcesHeader = response.headers.get("x-sources");
      const sources = sourcesHeader
        ? JSON.parse(Buffer.from(sourcesHeader, "base64").toString("utf8"))
        : [];

      const messageIndexHeader = response.headers.get("x-message-index");
      if (sources.length && messageIndexHeader !== null) {
        setSourcesForMessages({
          ...sourcesForMessages,
          [messageIndexHeader]: sources,
        });
      }
    },
    streamMode: "text",
    onError: (e) =>
      toast.error(`Error while processing your request`, {
        description: e.message,
      }),
  });

  async function sendMessage(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    console.log("SUBMITTING");
    if (chat.isLoading || intermediateStepsLoading) return;

    if (!showIntermediateSteps) {
      chat.handleSubmit(e);
      return;
    }

    // Some extra work to show intermediate steps properly
    setIntermediateStepsLoading(true);

    chat.setInput("");

    const messagesWithUserReply = chat.messages.concat({
      id: chat.messages.length.toString(),
      content: chat.input,
      role: "user",
    });

    chat.setMessages(messagesWithUserReply);

    const response = await fetch(props.endpoint, {
      method: "POST",
      body: JSON.stringify({
        messages: messagesWithUserReply,
        show_intermediate_steps: true,
      }),
    });
    const json = await response.json();
    setIntermediateStepsLoading(false);

    if (!response.ok) {
      toast.error(`Error while processing your request`, {
        description: json.error,
      });
      return;
    }

    const responseMessages: Message[] = json.messages;

    const toolCallMessages = responseMessages.filter(
      (responseMessage: Message) => {
        return (
          (responseMessage.role === "assistant" &&
            !!responseMessage.tool_calls?.length) ||
          responseMessage.role === "tool"
        );
      },
    );

    const intermediateStepMessages = [];
    for (let i = 0; i < toolCallMessages.length; i += 2) {
      const aiMessage = toolCallMessages[i];
      const toolMessage = toolCallMessages[i + 1];
      intermediateStepMessages.push({
        id: (messagesWithUserReply.length + i / 2).toString(),
        role: "system" as const,
        content: JSON.stringify({
          action: aiMessage.tool_calls?.[0],
          observation: toolMessage.content,
        }),
      });
    }

    const newMessages = messagesWithUserReply;
    for (const message of intermediateStepMessages) {
      newMessages.push(message);
      chat.setMessages([...newMessages]);
    }

    chat.setMessages([
      ...newMessages,
      {
        id: newMessages.length.toString(),
        content: responseMessages[responseMessages.length - 1].content,
        role: "assistant",
      },
    ]);
  }

  const setInput = useCallback(() => {
    if (formContent.size === 0) {
      chat.setInput("");
      return;
    }
    const input = Array.from(formContent.entries())
      .map(([key, value]) => `${key}: ${value}`)
      .join(" ");

    chat.setInput(input);
  }, [chat, formContent]);

  const handleFormStateChange = useCallback(
    (key: string, value: string) => {
      setFormContet((prev) => prev.set(key, value));
      setInput();
    },
    [chat, setFormContet, setInput],
  );

  const [uploading, setUploading] = useState(false);

  async function handleUploadAndChat(file: File) {
    toast("Uploading file and starting chat...");
    setUploading(true);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const ingestResponse = await fetch(`/api/retrieval/ingest`, {
        method: "POST",
        body: formData,
      });

      toast("File uploaded. Processing...");

      if (!ingestResponse.ok) {
        const errorData = await ingestResponse.json();
        throw new Error(errorData.message);
      }
      const ingestData = await ingestResponse.json();

      if (!ingestData || !ingestData.generatedQuery) {
        throw new Error("Generated query from document is empty or invalid.");
      }

      toast.success("Document uploaded and query generated successfully!");

      // Combine with form input if needed
      const formInputString = Array.from(formContent.entries())
        .map(([key, value]) => `${key}: ${value}`)
        .filter(Boolean)
        .join(" ");

      let combinedInput = `Generated query from uploaded document: "${ingestData.generatedQuery}"`;

      if (formInputString) {
        combinedInput += `\nAdditional user input from form: "${formInputString}"`;
      }

      await chat.append({ role: "user", content: combinedInput });
    } catch (e: any) {
      toast.error("Document upload failed", { description: e.message });
    } finally {
      setUploading(false);
    }
  }

  const [modalOpen, setModalOpen] = React.useState(false);
  const [isLoading, setIsLoading] = useState(false);
  return (
    <>
      <ChatLayout
        content={
          chat.messages.length === 0 ? (
            <div>{props.emptyStateComponent}</div>
          ) : (
            <ChatMessages
              aiEmoji={props.emoji}
              messages={chat.messages}
              emptyStateComponent={props.emptyStateComponent}
              sourcesForMessages={sourcesForMessages}
            />
          )
        }
        form={
          <>
            <ChatInput
              value={chat.input}
              onChange={chat.handleInputChange}
              onSubmit={sendMessage}
              loading={chat.isLoading || intermediateStepsLoading}
              placeholder={
                props.placeholder ?? "What's it like to be a pirate?"
              }
              onStateFormStateChange={handleFormStateChange}
              messages={chat.messages}
            >
              {props.showIngestForm && (
                <Dialog
                  open={modalOpen}
                  onOpenChange={() => {
                    setModalOpen(!modalOpen);
                  }}
                >
                  <DialogTrigger asChild>
                    <Button
                      variant="ghost"
                      className="pl-2 pr-3 -ml-2 hover:bg-[#e1e8f3] bg-gray-300 text-black"
                      disabled={chat.messages.length !== 0}
                    >
                      <Paperclip className="size-4" color="#238dd2" />
                      <span className="text-[#238dd2]">Upload document</span>
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Upload document</DialogTitle>
                      <DialogDescription>
                        We currently only support PDF files.
                      </DialogDescription>
                    </DialogHeader>
                    <UploadDocumentsForm
                      onUpload={handleUploadAndChat}
                      setModalOpen={setModalOpen}
                      setIsLoading={setIsLoading}
                    />
                  </DialogContent>
                </Dialog>
              )}

              {props.showIntermediateStepsToggle && (
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="show_intermediate_steps"
                    name="show_intermediate_steps"
                    checked={showIntermediateSteps}
                    disabled={chat.isLoading || intermediateStepsLoading}
                    onCheckedChange={(e) => setShowIntermediateSteps(!!e)}
                  />
                  <label htmlFor="show_intermediate_steps" className="text-sm">
                    Show intermediate steps
                  </label>
                </div>
              )}
            </ChatInput>
          </>
        }
      />
    </>
  );
}

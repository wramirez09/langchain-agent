"use client";

import { type Message } from "ai";
import { useBodyPointerEvents } from "@/utils/use-body-pointer-events";
import { Checkbox } from "./ui/checkbox";
import { cn } from "@/utils/cn";
import React, { FormEvent, ReactNode, useCallback, useState } from "react";
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
  IconSettings,
  IconUpload,
} from "@tabler/icons-react";
import FlyoutForm from "./ui/FlyoutForm";
import Link from "next/link";
import MobileDrawer from "./ui/MobileDrawer";
import { toast } from "sonner";
import { useChat } from "ai/react";
import { ArrowDown, LoaderCircle } from "lucide-react";
import { ChatMessageBubble } from "./ChatMessageBubble";
import { IntermediateStep } from "./IntermediateStep";
import { Button } from "./ui/button";

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
      type="button"
      variant="ghost"
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
      className={cn("grid grid-rows-[1fr,auto] bottom-fixed-element mb-3 md:mb-0", props.className)}
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
  messages: Message[];
  sheetOpen: boolean;
  setSheetOpen: React.Dispatch<React.SetStateAction<boolean>>;
  openMobileDrawer: boolean;
  setOpenMobileDrawer: React.Dispatch<React.SetStateAction<boolean>>;
  modalOpen: boolean;
  setModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
}) {



  const disabled = props.loading && props.onStop == null;

  const handleMobileDrawerOptionSelection = useCallback((option: string) => {
    if (option) {
      switch (option) {
        case "upload":
          props.setModalOpen(true);
          break;
        case "form":
          props.setSheetOpen(true);
          break;
        default:
          break;
      }
      props.setOpenMobileDrawer(false);
      useBodyPointerEvents(false);
    }
  }, [props.setModalOpen, props.setSheetOpen, props.setOpenMobileDrawer]);

  return (
    <div className="w-full max-w-4xl mx-auto">
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
        className={cn("w-full", props.className)}
      >
        <div className="border border-blue-200 bg-blue-50 rounded-lg flex flex-col max-w-[768px] w-full mx-auto">
          <div className="flex flex-wrap items-center gap-2 px-4 py-3">
            {props.children}
            
            <Button
              type="button"
              variant="ghost"
              className="hidden sm:flex items-center hover:bg-blue-100 bg-white/50 border border-blue-100 text-[#1e7dbf] hover:text-[#1e7dbf] p-1.5 text-sm h-8"
              onClick={() => props.setSheetOpen((open) => !open)}
            >
              <IconFileSearch stroke={1.25} className="shrink-0 text-[#238dd2] mr-1.5" width={16} />
              <span>Pre-Auth Form</span>
            </Button>

            <Button
              type="button"
              variant="ghost"
              className="hidden sm:flex items-center hover:bg-blue-100 bg-white/50 border border-blue-100 p-1.5 text-sm h-8"
            >
              <IconFileTypePdf stroke={1.25} className="shrink-0 text-[#238dd2] mr-1.5" width={16} />
              <Link
                target="_blank"
                className="text-[#238dd2] hover:text-[#1e7dbf] text-sm"
                href={{
                  pathname: "/pdf",
                  query: { data: JSON.stringify(props.messages) },
                }}
              >
                PDF Export
              </Link>
            </Button>

            <Button
              type="button"
              className="md:hidden flex items-center hover:bg-blue-100 bg-blue-50 text-[#1e7dbf] hover:text-[#1e7dbf] p-1.5 h-8"
              onClick={() => props.setOpenMobileDrawer((prev) => !prev)}
            >
              <IconSettings stroke={1.5} width={16} />
            </Button>
          </div>
          
          <div className="relative px-3 pb-2">
            <hr className="border-t border-blue-100/80 mt-1 mb-2" />
          </div>
          
          <div className="flex items-center px-4 py-3 bg-white/80 rounded-lg mx-3 mb-3 border border-blue-100">
            <input
              name="chat"
              value={props.value}
              placeholder={props.placeholder}
              onChange={props.onChange}
              className="w-full outline-none bg-transparent text-gray-900 placeholder-gray-500 text-base"
            />
            
            <Button
              type="submit"
              className="bg-white hover:bg-blue-50 ml-2 h-10 w-10 flex-shrink-0 rounded-lg border border-blue-100 shadow-sm"
              disabled={disabled}
            >
              {props.loading ? (
                <span role="status" className="flex items-center justify-center">
                  <LoaderCircle className="animate-spin h-4 w-4 text-[#238dd2]" />
                  <span className="sr-only">Loading...</span>
                </span>
              ) : (
                <IconSend2
                  className="text-[#1e7dbf] hover:text-[#1e7dbf]"
                  width={18}
                />
              )}
            </Button>
          </div>
          <MobileDrawer
            setOpen={props.setOpenMobileDrawer}
            onChange={handleMobileDrawerOptionSelection}
            open={props.openMobileDrawer}
            messages={props.messages}
          />
        </div>
      </form>
    </div>
  );
}

export function ChatLayout(props: { content: ReactNode; form: ReactNode }) {
  return (
    <StickToBottom>
      <StickyToBottomContent
        className="absolute inset-0"
        contentClassName="py-8 px-2"
        content={props.content}
        footer={
          <div className="sticky bottom-8 px-2">
            <ScrollToBottom className="absolute bottom-full left-1/2 -translate-x-1/2 mb-4 bg-white border border-blue-200 text-gray-900 hover:bg-blue-50 hover:text-blue-900" />
            {props.form}
          </div>
        }
      />
    </StickToBottom>
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
  const [intermediateStepsLoading, setIntermediateStepsLoading] = useState(false);
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [openMobileDrawer, setOpenMobileDrawer] = React.useState<boolean>(false);
  const [modalOpen, setModalOpen] = React.useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [uploading, setUploading] = useState(false);

  useBodyPointerEvents(sheetOpen || openMobileDrawer || modalOpen);

  const [sourcesForMessages, setSourcesForMessages] = useState<
    Record<string, any>
  >({});

  const [formContent, setFormContent] = useState<Map<string, string>>(
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
      toast.error(`Error while processing your request in Chat`, {
        description: e.message,
      }),
  });

  async function sendMessage(e: FormEvent<HTMLFormElement>) {
    if (chat.isLoading || intermediateStepsLoading) return;

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
      setFormContent((prev) => prev.set(key, value));
      setInput();
    },
    [chat, setFormContent, setInput],
  );

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
      setModalOpen(false);

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

  return (
    <div className="flex flex-col min-h-[100dvh] bg-gray-100 font-sans">
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
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
                sheetOpen={sheetOpen}
                setSheetOpen={setSheetOpen}
                openMobileDrawer={openMobileDrawer}
                setOpenMobileDrawer={setOpenMobileDrawer}
                modalOpen={modalOpen}
                setModalOpen={setModalOpen}
              >
                {props.showIntermediateStepsToggle && (
                  <div className="flex items-center gap-2 bg-white/50 rounded px-2 py-1 border border-blue-100">
                  <Checkbox
                    id="show_intermediate_steps"
                    name="show_intermediate_steps"
                    checked={showIntermediateSteps}
                    disabled={chat.isLoading || intermediateStepsLoading}
                    onCheckedChange={(e) => setShowIntermediateSteps(!!e)}
                    className="h-4 w-4 border-gray-300 text-[#1e7dbf] focus:ring-[#1e7dbf]"
                  />
                  <label htmlFor="show_intermediate_steps" className="text-sm text-gray-600">
                    Show steps
                  </label>
                </div>
                )}
                {props.showIngestForm && (
                  <Dialog
                    open={modalOpen}
                    onOpenChange={() => setModalOpen(!modalOpen)}
                  >
                    <DialogTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        className="hidden sm:flex items-center hover:bg-blue-100 bg-white/50 border border-blue-100 text-[#1e7dbf] hover:text-[#1e7dbf] p-1.5 text-sm h-8"
                        disabled={chat.messages.length !== 0}
                      >
                        <IconUpload stroke={1.5} width={16} className="mr-1.5" />
                        <span>Upload PDF</span>
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="bg-white border-blue-200">
                      <DialogHeader>
                        <DialogTitle className="text-gray-900">Add a document to start the analysis</DialogTitle>
                        <DialogDescription className="text-gray-700">
                          Upload a PDF file to extract and analyze its contents
                        </DialogDescription>
                      </DialogHeader>
                      <UploadDocumentsForm
                        onUpload={handleUploadAndChat}
                        setModalOpen={setModalOpen}
                        setIsLoading={setIsLoading}
                        uploading={uploading}
                      />
                    </DialogContent>
                  </Dialog>
                )}
              </ChatInput>
              <FlyoutForm
                openSheet={sheetOpen}
                setOpenSheet={setSheetOpen}
                submitAction={sendMessage}
                onStateFormStateChange={handleFormStateChange}
                chatOnChange={chat.handleInputChange}
              />
            </>
          }
        />
      </div>
    </div>
  );
}

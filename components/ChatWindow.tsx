"use client";

import { type Message } from "ai";
import { useBodyPointerEvents } from "@/utils/use-body-pointer-events";

import { cn } from "@/utils/cn";
import React, { FormEvent, ReactNode, useCallback, useState, type JSX } from "react";
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
  IconDots,
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
  isLoading?: boolean;
}) {
  
  return (
    <div className="relative flex flex-col max-w-[768px] mx-auto pb-12 w-full bg-transparent">
      <div className="sticky bottom-0 left-0 right-0 h-12 pointer-events-none z-10" />
      {/* <Toaster position="top-right" richColors /> */}
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
      className={cn("bg-gradient-light grid grid-rows-[1fr,auto] bottom-fixed-element mb-3 md:mb-0", props.className)}
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
    <div className="max-w-[768px] w-full mx-auto">

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
          <div className="flex flex-wrap items-center gap-2 px-4 py-0 md:py-3">
            {props.children}

            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="hidden sm:flex items-center hover:bg-blue-100 bg-white/50 border border-blue-100 text-[#1e7dbf] hover:text-[#1e7dbf] px-3 h-8"
              onClick={() => props.setSheetOpen((open) => !open)}
            >
              <IconFileSearch className="w-4 h-4 text-[#238dd2] mr-1" strokeWidth={1.5} />
              <span>Pre-Authorization</span>
            </Button>

            <Button
              asChild
              type="button"
              variant="ghost"
              size="sm"
              className="hidden sm:flex items-center hover:bg-blue-100 bg-white/50 border border-blue-100 text-[#1e7dbf] hover:text-[#1e7dbf] px-3 h-8"
            >
              <Link
                target="_blank"
                href={{
                  pathname: "/pdf",
                  query: { data: JSON.stringify(props.messages) },
                }}
                className="flex items-center hidden sm:flex items-center hover:bg-blue-100 bg-white/50 border border-blue-100 text-[#1e7dbf] hover:text-[#1e7dbf] px-3 h-8 rounded-md"
              >
                <IconFileTypePdf className="w-4 h-4 text-[#238dd2] mr-2" strokeWidth={1.5} />
                <span className="text-xs font-medium">File Export</span>
              </Link>
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="md:hidden hover:bg-blue-100 bg-blue-50 text-[#1e7dbf] hover:text-[#1e7dbf] w-8 h-8 mt-1"
              onClick={() => props.setOpenMobileDrawer((prev) => !prev)}
            >
              <IconDots className="w-4 h-4" strokeWidth={1.5} color="black" />
            </Button>
          </div>

          <div className="relative px-3 pb-1 md:pb-2">
            <hr className="border-t border-blue-100/80 mt-1 mb-2" />
          </div>

          <div className="flex items-center px-4 py-1 md:py-3 bg-white/80 rounded-lg mx-3 mb-3 border border-blue-100">
            <input
              name="chat"
              value={props.value}
              placeholder={props.placeholder}
              onChange={props.onChange}
              className="w-full outline-none bg-transparent text-gray-900 placeholder-gray-500 text-base"
            />

            <Button
              type="submit"
              className="bg-white hover:bg-blue-50 ml-2 h-13 w-13 flex-shrink-0 rounded-lg border border-blue-100 shadow-sm"
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
                  width={16}
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

export function ChatLayout(props: {
  content: ReactNode;
  form: ReactNode;
  className?: string;
}) {
  return (
    <StickToBottom>
      <StickyToBottomContent
        className={cn("fixed inset-0 pb-[var(--keyboard-inset-bottom,0)]", props.className)}
        contentClassName="pt-16 px-2 pb-24 md:pb-32 relative"
        content={
          props.content && <div className="h-full overflow-y-auto -mx-2 px-2">
            {props.content}
          </div>
        }
        footer={
          <>
            <div className="fixed bottom-0 left-0 right-0  z-10">
              <div className="max-w-3xl mx-auto px-2 py-2">
                <ScrollToBottom className="absolute bottom-full left-1/2 -translate-x-1/2 mb-4 bg-white border border-blue-200 text-gray-900 hover:bg-blue-50 hover:text-blue-900" />
                {props.form}
              </div>
            </div></>
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
    streamMode: 'text',
    onFinish() {
      // This runs when the stream is complete
      setIntermediateStepsLoading(false);
      setIsLoading(false);
    },
    onError(error) {
      console.error('Chat error:', error);
      setIntermediateStepsLoading(false);
      setIsLoading(false);
      toast.error('An error occurred while processing your message');
    },
    onResponse(response) {
      try {
        // Handle sources from response
        const sourcesHeader = response.headers.get("x-sources");
        let sources = [];

        if (sourcesHeader) {
          try {
            sources = JSON.parse(sourcesHeader);
          } catch (error) {
            console.warn("Failed to parse sources header:", error);
            sources = [];
          }
        }

        const messageIndexHeader = response.headers.get("x-message-index");
        if (sources.length && messageIndexHeader !== null) {
          setSourcesForMessages({
            ...sourcesForMessages,
            [messageIndexHeader]: sources,
          });
        }

        // Handle toast notifications from the API
        try {
          const toastHeader = response.headers.get('x-toast-notifications');
          if (toastHeader) {
            const toastData = JSON.parse(toastHeader);
            if (Array.isArray(toastData)) {
              toastData.forEach((toastItem: { message: string; type: string }) => {
                const { message, type } = toastItem;
                switch (type) {
                  case 'success':
                    toast.success(message);
                    break;
                  case 'error':
                    toast.error(message);
                    break;
                  case 'loading':
                    toast.loading(message);
                    break;
                  default:
                    toast(message);
                }
              });
            }
          }
        } catch (e) {
          console.error('Error processing toast notifications:', e);
        }
      } catch (error) {
        console.error('Error in onResponse handler:', error);
      }
    },
  });

  const sendMessage = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (chat.isLoading) return;

    // Declare timeout variables at the function level
    let loadingToastTimeout1: NodeJS.Timeout | null = null;
    let loadingToastTimeout2: NodeJS.Timeout | null = null;

    // Reset loading states
    setIsLoading(true);
    setIntermediateStepsLoading(true);

    // Set up the loading toasts
    loadingToastTimeout1 = setTimeout(() => {
      toast.info('Processing your request');
    }, 20000); // Show after 20 seconds

    loadingToastTimeout2 = setTimeout(() => {
      toast.info('Still processing your request');
    }, 60000); // Show after 1 minute

    toast.info('Sending request to our AI agent');
    try {
      // Clear the input field
      const userMessage = chat.input;
      chat.setInput("");

      // Append the user message
      await chat.append({
        role: "user",
        content: userMessage,
      });

      const response = await fetch(props.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: chat.messages,
        }),
      });

      // ... rest of your try block ...

    } catch (error: any) {
      toast.error('Failed to send message', {
        description: error.message || 'An unknown error occurred',
      });
    } finally {
      // Clear timeouts
      if (loadingToastTimeout1) clearTimeout(loadingToastTimeout1);
      if (loadingToastTimeout2) clearTimeout(loadingToastTimeout2);
      setIntermediateStepsLoading(false);
      setIsLoading(false);
    }
  };

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

  async function handleUploadAndChat(file: File, insurance?: string) {
    let loadingToastTimeout1: NodeJS.Timeout | null = null;
    let loadingToastTimeout2: NodeJS.Timeout | null = null;
    // Set up the loading toasts
    loadingToastTimeout1 = setTimeout(() => {
      toast.info('Processing your document');
    }, 20000); // Show after 20 seconds

    loadingToastTimeout2 = setTimeout(() => {
      toast.info('Still processing your document');
    }, 60000); // Show after 1 minute

    if (!file) {
      toast.error("No file selected");
      return;
    }

    // Validate file type
    if (file.type !== 'application/pdf') {
      toast.error("Only PDF files are supported");
      return;
    }

    // Validate file size (10MB max)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      toast.error("File size exceeds 10MB limit");
      return;
    }

    setUploading(true);


    const formData = new FormData();
    formData.append("file", file);

    try {
      toast.info('Sending file to API...');
      const uploadResponse = await fetch('/api/retrieval/ingest', {
        method: 'POST',
        body: formData,
      });

      toast.info(
        'Received response, processing...',

      );

      const data = await uploadResponse.json();
      toast.info('Parsed response data:', data);

      if (!uploadResponse.ok) {
        const errorMsg = data?.error || 'Failed to process file';
        console.error('API Error:', errorMsg);
        throw new Error(errorMsg);
      }

      if (!data.success) {
        console.error('API returned unsuccessful response:', data);
        throw new Error(data.error || 'Failed to process document');
      }

      if (!data.generatedQuery) {
        console.error('No generated query in response:', data);
        throw new Error("Failed to generate query from document");
      }

      toast("Document processed successfully!",
      );
      setModalOpen(false);

      // Combine with form input if available
      const formInputString = Array.from(formContent.entries())
        .map(([key, value]) => `${key}: ${value}`)
        .filter(Boolean)
        .join(" ");

      let combinedInput = `Generated query from uploaded document: "${data.generatedQuery}"`;

      if (insurance) {
        combinedInput += `\nInsurance Provider: ${insurance}`;
      }

      if (formInputString) {
        combinedInput += `\nAdditional user input: "${formInputString}"`;
      }

      toast.info('Appending message to chat...',
      );
      console.log({ combinedInput });

      await chat.append({ role: "user", content: combinedInput });

    } catch (error: any) {
      console.error("Upload error:", {
        message: error.message,
        stack: error.stack,
        name: error.name
      });

      toast.error(
        "Upload failed",
      );
    } finally {
      // Clear all timeouts
      clearTimeout(loadingToastTimeout1);
      clearTimeout(loadingToastTimeout2);
      toast.info('Upload process completed',
      );
      setUploading(false);
    }
  }

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      <ChatLayout
        content={
          chat.messages.length === 0 ? (
            <></>
          ) : (
            <ChatMessages
              aiEmoji={props.emoji}
              messages={chat.messages}
              emptyStateComponent={props.emptyStateComponent}
              sourcesForMessages={sourcesForMessages}
              isLoading={chat.isLoading || intermediateStepsLoading}
            />
          )
        }
        form={
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-light-to-t from-white to-transparent pointer-events-none rounded-lg" />
            <div className="relative z-10">
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

                {props.showIngestForm && (
                  <Dialog
                    open={modalOpen}
                    onOpenChange={() => setModalOpen(!modalOpen)}
                  >
                    <DialogTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="hidden sm:flex items-center hover:bg-blue-100 bg-white/50 border border-blue-100 text-[#1e7dbf] hover:text-[#1e7dbf] px-3 h-8"
                        disabled={chat.messages.length !== 0}
                      >
                        <IconUpload className="w-4 h-4 text-[#238dd2] mr-1" strokeWidth={1.5} />
                        <span>Upload File</span>
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
            </div>
          </div>
        }
      />
    </div>
  );
}

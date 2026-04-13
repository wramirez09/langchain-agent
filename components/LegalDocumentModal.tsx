'use client';

import { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { LegalDocumentViewer } from './LegalDocumentViewer';
import { Button } from './ui/button';
import { ChevronDown } from 'lucide-react';

interface LegalDocumentModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  content: string;
  onScrolledToBottom?: () => void;
}

export function LegalDocumentModal({ isOpen, onClose, title, content, onScrolledToBottom }: LegalDocumentModalProps) {
  const [hasScrolledToBottom, setHasScrolledToBottom] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const handleScroll = () => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const { scrollTop, scrollHeight, clientHeight } = container;
    const isAtBottom = scrollTop + clientHeight >= scrollHeight - 10; // 10px threshold

    if (isAtBottom && !hasScrolledToBottom) {
      setHasScrolledToBottom(true);
      onScrolledToBottom?.();
    }
  };

  const handleClose = () => {
    if (hasScrolledToBottom) {
      onClose();
    }
  };
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && hasScrolledToBottom && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="px-6 py-4 border-b border-gray-200 flex-shrink-0">
          <DialogTitle className="text-2xl font-semibold text-gray-900">
            {title}
          </DialogTitle>
        </DialogHeader>
        {!hasScrolledToBottom && (
          <div className="px-6 py-2 bg-amber-50 border-b border-amber-200 flex items-center gap-2 text-sm text-amber-800">
            <ChevronDown className="h-4 w-4 animate-bounce" />
            <span>Please scroll to the bottom to continue</span>
          </div>
        )}
        <div 
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto px-6 py-6"
        >
          <LegalDocumentViewer content={content} />
        </div>
        <div className="px-6 py-4 border-t border-gray-200 flex justify-end flex-shrink-0">
          <Button 
            onClick={handleClose} 
            disabled={!hasScrolledToBottom}
            className="bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

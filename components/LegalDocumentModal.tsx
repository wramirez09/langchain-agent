'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { LegalDocumentViewer } from './LegalDocumentViewer';
import { Button } from './ui/button';
import { Checkbox } from './ui/checkbox';
import { cn } from '@/utils/cn';

interface LegalDocumentModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  content: string;
  /** Whether this document has been accepted. */
  accepted: boolean;
  /** Called when the user toggles the in-modal acceptance checkbox. */
  onAcceptedChange: (accepted: boolean) => void;
  /** Label shown next to the in-modal acceptance checkbox. */
  checkboxLabel: string;
  /** Stable id for the checkbox input. */
  checkboxId: string;
}

export function LegalDocumentModal({
  isOpen,
  onClose,
  title,
  content,
  accepted,
  onAcceptedChange,
  checkboxLabel,
  checkboxId,
}: LegalDocumentModalProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  // Whether the content overflows its container (i.e. is scrollable).
  const [isScrollable, setIsScrollable] = useState(false);
  // Whether the user has scrolled to the bottom of a scrollable document.
  const [scrolledToBottom, setScrolledToBottom] = useState(false);

  // The checkbox is only locked while there is unread content below the fold.
  const canAccept = !isScrollable || scrolledToBottom;

  const measure = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const scrollable = el.scrollHeight > el.clientHeight + 1;
    setIsScrollable(scrollable);
    if (!scrollable) {
      // Nothing to scroll — treat as fully read.
      setScrolledToBottom(true);
    }
  }, []);

  // Measure once the modal opens and its content is laid out.
  useEffect(() => {
    if (!isOpen) {
      setIsScrollable(false);
      setScrolledToBottom(false);
      return;
    }
    // Defer to next frame so the content has rendered before measuring.
    const id = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(id);
  }, [isOpen, content, measure]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight <= 24;
    if (atBottom) {
      setScrolledToBottom(true);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="px-6 py-4 border-b border-gray-200 flex-shrink-0">
          <DialogTitle className="text-2xl font-semibold text-gray-900">
            {title}
          </DialogTitle>
        </DialogHeader>
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto px-6 py-6"
        >
          <LegalDocumentViewer content={content} />
        </div>
        <div className="px-6 py-4 border-t border-gray-200 flex flex-col gap-4 flex-shrink-0">
          <div className="flex items-start gap-3">
            <Checkbox
              id={checkboxId}
              checked={accepted}
              onCheckedChange={(checked) => onAcceptedChange(checked === true)}
              disabled={!canAccept}
              className="mt-0.5"
            />
            <label
              htmlFor={checkboxId}
              className={cn(
                'text-sm flex-1',
                canAccept
                  ? 'text-gray-700 cursor-pointer'
                  : 'text-gray-400 cursor-not-allowed'
              )}
            >
              {checkboxLabel}
              {!canAccept && (
                <span className="block text-xs text-gray-400 mt-0.5">
                  Please scroll to the bottom to continue.
                </span>
              )}
            </label>
          </div>
          <div className="flex justify-end">
            <Button
              onClick={onClose}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {accepted ? 'Done' : 'Close'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

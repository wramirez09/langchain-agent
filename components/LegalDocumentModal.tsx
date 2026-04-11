'use client';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { LegalDocumentViewer } from './LegalDocumentViewer';
import { Button } from './ui/button';

interface LegalDocumentModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  content: string;
}

export function LegalDocumentModal({ isOpen, onClose, title, content }: LegalDocumentModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="px-6 py-4 border-b border-gray-200 flex-shrink-0">
          <DialogTitle className="text-2xl font-semibold text-gray-900">
            {title}
          </DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto px-6 py-6">
          <LegalDocumentViewer content={content} />
        </div>
        <div className="px-6 py-4 border-t border-gray-200 flex justify-end flex-shrink-0">
          <Button onClick={onClose} className="bg-blue-600 hover:bg-blue-700 text-white">
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

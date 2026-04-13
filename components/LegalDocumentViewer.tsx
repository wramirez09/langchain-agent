'use client';

import ReactMarkdown from 'react-markdown';
import { cn } from '@/utils/cn';

interface LegalDocumentViewerProps {
  content: string;
  className?: string;
}

export function LegalDocumentViewer({ content, className }: LegalDocumentViewerProps) {
  return (
    <div className={cn('prose prose-sm max-w-none', className)}>
      <ReactMarkdown
        components={{
          h1: ({ ...props }) => (
            <h1 className="text-3xl font-bold text-gray-900 mb-4" {...props} />
          ),
          h2: ({ ...props }) => (
            <h2 className="text-2xl font-semibold text-gray-900 mt-8 mb-3" {...props} />
          ),
          h3: ({ ...props }) => (
            <h3 className="text-xl font-semibold text-gray-800 mt-6 mb-2" {...props} />
          ),
          p: ({ ...props }) => (
            <p className="text-gray-700 mb-4 leading-relaxed" {...props} />
          ),
          ul: ({ ...props }) => (
            <ul className="list-disc list-inside mb-4 space-y-2 text-gray-700" {...props} />
          ),
          ol: ({ ...props }) => (
            <ol className="list-decimal list-inside mb-4 space-y-2 text-gray-700" {...props} />
          ),
          li: ({ ...props }) => (
            <li className="ml-4" {...props} />
          ),
          strong: ({ ...props }) => (
            <strong className="font-semibold text-gray-900" {...props} />
          ),
          em: ({ ...props }) => (
            <em className="italic text-gray-800" {...props} />
          ),
          hr: ({ ...props }) => (
            <hr className="my-8 border-gray-300" {...props} />
          ),
          blockquote: ({ ...props }) => (
            <blockquote className="border-l-4 border-blue-500 pl-4 italic text-gray-700 my-4" {...props} />
          ),
          a: ({ href, ...props }) => {
            const isEmail = href?.startsWith('mailto:') || (href && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(href));
            const mailtoHref = isEmail && !href?.startsWith('mailto:') ? `mailto:${href}` : href;
            return (
              <a 
                href={mailtoHref} 
                className="text-blue-600 hover:underline font-medium"
                {...props} 
              />
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

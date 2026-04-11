import { promises as fs } from 'fs';
import path from 'path';
import { LegalDocumentViewer } from '@/components/LegalDocumentViewer';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export const metadata = {
  title: 'Terms of Service | MediAuth Pro',
  description: 'Terms of Service for MediAuth Pro authorization readiness platform',
  robots: { index: true, follow: true },
};

async function getTermsContent() {
  const filePath = path.join(process.cwd(), 'documents', 'terms-of-service.md');
  const content = await fs.readFile(filePath, 'utf8');
  return content;
}

export default async function TermsPage() {
  const content = await getTermsContent();

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6">
          <Link href="/">
            <Button variant="ghost" className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              Back to Home
            </Button>
          </Link>
        </div>

        <div className="bg-white rounded-lg shadow-sm p-8">
          <LegalDocumentViewer content={content} />
        </div>

        <div className="mt-8 text-center text-sm text-gray-600">
          <p>
            Questions about these terms?{' '}
            <a href="mailto:support@mediauth.pro" className="text-blue-600 hover:underline">
              Contact Support
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}

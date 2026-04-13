import { LegalDocumentViewer } from '@/components/LegalDocumentViewer';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { PRIVACY_POLICY } from '@/lib/legalDocuments';

export const metadata = {
  title: 'Privacy Policy | NoteDoctor.AI',
  description: 'Privacy Policy for NoteDoctor.AI authorization readiness platform',
  robots: { index: true, follow: true },
};

export default function PrivacyPage() {

  return (
    <div className="h-screen bg-gray-50 overflow-y-auto">
      <div className="max-w-4xl mx-auto px-4 py-8 sm:px-6 lg:px-8 pb-16">
        <div className="mb-6">
          <Link href="/">
            <Button variant="ghost" className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              Back to Home
            </Button>
          </Link>
        </div>

        <div className="bg-white rounded-lg shadow-sm p-8">
          <LegalDocumentViewer content={PRIVACY_POLICY} />
        </div>

        <div className="mt-8 text-center text-sm text-gray-600">
          <p>
            Questions about our privacy practices?{' '}
            <a href="mailto:sales@notedoctor.ai" className="text-blue-600 hover:underline">
              Contact Privacy Team
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}

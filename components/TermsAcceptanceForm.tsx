'use client';

import { useState } from 'react';
import { Button } from './ui/button';
import { toast } from 'sonner';
import { LoaderCircle, FileText, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { cn } from '@/utils/cn';
import { LegalDocumentModal } from './LegalDocumentModal';
import { TERMS_OF_SERVICE, PRIVACY_POLICY, AI_SUBSCRIPTION_AGREEMENT } from '@/lib/legalDocuments';

interface TermsAcceptanceFormProps {
  email: string;
  name: string;
  onAccepted: () => void;
}

export function TermsAcceptanceForm({ email, name, onAccepted }: TermsAcceptanceFormProps) {
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [aiAgreementAccepted, setAiAgreementAccepted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [showAiAgreementModal, setShowAiAgreementModal] = useState(false);

  const allAccepted = termsAccepted && privacyAccepted && aiAgreementAccepted;

  const handleAccept = async () => {
    if (!allAccepted) {
      toast.error('Please accept all three agreements to continue');
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch('/api/accept-terms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to accept terms');
      }

      toast.success('Terms accepted successfully');
      onAccepted();
    } catch (error) {
      console.error('Error accepting terms:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to accept terms');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6 pb-8">
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex gap-3">
        <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-amber-800">
          <p className="font-semibold mb-1">Important: Review Before Accepting</p>
          <p>
            Please carefully review our Terms of Service and Privacy Policy before proceeding.
            You must accept these terms to use NoteDoctorAi.
          </p>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-4">
        <h3 className="text-lg font-semibold text-gray-900">Legal Documents</h3>

        <p className="text-sm text-gray-600">
          Open each document and check the box at the bottom to agree.
        </p>

        <div className="space-y-3">
          <DocumentRow
            title="Terms of Service"
            description="Review our terms and conditions"
            accepted={termsAccepted}
            onClick={() => setShowTermsModal(true)}
          />

          <DocumentRow
            title="Privacy Policy"
            description="Learn how we protect your data"
            accepted={privacyAccepted}
            onClick={() => setShowPrivacyModal(true)}
          />

          <DocumentRow
            title="AI Subscription Agreement"
            description="Review our AI service terms and conditions"
            accepted={aiAgreementAccepted}
            onClick={() => setShowAiAgreementModal(true)}
          />
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 pt-4">
        <Button
          type="button"
          variant="outline"
          onClick={() => window.history.back()}
          className="w-full sm:w-auto"
          disabled={isLoading}
        >
          Go Back
        </Button>
        <Button
          onClick={handleAccept}
          disabled={!allAccepted || isLoading}
          className={cn(
            'w-full sm:flex-1 bg-gradient-to-b from-blue-500 to-blue-600 text-white',
            'disabled:opacity-50 disabled:cursor-not-allowed'
          )}
        >
          {isLoading ? (
            <span className="flex items-center gap-2">
              <LoaderCircle className="animate-spin h-4 w-4" />
              Processing...
            </span>
          ) : (
            'Continue to Payment'
          )}
        </Button>
      </div>

      <p className="text-xs text-gray-500 text-center">
        By continuing, you authorize NoteDoctorAito charge your payment method for the subscription fees.
      </p>

      <LegalDocumentModal
        key={`terms-${showTermsModal}`}
        isOpen={showTermsModal}
        onClose={() => setShowTermsModal(false)}
        title="Terms of Service"
        content={TERMS_OF_SERVICE}
        accepted={termsAccepted}
        onAcceptedChange={setTermsAccepted}
        checkboxId="terms-agreement"
        checkboxLabel="I have read and agree to the Terms of Service"
      />

      <LegalDocumentModal
        key={`privacy-${showPrivacyModal}`}
        isOpen={showPrivacyModal}
        onClose={() => setShowPrivacyModal(false)}
        title="Privacy Policy"
        content={PRIVACY_POLICY}
        accepted={privacyAccepted}
        onAcceptedChange={setPrivacyAccepted}
        checkboxId="privacy-agreement"
        checkboxLabel="I have read and agree to the Privacy Policy"
      />

      <LegalDocumentModal
        key={`ai-${showAiAgreementModal}`}
        isOpen={showAiAgreementModal}
        onClose={() => setShowAiAgreementModal(false)}
        title="AI Subscription Agreement"
        content={AI_SUBSCRIPTION_AGREEMENT}
        accepted={aiAgreementAccepted}
        onAcceptedChange={setAiAgreementAccepted}
        checkboxId="ai-agreement"
        checkboxLabel="I have read and agree to the AI Subscription Agreement"
      />
    </div>
  );
}

interface DocumentRowProps {
  title: string;
  description: string;
  accepted: boolean;
  onClick: () => void;
}

function DocumentRow({ title, description, accepted, onClick }: DocumentRowProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full flex items-center justify-between p-4 border rounded-lg transition-colors group text-left',
        accepted
          ? 'border-green-300 bg-green-50 hover:bg-green-100'
          : 'border-gray-200 hover:bg-gray-50'
      )}
    >
      <div>
        <p className="font-medium text-gray-900 group-hover:text-blue-600">
          {title}
        </p>
        <p className="text-sm text-gray-600">
          {accepted ? 'Agreed' : description}
        </p>
      </div>
      {accepted ? (
        <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0" />
      ) : (
        <FileText className="h-5 w-5 text-gray-400 group-hover:text-blue-600 flex-shrink-0" />
      )}
    </button>
  );
}

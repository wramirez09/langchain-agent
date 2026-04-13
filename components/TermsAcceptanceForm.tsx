'use client';

import { useState } from 'react';
import { Button } from './ui/button';
import { Checkbox } from './ui/checkbox';
import { toast } from 'sonner';
import { LoaderCircle, FileText, AlertTriangle } from 'lucide-react';
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
            You must accept these terms to use NoteDoctor.AI.
          </p>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-4">
        <h3 className="text-lg font-semibold text-gray-900">Legal Documents</h3>
        
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => setShowTermsModal(true)}
            className="w-full flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors group text-left"
          >
            <div>
              <p className="font-medium text-gray-900 group-hover:text-blue-600">
                Terms of Service
              </p>
              <p className="text-sm text-gray-600">
                Review our terms and conditions
              </p>
            </div>
            <FileText className="h-5 w-5 text-gray-400 group-hover:text-blue-600" />
          </button>

          <button
            type="button"
            onClick={() => setShowPrivacyModal(true)}
            className="w-full flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors group text-left"
          >
            <div>
              <p className="font-medium text-gray-900 group-hover:text-blue-600">
                Privacy Policy
              </p>
              <p className="text-sm text-gray-600">
                Learn how we protect your data
              </p>
            </div>
            <FileText className="h-5 w-5 text-gray-400 group-hover:text-blue-600" />
          </button>

          <button
            type="button"
            onClick={() => setShowAiAgreementModal(true)}
            className="w-full flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors group text-left"
          >
            <div>
              <p className="font-medium text-gray-900 group-hover:text-blue-600">
                AI Subscription Agreement
              </p>
              <p className="text-sm text-gray-600">
                Review our AI service terms and conditions
              </p>
            </div>
            <FileText className="h-5 w-5 text-gray-400 group-hover:text-blue-600" />
          </button>
        </div>
      </div>

      <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 space-y-4">
        <div className="flex items-start gap-3">
          <Checkbox
            id="terms-agreement"
            checked={termsAccepted}
            onCheckedChange={(checked) => setTermsAccepted(checked === true)}
            className="mt-1"
          />
          <label
            htmlFor="terms-agreement"
            className="text-sm text-gray-700 cursor-pointer flex-1"
          >
            I have read and agree to the{' '}
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                setShowTermsModal(true);
              }}
              className="text-blue-600 hover:underline font-medium inline"
            >
              Terms of Service
            </button>
          </label>
        </div>

        <div className="flex items-start gap-3">
          <Checkbox
            id="privacy-agreement"
            checked={privacyAccepted}
            onCheckedChange={(checked) => setPrivacyAccepted(checked === true)}
            className="mt-1"
          />
          <label
            htmlFor="privacy-agreement"
            className="text-sm text-gray-700 cursor-pointer flex-1"
          >
            I have read and agree to the{' '}
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                setShowPrivacyModal(true);
              }}
              className="text-blue-600 hover:underline font-medium inline"
            >
              Privacy Policy
            </button>
          </label>
        </div>

        <div className="flex items-start gap-3">
          <Checkbox
            id="ai-agreement"
            checked={aiAgreementAccepted}
            onCheckedChange={(checked) => setAiAgreementAccepted(checked === true)}
            className="mt-1"
          />
          <label
            htmlFor="ai-agreement"
            className="text-sm text-gray-700 cursor-pointer flex-1"
          >
            I have read and agree to the{' '}
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                setShowAiAgreementModal(true);
              }}
              className="text-blue-600 hover:underline font-medium inline"
            >
              AI Subscription Agreement
            </button>
          </label>
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
        By continuing, you authorize NoteDoctor.AI to charge your payment method for the subscription fees.
      </p>

      <LegalDocumentModal
        isOpen={showTermsModal}
        onClose={() => setShowTermsModal(false)}
        title="Terms of Service"
        content={TERMS_OF_SERVICE}
      />

      <LegalDocumentModal
        isOpen={showPrivacyModal}
        onClose={() => setShowPrivacyModal(false)}
        title="Privacy Policy"
        content={PRIVACY_POLICY}
      />

      <LegalDocumentModal
        isOpen={showAiAgreementModal}
        onClose={() => setShowAiAgreementModal(false)}
        title="AI Subscription Agreement"
        content={AI_SUBSCRIPTION_AGREEMENT}
      />
    </div>
  );
}

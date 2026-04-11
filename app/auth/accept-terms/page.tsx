'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { TermsAcceptanceForm } from '@/components/TermsAcceptanceForm';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LoaderCircle } from 'lucide-react';

function AcceptTermsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const emailParam = searchParams.get('email');
    const nameParam = searchParams.get('name');

    if (!emailParam || !nameParam) {
      const storedEmail = localStorage.getItem('signup_email');
      const storedName = localStorage.getItem('signup_name');

      if (storedEmail && storedName) {
        setEmail(storedEmail);
        setName(storedName);
        setIsLoading(false);
      } else {
        router.push('/auth/sign-up');
      }
    } else {
      setEmail(emailParam);
      setName(nameParam);
      localStorage.setItem('signup_email', emailParam);
      localStorage.setItem('signup_name', nameParam);
      setIsLoading(false);
    }
  }, [searchParams, router]);

  const handleAccepted = async () => {
    try {
      const response = await fetch('/api/stripe/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name }),
      });

      if (!response.ok) {
        throw new Error('Failed to create checkout session');
      }

      const data = await response.json();
      if (data.url) {
        localStorage.removeItem('signup_email');
        localStorage.removeItem('signup_name');
        window.location.href = data.url;
      }
    } catch (error) {
      console.error('Error creating checkout session:', error);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoaderCircle className="animate-spin h-8 w-8 text-blue-600" />
      </div>
    );
  }

  return (
    <div className="h-screen bg-gray-50 overflow-y-auto">
      <div className="w-full max-w-3xl mx-auto px-4 py-8 pb-24">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl text-dark font-semibold">
              Accept Terms & Privacy Policy
            </CardTitle>
            <CardDescription className="text-dark font-medium">
              Before proceeding to payment, please review and accept our legal agreements
            </CardDescription>
          </CardHeader>
          <CardContent>
            <TermsAcceptanceForm
              email={email}
              name={name}
              onAccepted={handleAccepted}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function AcceptTermsPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <LoaderCircle className="animate-spin h-8 w-8 text-blue-600" />
      </div>
    }>
      <AcceptTermsContent />
    </Suspense>
  );
}

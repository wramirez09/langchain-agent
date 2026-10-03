import { Button } from '@/components/ui/button';
import { CheckCircle2 } from 'lucide-react';
import Link from 'next/link';

export default function Page() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-light dark:bg-none p-6">
      <div className="w-full max-w-md text-center">
        <div className="bg-card rounded-xl shadow-md p-8 dark:border dark:border-border dark:shadow-[0_24px_60px_-30px_rgba(0,0,0,0.7)]">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-success/10 mb-6">
            <CheckCircle2 className="h-10 w-10 text-success" />
          </div>
          <h1 className="text-2xl font-bold text-foreground mb-2">Account created successfully!</h1>
          <p className="text-foreground-soft mb-6">
            We&apos;ve sent a confirmation email to your inbox. Please check your email and verify your account to continue.
          </p>
          <div className="space-y-4">
            <Button asChild className="w-full h-11">
              <Link href="/auth/login">
                Back to sign in
              </Link>
            </Button>
            <p className="text-sm text-muted-foreground">
              Didn&apos;t receive an email?{' '}
              <Link href="/auth/sign-up" className="font-medium text-blue-600 dark:text-accent-foreground hover:underline">
                Try again
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

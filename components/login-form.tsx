'use client';

import { cn } from "@/utils/cn";
import { createClient } from '@/utils/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Label } from '@/components/ui/label';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { LoadingOverlay } from './ui/loading-overlay';

export function LoginForm({
  className,
  next = '/protected/preAuth',
  ...props
}: React.ComponentPropsWithoutRef<'div'> & { next?: string }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const supabase = createClient();
    setIsLoading(true);
    setError(null);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;
      router.push(next);
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : 'An error occurred');
      setIsLoading(false);
    }
  };

  return (
    <div className={cn('relative space-y-6', className)} {...props}>
      <LoadingOverlay isLoading={isLoading} />
      <form onSubmit={handleLogin}>
        <div className="space-y-4">

          <div className="space-y-2">
            <Label htmlFor="email" className="text-sm font-medium">
              Email
            </Label>
            <Input
              id="email"
              type="email"
              placeholder="name@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isLoading}
              required
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password" className="text-sm font-medium">
                Password
              </Label>
              <Link
                href="/auth/forgot-password"
                className="text-sm font-medium text-blue-600 dark:text-accent-foreground hover:underline"
              >
                Forgot password?
              </Link>
            </div>
            <PasswordInput
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isLoading}
              required
            />
          </div>
          {error && (
            <div className="rounded-md bg-destructive/5 p-4 text-sm text-destructive">
              {error}
            </div>
          )}
          <Button
            type="submit"
            className="w-full bg-gradient-to-b from-blue-500 to-blue-600 text-white dark:shadow-[0_0_32px_rgba(59,130,246,0.35)]"
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Signing in...
              </>
            ) : (
              'Sign In'
            )}
          </Button>
        </div>
      </form>
      <div className="text-center text-sm text-dark dark:text-muted-foreground">
        Don&apos;t have an account?{' '}
        <Link
          href="/auth/sign-up"
          className="font-medium text-blue-600 dark:text-accent-foreground hover:underline"
        >
          Sign up
        </Link>
      </div>
    </div>
  );
}

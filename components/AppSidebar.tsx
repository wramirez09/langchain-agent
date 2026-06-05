'use client';
import { FileText, FileDown, LogOut, CreditCard, Scale, Shield, Mail } from 'lucide-react';
import { cn } from '@/utils/cn';
import { createClient } from '@/utils/client';
import { useRouter } from 'next/navigation';
import { useMobileSidebar } from '@/components/providers/MobileSidebarProvider';
import { usePriorAuthChat } from '@/components/providers/PriorAuthProvider';
import { useState } from 'react';
import Link from 'next/link';

export type AppView = 'auth' | 'upload' | 'export';

interface AppSidebarProps {
  activeView: AppView;
  onViewChange: (view: AppView) => void;
}

const navItems: { id: AppView; icon: React.ElementType; label: string }[] = [
  { id: 'auth',   icon: FileText, label: 'Prior Auth' },
  // { id: 'upload', icon: Upload,   label: 'Upload File' },
  { id: 'export', icon: FileDown, label: 'File Export' },
];

export function AppSidebar({ activeView, onViewChange }: AppSidebarProps) {
  const router = useRouter();
  const { isOpen, setIsOpen } = useMobileSidebar();
  const { responseReady } = usePriorAuthChat();
  // Export is enabled once `responseReady` flips true (set in the chat
  // onFinish callback when the BE stream has fully completed). It resets to
  // false on new query, stop, clear, and page refresh — exactly the desired
  // lifecycle. Driving the gate from a single explicit latch avoids the
  // pitfalls of inferring "done" from message contents or useChat.isLoading.
  const hasResponse = responseReady;
  const [billingLoading, setBillingLoading] = useState(false);

  const handleNavClick = (view: AppView) => {
    onViewChange(view);
    setIsOpen(false);
  };

  const handleBilling = async () => {
    try {
      setBillingLoading(true);
      const res = await fetch("/api/stripe/billing", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 404) {
          alert("No billing account found. Please complete your subscription first.");
        } else if (res.status === 401) {
          alert("Please log in to access billing.");
        } else {
          alert(data.error || "Unable to open billing portal.");
        }
        return;
      }
      if (data.url) window.location.href = data.url;
    } catch (err) {
      console.error("Portal error:", err);
      alert("Unable to open billing portal. Please try again later.");
    } finally {
      setBillingLoading(false);
    }
  };

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    localStorage.removeItem('medauth-welcome-seen');
    router.push('/auth/login');
  };

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/50 z-40"
          onClick={() => setIsOpen(false)}
        />
      )}

      <aside
        className={cn(
          'bg-white border-r border-gray-200 flex flex-col py-8 px-2 w-16 m-1',
          'transition-all duration-300 ease-in-out',
          'fixed left-0 top-16 bottom-0 z-50',
          'md:relative md:top-0 md:translate-x-0 md:w-16',
          isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
        )}
      >
        {/* Primary actions — evenly spaced above the fold */}
        <div className="flex flex-col flex-1 justify-start gap-1 w-full">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeView === item.id;
            const isDisabled = item.id === 'export' && !hasResponse;
            return (
              <button
                key={item.id}
                onClick={() => !isDisabled && handleNavClick(item.id)}
                disabled={isDisabled}
                className={cn(
                  'relative w-full flex flex-col items-center justify-center gap-1 px-2 py-2 rounded-lg transition-colors',
                  isDisabled
                    ? 'text-gray-300 cursor-not-allowed'
                    : isActive
                      ? 'bg-blue-50 text-blue-600'
                      : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700',
                )}
              >
                {isActive && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-blue-600 rounded-r" />
                )}
                <Icon className="size-4 shrink-0" strokeWidth={1} />
                <span className="text-[10px] leading-tight">{item.label}</span>
              </button>
            );
          })}

          <div className="w-full h-px bg-gray-200" />

          <button
            onClick={handleBilling}
            disabled={billingLoading}
            className={cn(
              'w-full flex flex-col items-center justify-center gap-1 px-2 py-2 rounded-lg transition-colors',
              billingLoading
                ? 'text-gray-300 cursor-not-allowed'
                : 'text-green-500 hover:bg-green-50 hover:text-green-600',
            )}
          >
            <CreditCard className="size-4 shrink-0" strokeWidth={1} />
            <span className="text-[10px] leading-tight">
              {billingLoading ? 'Loading…' : 'Manage Billing'}
            </span>
          </button>
          <button
            onClick={handleLogout}
            className="w-full flex flex-col items-center justify-center gap-1 px-2 py-2 rounded-lg text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors"
          >
            <LogOut className="size-4 shrink-0" strokeWidth={1} />
            <span className="text-[10px] leading-tight">Logout</span>
          </button>
        </div>

        {/* Legal links — pinned to bottom */}
        <div className="flex flex-col w-full">
          <div className="w-full h-px bg-gray-200" />
          <div className="flex flex-col items-center gap-1 w-full py-1">
            {([
              { href: '/legal/terms-of-service', Icon: Scale, label: 'Terms', isLink: true },
              { href: '/legal/privacy-policy', Icon: Shield, label: 'Privacy', isLink: true },
              { href: 'mailto:sales@notedoctor.ai', Icon: Mail, label: 'Contact', isLink: false },
            ] as const).map(({ href, Icon, label, isLink }) =>
              isLink ? (
                <Link
                  key={label}
                  href={href}
                  onClick={() => setIsOpen(false)}
                  className="w-full flex flex-col items-center justify-center gap-1 px-1 py-2 rounded-lg text-gray-400 hover:bg-gray-50 hover:text-gray-600 transition-colors text-center"
                >
                  <Icon className="size-3.5 shrink-0" strokeWidth={1} />
                  <span className="text-[10px] leading-tight">{label}</span>
                </Link>
              ) : (
                <a
                  key={label}
                  href={href}
                  onClick={() => setIsOpen(false)}
                  className="w-full flex flex-col items-center justify-center gap-1 px-1 py-2 rounded-lg text-gray-400 hover:bg-gray-50 hover:text-gray-600 transition-colors text-center"
                >
                  <Icon className="size-3.5 shrink-0" strokeWidth={1} />
                  <span className="text-[10px] leading-tight">{label}</span>
                </a>
              ),
            )}
            <p className="text-[10px] text-gray-300 text-center mt-1">
              © {new Date().getFullYear()} NoteDoctor.Ai
            </p>
          </div>
        </div>
      </aside>
    </>
  );
}

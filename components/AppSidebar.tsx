'use client';
import { FileText, FileDown, LogOut, CreditCard, Scale, Shield, Mail } from 'lucide-react';
import { cn } from '@/utils/cn';
import { createClient } from '@/utils/client';
import { useRouter } from 'next/navigation';
import { useMobileSidebar } from '@/components/providers/MobileSidebarProvider';
import { usePriorAuthChat } from '@/components/providers/PriorAuthProvider';
import { useState } from 'react';
import Link from 'next/link';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export type AppView = 'auth' | 'upload' | 'export';

interface AppSidebarProps {
  activeView: AppView;
  onViewChange: (view: AppView) => void;
}

const navItems: { id: AppView; icon: React.ElementType; label: string }[] = [
  { id: 'auth',   icon: FileText, label: 'Prior Authorization' },
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
    <TooltipProvider delayDuration={300}>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/50 z-40"
          onClick={() => setIsOpen(false)}
        />
      )}

      <aside
        className={cn(
          'bg-white border-r border-gray-200 flex flex-col py-8',
          'transition-all duration-300 ease-in-out',
          'fixed left-0 top-16 bottom-0 z-50',
          'md:relative md:top-0 md:translate-x-0 md:w-12 md:items-center md:px-0',
          isOpen
            ? 'translate-x-0 w-56 px-3'
            : '-translate-x-full w-56',
        )}
      >
        {/* Nav items */}
        <div className="flex flex-col gap-1 flex-1 w-full md:items-center">
          {navItems.map((item, index) => {
            const Icon = item.icon;
            const isActive = activeView === item.id;
            const isDisabled = item.id === 'export' && !hasResponse;
            return (
              <div key={item.id} className="w-full flex flex-col md:items-center">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => !isDisabled && handleNavClick(item.id)}
                      disabled={isDisabled}
                      className={cn(
                        'relative w-full flex items-center gap-3 px-2 h-10 rounded-lg transition-colors',
                        'md:w-10 md:justify-center md:gap-0',
                        isDisabled
                          ? 'text-gray-300 cursor-not-allowed'
                          : isActive
                            ? 'bg-blue-50 text-blue-600'
                            : 'text-gray-400 hover:bg-gray-50 hover:text-gray-600',
                      )}
                    >
                      {isActive && (
                        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-blue-600 rounded-r" />
                      )}
                      <Icon className="size-5 shrink-0 ml-1 md:ml-0" />
                      <span className="text-sm font-medium md:hidden">{item.label}</span>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right">
                    <p>{isDisabled ? 'Waiting for response…' : item.label}</p>
                  </TooltipContent>
                </Tooltip>
                {index < navItems.length - 1 && (
                  <div className="w-full h-px bg-gray-100 my-1 md:w-8 md:mx-auto" />
                )}
              </div>
            );
          })}
        </div>

        {/* Billing & Logout */}
        <div className="flex flex-col w-full gap-2 md:items-center">
          <div className="w-full h-px bg-gray-200 md:w-8" />
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={handleBilling}
                disabled={billingLoading}
                className={cn(
                  'w-full flex items-center gap-3 px-2 h-10 rounded-lg transition-colors',
                  'md:w-10 md:justify-center md:gap-0',
                  billingLoading
                    ? 'text-gray-300 cursor-not-allowed'
                    : 'text-green-500 hover:bg-green-50 hover:text-green-600',
                )}
              >
                <CreditCard className="size-5 shrink-0 ml-1 md:ml-0" />
                <span className="text-sm font-medium md:hidden">
                  {billingLoading ? 'Loading…' : 'Manage Billing'}
                </span>
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">
              <p>Manage Billing</p>
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-2 h-10 rounded-lg text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors md:w-10 md:justify-center md:gap-0"
              >
                <LogOut className="size-5 shrink-0 ml-1 md:ml-0" />
                <span className="text-sm font-medium md:hidden">Logout</span>
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">
              <p>Logout</p>
            </TooltipContent>
          </Tooltip>
          <div className="w-full h-px bg-gray-200 md:w-8" />

          {/* Legal links */}
          <div className="flex flex-col gap-1 w-full md:items-center py-1">
            {([
              { href: '/legal/terms-of-service', Icon: Scale, label: 'Terms of Service', isLink: true },
              { href: '/legal/privacy-policy', Icon: Shield, label: 'Privacy Policy', isLink: true },
              { href: 'mailto:sales@notedoctor.ai', Icon: Mail, label: 'Contact', isLink: false },
            ] as const).map(({ href, Icon, label, isLink }) => (
              <Tooltip key={label}>
                <TooltipTrigger asChild>
                  {isLink ? (
                    <Link
                      href={href}
                      onClick={() => setIsOpen(false)}
                      className="w-full flex items-center gap-3 px-2 h-9 rounded-lg text-gray-400 hover:bg-gray-50 hover:text-gray-600 transition-colors md:w-10 md:justify-center md:gap-0"
                    >
                      <Icon className="size-4 shrink-0 ml-1 md:ml-0" />
                      <span className="text-xs md:hidden">{label}</span>
                    </Link>
                  ) : (
                    <a
                      href={href}
                      onClick={() => setIsOpen(false)}
                      className="w-full flex items-center gap-3 px-2 h-9 rounded-lg text-gray-400 hover:bg-gray-50 hover:text-gray-600 transition-colors md:w-10 md:justify-center md:gap-0"
                    >
                      <Icon className="size-4 shrink-0 ml-1 md:ml-0" />
                      <span className="text-xs md:hidden">{label}</span>
                    </a>
                  )}
                </TooltipTrigger>
                <TooltipContent side="right"><p>{label}</p></TooltipContent>
              </Tooltip>
            ))}
            <p className="text-xs text-gray-300 px-2 mt-1 md:hidden">
              © {new Date().getFullYear()} NoteDoctor.Ai
            </p>
          </div>
        </div>
      </aside>
    </TooltipProvider>
  );
}

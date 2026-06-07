'use client';
import {
  FileText,
  FileDown,
  LogOut,
  CreditCard,
  Scale,
  Shield,
  Mail,
  Pin,
  Bookmark,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/utils/cn';
import { createClient } from '@/utils/client';
import { useRouter } from 'next/navigation';
import { useMobileSidebar } from '@/components/providers/MobileSidebarProvider';
import {
  usePriorAuthChat,
  usePriorAuthUi,
} from '@/components/providers/PriorAuthProvider';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import logoMark from '@/public/images/logo-main.svg';

export type AppView = 'auth' | 'upload' | 'export';

interface AppSidebarProps {
  activeView: AppView;
  onViewChange: (view: AppView) => void;
}

const navItems: { id: AppView; icon: React.ElementType; label: string }[] = [
  { id: 'auth',   icon: FileText, label: 'Requests' },
  // { id: 'upload', icon: Upload,   label: 'Upload File' },
  { id: 'export', icon: FileDown, label: 'Export' },
];

const supportLinks = [
  { href: '/legal/terms-of-service', icon: Scale, label: 'Terms', isLink: true },
  { href: '/legal/privacy-policy', icon: Shield, label: 'Privacy', isLink: true },
  { href: 'mailto:sales@notedoctor.ai', icon: Mail, label: 'Contact', isLink: false },
] as const;

// Fly-out rail row: the icon stays put in the slim rail while the label
// (`fb-label`, styled in globals.css) fades/slides in as the rail expands.
const rowClass =
  'relative w-full flex items-center gap-[15px] h-[46px] px-3.5 rounded-xl text-left transition-colors';

function SectionHead({ children }: { children: React.ReactNode }) {
  return (
    <div className="fb-label fb-head px-3.5 text-[11px] font-bold uppercase tracking-[0.1em] text-[#aab0bd]">
      {children}
    </div>
  );
}

/** 3.5px accent bar bleeding off the rail's left edge (half clipped). */
function ActiveBar() {
  return (
    <span className="absolute -left-[15.5px] top-3 bottom-3 w-[7px] rounded-full bg-primary" />
  );
}

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
  const { setSavedSheetOpen } = usePriorAuthUi();
  const [billingLoading, setBillingLoading] = useState(false);

  // Desktop fly-out: hovering (or keyboard focus inside) floats the rail open
  // over the content; the pin toggle locks it open as a static sidebar.
  const [hovering, setHovering] = useState(false);
  const [pinned, setPinned] = useState(false);
  const expanded = pinned || hovering;
  // Floating = open as an overlay (scrim + shadow). Pinned = static, reflows.
  const floating = expanded && !pinned;

  // Account card identity — email only, never the user id.
  const [accountEmail, setAccountEmail] = useState('');
  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    supabase.auth
      .getSession()
      .then(({ data }: { data: { session: { user?: { email?: string } } | null } }) => {
        if (!cancelled) setAccountEmail(data.session?.user?.email ?? '');
      })
      .catch(() => { /* ignore — card just stays generic */ });
    return () => {
      cancelled = true;
    };
  }, []);
  const accountHandle = accountEmail.split('@')[0] || 'Account';
  const accountInitial = (accountHandle[0] || 'U').toUpperCase();

  const collapseFlyout = () => {
    setIsOpen(false);
    if (!pinned) setHovering(false);
  };

  const handleNavClick = (view: AppView) => {
    onViewChange(view);
    collapseFlyout();
  };

  // Opens the saved-queries palette (rendered inside PriorAuthView, which
  // stays mounted). Jump to the Requests view first so re-applying a query
  // lands on a visible chat.
  const handleSavedClick = () => {
    onViewChange('auth');
    setSavedSheetOpen(true);
    collapseFlyout();
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

      {/* Desktop scrim — only while the rail floats open UNPINNED. Sits over
          the app content but under the rail; pointer-events-none so the rail
          still collapses naturally on mouseleave. */}
      <div
        aria-hidden
        data-testid="flyout-scrim"
        className={cn(
          'hidden md:block fixed inset-0 z-20 bg-[rgba(20,28,48,0.13)]',
          'pointer-events-none transition-opacity duration-200 motion-reduce:transition-none',
          floating ? 'opacity-100' : 'opacity-0',
        )}
      />

      {/* Rail zone — the app's left gutter. Reserved at the collapsed 76px so
          nothing reflows while the rail floats open; only PINNING widens it
          (static 256px sidebar, app reflows). */}
      <div
        data-testid="flyout-zone"
        className={cn(
          'flyout-zone relative w-0 shrink-0 z-50 md:z-30',
          pinned ? 'md:w-[256px]' : 'md:w-[76px]',
        )}
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
        onFocus={() => setHovering(true)}
        onBlur={(e) => {
          // Collapse only when focus leaves the rail entirely.
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
            setHovering(false);
          }
        }}
      >
        <div
          className={cn(
            'flyout-wrap fixed left-0 top-16 bottom-0 z-50',
            'md:absolute md:inset-y-0 md:z-auto',
            isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
            (expanded || isOpen) && 'is-open',
            pinned && 'is-pinned',
          )}
        >
          <aside className="flyout-rail h-full flex flex-col bg-white border-r border-[#ebedf1] pt-4 px-3 pb-3.5">
            {/* Brand — real logo mark; wordmark hides when collapsed */}
            <div className="flex items-center gap-[11px] px-1.5 pb-3">
              <Image
                src={logoMark}
                alt="NoteDoctor.Ai"
                width={34}
                height={34}
                className="shrink-0 rounded-[10px]"
                priority
                unoptimized
              />
              <span className="fb-label text-[17px] font-extrabold tracking-tight text-[#1c2333]">
                NoteDoctor<span className="text-primary">.Ai</span>
              </span>
            </div>

            <nav aria-label="Primary" className="flex-1 flex flex-col gap-[3px] overflow-hidden pt-1.5">
              <SectionHead>Workspace</SectionHead>
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeView === item.id;
                const isDisabled = item.id === 'export' && !hasResponse;
                return (
                  <button
                    key={item.id}
                    onClick={() => !isDisabled && handleNavClick(item.id)}
                    disabled={isDisabled}
                    aria-label={item.label}
                    aria-current={isActive ? 'page' : undefined}
                    className={cn(
                      rowClass,
                      isDisabled
                        ? 'text-gray-300 cursor-not-allowed'
                        : isActive
                          ? 'bg-primary/10 text-primary'
                          : 'text-[#737b89] hover:bg-[#f4f5f8]',
                    )}
                  >
                    {isActive && <ActiveBar />}
                    <Icon size={21} strokeWidth={1.7} className="shrink-0" />
                    <span
                      className={cn(
                        'fb-label text-sm',
                        isActive ? 'font-bold text-primary' : 'font-semibold',
                        !isActive && !isDisabled && 'text-[#3f4654]',
                      )}
                    >
                      {item.label}
                    </span>
                  </button>
                );
              })}

              <button
                onClick={handleSavedClick}
                aria-label="Saved"
                className={cn(rowClass, 'text-[#737b89] hover:bg-[#f4f5f8]')}
              >
                <Bookmark size={21} strokeWidth={1.7} className="shrink-0" />
                <span className="fb-label text-sm font-semibold text-[#3f4654]">
                  Saved
                </span>
              </button>

              <button
                onClick={handleBilling}
                disabled={billingLoading}
                aria-label="Billing"
                className={cn(
                  rowClass,
                  billingLoading
                    ? 'text-gray-300 cursor-not-allowed'
                    : 'text-[#15a06b] hover:bg-[#f4f5f8]',
                )}
              >
                <CreditCard size={21} strokeWidth={1.7} className="shrink-0" />
                <span className="fb-label text-sm font-semibold">
                  {billingLoading ? 'Loading…' : 'Billing'}
                </span>
              </button>

              <div className="h-3.5" />

              <SectionHead>Support</SectionHead>
              {supportLinks.map(({ href, icon: Icon, label, isLink }) => {
                const linkClass = cn(rowClass, 'text-[#737b89] hover:bg-[#f4f5f8]');
                const inner = (
                  <>
                    <Icon size={21} strokeWidth={1.7} className="shrink-0" />
                    <span className="fb-label text-sm font-semibold text-[#3f4654]">
                      {label}
                    </span>
                  </>
                );
                return isLink ? (
                  <Link key={label} href={href} onClick={collapseFlyout} className={linkClass}>
                    {inner}
                  </Link>
                ) : (
                  <a key={label} href={href} onClick={collapseFlyout} className={linkClass}>
                    {inner}
                  </a>
                );
              })}
            </nav>

            {/* Logout — pinned to bottom */}
            <button
              onClick={handleLogout}
              aria-label="Logout"
              className={cn(rowClass, 'text-[#ef5b5b] hover:bg-[#f4f5f8]')}
            >
              <LogOut size={21} strokeWidth={1.7} className="shrink-0" />
              <span className="fb-label text-sm font-semibold">Logout</span>
            </button>

            <div className="h-px bg-[#eef0f3] mx-2 my-3" />

            {/* Account card — avatar stays in the slim rail; text + chevron
                reveal on expand. Opens the billing portal (our account
                management surface). */}
            <button
              onClick={handleBilling}
              aria-label="Account settings"
              className="flex items-center gap-[11px] h-[52px] px-1.5 rounded-xl text-left hover:bg-[#f4f5f8] transition-colors"
            >
              <span className="shrink-0 grid place-items-center w-9 h-9 rounded-full bg-primary/10 text-primary text-sm font-bold">
                {accountInitial}
              </span>
              <span className="fb-label min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-[#3f4654]">
                  {accountHandle}
                </span>
                <span className="block text-[11.5px] text-[#aab0bd]">
                  Account settings
                </span>
              </span>
              <ChevronRight
                size={16}
                strokeWidth={1.7}
                className="fb-label shrink-0 text-[#aab0bd]"
              />
            </button>
          </aside>

          {/* Pin toggle — rides the expanding edge, desktop only */}
          {expanded && (
            <button
              onClick={() => setPinned((p) => !p)}
              title={pinned ? 'Unpin sidebar' : 'Pin sidebar open'}
              aria-label={pinned ? 'Unpin sidebar' : 'Pin sidebar open'}
              aria-pressed={pinned}
              className={cn(
                'hidden md:grid place-items-center absolute top-[22px] -right-[13px] z-30',
                'w-[26px] h-[26px] rounded-full border border-[#e7e9ee] bg-white hover:bg-[#f7f8fa]',
                'shadow-[0_3px_10px_rgba(20,30,60,0.12)]',
                pinned ? 'text-primary' : 'text-[#aab0bd]',
              )}
            >
              <Pin size={14} strokeWidth={1.7} />
            </button>
          )}
        </div>
      </div>
    </>
  );
}

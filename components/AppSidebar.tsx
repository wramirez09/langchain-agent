'use client';
import {
  FileText,
  FileDown,
  LogOut,
  Scale,
  Shield,
  Mail,
  Pin,
  ChevronRight,
  KeyRound,
  FlaskConical,
  Code2,
  SunMoon,
  Check,
} from 'lucide-react';
import { useTheme } from 'next-themes';
import { THEME_OPTIONS, noopSubscribe } from '@/components/theme/themeOptions';
import { cn } from '@/utils/cn';
import { createClient } from '@/utils/client';
import { useRouter } from 'next/navigation';
import { useMobileSidebar } from '@/components/providers/MobileSidebarProvider';
import { usePriorAuthChat } from '@/components/providers/PriorAuthProvider';
import { useEffect, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { openBillingPortal } from '@/lib/billing/openBillingPortal';

export type AppView = 'auth' | 'export';

interface AppSidebarProps {
  activeView: AppView;
  onViewChange: (view: AppView) => void;
}

const navItems: { id: AppView; icon: React.ElementType; label: string }[] = [
  { id: 'auth', icon: FileText, label: 'Requests' },
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
  'relative w-full flex items-center gap-[15px] h-[46px] px-[15.5px] rounded-xl text-left transition-colors';

// API rows nested under the Developer group — same row, deeper left padding
// so they read as children of the Developer header.
const nestedRowClass =
  'relative w-full flex items-center gap-[15px] h-[46px] pl-9 pr-3.5 rounded-xl text-left transition-colors';

function SectionHead({ children }: { children: React.ReactNode }) {
  return (
    <div className="fb-label fb-head px-3.5 text-[11px] font-bold uppercase tracking-[0.1em] text-faint">
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

/** Collapsible group header (Developer, Theme): icon, label, rotating caret. */
function AccordionHeader({
  icon: Icon,
  label,
  open,
  onToggle,
  controls,
}: {
  icon: React.ElementType;
  label: string;
  open: boolean;
  onToggle: () => void;
  controls: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-controls={controls}
      aria-label={label}
      className={cn(rowClass, 'text-muted-foreground hover:bg-accent')}
    >
      <Icon size={18} strokeWidth={1.7} className="shrink-0" />
      <span className="fb-label text-[13px] font-semibold text-foreground-soft">{label}</span>
      {/* The rotation lives on the icon, not the .fb-label wrapper:
          `.flyout-wrap.is-open .fb-label` sets `transform: none` for the label
          slide-in, which would otherwise cancel rotate-90. */}
      <span aria-hidden className="fb-label ml-auto shrink-0 text-faint">
        <ChevronRight
          size={16}
          strokeWidth={2}
          className={cn(
            'transition-transform duration-200 ease-out motion-reduce:transition-none',
            open && 'rotate-90',
          )}
        />
      </span>
    </button>
  );
}

/**
 * A group's children. Always mounted so the height can animate: a 0fr -> 1fr
 * grid row eases between collapsed and the content's natural height. Closed,
 * the group is inert + aria-hidden so its rows can't be tabbed to or read out
 * while invisible.
 */
function AccordionPanel({
  id,
  open,
  children,
  ...rest
}: {
  id: string;
  open: boolean;
  children: React.ReactNode;
} & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      id={id}
      inert={!open}
      aria-hidden={!open}
      className={cn(
        'grid transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none',
        open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
      )}
    >
      <div {...rest} className="flex min-h-0 flex-col gap-[3px] overflow-hidden">
        {children}
      </div>
    </div>
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

  // Desktop fly-out: hovering (or keyboard focus inside) floats the rail open
  // over the content; the pin toggle locks it open as a static sidebar.
  const [hovering, setHovering] = useState(false);
  const [pinned, setPinned] = useState(false);
  const expanded = pinned || hovering;
  // Floating = open as an overlay (scrim + shadow). Pinned = static, reflows.
  const floating = expanded && !pinned;
  // Rail is showing labels (desktop expanded, or the mobile overlay). The
  // nested API Keys indent only applies here; collapsed, its icon must line
  // up with the other rail icons.
  const railOpen = expanded || isOpen;

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

  // Org membership gates how the API rows appear in the rail. Normal case
  // (has org): they nest under the Developer group. Exception (no org but paid
  // for API access): show API Keys and API Playground on their own.
  // `/api/org` returns 200 when the caller has an org; anything else (incl.
  // the pathological no-org 500) is treated as "no org". Optimistically
  // assume has-org so the common case renders without a flash.
  const [hasOrg, setHasOrg] = useState(true);
  // "Developer" is a collapsible group header, not a link — it only expands
  // and collapses its children. Open by default so the API rows are visible.
  const [devOpen, setDevOpen] = useState(true);
  // Theme group starts closed — it's a preference, not navigation.
  const [themeOpen, setThemeOpen] = useState(false);
  const { theme, setTheme } = useTheme();
  // next-themes only knows the stored theme on the client; leave every option
  // unselected until mount so server and client markup agree.
  const mounted = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
  const activeTheme = THEME_OPTIONS.find((o) => mounted && o.value === theme);
  useEffect(() => {
    let cancelled = false;
    fetch('/api/org')
      .then((res) => {
        if (!cancelled) setHasOrg(res.ok);
      })
      .catch(() => {
        /* network error — keep the optimistic has-org default */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const collapseFlyout = () => {
    setIsOpen(false);
    if (!pinned) setHovering(false);
  };

  const handleNavClick = (view: AppView) => {
    onViewChange(view);
    collapseFlyout();
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
          <aside className="flyout-rail h-full flex flex-col bg-card border-r border-border pt-4 px-3 pb-3.5">

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
                        ? 'text-faint cursor-not-allowed'
                        : isActive
                          ? 'bg-primary/10 text-primary'
                          : 'text-muted-foreground hover:bg-accent',
                    )}
                  >
                    {isActive && <ActiveBar />}
                    <Icon size={18} strokeWidth={1.7} className="shrink-0" />
                    <span
                      className={cn(
                        'fb-label text-[13px]',
                        isActive ? 'font-bold text-primary' : 'font-semibold',
                        !isActive && !isDisabled && 'text-foreground-soft',
                      )}
                    >
                      {item.label}
                    </span>
                  </button>
                );
              })}

              {hasOrg ? (
                <>
                  <AccordionHeader
                    icon={Code2}
                    label="Developer"
                    open={devOpen}
                    onToggle={() => setDevOpen((o) => !o)}
                    controls="sidebar-developer-group"
                  />
                  <AccordionPanel id="sidebar-developer-group" open={devOpen}>
                      <Link
                        href="/agents/api-keys"
                        onClick={collapseFlyout}
                        aria-label="API Keys"
                        className={cn(
                          railOpen ? nestedRowClass : rowClass,
                          'transition-[padding] text-muted-foreground hover:bg-accent',
                        )}
                      >
                        <KeyRound size={16} strokeWidth={1.7} className="shrink-0" />
                        <span className="fb-label text-[13px] font-medium text-muted-foreground">
                          API Keys
                        </span>
                      </Link>

                      <Link
                        href="/agents/api-playground"
                        onClick={collapseFlyout}
                        aria-label="API Playground"
                        className={cn(
                          railOpen ? nestedRowClass : rowClass,
                          'transition-[padding] text-muted-foreground hover:bg-accent',
                        )}
                      >
                        <FlaskConical size={16} strokeWidth={1.7} className="shrink-0" />
                        <span className="fb-label text-[13px] font-medium text-muted-foreground">
                          API Playground
                        </span>
                      </Link>
                  </AccordionPanel>
                </>
              ) : (
                /* No org but API-enabled — surface API Keys on its own */
                <Link
                  href="/agents/api-keys"
                  onClick={collapseFlyout}
                  aria-label="API Keys"
                  className={cn(rowClass, 'text-muted-foreground hover:bg-accent')}
                >
                  <KeyRound size={18} strokeWidth={1.7} className="shrink-0" />
                  <span className="fb-label text-[13px] font-semibold text-foreground-soft">
                    API Keys
                  </span>
                </Link>
              )}

              {/* API Playground on its own, mirroring the standalone API Keys row
                  (the has-org branch nests its own Playground link above). */}
              {!hasOrg && (
                <Link
                  href="/agents/api-playground"
                  onClick={collapseFlyout}
                  aria-label="API Playground"
                  className={cn(rowClass, 'text-muted-foreground hover:bg-accent')}
                >
                  <FlaskConical size={18} strokeWidth={1.7} className="shrink-0" />
                  <span className="fb-label text-[13px] font-semibold text-foreground-soft">
                    API Playground
                  </span>
                </Link>
              )}

              <AccordionHeader
                icon={activeTheme?.icon ?? SunMoon}
                label="Theme"
                open={themeOpen}
                onToggle={() => setThemeOpen((o) => !o)}
                controls="sidebar-theme-group"
              />
              <AccordionPanel
                id="sidebar-theme-group"
                open={themeOpen}
                role="radiogroup"
                aria-label="Color theme"
              >
                {THEME_OPTIONS.map(({ value, label, icon: Icon }) => {
                  const selected = mounted && theme === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      aria-label={label}
                      onClick={() => setTheme(value)}
                      className={cn(
                        railOpen ? nestedRowClass : rowClass,
                        'transition-[padding]',
                        selected
                          ? 'bg-primary/10 text-primary'
                          : 'text-muted-foreground hover:bg-accent',
                      )}
                    >
                      <Icon size={16} strokeWidth={1.7} className="shrink-0" />
                      <span
                        className={cn(
                          'fb-label text-[13px]',
                          selected ? 'font-semibold text-primary' : 'font-medium text-muted-foreground',
                        )}
                      >
                        {label}
                      </span>
                      {selected && (
                        <Check
                          size={16}
                          strokeWidth={2}
                          aria-hidden
                          className="fb-label ml-auto shrink-0"
                        />
                      )}
                    </button>
                  );
                })}
              </AccordionPanel>

              <div className="h-3.5" />

              <SectionHead>Support</SectionHead>
              {supportLinks.map(({ href, icon: Icon, label, isLink }) => {
                const linkClass = cn(rowClass, 'text-muted-foreground hover:bg-accent');
                const inner = (
                  <>
                    <Icon size={18} strokeWidth={1.7} className="shrink-0" />
                    <span className="fb-label text-[13px] font-semibold text-foreground-soft">
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
              className={cn(rowClass, 'text-destructive hover:bg-accent')}
            >
              <LogOut size={18} strokeWidth={1.7} className="shrink-0" />
              <span className="fb-label text-[13px] font-semibold">Logout</span>
            </button>

            <div className="h-px bg-border mx-2 my-3" />

            {/* Account card — avatar stays in the slim rail; text + chevron
                reveal on expand. Opens the Stripe billing portal, so the row
                is labelled for what it actually does. */}
            <button
              onClick={openBillingPortal}
              aria-label="Billing"
              className="flex items-center gap-[11px] h-[52px] px-1.5 rounded-xl text-left hover:bg-accent transition-colors"
            >
              <span className="shrink-0 grid place-items-center w-9 h-9 rounded-full bg-primary/10 text-primary text-sm font-bold">
                {accountInitial}
              </span>
              <span className="fb-label min-w-0 flex-1">
                <span className="block truncate text-[13px] font-semibold text-foreground-soft">
                  {accountHandle}
                </span>
                <span className="block text-[11.5px] text-faint">
                  Billing
                </span>
              </span>
              <ChevronRight
                size={16}
                strokeWidth={1.7}
                className="fb-label shrink-0 text-faint"
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
                'w-[26px] h-[26px] rounded-full border border-border bg-card hover:bg-accent',
                'shadow-[0_3px_10px_rgba(20,30,60,0.12)]',
                pinned ? 'text-primary' : 'text-faint',
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

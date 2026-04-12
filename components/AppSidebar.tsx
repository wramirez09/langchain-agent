'use client';
import { FileText, Upload, FileDown, LogOut, CreditCard } from 'lucide-react';
import { cn } from '@/utils/cn';
import { createClient } from '@/utils/client';
import { useRouter } from 'next/navigation';
import { useMobileSidebar } from '@/components/providers/MobileSidebarProvider';
import { useState } from 'react';

export type AppView = 'auth' | 'upload' | 'export';

interface AppSidebarProps {
  activeView: AppView;
  onViewChange: (view: AppView) => void;
}

const navItems: { id: AppView; icon: React.ElementType; label: string }[] = [
  { id: 'auth',   icon: FileText, label: 'Prior Authorization' },
  { id: 'upload', icon: Upload,   label: 'Upload File' },
  { id: 'export', icon: FileDown, label: 'File Export' },
];

export function AppSidebar({ activeView, onViewChange }: AppSidebarProps) {
  const router = useRouter();
  const { isOpen, setIsOpen } = useMobileSidebar();
  const [billingLoading, setBillingLoading] = useState(false);

  const handleNavClick = (view: AppView) => {
    onViewChange(view);
    setIsOpen(false);
  };

  const handleBilling = async () => {
    try {
      setBillingLoading(true);
      const res = await fetch("/api/stripe/billing", {
        method: "POST",
      });
      
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
      
      if (data.url) {
        window.location.href = data.url;
      }
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
          'w-12 bg-white border-r border-gray-200 flex flex-col items-center py-4',
          'transition-transform duration-300 ease-in-out',
          'fixed left-0 top-16 bottom-0 z-50',
          'md:relative md:top-0 md:translate-x-0',
          isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
        )}
      >
        {/* Nav items */}
        <div className="flex flex-col items-center gap-1 flex-1 w-full">
          {navItems.map((item, index) => {
            const Icon = item.icon;
            const isActive = activeView === item.id;
            return (
              <div key={item.id} className="w-full flex flex-col items-center">
                <button
                  onClick={() => handleNavClick(item.id)}
                  title={item.label}
                  className={cn(
                    'relative w-10 h-10 flex items-center justify-center rounded-lg transition-colors',
                    isActive
                      ? 'bg-blue-50 text-blue-600'
                      : 'text-gray-400 hover:bg-gray-50 hover:text-gray-600',
                  )}
                >
                  {isActive && (
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-blue-600 rounded-r" />
                  )}
                  <Icon className="size-5" />
                </button>
                {index < navItems.length - 1 && (
                  <div className="w-8 h-px bg-gray-200 my-1" />
                )}
              </div>
            );
          })}
        </div>

        {/* Billing & Logout */}
        <div className="flex flex-col items-center w-full gap-2">
          <div className="w-8 h-px bg-gray-200" />
          <div className="flex flex-col items-center gap-1">
            <button
              onClick={handleBilling}
              disabled={billingLoading}
              title="Manage Billing"
              className={cn(
                "w-10 h-10 flex items-center justify-center rounded-lg transition-colors",
                billingLoading 
                  ? "text-gray-300 cursor-not-allowed"
                  : "text-green-500 hover:bg-green-50 hover:text-green-600"
              )}
            >
              <CreditCard className="size-5" />
            </button>
          </div>
          <div className="w-8 h-px bg-gray-200" />
          <button
            onClick={handleLogout}
            title="Logout"
            className="w-10 h-10 flex items-center justify-center rounded-lg text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors"
          >
            <LogOut className="size-5" />
          </button>
        </div>
      </aside>
    </>
  );
}

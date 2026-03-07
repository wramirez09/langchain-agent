'use client';
import { FileText, Upload, FileDown, LogOut } from 'lucide-react';
import { cn } from '@/utils/cn';
import { createClient } from '@/utils/client';
import { useRouter } from 'next/navigation';
import { useMobileSidebar } from '@/components/providers/MobileSidebarProvider';

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

  const handleNavClick = (view: AppView) => {
    onViewChange(view);
    setIsOpen(false);
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

        {/* Logout */}
        <div className="flex flex-col items-center w-full">
          <div className="w-8 h-px bg-gray-200 mb-2" />
          <button
            onClick={handleLogout}
            title="Logout"
            className="w-10 h-10 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-50 hover:text-gray-600 transition-colors"
          >
            <LogOut className="size-5" />
          </button>
        </div>
      </aside>
    </>
  );
}

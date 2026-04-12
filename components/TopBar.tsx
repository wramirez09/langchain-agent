'use client';
import Image from "next/image";
import logo from "@/public/images/ndLogo.png";
import * as React from 'react';
import { Menu } from 'lucide-react';
import { createClient } from '@/utils/client';
import { useMobileSidebar } from '@/components/providers/MobileSidebarProvider';

const TopBar: React.FC = () => {
  const { toggleIsOpen } = useMobileSidebar();
  const [displayName, setDisplayName] = React.useState('');
  const [displayEmail, setDisplayEmail] = React.useState('');
  const [initials, setInitials] = React.useState('');
  const [isLoggedIn, setIsLoggedIn] = React.useState(false);

  React.useEffect(() => {
    const supabase = createClient();

    const loadUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;
      setIsLoggedIn(true);
      setDisplayEmail(session.user.email || '');
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, email')
        .eq('id', session.user.id)
        .single();
      const name = profile?.full_name || session.user.email || 'User';
      setDisplayName(name);
      setInitials(
        name.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase()
      );
    };

    loadUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setIsLoggedIn(true);
        loadUser();
      } else {
        setIsLoggedIn(false);
        setDisplayName('');
        setDisplayEmail('');
        setInitials('');
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <div className="h-16 bg-white border-b border-gray-200 flex items-center px-4 md:px-6 z-50 flex-shrink-0">
      {/* Left — hamburger on mobile, spacer on desktop */}
      <div className="flex-1 flex items-center">
        <button
          onClick={toggleIsOpen}
          className="md:hidden text-gray-600 hover:text-gray-900 p-1"
          aria-label="Toggle menu"
        >
          <Menu className="size-6" />
        </button>
      </div>

      {/* Center — logo always centered */}
      <div className="flex items-center gap-2">
        <Image src={logo} alt="NoteDoctor.ai Logo" className="h-8 w-auto" />
        <span className="text-sm font-bold text-gray-900">NoteDoctor.Ai</span>
      </div>

      {/* Right — user info */}
      <div className="flex-1 flex items-center justify-end">
        {isLoggedIn && (
          <div className="flex items-center gap-3">
            <div className="hidden md:flex flex-col text-right">
              <span className="text-sm font-medium text-gray-700">{displayName}</span>
              <span className="text-xs text-gray-500">{displayEmail}</span>
            </div>
            <div className="w-9 h-9 bg-blue-600 rounded-full flex items-center justify-center flex-shrink-0">
              <span className="text-sm font-semibold text-white">{initials || 'U'}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TopBar;
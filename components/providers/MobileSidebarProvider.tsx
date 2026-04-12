'use client';
import { createContext, useContext, useState, ReactNode } from 'react';

type MobileSidebarContextType = {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  toggleIsOpen: () => void;
};

const MobileSidebarContext = createContext<MobileSidebarContextType>({
  isOpen: false,
  setIsOpen: () => {},
  toggleIsOpen: () => {},
});

export function MobileSidebarProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const toggleIsOpen = () => setIsOpen(prev => !prev);
  
  return (
    <MobileSidebarContext.Provider value={{ isOpen, setIsOpen, toggleIsOpen }}>
      {children}
    </MobileSidebarContext.Provider>
  );
}

export const useMobileSidebar = () => useContext(MobileSidebarContext);

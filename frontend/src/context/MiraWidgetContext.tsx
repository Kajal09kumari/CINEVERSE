'use client';

/**
 * MiraWidgetContext — Global state provider for MIRA floating chat widget.
 *
 * Controls whether the floating MIRA panel is open, closed, or minimized,
 * and allows any component (Navbar, MobileNav, MiraPreview, etc.) across any
 * page to open MIRA or pass starter queries directly into it.
 */

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';

interface MiraWidgetContextType {
  isOpen: boolean;
  isMinimized: boolean;
  queuedPrompt: string | null;
  openMira: (prompt?: string) => void;
  closeMira: () => void;
  toggleMira: () => void;
  minimizeMira: () => void;
  maximizeMira: () => void;
  clearQueuedPrompt: () => void;
}

const MiraWidgetContext = createContext<MiraWidgetContextType | undefined>(undefined);

export function MiraWidgetProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [isMinimized, setIsMinimized] = useState<boolean>(false);
  const [queuedPrompt, setQueuedPrompt] = useState<string | null>(null);

  const openMira = useCallback((prompt?: string) => {
    setIsOpen(true);
    setIsMinimized(false);
    if (prompt && prompt.trim()) {
      setQueuedPrompt(prompt.trim());
    }
  }, []);

  const closeMira = useCallback(() => {
    setIsOpen(false);
    setIsMinimized(false);
  }, []);

  const toggleMira = useCallback(() => {
    setIsOpen((prev) => {
      if (!prev) {
        setIsMinimized(false);
        return true;
      }
      return false;
    });
  }, []);

  const minimizeMira = useCallback(() => {
    setIsMinimized(true);
  }, []);

  const maximizeMira = useCallback(() => {
    setIsMinimized(false);
  }, []);

  const clearQueuedPrompt = useCallback(() => {
    setQueuedPrompt(null);
  }, []);

  // Listen for global custom events and URL parameter trigger (?mira=open or ?q=...)
  useEffect(() => {
    const handleOpenEvent = (e: Event) => {
      const customEvent = e as CustomEvent<{ prompt?: string }>;
      openMira(customEvent.detail?.prompt);
    };
    window.addEventListener('cineverse:open-mira', handleOpenEvent);

    let timer: NodeJS.Timeout | undefined;
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get('mira') === 'open' || urlParams.has('mira')) {
        const q = urlParams.get('q');
        timer = setTimeout(() => {
          openMira(q || undefined);
        }, 0);
      }
    }

    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener('cineverse:open-mira', handleOpenEvent);
    };
  }, [openMira]);

  return (
    <MiraWidgetContext.Provider
      value={{
        isOpen,
        isMinimized,
        queuedPrompt,
        openMira,
        closeMira,
        toggleMira,
        minimizeMira,
        maximizeMira,
        clearQueuedPrompt,
      }}
    >
      {children}
    </MiraWidgetContext.Provider>
  );
}

export function useMiraWidget() {
  const context = useContext(MiraWidgetContext);
  if (!context) {
    throw new Error('useMiraWidget must be used within a MiraWidgetProvider');
  }
  return context;
}

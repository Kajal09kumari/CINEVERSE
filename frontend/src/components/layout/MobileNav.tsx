'use client';

/**
 * MobileNav — slide-in drawer for mobile navigation.
 */

import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Home,
  Compass,
  Library,
  Bookmark,
  Sparkles,
  User,
  X,
} from 'lucide-react';
import { useMiraWidget } from '@/context/MiraWidgetContext';

interface NavLink {
  label: string;
  href: string;
}

interface MobileNavProps {
  isOpen: boolean;
  links: readonly NavLink[];
  onClose: () => void;
}

const ICON_MAP: Record<string, React.ComponentType<{ size?: number; strokeWidth?: number }>> = {
  Home:           Home,
  Discover:       Compass,
  Collections:    Library,
  'My Watchlist': Bookmark,
};

export function MobileNav({ isOpen, links, onClose }: MobileNavProps) {
  const pathname = usePathname();
  const { openMira } = useMiraWidget();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-black/65 md:hidden"
            onClick={onClose}
            aria-hidden="true"
          />

          <motion.div
            key="drawer"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 320, damping: 32 }}
            className="fixed top-0 right-0 bottom-0 z-50 w-72 md:hidden flex flex-col bg-[#17161D] border-l border-white/[0.08]"
            aria-label="Mobile navigation menu"
            role="dialog"
            aria-modal="true"
          >
            <div className="flex items-center justify-between px-5 h-16 border-b border-white/[0.08]">
              <span className="text-sm font-medium text-[#AAA5B3]">Menu</span>
              <button
                type="button"
                onClick={onClose}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-[#AAA5B3] hover:text-[#F5F2F7]"
                aria-label="Close navigation menu"
              >
                <X size={18} />
              </button>
            </div>

            <nav className="flex-1 overflow-y-auto py-4 px-3">
              <ul className="space-y-1" role="list">
                {links.map((link) => {
                  const Icon = ICON_MAP[link.label];
                  const isActive = pathname === link.href;
                  return (
                    <li key={link.href}>
                      <Link
                        href={link.href}
                        onClick={onClose}
                        className={`
                          flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors
                          ${
                            isActive
                              ? 'bg-[#8060A8]/20 text-[#F5F2F7] border border-[#8060A8]/30'
                              : 'text-[#AAA5B3] hover:text-[#F5F2F7] hover:bg-white/5'
                          }
                        `}
                        aria-current={isActive ? 'page' : undefined}
                      >
                        {Icon && <Icon size={18} strokeWidth={1.8} />}
                        {link.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>

              <div className="my-4 border-t border-white/[0.08]" />

              <ul className="space-y-1" role="list">
                <li>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      openMira();
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-[#A68BC7] hover:text-[#F5F2F7] transition-colors bg-[#8060A8]/15 hover:bg-[#8060A8]/25 text-left"
                  >
                    <Sparkles size={18} strokeWidth={2} />
                    Talk to MIRA
                  </button>
                </li>
                <li>
                  <Link
                    href="/profile"
                    onClick={onClose}
                    className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-[#AAA5B3] hover:text-[#F5F2F7] hover:bg-white/5 transition-colors"
                  >
                    <User size={18} strokeWidth={1.8} />
                    Profile
                  </Link>
                </li>
              </ul>
            </nav>

            <div className="px-5 py-4 text-xs text-[#77727F] border-t border-white/[0.08]">
              CINEVERSE · Discover Beyond the Ordinary
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

'use client';

/**
 * Button — CINEVERSE reusable button component.
 *
 * Four variants to cover every use case in the design system:
 *   primary   — violet-filled, main CTAs
 *   secondary — outlined, secondary CTAs
 *   ghost     — no background, navigation/subtle actions
 *   amber     — amber-filled, special highlights (watchlist, ratings)
 *
 * Size options: sm | md | lg
 *
 * Usage:
 *   <Button variant="primary" size="lg" onClick={...}>Watch Now</Button>
 *   <Button variant="amber" href="/watchlist">Add to Watchlist</Button>
 */

import { motion } from 'framer-motion';
import Link from 'next/link';
import type { ReactNode } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'amber';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps {
  children: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  type?: 'button' | 'submit' | 'reset';
  'aria-label'?: string;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    'bg-[#8060A8] hover:bg-[#9070B8] text-white border border-transparent',
  secondary:
    'bg-transparent border border-white/20 text-[#F5F2F7] hover:border-white/40 hover:bg-white/5',
  ghost:
    'bg-transparent border border-transparent text-[#AAA5B3] hover:text-[#F5F2F7] hover:bg-white/5',
  amber:
    'bg-[#D9A45D] hover:bg-[#E0B070] text-[#101014] border border-transparent font-semibold',
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: 'px-4 py-2 text-sm rounded-lg gap-1.5',
  md: 'px-5 py-2.5 text-sm rounded-xl gap-2',
  lg: 'px-7 py-3.5 text-base rounded-xl gap-2.5',
};

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  href,
  onClick,
  disabled = false,
  className = '',
  type = 'button',
  'aria-label': ariaLabel,
}: ButtonProps) {
  const baseClasses = `
    inline-flex items-center justify-center font-medium
    transition-all duration-200
    focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8060A8]
    disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none
    ${variantStyles[variant]}
    ${sizeStyles[size]}
    ${className}
  `.trim();

  const motionProps = {
    whileHover: disabled ? {} : { scale: 1.02 },
    whileTap:   disabled ? {} : { scale: 0.97 },
    transition: { duration: 0.15 },
  };

  if (href && !disabled) {
    return (
      <motion.div {...motionProps} style={{ display: 'inline-flex' }}>
        <Link href={href} className={baseClasses} aria-label={ariaLabel}>
          {children}
        </Link>
      </motion.div>
    );
  }

  return (
    <motion.button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={baseClasses}
      aria-label={ariaLabel}
      {...motionProps}
    >
      {children}
    </motion.button>
  );
}

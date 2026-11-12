'use client';

/**
 * SectionHeading — editorial-style section title component.
 *
 * Provides consistent visual hierarchy for every content section.
 * The overline (small label above the heading) follows editorial
 * conventions from magazines and film publications.
 */

import { motion } from 'framer-motion';

interface SectionHeadingProps {
  id?: string;
  overline?: string;
  title: string;
  subtitle?: string;
  align?: 'left' | 'center';
  /** Use Playfair Display serif for the title */
  serif?: boolean;
  className?: string;
}

export function SectionHeading({
  id,
  overline,
  title,
  subtitle,
  align = 'left',
  serif = false,
  className = '',
}: SectionHeadingProps) {
  const alignClasses =
    align === 'center' ? 'text-center items-center' : 'text-left items-start';

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.45, ease: [0.25, 0.46, 0.45, 0.94] as const }}
      className={`flex flex-col gap-2 ${alignClasses} ${className}`}
    >
      {overline && (
        <span className="text-xs font-medium tracking-[0.2em] uppercase text-[#A68BC7]">
          {overline}
        </span>
      )}
      <h2
        id={id}
        className={`text-2xl sm:text-3xl font-semibold text-[#F5F2F7] leading-tight ${
          serif ? 'font-display' : ''
        }`}
        style={serif ? { fontFamily: 'var(--font-playfair)' } : undefined}
      >
        {title}
      </h2>
      {subtitle && (
        <p className="text-sm sm:text-base text-[#AAA5B3] max-w-xl leading-relaxed">
          {subtitle}
        </p>
      )}
    </motion.div>
  );
}

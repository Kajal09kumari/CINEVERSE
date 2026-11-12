/**
 * Container — CINEVERSE standard horizontal alignment wrapper.
 *
 * Keeps page backgrounds full-bleed while constraining inner content
 * to a centered 1440px max-width with responsive horizontal padding:
 *   - Mobile  (<768px):  20px
 *   - Tablet  (>=768px): 32px
 *   - Laptop  (>=1024px): 48px
 *   - Desktop (>=1280px): 64px
 */

import type { ReactNode } from 'react';

interface ContainerProps {
  children: ReactNode;
  className?: string;
  as?: 'div' | 'section' | 'header' | 'footer' | 'main';
}

export function Container({
  children,
  className = '',
  as: Component = 'div',
}: ContainerProps) {
  return (
    <Component className={`cineverse-container ${className}`.trim()}>
      {children}
    </Component>
  );
}

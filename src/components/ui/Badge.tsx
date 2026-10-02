import React from 'react';

export type BadgeTone = 'brand' | 'danger' | 'success' | 'warning' | 'neutral';

const TONE: Record<BadgeTone, string> = {
  brand: 'bg-brand-50 text-brand-700',
  danger: 'bg-danger-soft text-danger',
  success: 'bg-success-soft text-success',
  warning: 'bg-warn-soft text-warn',
  neutral: 'bg-[var(--surface-sunken)] text-muted',
};

interface BadgeProps {
  tone?: BadgeTone;
  className?: string;
  /** Rendered before the label, e.g. a small status dot. */
  icon?: React.ReactNode;
  children: React.ReactNode;
}

export function Badge({ tone = 'brand', className = '', icon, children }: BadgeProps) {
  return (
    <span
      className={
        'inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-extrabold uppercase ' +
        'leading-none tracking-[0.04em] whitespace-nowrap ' +
        TONE[tone] +
        ' ' +
        className
      }
    >
      {icon}
      {children}
    </span>
  );
}

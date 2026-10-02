import React from 'react';

interface GlassCardProps {
  className?: string;
  style?: React.CSSProperties;
  /** Adds press feedback — use for cards that navigate or trigger something. */
  interactive?: boolean;
  /** Removes the default inner padding when the card supplies its own. */
  flush?: boolean;
  children?: React.ReactNode;
  id?: string;
}

/**
 * The standard surface: white, 22px radius, 16px padding, soft shadow and a
 * 1px hairline border. Group cards with spacing rather than heavy borders.
 */
export function GlassCard({ className = '', style, interactive = false, flush = false, id, children }: GlassCardProps) {
  return (
    <div
      id={id}
      style={style}
      className={
        'bg-[var(--surface)] rounded-card border border-[rgba(15,31,58,.04)] shadow-soft ' +
        'dark:border-white/[.07] ' +
        (flush ? '' : 'p-4 ') +
        (interactive ? 'press cursor-pointer' : '') +
        ' ' +
        className
      }
    >
      {children}
    </div>
  );
}

type GlassCardButtonProps = {
  className?: string;
  children?: React.ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>;

/** A card that behaves like a button (min 44px target, press scale .97). */
export function GlassCardButton({ className = '', children, ...rest }: GlassCardButtonProps) {
  return (
    <button
      type="button"
      className={
        'w-full text-left bg-[var(--surface)] rounded-card p-4 shadow-soft ' +
        'border border-[rgba(15,31,58,.04)] dark:border-white/[.07] ' +
        'press transition-[box-shadow,border-color] duration-[160ms] ' +
        'hover:border-brand-200 ' +
        className
      }
      {...rest}
    >
      {children}
    </button>
  );
}

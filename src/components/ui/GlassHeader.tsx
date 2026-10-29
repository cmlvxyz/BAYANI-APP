import React from 'react';

interface IconButtonProps {
  label: string;
  onClick?: () => void;
  className?: string;
  /** Renders a small dot (e.g. unread count). */
  dot?: boolean;
  /** Renders a count badge (e.g. number of unread notifications). */
  badge?: number;
  children: React.ReactNode;
  expanded?: boolean;
  controls?: string;
}

export function IconButton({ label, onClick, className = '', dot, badge, children, expanded, controls }: IconButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-expanded={expanded}
      aria-controls={controls}
      className={
        'relative h-10 w-10 shrink-0 grid place-items-center rounded-ctl text-muted ' +
        'press transition-colors duration-[160ms] hover:text-ink hover:bg-[rgba(11,27,51,.05)] ' +
        // keeps a 44px+ touch target even though the visual box is 40px
        'after:absolute after:-inset-1 after:content-[""] ' +
        className
      }
    >
      {children}
      {dot && (
        <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-danger ring-2 ring-[var(--glass-bg)]" />
      )}
      {typeof badge === 'number' && badge > 0 && (
        <span className="absolute right-0.5 top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-danger px-1 text-[9px] font-extrabold leading-none text-white ring-2 ring-[var(--glass-bg)]">
          {badge > 9 ? '9+' : badge}
        </span>
      )}
    </button>
  );
}

interface GlassHeaderProps {
  title: string;
  subtitle?: string;
  leading?: React.ReactNode;
  actions?: React.ReactNode;
  /** Rendered in a glass dropdown anchored to the header's right edge. */
  menu?: React.ReactNode;
  menuId?: string;
  id?: string;
  className?: string;
}

/**
 * Floating glass pill header. Always 48px tall, 24px radius, and deliberately
 * narrower than the app column (compact centered pill, not a full-width bar).
 * Never a heavy bar.
 */
export function GlassHeader({
  title,
  subtitle,
  leading,
  actions,
  menu,
  menuId,
  id,
  className = '',
}: GlassHeaderProps) {
  return (
    <div
      className={
        'fixed inset-x-0 top-0 z-40 px-6 pt-[max(12px,env(safe-area-inset-top))] pointer-events-none ' +
        className
      }
    >
      <header
        id={id}
        className="glass pointer-events-auto relative mx-auto flex h-12 max-w-[21rem] items-center gap-2 rounded-[24px] px-2.5"
      >
        {leading}
        <div className="min-w-0 flex-1 pl-1">
          <h1 className="truncate text-[15px] font-extrabold leading-tight tracking-[-0.01em] text-ink">
            {title}
          </h1>
          {subtitle && (
            <p className="truncate text-[10px] font-semibold leading-tight text-muted">{subtitle}</p>
          )}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-0.5">{actions}</div>}
        {menu && <div id={menuId}>{menu}</div>}
      </header>
    </div>
  );
}

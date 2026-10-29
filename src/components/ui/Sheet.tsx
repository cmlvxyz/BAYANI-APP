import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface SheetProps {
  isOpen: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Rendered next to the close button in the header. */
  headerAction?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** Panel max width. Bottom sheets on mobile, centred panel from `sm` up. */
  size?: 'sm' | 'md' | 'lg';
  id?: string;
  /** Disable backdrop click-to-close (e.g. destructive confirmations). */
  persistent?: boolean;
}

const SIZE: Record<NonNullable<SheetProps['size']>, string> = {
  sm: 'sm:max-w-sm',
  md: 'sm:max-w-md',
  lg: 'sm:max-w-lg',
};

/**
 * Glass modal. Bottom sheet on mobile, centred panel on `sm` and up. Blurred
 * dimmed backdrop, 28px panel radius, enters with fade + translateY(24px)
 * scale(.98) over 340ms.
 */
export function Sheet({
  isOpen,
  onClose,
  title,
  subtitle,
  headerAction,
  children,
  footer,
  size = 'md',
  id,
  persistent = false,
}: SheetProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Escape to close + simple focus trap + scroll lock while open.
  useEffect(() => {
    if (!isOpen) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;

      const focusables = panelRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusables || focusables.length === 0) return;

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKey);
    const focusTimer = window.setTimeout(() => panelRef.current?.focus(), 20);

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      window.clearTimeout(focusTimer);
      previouslyFocused?.focus?.();
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Portal to <body> so the fixed overlay always spans the viewport, even when a
  // sheet is opened from inside a screen that has a lingering transform
  // (e.g. `.animate-screen-in`), which would otherwise become its containing block.
  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-4"
      role="presentation"
    >
      {/* Blurred dimmed backdrop */}
      <div
        onClick={persistent ? undefined : onClose}
        className="animate-fade-in absolute inset-0 bg-[rgba(9,20,38,.45)] backdrop-blur-sm"
      />

      <div
        ref={panelRef}
        id={id}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        className={
          'animate-sheet-in glass relative flex w-full flex-col outline-none ' +
          'max-h-[90dvh] rounded-t-panel sm:rounded-panel ' +
          SIZE[size] +
          ' sm:mx-auto'
        }
      >
        {/* Grab handle — mobile bottom sheet affordance */}
        <div className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-[rgba(11,27,51,.14)] sm:hidden" />

        {(title || subtitle) && (
          <div className="flex items-start justify-between gap-3 px-5 pb-3 pt-4">
            <div className="min-w-0">
              {title && (
                <h2 className="t-heading text-ink">{title}</h2>
              )}
              {subtitle && (
                <p className="t-body mt-1 text-muted">{subtitle}</p>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {headerAction}
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="press grid h-10 w-10 place-items-center rounded-ctl text-muted transition-colors duration-[160ms] hover:bg-[rgba(11,27,51,.05)] hover:text-ink after:absolute after:-inset-1 after:content-['']"
              >
                <X size={20} />
              </button>
            </div>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">{children}</div>

        {footer && (
          <div className="shrink-0 border-t border-[rgba(11,27,51,.06)] px-5 py-4 dark:border-white/[.08]">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

import React from 'react';
import type { LucideIcon } from 'lucide-react';

export interface NavTab<T extends string = string> {
  key: T;
  label: string;
  icon: LucideIcon;
}

interface BottomNavigationProps<T extends string> {
  items: NavTab<T>[];
  active: T;
  onChange: (key: T) => void;
  /** Keys that should show the emergency alert dot. */
  alertOn?: T[];
  id?: string;
}

const ICON_SIZE = 22;

/**
 * Floating glass dock. 12px inset from the sides, 32px radius, sits above the
 * safe-area inset. Four equal tabs, each 56px tall with a 22px icon above a
 * 10px label.
 */
export function BottomNavigation<T extends string>({
  items,
  active,
  onChange,
  alertOn = [],
  id,
}: BottomNavigationProps<T>) {
  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(14px,env(safe-area-inset-bottom))]"
    >
      <nav
        id={id}
        aria-label="Bottom Navigation"
        className="glass pointer-events-auto mx-auto max-w-[var(--app-max)] rounded-dock p-1"
      >
        <ul className="grid grid-cols-4">
          {items.map((item) => {
            const Icon = item.icon;
            const isActive = active === item.key;
            const showDot = alertOn.includes(item.key);
            return (
              <li key={item.key} className="min-w-0">
                <button
                  type="button"
                  onClick={() => onChange(item.key)}
                  aria-current={isActive ? 'page' : undefined}
                  aria-label={item.label}
                  className="press flex h-14 w-full flex-col items-center justify-center gap-1 rounded-dock px-0.5 transition-colors duration-[160ms]"
                >
                  <span
                    className={
                      'flex h-8 w-full max-w-[3.25rem] items-center justify-center rounded-full transition-colors duration-[160ms] ' +
                      (isActive ? 'bg-brand-50' : '')
                    }
                  >
                    <span className="relative inline-flex">
                      <Icon
                        className={
                          'transition-colors duration-[160ms] ' +
                          (isActive ? 'text-brand-600' : 'text-muted')
                        }
                        strokeWidth={1.9}
                        size={ICON_SIZE}
                      />
                      {showDot && (
                        <span className="absolute -right-1.5 -top-1 h-2 w-2 rounded-full bg-danger ring-2 ring-[var(--glass-bg)]" />
                      )}
                    </span>
                  </span>
                  <span
                    className={
                      'truncate text-[10px] leading-none ' +
                      (isActive ? 'font-extrabold text-brand-600' : 'font-semibold text-muted')
                    }
                  >
                    {item.label}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}

import React from 'react';

export interface SegmentOption<T extends string> {
  key: T;
  label: string;
  /** Optional trailing count, e.g. "All (3)". */
  badge?: string | number;
}

interface SegmentedControlProps<T extends string> {
  options: SegmentOption<T>[];
  value: T;
  onChange: (key: T) => void;
  /** Accessible name for the group. */
  label: string;
  id?: string;
}

/** Glass segmented filter used by Contacts and Alerts. */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
  id,
}: SegmentedControlProps<T>) {
  return (
    <div
      id={id}
      role="tablist"
      aria-label={label}
      className="glass flex gap-1 rounded-panel p-1"
    >
      {options.map((opt) => {
        const active = opt.key === value;
        return (
          <button
            key={opt.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.key)}
            className={
              'press min-h-[38px] flex-1 rounded-field px-2 text-[12px] leading-tight font-bold ' +
              'transition-colors duration-[160ms] ' +
              (active
                ? 'bg-[var(--surface)] text-brand-700 shadow-[0_1px_2px_rgba(15,31,58,.06)]'
                : 'text-muted hover:text-ink')
            }
          >
            <span className="truncate">
              {opt.label}
              {opt.badge !== undefined && (
                <span className={active ? 'text-brand-500' : 'text-muted'}> {opt.badge}</span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}

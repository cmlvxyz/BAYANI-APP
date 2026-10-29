import React from 'react';
import { Check, Loader2 } from 'lucide-react';
import type { IncidentTimelineStep } from '../../types';

interface TimelineProps {
  steps: IncidentTimelineStep[];
  /** Rendered above the list, e.g. "Status". */
  label?: string;
  className?: string;
}

/**
 * Response timeline. Renders ONLY the steps the backend actually sent — a step
 * that has not happened yet stays visually pending rather than pretending to be
 * done. Completed nodes are solid, the one in progress is spinning, the rest are
 * hollow, and a connector line threads them together.
 */
export function Timeline({ steps, label, className = '' }: TimelineProps) {
  if (steps.length === 0) return null;

  const lastIndex = steps.reduce(
    (acc, step, i) => (step.status === 'completed' ? i : acc),
    -1,
  );

  return (
    <div className={className}>
      {label && <p className="t-caption text-muted">{label}</p>}

      <ol className={label ? 'mt-3' : ''}>
        {steps.map((step, i) => {
          const done = step.status === 'completed';
          const active = step.status === 'in_progress';
          const isLast = i === steps.length - 1;
          const isCurrent = i === lastIndex + 1;

          return (
            <li key={step.id || i} className="relative flex items-start gap-3 pb-4 last:pb-0">
              {/* Connector — drawn from this node down to the next one */}
              {!isLast && (
                <span
                  aria-hidden="true"
                  className={
                    'absolute left-[9px] top-5 h-[calc(100%-10px)] w-[2px] rounded-full ' +
                    (done ? 'bg-success/45' : 'bg-[rgba(11,27,51,.10)] dark:bg-white/[.10]')
                  }
                />
              )}

              <span
                className={
                  'relative z-10 mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full ring-4 ring-[var(--surface)] ' +
                  (done
                    ? 'bg-success text-white'
                    : active
                      ? 'bg-brand-600 text-white'
                      : 'border border-[rgba(11,27,51,.16)] bg-[var(--surface-sunken)] text-muted dark:border-white/[.16]')
                }
              >
                {done ? (
                  <Check size={12} strokeWidth={3.2} />
                ) : active ? (
                  <Loader2 size={11} strokeWidth={3} className="animate-spin" />
                ) : (
                  <span className="h-1.5 w-1.5 rounded-full bg-current" />
                )}
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <p
                    className={
                      'text-[13px] font-extrabold ' +
                      (done || active ? 'text-ink' : 'text-muted')
                    }
                  >
                    {step.title}
                  </p>
                  {step.timestamp && (
                    <span className="shrink-0 font-mono text-[10px] text-muted">
                      {step.timestamp}
                    </span>
                  )}
                </div>
                {step.description && (
                  <p className="t-body-sm mt-0.5 text-muted">{step.description}</p>
                )}
                {isCurrent && !done && !active && (
                  <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.06em] text-muted">
                    Waiting
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

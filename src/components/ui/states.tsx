import React from 'react';
import { Button } from './Button';

interface IconTileProps {
  children: React.ReactNode;
  tone?: 'brand' | 'danger' | 'success' | 'warning' | 'neutral';
  className?: string;
}

const TILE_TONE: Record<NonNullable<IconTileProps['tone']>, string> = {
  brand: 'bg-brand-50 text-brand-600',
  danger: 'bg-danger-soft text-danger',
  success: 'bg-success-soft text-success',
  warning: 'bg-warn-soft text-warn',
  neutral: 'bg-[var(--surface-sunken)] text-muted',
};

/** Rounded icon tile that anchors every empty / loading / error state. */
export function IconTile({ children, tone = 'brand', className = '' }: IconTileProps) {
  return (
    <span
      className={
        'grid h-14 w-14 shrink-0 place-items-center rounded-card ' +
        TILE_TONE[tone] +
        ' ' +
        className
      }
    >
      {children}
    </span>
  );
}

interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  className = '',
}: EmptyStateProps) {
  return (
    <div
      className={
        'animate-rise-in flex flex-col items-center gap-3 rounded-card border border-dashed ' +
        'border-[rgba(11,27,51,.12)] bg-[var(--surface)]/60 px-5 py-8 text-center ' +
        'dark:border-white/[.12] ' +
        className
      }
    >
      <IconTile>{icon}</IconTile>
      <div>
        <p className="t-heading text-ink">{title}</p>
        <p className="t-body mt-1 text-muted">{description}</p>
      </div>
      {actionLabel && onAction && (
        <Button variant="secondary" size="sm" onClick={onAction} className="mt-1">
          {actionLabel}
        </Button>
      )}
    </div>
  );
}

interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  className?: string;
}

/** Inline error card with an optional Retry action. */
export function ErrorState({
  title = 'Something went wrong',
  message,
  onRetry,
  className = '',
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={
        'flex items-center gap-3 rounded-card border border-danger/25 bg-danger-soft px-4 py-3.5 ' +
        className
      }
    >
      <IconTile tone="danger" className="h-10 w-10 rounded-ctl">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M12 9v4" />
          <path d="M12 17h.01" />
          <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
        </svg>
      </IconTile>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-extrabold text-danger">{title}</p>
        <p className="t-body text-danger/85">{message}</p>
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry} className="shrink-0">
          Retry
        </Button>
      )}
    </div>
  );
}

/** Skeleton bar that matches the rhythm of real content. */
export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={'animate-skeleton block rounded-ctl bg-[rgba(11,27,51,.09)] dark:bg-white/[.1] ' + className}
    />
  );
}

/** Skeleton shaped like a real list card. */
export function SkeletonCard({ lines = 2, className = '' }: { lines?: number; className?: string }) {
  return (
    <div
      className={
        'space-y-3 rounded-card border border-[rgba(11,27,51,.04)] bg-[var(--surface)] p-4 ' +
        'dark:border-white/[.07] ' +
        className
      }
    >
      <div className="flex items-center gap-3">
        <Skeleton className="h-10 w-10 rounded-card" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3 w-1/2" />
          <Skeleton className="h-2.5 w-1/3" />
        </div>
      </div>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className="h-2.5 w-full" />
      ))}
    </div>
  );
}

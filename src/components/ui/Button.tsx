import React from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
export type ButtonSize = 'md' | 'sm';

type Variant = ButtonVariant;
type Size = ButtonSize;

type CommonProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  fullWidth?: boolean;
  icon?: React.ReactNode;
  iconRight?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
};

export type ButtonProps = CommonProps &
  Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'className' | 'children'> & {
    href?: undefined;
  };

export type LinkButtonProps = CommonProps &
  Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'className' | 'children'> & {
    href: string;
  };

const VARIANT: Record<Variant, string> = {
  primary:
    'bg-brand-600 text-white shadow-[0_6px_18px_-8px_rgba(11,27,51,.7)] hover:bg-brand-700',
  secondary: 'bg-brand-50 text-brand-700 border border-brand-100 hover:bg-brand-100',
  outline: 'bg-transparent text-brand-700 border-[1.5px] border-brand-600 hover:bg-brand-50',
  ghost: 'bg-transparent text-muted hover:bg-[var(--surface-sunken)] hover:text-ink',
  danger: 'bg-danger text-white shadow-[0_6px_18px_-8px_rgba(224,39,28,.7)] hover:brightness-95',
};

const SIZE: Record<Size, string> = {
  // 50px min touch target, 16px radius, 15px/700
  md: 'min-h-[50px] px-5 rounded-field t-button',
  sm: 'min-h-[44px] px-4 rounded-ctl text-[13px] font-bold',
};

function Spinner() {
  return (
    <svg className="h-4 w-4 shrink-0 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function shell({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  className = '',
}: CommonProps) {
  return [
    'press inline-flex items-center justify-center gap-2 select-none touch-manipulation',
    'transition-[background-color,border-color,color,opacity,transform] duration-[160ms]',
    'disabled:opacity-55 disabled:pointer-events-none',
    VARIANT[variant],
    SIZE[size],
    fullWidth ? 'w-full' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');
}

function content({ loading, icon, iconRight, children }: CommonProps) {
  return (
    <>
      {loading ? <Spinner /> : icon}
      {children != null && children !== false ? <span className="truncate">{children}</span> : null}
      {!loading && iconRight}
    </>
  );
}

export function Button(props: ButtonProps) {
  const { loading = false, icon, iconRight, children, className, href: _href, ...rest } = props;
  return (
    <button
      type={rest.type ?? 'button'}
      disabled={rest.disabled || loading}
      aria-busy={loading || undefined}
      className={shell({ ...props, className })}
      {...rest}
    >
      {content({ loading, icon, iconRight, children })}
    </button>
  );
}

export function LinkButton(props: LinkButtonProps) {
  const { loading = false, icon, iconRight, children, className, ...rest } = props;
  return (
    <a
      className={shell({ ...props, className })}
      aria-busy={loading || undefined}
      aria-disabled={rest['aria-disabled'] || loading || undefined}
      {...rest}
    >
      {content({ loading, icon, iconRight, children })}
    </a>
  );
}

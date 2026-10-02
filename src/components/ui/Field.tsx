import React, { useId } from 'react';

interface FieldShellProps {
  label?: string;
  error?: string;
  hint?: string;
  className?: string;
  children: (props: {
    id: string;
    'aria-invalid': boolean | undefined;
    'aria-describedby': string | undefined;
    className: string;
  }) => React.ReactNode;
}

/**
 * Shared input chrome: 44px min height, 16px radius, 1.5px border, brand focus
 * ring and a danger border with an inline message on error.
 */
export function Field({ label, error, hint, className = '', children }: FieldShellProps) {
  const id = useId();
  const msgId = `${id}-msg`;

  return (
    <div className={className}>
      {label && (
        <label htmlFor={id} className="t-caption mb-1.5 block text-muted">
          {label}
        </label>
      )}
      {children({
        id,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': error || hint ? msgId : undefined,
        className:
          'w-full min-h-[44px] rounded-field border-[1.5px] bg-[var(--surface)] px-3.5 py-2.5 ' +
          'text-[13px] text-ink placeholder:text-[color-mix(in_srgb,var(--color-muted)_60%,transparent)] ' +
          'transition-[border-color,box-shadow] duration-[160ms] outline-none ' +
          (error
            ? 'border-danger focus:border-danger focus:shadow-[0_0_0_4px_var(--color-danger-soft)]'
            : 'border-[rgba(15,31,58,.14)] dark:border-white/[.14] focus:border-brand-600 focus:shadow-[0_0_0_4px_var(--color-brand-50)]'),
      })}
      {error ? (
        <p id={msgId} role="alert" className="mt-1.5 text-[11px] font-semibold text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={msgId} className="mt-1.5 text-[11px] text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

type TextFieldProps = {
  label?: string;
  error?: string;
  hint?: string;
  className?: string;
  inputClassName?: string;
  containerClassName?: string;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'className' | 'size'>;

export function TextField({
  label,
  error,
  hint,
  className = '',
  inputClassName = '',
  containerClassName,
  leading,
  trailing,
  ...rest
}: TextFieldProps) {
  return (
    <Field label={label} error={error} hint={hint} className={containerClassName ?? className}>
      {(field) => {
        const input = (
          <input
            {...rest}
            id={field.id}
            aria-invalid={field['aria-invalid']}
            aria-describedby={field['aria-describedby']}
            className={
              field.className +
              (leading ? ' pl-10' : '') +
              (trailing ? ' pr-11' : '') +
              ' ' +
              inputClassName
            }
          />
        );

        if (!leading && !trailing) return input;

        return (
          <div className="relative">
            {leading && (
              <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted">
                {leading}
              </span>
            )}
            {input}
            {trailing && (
              <span className="absolute right-1.5 top-1/2 -translate-y-1/2">{trailing}</span>
            )}
          </div>
        );
      }}
    </Field>
  );
}

type SelectFieldProps = {
  label?: string;
  error?: string;
  hint?: string;
  className?: string;
  children: React.ReactNode;
} & Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'className'>;

export function SelectField({ label, error, hint, className = '', children, ...rest }: SelectFieldProps) {
  return (
    <Field label={label} error={error} hint={hint} className={className}>
      {(field) => (
        <select
          {...rest}
          id={field.id}
          aria-invalid={field['aria-invalid']}
          aria-describedby={field['aria-describedby']}
          className={field.className + ' cursor-pointer appearance-none pr-9'}
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%235b6b85' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'right 12px center',
          }}
        >
          {children}
        </select>
      )}
    </Field>
  );
}

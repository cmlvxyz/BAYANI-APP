import React, { useEffect, useRef, useState } from 'react';
import { BrandLogo } from '../ui';

type Phase = 'idle' | 'logo' | 'wordmark' | 'ready';

interface Props {
  onSelect: (mode: 'register' | 'signup' | 'login') => void;
}

/** Re-exported for the auth screen so both share one brand logo source. */
export { BrandLogo as SplashLogo } from '../ui';

/** Intro timing: logo lands, wordmark settles, then the call to action appears. */
const STEP_MS: { phase: Phase; ms: number }[] = [
  { phase: 'logo', ms: 120 },
  { phase: 'wordmark', ms: 460 },
];

export default function SplashScreen({ onSelect }: Props) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [showGetStarted, setShowGetStarted] = useState(false);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    let cancelled = false;
    const timers: number[] = [];
    let acc = 80;
    for (const step of STEP_MS) {
      timers.push(
        window.setTimeout(() => {
          if (!cancelled) setPhase(step.phase);
        }, acc),
      );
      acc += step.ms;
    }
    // Reveal the call to action after the intro settles; the rings keep breathing.
    timers.push(
      window.setTimeout(() => {
        if (!cancelled) {
          setPhase('ready');
          setShowGetStarted(true);
        }
      }, acc),
    );
    return () => {
      cancelled = true;
      timers.forEach((t) => window.clearTimeout(t));
    };
  }, []);

  const handleSelect = (mode: 'register' | 'signup' | 'login') => {
    onSelectRef.current(mode);
  };

  return (
    <div className="app-bg relative fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden px-6">
      {/* Ambient brand blobs (static — no infinite animation outside the SOS halo) */}
      <span
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 h-[460px] w-[460px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-100/45 blur-[100px] dark:bg-brand-900/25"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 h-[280px] w-[280px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--surface)]/55 blur-[80px]"
      />

      <div className="relative flex flex-col items-center">
        {/* Logo plate */}
        <div
          className={
            'transition-all duration-[520ms] ease-out ' +
            (phase === 'idle' ? 'scale-90 opacity-0' : 'scale-100 opacity-100')
          }
        >
          <BrandLogo className="h-28 w-28 select-none drop-shadow-[0_14px_28px_rgba(15,31,58,.28)] sm:h-32 sm:w-32" />
        </div>

        {/* Wordmark */}
        <div
          className={
            'mt-7 text-center transition-all duration-[520ms] ease-out ' +
            (phase === 'logo' ? 'translate-y-2 opacity-0' : 'translate-y-0 opacity-100')
          }
        >
          <p className="text-[26px] font-extrabold uppercase leading-none tracking-[.34em] text-ink sm:text-[30px]">
            Bayani
          </p>
          <p className="t-body mt-3 max-w-[19rem] text-muted">
            Your silent shield. Always on.
          </p>
        </div>
      </div>

      {/* Get Started — opens the register form; Sign Up / Log In live inside the form. */}
      {showGetStarted && (
        <div className="absolute inset-x-0 bottom-12 flex justify-center px-6">
          <button
            type="button"
            onClick={() => handleSelect('register')}
            className="press w-full max-w-[20rem] rounded-field bg-brand-600 px-8 py-3.5 text-sm font-extrabold uppercase tracking-[.16em] text-white shadow-[0_14px_34px_-12px_rgba(30,58,138,.65)] transition-colors duration-[160ms] hover:bg-brand-700"
          >
            Get Started
          </button>
        </div>
      )}
    </div>
  );
}
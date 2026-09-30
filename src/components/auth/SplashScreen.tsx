import React, { useEffect, useRef, useState } from 'react';

type Phase = 'idle' | 'pull' | 'wiggle' | 'center' | 'wrap' | 'ready' | 'zoom';

interface Props {
  onSelect: (mode: 'register' | 'signup' | 'login') => void;
}

/** Reuses the same logo loading as the main header (RC PNG on port 4000, fallback /logo.svg). */
export function SplashLogo({ className }: { className?: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return <img src="/logo.svg" alt="Bayani" className={className} />;
  }
  return (
    <img
      src="http://localhost:4000/src/assets/images/logo%20(2).png"
      alt="Bayani"
      className={`${className} object-contain`}
      onError={() => setFailed(true)}
    />
  );
}

const STEP_MS: { phase: Phase; ms: number }[] = [
  { phase: 'pull', ms: 900 },
  { phase: 'wiggle', ms: 500 },
  { phase: 'center', ms: 900 },
  { phase: 'wrap', ms: 1100 },
];

export default function SplashScreen({ onSelect }: Props) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [showGetStarted, setShowGetStarted] = useState(false);
  const [zooming, setZooming] = useState(false);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    let cancelled = false;
    const timers: number[] = [];
    let acc = 250; // short hold at the top before the string pulls the logo down
    for (const step of STEP_MS) {
      timers.push(
        window.setTimeout(() => {
          if (!cancelled) setPhase(step.phase);
        }, acc)
      );
      acc += step.ms;
    }
    // After the rings wrap, pause and wait for the user to tap "Get Started"
    // (the rings keep spinning during this wait).
    timers.push(
      window.setTimeout(() => {
        if (!cancelled) {
          setPhase('ready');
          setShowGetStarted(true);
        }
      }, acc)
    );
    return () => {
      cancelled = true;
      timers.forEach((t) => window.clearTimeout(t));
    };
  }, []);

  const handleSelect = (mode: 'register' | 'signup' | 'login') => {
    if (zooming) return;
    setZooming(true);
    setShowGetStarted(false);
    setPhase('zoom');
    window.setTimeout(() => onSelectRef.current(mode), 500);
  };

  return (
    <div className="fixed inset-0 z-50 bg-gradient-to-b from-sky-400 to-blue-600 overflow-hidden">
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="relative flex flex-col items-center">
          <div className={`relative splash-logo-wrap phase-${phase}`}>
            <SplashLogo className="splash-logo w-28 h-28 sm:w-32 sm:h-32 drop-shadow-2xl" />
            {/* String hangs below the logo; the two dashed rings wrap around it at center */}
            <span className="splash-string" />
            <span className="splash-ring" />
            <span className="splash-ring splash-ring-2" />
          </div>
        </div>
      </div>

      {/* Get Started — slides up after the rings finish wrapping; opens the register form.
          Ang Sign Up / Log In ay nasa ibaba na mismo ng form ("or" section). */}
      {showGetStarted && !zooming && (
        <div className="splash-getstarted absolute bottom-12 left-1/2 flex w-[min(80%,20rem)] flex-col gap-3">
          <button
            type="button"
            onClick={() => handleSelect('register')}
            className="w-full px-8 py-3.5 rounded-full bg-white text-blue-700 text-sm font-extrabold uppercase tracking-widest shadow-2xl active:scale-95"
          >
            Get Started
          </button>
        </div>
      )}
    </div>
  );
}
import React, { useState, useRef, useEffect } from 'react';
import { Lock, User, LogIn, UserPlus, Eye, EyeOff, Mail, Calendar, AlertCircle, Loader2 } from 'lucide-react';
import { computeAge, loadCitizenProfile } from '../../services/profileService';
import { KnownAccount } from '../../services/authClient';
import { BrandLogo, Button, GlassCard, TextField, SelectField } from '../ui';

export type AuthMode = 'register' | 'signup' | 'login';

export interface CitizenProfileData {
  email: string;
  fullName: string;
  gender: string;
  dateOfBirth: string;
}

interface Props {
  onSaveProfile: (data: CitizenProfileData) => void;
  onLogin: (username: string, password: string) => Promise<void>;
  onCreateAccount: (username: string, password: string) => Promise<void>;
  initialMode?: AuthMode;
  /** Mga account na na-login na sa device na ito — quick login chips. */
  knownAccounts?: KnownAccount[];
}

const MODE_LABEL: Record<AuthMode, string> = {
  register: 'REGISTER',
  signup: 'SIGN UP',
  login: 'LOG IN',
};

// Ang dalawang secondary (cross) na button na lalabas sa bawat form.
const CROSS: Record<AuthMode, AuthMode[]> = {
  register: ['signup', 'login'],
  signup: ['register', 'login'],
  login: ['register', 'signup'],
};

export default function CitizenAuthScreen({ onSaveProfile, onLogin, onCreateAccount, initialMode = 'register', knownAccounts = [] }: Props) {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Napiling saved account (quick login — password lang, walang create).
  const [quickUser, setQuickUser] = useState<string | null>(null);

  // Register form
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [gender, setGender] = useState('');
  const [birthday, setBirthday] = useState('');
  const [emailPassword, setEmailPassword] = useState('');

  // Sign Up form
  const [suEmail, setSuEmail] = useState('');
  const [suPassword, setSuPassword] = useState('');

  // Log In form
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');

  // Ang na-register na email + password (para i-verify sa Sign Up form).
  const registeredRef = useRef<{ email: string; password: string } | null>(null);

  const age = computeAge(birthday);
  const today = new Date().toISOString().split('T')[0];

  const [entering, setEntering] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setEntering(false), 520);
    return () => clearTimeout(t);
  }, []);

  const changeMode = (next: AuthMode) => {
    setError(null);
    setShowPw(false);
    if (next !== 'login') setQuickUser(null);
    setMode(next);
  };

  const goCross = (next: AuthMode) => {
    if (busy) return;
    if (mode === 'register' && next === 'signup') {
      setSuEmail(email.trim());
    }
    if (mode === 'signup' && next === 'login') {
      setUsername('');
    }
    changeMode(next);
  };

  // Username: lowercase letters lang, max 6.
  const onUsernameChange = (v: string) => {
    setQuickUser(null);
    setUsername(v.toLowerCase().replace(/[^a-z]/g, '').slice(0, 6));
  };

  const selectSavedAccount = (username: string) => {
    if (busy) return;
    setError(null);
    setQuickUser(username);
    setUsername(username);
    setPassword('');
    setConfirm('');
    if (mode !== 'login') changeMode('login');
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError(null);

    if (mode === 'register') {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
        setError('Enter a valid email address');
        return;
      }
      if (!fullName.trim()) {
        setError('Full name is required');
        return;
      }
      if (!gender) {
        setError('Select your gender');
        return;
      }
      if (!birthday) {
        setError('Birthday is required');
        return;
      }
      if (!emailPassword.trim()) {
        setError('Email account password is required');
        return;
      }
      onSaveProfile({ email: email.trim(), fullName: fullName.trim(), gender, dateOfBirth: birthday });
      registeredRef.current = { email: email.trim().toLowerCase(), password: emailPassword };
      setSuEmail(email.trim());
      changeMode('signup');
      return;
    }

    if (mode === 'signup') {
      const reg = registeredRef.current;
      if (!reg) {
        setError('Please register first');
        return;
      }
      if (suEmail.trim().toLowerCase() !== reg.email || suPassword !== reg.password) {
        setError('Email or password does not match your registration');
        return;
      }
      changeMode('login');
      return;
    }

    // Log In form — gumagawa ng app account (username + password) at pumapasok.
    // Kapag may napiling saved account -> quick login (password lang, direct login).
    if (quickUser) {
      if (!password.trim()) {
        setError('Password is required');
        return;
      }
      setBusy(true);
      try {
        await onLogin(quickUser, password);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Login failed');
      } finally {
        setBusy(false);
      }
      return;
    }
    if (!/^[a-z]{1,6}$/.test(username)) {
      setError('Username must be lowercase letters (max 6)');
      return;
    }
    if (!password.trim()) {
      setError('Password is required');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }
    setBusy(true);
    try {
      await onCreateAccount(username, password);
      await onLogin(username, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setBusy(false);
    }
  };

  const pwToggle = (
    <button
      type="button"
      onClick={() => setShowPw((v) => !v)}
      aria-label={showPw ? 'Hide password' : 'Show password'}
      className="press grid h-8 w-8 place-items-center rounded-ctl text-muted transition-colors duration-[160ms] hover:bg-[var(--surface-sunken)] hover:text-ink"
    >
      {showPw ? <EyeOff size={16} strokeWidth={1.9} /> : <Eye size={16} strokeWidth={1.9} />}
    </button>
  );

  const mainLabel =
    mode === 'register' ? (busy ? 'CREATING…' : 'CREATE ACCOUNT')
    : mode === 'signup' ? (busy ? 'SIGNING IN…' : 'SIGN IN')
    : (busy ? 'LOGGING IN…' : 'LOG IN');

  return (
    <div className="app-bg min-h-screen px-5 pb-10 pt-8 sm:px-6 sm:pt-12">
      <div className="mx-auto w-full max-w-[26rem]">
        {/* Brand header */}
        <header
          className={
            'flex flex-col items-center text-center transition-all duration-[520ms] ease-out ' +
            (entering ? 'translate-y-3 opacity-0' : 'translate-y-0 opacity-100')
          }
        >
          <BrandLogo className="h-20 w-20 select-none drop-shadow-[0_12px_24px_rgba(11,27,51,.26)]" />
          <h1 className="mt-5 text-[24px] font-extrabold uppercase leading-none tracking-[.32em] text-ink">
            SINAG
          </h1>
          <p className="t-body mt-2.5 text-muted">Safety in every step</p>
        </header>

        {/* Form card */}
        <div
          className={
            'mt-7 transition-all duration-[520ms] ease-out ' +
            (entering ? 'translate-y-4 opacity-0' : 'translate-y-0 opacity-100')
          }
        >
          <GlassCard className="space-y-4">
            {knownAccounts.length > 0 && (
              <div>
                <span className="t-caption mb-2 block text-muted">Saved accounts</span>
                <div className="flex flex-wrap gap-2">
                  {knownAccounts.map((a) => {
                    const selected = quickUser === a.username;
                    const avatar = loadCitizenProfile(a.username).avatar;
                    return (
                      <button
                        key={a.username}
                        type="button"
                        onClick={() => selectSavedAccount(a.username)}
                        disabled={busy}
                        className={
                          'press flex items-center gap-1.5 rounded-full border py-1.5 pl-1.5 pr-3 text-[12px] font-bold transition-colors duration-[160ms] disabled:opacity-60 ' +
                          (selected
                            ? 'border-brand-600 bg-brand-50 text-brand-700'
                            : 'border-[rgba(11,27,51,.10)] bg-[var(--surface)] text-muted hover:border-brand-200 dark:border-white/[.12]')
                        }
                      >
                        <span
                          style={avatar ? { backgroundImage: `url("${avatar}")` } : undefined}
                          className="grid h-5 w-5 shrink-0 place-items-center overflow-hidden rounded-full bg-brand-600 bg-cover bg-center text-[10px] font-extrabold uppercase text-white"
                        >
                          {avatar ? null : a.username.charAt(0)}
                        </span>
                        {a.username}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <form onSubmit={submit} className="space-y-4">
              {mode === 'register' && (
                <>
                  <TextField
                    label="Email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="yourname@email.com"
                    autoComplete="email"
                    leading={<Mail size={16} strokeWidth={1.9} />}
                  />

                  <TextField
                    label="Full name"
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Juan Dela Cruz"
                    autoComplete="name"
                    leading={<User size={16} strokeWidth={1.9} />}
                  />

                  <SelectField
                    label="Gender"
                    value={gender}
                    onChange={(e) => setGender(e.target.value)}
                  >
                    <option value="">Select</option>
                    <option value="Female">Female</option>
                    <option value="Male">Male</option>
                    <option value="Prefer not to say">Prefer not to say</option>
                  </SelectField>

                  <div className="grid grid-cols-2 gap-3">
                    <TextField
                      label="Birthday"
                      type="date"
                      value={birthday}
                      max={today}
                      onChange={(e) => setBirthday(e.target.value)}
                      leading={<Calendar size={16} strokeWidth={1.9} />}
                    />
                    <TextField label="Age" type="text" value={age ?? '—'} readOnly disabled />
                  </div>

                  <TextField
                    label="Password (email account)"
                    type={showPw ? 'text' : 'password'}
                    value={emailPassword}
                    onChange={(e) => setEmailPassword(e.target.value)}
                    placeholder="Email account password"
                    autoComplete="new-password"
                    leading={<Lock size={16} strokeWidth={1.9} />}
                    trailing={pwToggle}
                  />
                </>
              )}

              {mode === 'signup' && (
                <>
                  <TextField
                    label="Email (registered)"
                    type="email"
                    value={suEmail}
                    onChange={(e) => setSuEmail(e.target.value)}
                    placeholder="yourname@email.com"
                    autoComplete="email"
                    leading={<Mail size={16} strokeWidth={1.9} />}
                  />

                  <TextField
                    label="Password (registered)"
                    type={showPw ? 'text' : 'password'}
                    value={suPassword}
                    onChange={(e) => setSuPassword(e.target.value)}
                    placeholder="Registered password"
                    autoComplete="current-password"
                    leading={<Lock size={16} strokeWidth={1.9} />}
                    trailing={pwToggle}
                  />
                </>
              )}

              {mode === 'login' && (
                <>
                  <TextField
                    label="Username"
                    type="text"
                    value={username}
                    onChange={(e) => onUsernameChange(e.target.value)}
                    placeholder="username"
                    autoComplete="username"
                    maxLength={6}
                    hint="Lowercase letters only, max 6 characters"
                    leading={<User size={16} strokeWidth={1.9} />}
                  />

                  <TextField
                    label={quickUser ? 'Password' : 'Create password'}
                    type={showPw ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={quickUser ? 'Enter your password' : 'Create password'}
                    autoComplete={quickUser ? 'current-password' : 'new-password'}
                    leading={<Lock size={16} strokeWidth={1.9} />}
                    trailing={pwToggle}
                  />

                  {!quickUser && (
                    <TextField
                      label="Confirm password"
                      type={showPw ? 'text' : 'password'}
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                      placeholder="Confirm password"
                      autoComplete="new-password"
                      leading={<Lock size={16} strokeWidth={1.9} />}
                    />
                  )}
                </>
              )}

              {error && (
                <p
                  role="alert"
                  className="flex items-start gap-2 rounded-field border border-danger/25 bg-danger-soft px-3.5 py-2.5 text-[12px] font-bold text-danger"
                >
                  <AlertCircle size={15} strokeWidth={2} className="mt-px shrink-0" />
                  {error}
                </p>
              )}

              <Button
                type="submit"
                variant="primary"
                fullWidth
                disabled={busy}
                icon={busy ? <Loader2 size={16} strokeWidth={2.2} className="animate-spin" /> : mode === 'register' ? <UserPlus size={16} strokeWidth={1.9} /> : <LogIn size={16} strokeWidth={1.9} />}
              >
                {mainLabel}
              </Button>

              <div className="flex items-center gap-3">
                <span className="h-px flex-1 bg-[rgba(11,27,51,.08)] dark:bg-white/[.10]" />
                <span className="t-caption text-muted">or</span>
                <span className="h-px flex-1 bg-[rgba(11,27,51,.08)] dark:bg-white/[.10]" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                {CROSS[mode].map((m) => (
                  <Button key={m} type="button" variant="secondary" disabled={busy} onClick={() => goCross(m)}>
                    {MODE_LABEL[m]}
                  </Button>
                ))}
              </div>
            </form>
          </GlassCard>

          <p className="t-caption mt-5 text-center text-muted">
            Protected by RA 9262 · Data Privacy Act of 2012
          </p>
        </div>
      </div>
    </div>
  );
}
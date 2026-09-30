import React, { useState, useRef, useEffect } from 'react';
import { Lock, User, LogIn, UserPlus, Eye, EyeOff, Mail, Calendar } from 'lucide-react';
import { SplashLogo } from './SplashScreen';
import { computeAge } from '../../services/profileService';
import { KnownAccount } from '../../services/authClient';

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
  // Layout toggle — baliktad ang blue/form sa bawat pagpalit ng form.
  const [flipped, setFlipped] = useState(initialMode === 'signup');
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

  const isBottom = flipped;
  const isInitialTop = useRef(initialMode !== 'signup').current;
  const age = computeAge(birthday);
  const today = new Date().toISOString().split('T')[0];

  const [entering, setEntering] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setEntering(false), 900);
    return () => clearTimeout(t);
  }, []);

  const changeMode = (next: AuthMode) => {
    setFlipped((f) => !f);
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

  const inputCls =
    'w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 focus:border-blue-500 focus:outline-none text-sm';
  const labelCls = 'text-xs font-black text-slate-600 uppercase tracking-wider block mb-1';

  const mainLabel =
    mode === 'register' ? (busy ? 'CREATING…' : 'CREATE ACCOUNT')
    : mode === 'signup' ? (busy ? 'SIGNING IN…' : 'SIGN IN')
    : (busy ? 'LOGGING IN…' : 'LOG IN');

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-100 via-blue-50 to-blue-200 text-slate-800 antialiased font-sans">
      {/* Blue sheet (logo + text) — nasa taas sa register/sign up, nasa baba sa log in */}
      <div
        className={`splash-auth-sheet w-full min-h-[62vh] bg-gradient-to-b from-sky-400 to-blue-600 px-6 pt-24 pb-20 sm:pt-28 sm:pb-24 shadow-lg ${
          isBottom ? 'sheet-login' : 'sheet-register'
        } ${entering ? 'splash-sheet-drop' : ''}`}
        style={{
          borderRadius: isBottom
            ? '4.5rem 4.5rem 0 0'
            : '0 0 50% 50% / 0 0 4.5rem 4.5rem',
        }}
      >
        <div
          className={`flex flex-col items-center text-center transition-transform duration-700 ease-[cubic-bezier(0.33,1,0.68,1)] ${
            isBottom ? 'translate-y-36' : '-translate-y-20'
          }`}
        >
          <SplashLogo className="w-24 h-24 sm:w-28 sm:h-28 drop-shadow-2xl" />
          <h1 className="font-black text-white text-2xl tracking-wider uppercase mt-1">
            Bayani
          </h1>
          <p className="text-xs text-blue-100 font-medium">
            Safety in Every Step
          </p>
        </div>
      </div>

      {/* Form card */}
      <div className={`splash-auth-form-wrap ${isBottom ? 'form-wrap-login' : 'form-wrap-register'}`}>
        <div className={`${isInitialTop ? 'splash-auth-form-login' : 'splash-auth-form'} w-full bg-white rounded-3xl border border-slate-200/80 shadow-sm p-4 space-y-3`}>
          {knownAccounts.length > 0 && (
            <div className="space-y-1.5">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Saved Accounts</span>
              <div className="flex flex-wrap gap-2">
                {knownAccounts.map((a) => {
                  const selected = quickUser === a.username;
                  return (
                    <button
                      key={a.username}
                      type="button"
                      onClick={() => selectSavedAccount(a.username)}
                      disabled={busy}
                      className={`flex items-center gap-1.5 py-1.5 pl-1.5 pr-3 rounded-full border text-xs font-bold transition-all active:scale-[0.97] disabled:opacity-60 ${
                        selected
                          ? 'border-blue-500 bg-blue-50 text-blue-700 ring-2 ring-blue-200'
                          : 'border-slate-200 bg-white text-slate-600 hover:border-blue-300'
                      }`}
                    >
                      <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px] font-black uppercase">
                        {a.username.charAt(0)}
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
                <div>
                  <label className={labelCls}>Email</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="yourname@email.com"
                      autoComplete="email"
                      className={inputCls}
                    />
                  </div>
                </div>

                <div>
                  <label className={labelCls}>Full Name</label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Juan Dela Cruz"
                      autoComplete="name"
                      className={inputCls}
                    />
                  </div>
                </div>

                <div>
                  <label className={labelCls}>Gender</label>
                  <select
                    value={gender}
                    onChange={(e) => setGender(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:border-blue-500 focus:outline-none text-sm bg-white"
                  >
                    <option value="">Select</option>
                    <option value="Female">Female</option>
                    <option value="Male">Male</option>
                    <option value="Prefer not to say">Prefer not to say</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>Birthday</label>
                    <div className="relative">
                      <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input
                        type="date"
                        value={birthday}
                        max={today}
                        onChange={(e) => setBirthday(e.target.value)}
                        className="w-full pl-9 pr-2 py-2 rounded-xl border border-slate-200 focus:border-blue-500 focus:outline-none text-sm"
                      />
                    </div>
                  </div>
                  <div>
                    <label className={labelCls}>Age</label>
                    <input
                      type="text"
                      value={age ?? '—'}
                      readOnly
                      className="w-full px-3 py-2 rounded-xl border border-slate-100 bg-slate-50 text-slate-500 font-bold text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label className={labelCls}>Password (Email Account)</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type={showPw ? 'text' : 'password'}
                      value={emailPassword}
                      onChange={(e) => setEmailPassword(e.target.value)}
                      placeholder="Email account password"
                      autoComplete="new-password"
                      className="w-full pl-9 pr-10 py-2 rounded-xl border border-slate-200 focus:border-blue-500 focus:outline-none text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw((v) => !v)}
                      aria-label={showPw ? 'Hide password' : 'Show password'}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600"
                    >
                      {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </>
            )}

            {mode === 'signup' && (
              <>
                <div>
                  <label className={labelCls}>Email (Registered)</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="email"
                      value={suEmail}
                      onChange={(e) => setSuEmail(e.target.value)}
                      placeholder="yourname@email.com"
                      autoComplete="email"
                      className={inputCls}
                    />
                  </div>
                </div>

                <div>
                  <label className={labelCls}>Password (Registered)</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type={showPw ? 'text' : 'password'}
                      value={suPassword}
                      onChange={(e) => setSuPassword(e.target.value)}
                      placeholder="Registered password"
                      autoComplete="current-password"
                      className="w-full pl-9 pr-10 py-2 rounded-xl border border-slate-200 focus:border-blue-500 focus:outline-none text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw((v) => !v)}
                      aria-label={showPw ? 'Hide password' : 'Show password'}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600"
                    >
                      {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </>
            )}

            {mode === 'login' && (
              <>
                <div>
                  <label className={labelCls}>Username</label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => onUsernameChange(e.target.value)}
                      placeholder="username"
                      autoComplete="username"
                      maxLength={6}
                      className={inputCls}
                    />
                  </div>
                </div>

                <div>
                  <label className={labelCls}>{quickUser ? 'Password' : 'Create Password'}</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type={showPw ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={quickUser ? 'Enter your password' : 'Create password'}
                      autoComplete={quickUser ? 'current-password' : 'new-password'}
                      className="w-full pl-9 pr-10 py-2 rounded-xl border border-slate-200 focus:border-blue-500 focus:outline-none text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw((v) => !v)}
                      aria-label={showPw ? 'Hide password' : 'Show password'}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600"
                    >
                      {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {!quickUser && (
                  <div>
                    <label className={labelCls}>Confirm Password</label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input
                        type={showPw ? 'text' : 'password'}
                        value={confirm}
                        onChange={(e) => setConfirm(e.target.value)}
                        placeholder="Confirm password"
                        autoComplete="new-password"
                        className={inputCls}
                      />
                    </div>
                  </div>
                )}
              </>
            )}

            {error && (
              <p className="text-xs font-bold text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-xs font-extrabold flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
            >
              {mode === 'register' ? <UserPlus className="w-4 h-4" /> : <LogIn className="w-4 h-4" />}
              {mainLabel}
            </button>

            <div className="flex items-center gap-3 pt-1">
              <span className="h-px flex-1 bg-slate-200" />
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">or</span>
              <span className="h-px flex-1 bg-slate-200" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              {CROSS[mode].map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => goCross(m)}
                  disabled={busy}
                  className="py-2.5 rounded-xl border-2 border-blue-600 text-blue-700 hover:bg-blue-50 disabled:opacity-60 text-xs font-extrabold transition-all active:scale-[0.98]"
                >
                  {MODE_LABEL[m]}
                </button>
              ))}
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

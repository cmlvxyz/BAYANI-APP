import React, { useState, useRef } from 'react';
import {
  User,
  EyeOff,
  MapPin,
  Bell,
  Mic,
  Lock,
  Info,
  ChevronRight,
  ShieldCheck,
  Camera,
  Check,
} from 'lucide-react';
import { UserNavTab } from '../../types';
import { CitizenProfile, loadCitizenProfile, saveCitizenProfile, computeAge, readAvatarFile } from '../../services/profileService';
import {
  Badge,
  Button,
  GlassCard,
  Sheet,
  TextField,
  SelectField,
} from '../ui';

interface UserSettingsScreenProps {
  stealthMode: boolean;
  username: string;
  onToggleStealthMode: (val: boolean) => void;
  onNavigateTab: (tab: UserNavTab) => void;
  onOpenAudioEvidence: () => void;
}

export const UserSettingsScreen: React.FC<UserSettingsScreenProps> = ({
  stealthMode,
  username,
  onToggleStealthMode,
  onNavigateTab,
  onOpenAudioEvidence,
}) => {
  const [highAccuracyGps, setHighAccuracyGps] = useState(true);
  const [silentAlerts, setSilentAlerts] = useState(true);
  const [showAboutModal, setShowAboutModal] = useState(false);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [profile, setProfile] = useState<CitizenProfile>(loadCitizenProfile);
  const [isEditing, setIsEditing] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  // Configurable privacy-contact placeholder (set via VITE_PRIVACY_CONTACT, or
  // the LGU's DPO contact once assigned). Never hardcoded personnel.
  const privacyContact =
    import.meta.env.VITE_PRIVACY_CONTACT || 'privacy.operations at the city hall of Balanga (to be configured)';
  const privacyOfficer =
    import.meta.env.VITE_PRIVACY_OFFICER || 'LGU Data Protection Officer (to be appointed by the LGU)';

  const updateProfile = (patch: Partial<CitizenProfile>) => {
    setProfile((prev) => ({ ...prev, ...patch }));
  };

  const handleSaveProfile = () => {
    saveCitizenProfile(profile);
    setIsEditing(false);
  };

  const handleEditProfile = () => {
    setProfile(loadCitizenProfile());
    setIsEditing(true);
  };

  const readOnlyField =
    'w-full min-h-[44px] rounded-field border-[1.5px] border-[rgba(11,27,51,.06)] bg-[var(--surface-sunken)] px-3.5 py-2.5 text-[13px] text-muted cursor-default dark:border-white/[.06]';

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSaveError(null);
    try {
      const dataUrl = await readAvatarFile(file);
      // Persist right away so the header avatar updates even outside edit mode.
      const next = { ...profile, avatar: dataUrl };
      setProfile(next);
      if (!saveCitizenProfile(next)) {
        setSaveError('Could not save the photo on this device — storage is full.');
      }
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not load this image.');
    } finally {
      e.target.value = '';
    }
  };

  return (
    <div id="user-settings-screen" className="space-y-4 pb-6">
      <header>
        <h2 className="t-heading text-ink">Settings</h2>
      </header>

      {/* Profile summary */}
      <GlassCard>
        <div className="flex items-center gap-3.5">
          <button
            type="button"
            onClick={() => avatarInputRef.current?.click()}
            aria-label="Change profile picture"
            style={
              profile.avatar
                ? { backgroundImage: `url("${profile.avatar}")` }
                : undefined
            }
            className="press group relative grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-full bg-brand-600 bg-cover bg-center text-[17px] font-extrabold text-white"
          >
            {profile.avatar ? null : (
              <span>{(profile.fullName || 'Protected Citizen').charAt(0).toUpperCase()}</span>
            )}
            <span className="absolute inset-0 grid place-items-center bg-black/45 opacity-0 transition-opacity duration-[160ms] group-hover:opacity-100">
              <Camera size={18} strokeWidth={1.9} className="text-white" />
            </span>
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleAvatarChange}
            />
          </button>
          <div className="min-w-0 flex-1">
            <p className="t-heading truncate text-ink">
              {profile.fullName || 'Protected Citizen'}
            </p>
            <p className="t-body truncate text-muted">@{username}</p>
          </div>
          <Badge tone="success">Protected</Badge>
        </div>
        {saveError && (
          <p
            role="alert"
            className="mt-3 rounded-field border border-danger/25 bg-danger-soft px-3.5 py-2.5 text-[12px] font-bold text-danger"
          >
            {saveError}
          </p>
        )}
      </GlassCard>

      {/* Profile details */}
      <GlassCard>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-ctl bg-brand-50 text-brand-600">
              <User size={16} strokeWidth={1.9} />
            </span>
            <p className="t-heading text-ink">Profile details</p>
          </div>
          {isEditing ? <Badge tone="brand">Editing</Badge> : <Badge tone="success">Saved</Badge>}
        </div>

        <div className="mt-4 space-y-3.5">
          <TextField
            label="Full name"
            type="text"
            value={profile.fullName}
            disabled={!isEditing}
            onChange={(e) => updateProfile({ fullName: e.target.value })}
            placeholder={isEditing ? 'e.g. Juan Dela Cruz' : '—'}
            className={isEditing ? '' : '[&_input]:' + readOnlyField}
          />

          <div>
            <span className="t-caption mb-1.5 block text-muted">Username</span>
            <input
              type="text"
              value={username}
              readOnly
              disabled
              className={readOnlyField + ' font-bold'}
            />
          </div>

          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
            <SelectField
              label="Gender"
              value={profile.gender}
              disabled={!isEditing}
              onChange={(e) => updateProfile({ gender: e.target.value })}
              className={isEditing ? '' : '[&_select]:' + readOnlyField}
            >
              <option value="">— Select —</option>
              <option value="Female">Female</option>
              <option value="Male">Male</option>
              <option value="Prefer not to say">Prefer not to say</option>
            </SelectField>

            <TextField
              label="Date of birth"
              type="date"
              value={profile.dateOfBirth}
              disabled={!isEditing}
              onChange={(e) => updateProfile({ dateOfBirth: e.target.value })}
              className={isEditing ? '' : '[&_input]:' + readOnlyField}
            />
          </div>

          <div>
            <span className="t-caption mb-1.5 block text-muted">Age</span>
            <input
              type="text"
              value={computeAge(profile.dateOfBirth) ?? '—'}
              readOnly
              disabled
              className={readOnlyField + ' font-bold'}
            />
          </div>
        </div>

        <div className="mt-4 border-t border-[rgba(11,27,51,.06)] pt-4 dark:border-white/[.08]">
          {isEditing ? (
            <Button variant="primary" fullWidth icon={<Check size={16} strokeWidth={2.2} />} onClick={handleSaveProfile}>
              Save changes
            </Button>
          ) : (
            <Button variant="secondary" fullWidth onClick={handleEditProfile}>
              Edit profile
            </Button>
          )}
        </div>
      </GlassCard>

      {/* Stealth mode */}
      <GlassCard>
        <ToggleRow
          icon={<EyeOff size={17} strokeWidth={1.9} />}
          iconTone={stealthMode ? 'warn' : 'neutral'}
          title="Stealth mode"
          description="Keep emergency functions discreet"
          checked={stealthMode}
          onChange={onToggleStealthMode}
        />
      </GlassCard>

      {/* Options */}
      <GlassCard flush className="overflow-hidden p-0">
        <NavRow
          icon={<User size={16} strokeWidth={1.9} />}
          title="Emergency contacts"
          description="Manage trusted contacts & authorities"
          onClick={() => onNavigateTab('contacts')}
        />
        <ToggleRow
          icon={<MapPin size={16} strokeWidth={1.9} />}
          title="High-accuracy GNSS"
          description="Transmit ±3m precision via wearable"
          checked={highAccuracyGps}
          onChange={setHighAccuracyGps}
        />
        <ToggleRow
          icon={<Bell size={16} strokeWidth={1.9} />}
          title="Silent emergency dispatch"
          description="No ringtone or siren on trigger"
          checked={silentAlerts}
          onChange={setSilentAlerts}
        />
        <NavRow
          icon={<Mic size={16} strokeWidth={1.9} />}
          title="Audio evidence vault"
          description="Encrypted recordings (RA 9262 compliance)"
          onClick={onOpenAudioEvidence}
        />
        <NavRow
          icon={<Lock size={16} strokeWidth={1.9} />}
          title="Privacy notice"
          description="What data we collect & your rights"
          onClick={() => setShowPrivacyModal(true)}
        />
        <NavRow
          icon={<Info size={16} strokeWidth={1.9} />}
          title="About SINAG"
          description="What this app does for you"
          onClick={() => setShowAboutModal(true)}
          last
        />
      </GlassCard>

      {/* Privacy notice */}
      <Sheet
        id="privacy-notice-sheet"
        isOpen={showPrivacyModal}
        onClose={() => setShowPrivacyModal(false)}
        title="Privacy notice"
        size="lg"
        footer={
          <Button variant="primary" fullWidth onClick={() => setShowPrivacyModal(false)}>
            Close
          </Button>
        }
      >
        <div className="space-y-4 text-muted">
          <p className="t-body">
            This notice describes how the SINAG system handles personal data during an
            emergency. It follows the baseline principles of the Philippines Data Privacy Act
            of 2012 for this demo.
          </p>

          <ProseGroup title="What is collected during an SOS" items={[
            'Location coordinates captured at the time of the alert.',
            'An ambient audio clip recorded on this device and shared only with the Response Center.',
            'Your username and display name.',
            'The emergency contacts you configured.',
          ]} />

          <ProseGroup title="How it is used" items={[
            'To dispatch responders to your exact location.',
            'To notify your trusted contacts.',
            'As incident evidence, retained only as long as legally required (configurable via the Response Center).',
          ]} />

          <ProseGroup title="Your rights" items={[
            'Access — ask for a copy of your data.',
            'Correction — correct inaccurate details.',
            'Deletion — request removal when allowed by law.',
            'Withdraw consent — disable location/audio sharing in Settings.',
          ]} />

          <div className="space-y-1 rounded-card border border-warn/25 bg-warn-soft p-3.5 text-warn">
            <p className="text-[13px] font-extrabold">Questions or requests?</p>
            <p className="t-body">Contact the {privacyOfficer}.</p>
            <p className="t-body">{privacyContact}.</p>
          </div>
        </div>
      </Sheet>

      {/* About */}
      <Sheet
        id="about-sheet"
        isOpen={showAboutModal}
        onClose={() => setShowAboutModal(false)}
        title="About SINAG"
        size="lg"
        footer={
          <Button variant="primary" fullWidth onClick={() => setShowAboutModal(false)}>
            Close
          </Button>
        }
      >
        <div className="space-y-4 text-muted">
          <p className="t-body text-ink">
            <strong>SINAG</strong> (&ldquo;Safety in Every Step&rdquo;) is the citizen-side
            smart companion app of the SINAG safety system. It pairs with a discreet physical
            thigh-worn wearable so you can call for help &mdash; without ever reaching for your
            phone.
          </p>

          <div className="space-y-1.5 rounded-card border border-brand-200 bg-brand-50 p-3.5 text-brand-700">
            <p className="t-caption">How it works</p>
            <p className="t-body">
              Squeeze the Thigh Band &rarr; SOS Activated &rarr; Exact GPS + Audio Recorded
              &rarr; Alert Sent to the Response Center &rarr; Responder Assigned &amp; On The
              Way &rarr; You confirm &ldquo;Help received&rdquo;
            </p>
          </div>

          <ProseGroup title="What this app does for you" items={[
            'One-tap SOS: fires an emergency alert with your exact GPS location, transmitted live to the municipal Response Center.',
            'Live status tracking: follow your rescue in real time — SOS activated, responder en route, then close the loop by confirming help has arrived.',
            'Discreet audio evidence: records ambient audio automatically during an emergency, stored securely as legally valid evidence under RA 9262 (Anti-VAWC).',
            'Trusted contacts: your emergency contacts are notified instantly so your loved ones are never left guessing.',
            'Evidence vault: every recording is kept in a lockable vault with an SHA-256 integrity hash for later playbacks.',
            'Emergency map & settings: share your live location on a map, edit your profile, and configure emergency preferences anytime.',
          ]} />
        </div>
      </Sheet>
    </div>
  );
};

/* ------------------------------------------------------------------ */

type Tone = 'brand' | 'neutral' | 'warn';

const TILE: Record<Tone, string> = {
  brand: 'bg-brand-50 text-brand-600',
  neutral: 'bg-[var(--surface-sunken)] text-muted',
  warn: 'bg-warn-soft text-warn',
};

function ToggleRow({
  icon,
  iconTone = 'brand',
  title,
  description,
  checked,
  onChange,
}: {
  icon: React.ReactNode;
  iconTone?: Tone;
  title: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3.5">
      <div className="flex min-w-0 items-center gap-3">
        <span className={'grid h-8 w-8 shrink-0 place-items-center rounded-ctl ' + TILE[iconTone]}>{icon}</span>
        <div className="min-w-0">
          <p className="truncate text-[13px] font-extrabold text-ink">{title}</p>
          <p className="t-body truncate text-muted">{description}</p>
        </div>
      </div>
      <Switch checked={checked} onChange={onChange} label={title} />
    </div>
  );
}

function NavRow({
  icon,
  title,
  description,
  onClick,
  last = false,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  onClick: () => void;
  last?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'press flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left ' +
        'transition-colors duration-[160ms] hover:bg-[var(--surface-sunken)] ' +
        (last ? '' : 'border-b border-[rgba(11,27,51,.06)] dark:border-white/[.08]')
      }
    >
      <div className="flex min-w-0 items-center gap-3">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-ctl bg-brand-50 text-brand-600">{icon}</span>
        <div className="min-w-0">
          <p className="truncate text-[13px] font-extrabold text-ink">{title}</p>
          <p className="t-body truncate text-muted">{description}</p>
        </div>
      </div>
      <ChevronRight size={18} strokeWidth={1.9} className="shrink-0 text-muted" />
    </button>
  );
}

export function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={
        'track relative h-6 w-11 shrink-0 rounded-full ' +
        (checked ? 'bg-brand-600' : 'bg-[rgba(11,27,51,.2)] dark:bg-white/20')
      }
    >
      <span
        className={
          'knob absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow-soft ' +
          (checked ? 'translate-x-5' : 'translate-x-0')
        }
      />
    </button>
  );
}

function ProseGroup({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <p className="mb-1.5 text-[13px] font-extrabold text-ink">{title}</p>
      <ul className="list-disc space-y-1 pl-4 text-[12px] leading-relaxed marker:text-brand-400">
        {items.map((it) => (
          <li key={it}>{it}</li>
        ))}
      </ul>
    </div>
  );
}

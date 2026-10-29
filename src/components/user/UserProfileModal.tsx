import React, { useState, useEffect, useRef } from 'react';
import { ShieldCheck, Camera } from 'lucide-react';
import { WearableDeviceTelemetry } from '../../services/hardwareService';
import { CitizenProfile, loadCitizenProfile, saveCitizenProfile, computeAge, readAvatarFile } from '../../services/profileService';
import { Button, Sheet, TextField, SelectField } from '../ui';

interface UserProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  telemetry: WearableDeviceTelemetry;
}

export const UserProfileModal: React.FC<UserProfileModalProps> = ({
  isOpen,
  onClose,
  telemetry,
}) => {
  const [profile, setProfile] = useState<CitizenProfile>(loadCitizenProfile);
  const [saveError, setSaveError] = useState<string | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setProfile(loadCitizenProfile());
      setSaveError(null);
    }
  }, [isOpen]);

  const updateProfile = (patch: Partial<CitizenProfile>) => {
    const next = { ...profile, ...patch };
    setProfile(next);
    const ok = saveCitizenProfile(next);
    if (!ok && patch.avatar !== undefined) {
      setSaveError('Could not save the photo on this device — storage is full.');
    } else {
      setSaveError(null);
    }
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await readAvatarFile(file);
      updateProfile({ avatar: dataUrl });
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not load this image.');
    } finally {
      e.target.value = '';
    }
  };

  return (
    <Sheet
      id="user-profile-modal"
      isOpen={isOpen}
      onClose={onClose}
      title="Protected citizen profile"
      subtitle="Identity is anonymized outside an active SOS"
      headerAction={
        <button
          type="button"
          onClick={() => avatarInputRef.current?.click()}
          aria-label="Change profile picture"
          style={
            profile.avatar
              ? { backgroundImage: `url("${profile.avatar}")` }
              : undefined
          }
          className="press group relative grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full bg-brand-600 bg-cover bg-center text-[13px] font-extrabold text-white"
        >
          {profile.avatar ? null : (
            <span>{(profile.fullName || 'BA').charAt(0).toUpperCase()}</span>
          )}
          <span className="absolute inset-0 grid place-items-center bg-black/45 opacity-0 transition-opacity duration-[160ms] group-hover:opacity-100">
            <Camera size={14} strokeWidth={1.9} className="text-white" />
          </span>
          <input
            ref={avatarInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleAvatarChange}
          />
        </button>
      }
      footer={
        <Button variant="primary" fullWidth onClick={onClose}>
          Done
        </Button>
      }
    >
      <div className="space-y-5">
        {saveError && (
          <p
            role="alert"
            className="rounded-field border border-danger/25 bg-danger-soft px-3.5 py-2.5 text-[12px] font-bold text-danger"
          >
            {saveError}
          </p>
        )}

        {/* Identity safeguard notice */}
        <div className="flex items-start gap-2.5 rounded-card border border-success/25 bg-success-soft p-3.5">
          <ShieldCheck size={17} strokeWidth={1.9} className="mt-0.5 shrink-0 text-success" />
          <div>
            <p className="text-[13px] font-extrabold text-success">Anonymized protection</p>
            <p className="t-body text-success/90">
              Under RA 9262 protocols, personal identity is masked with a cryptographic
              alias unless an active SOS is routed to the PNP VAWC Desk.
            </p>
          </div>
        </div>

        {/* Personal information */}
        <div>
          <p className="t-caption mb-3 text-muted">Personal information</p>
          <div className="space-y-3.5">
            <TextField
              label="Full name"
              type="text"
              value={profile.fullName}
              onChange={(e) => updateProfile({ fullName: e.target.value })}
              placeholder="e.g. Juan Dela Cruz"
            />
            <SelectField
              label="Gender"
              value={profile.gender}
              onChange={(e) => updateProfile({ gender: e.target.value })}
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
              onChange={(e) => updateProfile({ dateOfBirth: e.target.value })}
            />
            <TextField
              label="Verified address"
              type="text"
              value={profile.address}
              onChange={(e) => updateProfile({ address: e.target.value })}
              placeholder="e.g. 949 National Road, St. Francis II, Limay, Bataan"
              hint="Shown to responders. Your live position always comes from your device GPS."
            />
            <div>
              <span className="t-caption mb-1.5 block text-muted">Age</span>
              <input
                type="text"
                value={computeAge(profile.dateOfBirth) ?? '—'}
                readOnly
                className="w-full min-h-[44px] rounded-field border-[1.5px] border-[rgba(11,27,51,.06)] bg-[var(--surface-sunken)] px-3.5 py-2.5 text-[13px] font-bold text-muted"
              />
            </div>
          </div>
        </div>

        {/* Paired wearable telemetry */}
        <div>
          <p className="t-caption mb-2.5 text-muted">Paired wearable thigh band</p>
          <dl className="space-y-2 rounded-card bg-[var(--surface-sunken)] p-3.5">
            <Row label="Hardware ID" value={telemetry.deviceId} mono />
            <Row label="Placement" value="Inner-thigh band" />
            <Row
              label="Trigger sensor"
              value={telemetry.bleConnected ? 'Dual squeeze ready' : 'Disconnected'}
              tone={telemetry.bleConnected ? 'success' : 'danger'}
            />
            <Row label="Firmware" value="v2.4.1-ph (Stable)" />
            <Row label="Battery" value={`${telemetry.battery}% (~58 hrs)`} />
          </dl>
        </div>
      </div>
    </Sheet>
  );
};

function Row({
  label,
  value,
  mono,
  tone,
}: {
  label: string;
  value: string;
  mono?: boolean;
  tone?: 'success' | 'danger';
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="shrink-0 text-[12px] text-muted">{label}</dt>
      <dd
        className={
          'min-w-0 truncate text-right text-[12px] font-extrabold ' +
          (mono ? 'font-mono ' : '') +
          (tone === 'success' ? 'text-success' : tone === 'danger' ? 'text-danger' : 'text-ink')
        }
      >
        {value}
      </dd>
    </div>
  );
}

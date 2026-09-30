import React, { useState, useEffect, useRef } from 'react';
import { X, User, ShieldCheck, Cpu, Smartphone, Radio, MapPin, CheckCircle2, Camera } from 'lucide-react';
import { WearableDeviceTelemetry } from '../../services/hardwareService';
import { CitizenProfile, loadCitizenProfile, saveCitizenProfile, computeAge, readAvatarFile } from '../../services/profileService';

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
  const avatarInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) setProfile(loadCitizenProfile());
  }, [isOpen]);

  const updateProfile = (patch: Partial<CitizenProfile>) => {
    setProfile((prev) => {
      const next = { ...prev, ...patch };
      saveCitizenProfile(next);
      return next;
    });
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const dataUrl = await readAvatarFile(file);
    updateProfile({ avatar: dataUrl });
    e.target.value = '';
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn">
      <div 
        id="user-profile-modal"
        className="bg-white rounded-3xl max-w-sm w-full border border-slate-200 shadow-2xl p-5 space-y-4"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-2 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <button
            type="button"
            onClick={() => avatarInputRef.current?.click()}
            title="Change profile picture"
            className="w-9 h-9 rounded-2xl overflow-hidden bg-blue-600 text-white flex items-center justify-center font-black text-sm relative group shrink-0"
          >
            {profile.avatar ? (
              <img src={profile.avatar} alt="Profile" className="w-full h-full object-cover" />
            ) : (
              <span className="font-black text-sm">BA</span>
            )}
            <span className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <Camera className="w-3.5 h-3.5 text-white" />
            </span>
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleAvatarChange}
            />
          </button>
          <div>
              <h3 className="font-extrabold text-slate-900 text-sm">
                Protected Citizen Profile
              </h3>
              <span className="text-[10px] text-slate-400 font-mono">
                Protected Citizen (Anonymized)
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Identity Safeguard Notice */}
        <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-start gap-2.5 text-xs text-emerald-900">
          <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold block">Anonymized Protection</span>
            <p className="text-[11px] text-emerald-800 leading-snug">
              Under RA 9262 protocols, personal identity is masked with a cryptographic alias unless an active SOS is routed to the PNP VAWC Desk.
            </p>
          </div>
        </div>

        {/* Paired Device Telemetry */}
        <div className="space-y-2 text-xs">
          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
            Paired Wearable Thigh Band
          </span>

          <div className="p-3 rounded-2xl bg-slate-50 border border-slate-100 space-y-2 font-mono text-[11px]">
            <div className="flex justify-between">
              <span className="text-slate-500 font-sans">Hardware ID:</span>
              <span className="font-bold text-slate-900">{telemetry.deviceId}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500 font-sans">Placement:</span>
              <span className="font-bold text-slate-900">Inner-Thigh Band</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500 font-sans">Trigger Sensor:</span>
              <span className="font-bold text-emerald-600">Dual Squeeze Ready</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500 font-sans">Firmware:</span>
              <span className="font-bold text-slate-700">v2.4.1-ph (Stable)</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500 font-sans">Battery:</span>
              <span className="font-bold text-slate-900">{telemetry.battery}% (~58 hrs)</span>
            </div>
          </div>
        </div>

        {/* Personal Information — editable */}
        <div className="space-y-2 text-xs">
          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
            Personal Information
          </span>

          <div className="p-3 rounded-2xl bg-slate-50 border border-slate-100 space-y-2.5">
            <div>
              <label className="text-slate-600 font-bold block mb-1">Full Name</label>
              <input
                type="text"
                value={profile.fullName}
                onChange={(e) => updateProfile({ fullName: e.target.value })}
                placeholder="e.g. Juan Dela Cruz"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:border-blue-500 focus:outline-none bg-white"
              />
            </div>

            <div>
              <label className="text-slate-600 font-bold block mb-1">Gender</label>
              <select
                value={profile.gender}
                onChange={(e) => updateProfile({ gender: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:border-blue-500 focus:outline-none bg-white"
              >
                <option value="">— Select —</option>
                <option value="Female">Female</option>
                <option value="Male">Male</option>
                <option value="Prefer not to say">Prefer not to say</option>
              </select>
            </div>

            <div>
              <label className="text-slate-600 font-bold block mb-1">Date of Birth</label>
              <input
                type="date"
                value={profile.dateOfBirth}
                onChange={(e) => updateProfile({ dateOfBirth: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:border-blue-500 focus:outline-none bg-white"
              />
            </div>

            <div>
              <label className="text-slate-600 font-bold block mb-1">Age</label>
              <input
                type="text"
                value={computeAge(profile.dateOfBirth) ?? '—'}
                readOnly
                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-100 text-slate-500 font-bold"
              />
            </div>
          </div>
        </div>

        {/* Action Button */}
        <div className="pt-2 border-t border-slate-100 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-900 text-white font-bold text-xs hover:bg-slate-800"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
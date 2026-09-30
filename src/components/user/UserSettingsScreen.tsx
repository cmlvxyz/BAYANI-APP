import React, { useState, useRef } from 'react';
import { 
  Settings, 
  User, 
  EyeOff, 
  MapPin, 
  Bell, 
  Mic, 
  Lock, 
  Info, 
  Check, 
  ChevronRight, 
  ExternalLink,
  ShieldCheck,
  Smartphone,
  Camera
} from 'lucide-react';
import { UserNavTab } from '../../types';
import { CitizenProfile, loadCitizenProfile, saveCitizenProfile, computeAge, readAvatarFile } from '../../services/profileService';

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
  const avatarInputRef = useRef<HTMLInputElement>(null);

  // Configurable privacy-contact placeholder (set via VITE_PRIVACY_CONTACT, or
  // the LGU's DPO contact once assigned). Never hardcoded personnel.
  const privacyContact =
    (import.meta as any)?.env?.VITE_PRIVACY_CONTACT || 'privacy.operations at the city hall of Balanga (to be configured)';
  const privacyOfficer =
    (import.meta as any)?.env?.VITE_PRIVACY_OFFICER || 'LGU Data Protection Officer (to be appointed by the LGU)';

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

  const fieldClass = isEditing
    ? 'w-full px-3 py-2 rounded-xl border border-slate-200 focus:border-blue-500 focus:outline-none bg-white'
    : 'w-full px-3 py-2 rounded-xl border border-slate-100 bg-slate-50 text-slate-700 cursor-default';

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const dataUrl = await readAvatarFile(file);
    updateProfile({ avatar: dataUrl });
    e.target.value = '';
  };

  return (
    <div id="user-settings-screen" className="space-y-4 pb-8">
      {/* Header */}
      <div>
        <h2 className="text-lg font-black text-slate-900 tracking-tight flex items-center gap-2">
          <Settings className="w-5 h-5 text-blue-600" />
          <span>SETTINGS</span>
        </h2>
      </div>

      {/* User Profile Card */}
      <div className="bg-white rounded-3xl p-4 border border-slate-200/80 shadow-xs flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => avatarInputRef.current?.click()}
            title="Change profile picture"
            className="relative w-11 h-11 rounded-2xl overflow-hidden bg-blue-600 text-white flex items-center justify-center font-black text-sm shadow-xs shrink-0 group"
          >
            {profile.avatar ? (
              <img src={profile.avatar} alt="" className="w-full h-full object-cover" />
            ) : (
              <span>BA</span>
            )}
            <span className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <Camera className="w-4 h-4 text-white" />
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
              {profile.fullName || 'Protected Citizen'}
            </h3>
          </div>
        </div>

        <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
          PROTECTED
        </span>
      </div>

      {/* Profile Details — editable fields */}
      <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="font-extrabold text-slate-900 text-sm flex items-center gap-2">
            <User className="w-4 h-4 text-blue-600" />
            <span>Profile Details</span>
          </h4>
          <span className={`text-[10px] font-bold uppercase tracking-wider ${isEditing ? 'text-blue-600' : 'text-emerald-600'}`}>
            {isEditing ? 'Editing' : 'Saved'}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div className="sm:col-span-2">
            <label className="text-slate-600 font-bold block mb-1">Full Name</label>
            <input
              type="text"
              value={profile.fullName}
              disabled={!isEditing}
              onChange={(e) => updateProfile({ fullName: e.target.value })}
              placeholder={isEditing ? 'e.g. Juan Dela Cruz' : '—'}
              className={fieldClass}
            />
          </div>

          <div className="sm:col-span-2">
            <label className="text-slate-600 font-bold block mb-1">Username</label>
            <input
              type="text"
              value={username}
              readOnly
              disabled
              placeholder="—"
              className="w-full px-3 py-2 rounded-xl border border-slate-100 bg-slate-50 text-slate-500 font-bold"
            />
          </div>

          <div>
            <label className="text-slate-600 font-bold block mb-1">Gender</label>
            <select
              value={profile.gender}
              disabled={!isEditing}
              onChange={(e) => updateProfile({ gender: e.target.value })}
              className={fieldClass}
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
              disabled={!isEditing}
              onChange={(e) => updateProfile({ dateOfBirth: e.target.value })}
              className={fieldClass}
            />
          </div>

          <div className="sm:col-span-2">
            <label className="text-slate-600 font-bold block mb-1">Age</label>
            <input
              type="text"
              value={computeAge(profile.dateOfBirth) ?? '—'}
              readOnly
              disabled={!isEditing}
              className="w-full px-3 py-2 rounded-xl border border-slate-100 bg-slate-50 text-slate-500 font-bold"
            />
          </div>
        </div>

        {/* Save / Edit */}
        <div className="pt-1 border-t border-slate-100">
          {isEditing ? (
            <button
              type="button"
              onClick={handleSaveProfile}
              className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-extrabold transition-all active:scale-[0.98]"
            >
              SAVE
            </button>
          ) : (
            <button
              type="button"
              onClick={handleEditProfile}
              className="w-full py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-extrabold transition-all active:scale-[0.98]"
            >
              EDIT
            </button>
          )}
        </div>
      </div>

      {/* Primary Feature: STEALTH MODE TOGGLE */}
      <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-xs space-y-2.5">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2.5">
            <div className={`w-9 h-9 rounded-2xl flex items-center justify-center ${
              stealthMode ? 'bg-amber-500 text-white' : 'bg-slate-100 text-slate-600'
            }`}>
              <EyeOff className="w-4 h-4" />
            </div>
            <div>
              <h4 className="font-extrabold text-slate-900 text-sm">
                Stealth Mode
              </h4>
              <span className="text-[11px] text-slate-500 block">
                Keep emergency functions discreet
              </span>
            </div>
          </div>

          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={stealthMode}
              onChange={(e) => onToggleStealthMode(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500"></div>
          </label>
        </div>
      </div>

      {/* Settings Options List */}
      <div className="bg-white rounded-3xl border border-slate-200/80 divide-y divide-slate-100 shadow-xs overflow-hidden">
        {/* Contacts Shortcut */}
        <button
          onClick={() => onNavigateTab('contacts')}
          className="w-full p-4 flex items-center justify-between hover:bg-slate-50 transition-colors text-left"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
              <User className="w-4 h-4" />
            </div>
            <div>
              <h5 className="font-bold text-slate-900 text-xs">Emergency Contacts</h5>
              <p className="text-[11px] text-slate-400">Manage trusted contacts &amp; authorities</p>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-400" />
        </button>

        {/* Location Sharing */}
        <div className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <MapPin className="w-4 h-4" />
            </div>
            <div>
              <h5 className="font-bold text-slate-900 text-xs">High-Accuracy GNSS</h5>
              <p className="text-[11px] text-slate-400">Transmit ±3m precision via wearable</p>
            </div>
          </div>
          <input
            type="checkbox"
            checked={highAccuracyGps}
            onChange={(e) => setHighAccuracyGps(e.target.checked)}
            className="w-4 h-4 rounded text-blue-600 accent-blue-600"
          />
        </div>

        {/* Silent Notification Alerts */}
        <div className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
              <Bell className="w-4 h-4" />
            </div>
            <div>
              <h5 className="font-bold text-slate-900 text-xs">Silent Emergency Dispatch</h5>
              <p className="text-[11px] text-slate-400">No ringtone or siren on trigger</p>
            </div>
          </div>
          <input
            type="checkbox"
            checked={silentAlerts}
            onChange={(e) => setSilentAlerts(e.target.checked)}
            className="w-4 h-4 rounded text-blue-600 accent-blue-600"
          />
        </div>

        {/* Audio Evidence Vault */}
        <button
          onClick={onOpenAudioEvidence}
          className="w-full p-4 flex items-center justify-between hover:bg-slate-50 transition-colors text-left"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
              <Mic className="w-4 h-4" />
            </div>
            <div>
              <h5 className="font-bold text-slate-900 text-xs">Audio Evidence Vault</h5>
              <p className="text-[11px] text-slate-400">Encrypted recordings (RA 9262 compliance)</p>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-400" />
        </button>

        {/* Privacy Notice — Data Privacy Act baseline */}
        <button
          onClick={() => setShowPrivacyModal(true)}
          className="w-full p-4 flex items-center justify-between hover:bg-slate-50 transition-colors text-left"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <Lock className="w-4 h-4" />
            </div>
            <div>
              <h5 className="font-bold text-slate-900 text-xs">Privacy Notice</h5>
              <p className="text-[11px] text-slate-400">What data we collect &amp; your rights</p>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-400" />
        </button>

        {/* About Bayani Alert */}
        <button
          onClick={() => setShowAboutModal(true)}
          className="w-full p-4 flex items-center justify-between hover:bg-slate-50 transition-colors text-left"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center">
              <Info className="w-4 h-4" />
            </div>
            <div>
              <h5 className="font-bold text-slate-900 text-xs">About BAYANI APP</h5>
              <p className="text-[11px] text-slate-400">What this app does for you</p>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-400" />
        </button>
      </div>

      {/* Privacy Notice Modal */}
      {showPrivacyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white rounded-3xl max-w-md w-full p-5 border border-slate-200 shadow-2xl space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-extrabold text-slate-900 text-sm flex items-center gap-2">
                <Lock className="w-5 h-5 text-emerald-600" />
                <span>Privacy Notice</span>
              </h3>
              <button
                onClick={() => setShowPrivacyModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs text-slate-600 leading-relaxed">
              <p>
                This notice describes how the BAYANI system handles personal
                data during an emergency. It follows the baseline principles of
                the Philippines Data Privacy Act of 2012 for this demo.
              </p>

              <div>
                <h5 className="font-bold text-slate-900 mb-1">What is collected during an SOS</h5>
                <ul className="list-disc pl-4 space-y-1 text-[11px] text-slate-500">
                  <li>Location coordinates captured at the time of the alert.</li>
                  <li>An ambient audio clip recorded on this device and shared only with the Response Center.</li>
                  <li>Your username and display name.</li>
                  <li>The emergency contacts you configured.</li>
                </ul>
              </div>

              <div>
                <h5 className="font-bold text-slate-900 mb-1">How it is used</h5>
                <ul className="list-disc pl-4 space-y-1 text-[11px] text-slate-500">
                  <li>To dispatch responders to your exact location.</li>
                  <li>To notify your trusted contacts.</li>
                  <li>As incident evidence, retained only as long as legally required (configurable via the Response Center).</li>
                </ul>
              </div>

              <div>
                <h5 className="font-bold text-slate-900 mb-1">Your rights</h5>
                <ul className="list-disc pl-4 space-y-1 text-[11px] text-slate-500">
                  <li><strong>Access</strong> — ask for a copy of your data.</li>
                  <li><strong>Correction</strong> — correct inaccurate details.</li>
                  <li><strong>Deletion</strong> — request removal when allowed by law.</li>
                  <li><strong>Withdraw consent</strong> — disable location/audio sharing in Settings.</li>
                </ul>
              </div>

              <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200 text-[11px] text-amber-900 space-y-1">
                <span className="font-bold block">Questions or requests?</span>
                <span>Contact the {privacyOfficer}.</span>
                <span>{privacyContact}.</span>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex justify-end">
              <button
                onClick={() => setShowPrivacyModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-900 text-white font-bold text-xs"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* About Modal */}
      {showAboutModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white rounded-3xl max-w-md w-full p-5 border border-slate-200 shadow-2xl space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-extrabold text-slate-900 text-sm flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-blue-600" />
                <span>About BAYANI APP</span>
              </h3>
              <button 
                onClick={() => setShowAboutModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs text-slate-600 leading-relaxed">
              <p className="font-medium text-slate-800">
                <strong>BAYANI APP</strong> (“Safety in Every Step”) is the citizen-side smart companion app of the Bayani safety system. It pairs with a discreet physical thigh-worn wearable so you can call for help — without ever reaching for your phone.
              </p>

              <div className="p-3 rounded-2xl bg-blue-50 border border-blue-100 text-blue-950 font-bold space-y-1">
                <span className="text-[10px] text-blue-600 uppercase tracking-wider block">How it works</span>
                <p className="text-[11px] font-normal leading-tight text-blue-900">
                  Squeeze the Thigh Band → SOS Activated → Exact GPS + Audio Recorded → Alert Sent to the Response Center → Responder Assigned &amp; On The Way → You confirm “HELP RECEIVED”
                </p>
              </div>

              <div className="space-y-1.5 pt-1">
                <h5 className="font-bold text-slate-900">What this app does for you:</h5>
                <ul className="list-disc pl-4 space-y-1 text-[11px] text-slate-500">
                  <li><strong>One-tap SOS:</strong> Fires an emergency alert with your exact GPS location, transmitted live to the municipal Response Center.</li>
                  <li><strong>Live status tracking:</strong> Follow your rescue in real time — SOS Activated, Responder En Route, then close the loop by confirming help has arrived.</li>
                  <li><strong>Discreet audio evidence:</strong> Records ambient audio automatically during an emergency, stored securely as legally valid evidence under RA 9262 (Anti-VAWC).</li>
                  <li><strong>Trusted contacts:</strong> Your emergency contacts are notified instantly so your loved ones are never left guessing.</li>
                  <li><strong>Evidence vault:</strong> Every recording is kept in a lockable vault with an SHA-256 integrity hash for later playbacks.</li>
                  <li><strong>Emergency map &amp; settings:</strong> Share your live location on a map, edit your profile, and configure emergency preferences anytime.</li>
                </ul>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex justify-end">
              <button
                onClick={() => setShowAboutModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-900 text-white font-bold text-xs"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
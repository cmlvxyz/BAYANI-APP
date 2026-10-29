import { getSession } from './authClient';

export interface CitizenProfile {
  username: string;
  email: string;
  fullName: string;
  gender: string;
  dateOfBirth: string;
  avatar: string;
  /**
   * Citizen's verified address, e.g. "949 National Road, St. Francis II,
   * Limay, Bataan".
   *
   * Reverse geocoding resolves coordinates to the nearest *mapped* feature —
   * a road or a subdivision centroid — so it can never supply a house number
   * (OSM has no address points for most of Bataan). The live position always
   * comes from the device GPS; this field is the human-readable address the
   * citizen confirms once and is what responders see on the incident.
   */
  address: string;
}

// Profiles are stored PER ACCOUNT (keyed by username) so signing in with a
// different account never shows the previous user's profile. The registration
// form collects the details before a username exists, so those are parked in
// PENDING_KEY and adopted by the account the moment it is created.
const KEY_PREFIX = 'bayani_citizen_profile:';
const PENDING_KEY = 'bayani_citizen_profile_pending';

const EMPTY_PROFILE: CitizenProfile = {
  username: '',
  email: '',
  fullName: '',
  gender: '',
  dateOfBirth: '',
  avatar: '',
  address: '',
};

function normUsername(username?: string | null): string {
  return (username ?? '').trim().toLowerCase();
}

function activeUsername(): string {
  return normUsername(getSession()?.user?.username);
}

function keyFor(username: string): string {
  return `${KEY_PREFIX}${normUsername(username)}`;
}

type ProfileListener = () => void;
const listeners = new Set<ProfileListener>();

/** Components (e.g. the header avatar) can react to profile edits elsewhere. */
export function subscribeProfile(listener: ProfileListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notifyProfile(): void {
  for (const listener of listeners) listener();
}

/**
 * Loads a profile. When no username is passed it resolves the signed-in
 * account; before login (registration form) it falls back to the pending
 * draft so the form still remembers what was typed.
 */
export function loadCitizenProfile(username?: string): CitizenProfile {
  const user = normUsername(username) || activeUsername();
  const key = user ? keyFor(user) : PENDING_KEY;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return { ...EMPTY_PROFILE };
    const parsed = JSON.parse(raw) as Partial<CitizenProfile>;
    return { ...EMPTY_PROFILE, ...parsed };
  } catch {
    return { ...EMPTY_PROFILE };
  }
}

/**
 * Saves a profile to the given account, or to the active account, or (before
 * login) to the pending registration draft. Returns false when the browser
 * storage rejects the write (e.g. quota exceeded) so callers can tell the user.
 */
export function saveCitizenProfile(profile: CitizenProfile, username?: string): boolean {
  const user = normUsername(username) || normUsername(profile.username) || activeUsername();
  const key = user ? keyFor(user) : PENDING_KEY;
  try {
    localStorage.setItem(key, JSON.stringify(user ? { ...profile, username: user } : profile));
  } catch (err) {
    console.error('[profileService] Failed to save profile to localStorage', err);
    return false;
  }
  notifyProfile();
  return true;
}

/**
 * Called right after a brand-new account is created: moves the registration
 * draft onto that account so its details are not shared with other accounts.
 */
export function adoptPendingProfile(username: string): void {
  const user = normUsername(username);
  if (!user) return;
  try {
    const pending = localStorage.getItem(PENDING_KEY);
    if (!pending) return;
    localStorage.removeItem(PENDING_KEY);
    if (localStorage.getItem(keyFor(user))) return;
    const parsed = JSON.parse(pending) as Partial<CitizenProfile>;
    localStorage.setItem(keyFor(user), JSON.stringify({ ...EMPTY_PROFILE, ...parsed, username: user }));
  } catch {}
  notifyProfile();
}

export function computeAge(dateOfBirth: string): number | null {
  if (!dateOfBirth) return null;
  const dob = new Date(dateOfBirth);
  if (isNaN(dob.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const monthDiff = now.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < dob.getDate())) {
    age -= 1;
  }
  return age;
}

const AVATAR_SIZE = 256;

function drawAvatar(img: HTMLImageElement, size: number, quality: number): string {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is not supported on this device');
  const scale = Math.max(size / img.width, size / img.height);
  const w = img.width * scale;
  const h = img.height * scale;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);
  // Center-crop to fill the square (the UI clips it into a circle), so the
  // photo fills the avatar instead of leaving white letterbox bars.
  ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
  return canvas.toDataURL('image/jpeg', quality);
}

export function readAvatarFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'));
    reader.onload = () => {
      const raw = String(reader.result);
      const img = new Image();
      img.onload = () => {
        try {
          // Always re-encode to a small JPEG. Never store the raw file — a big
          // base64 string would blow the localStorage quota and the avatar would
          // silently fail to persist.
          let out = drawAvatar(img, AVATAR_SIZE, 0.82);
          if (out.length > 400_000) out = drawAvatar(img, 160, 0.72);
          if (out.length > 200_000) out = drawAvatar(img, 112, 0.62);
          resolve(out);
        } catch {
          reject(new Error('Could not process this image. Please use a JPG or PNG.'));
        }
      };
      img.onerror = () => reject(new Error('Could not read this image. Please use a JPG or PNG.'));
      img.src = raw;
    };
    reader.readAsDataURL(file);
  });
}
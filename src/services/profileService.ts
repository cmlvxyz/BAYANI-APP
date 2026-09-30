export interface CitizenProfile {
  username: string;
  email: string;
  fullName: string;
  gender: string;
  dateOfBirth: string;
  avatar: string;
}

const STORAGE_KEY = 'bayani_citizen_profile';

const EMPTY_PROFILE: CitizenProfile = {
  username: '',
  email: '',
  fullName: '',
  gender: '',
  dateOfBirth: '',
  avatar: '',
};

export function loadCitizenProfile(): CitizenProfile {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...EMPTY_PROFILE };
    const parsed = JSON.parse(raw) as Partial<CitizenProfile>;
    return { ...EMPTY_PROFILE, ...parsed };
  } catch {
    return { ...EMPTY_PROFILE };
  }
}

export function saveCitizenProfile(profile: CitizenProfile): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  } catch {}
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

export function readAvatarFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'));
    reader.onload = () => {
      const raw = String(reader.result);
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = AVATAR_SIZE;
          canvas.height = AVATAR_SIZE;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(raw);
            return;
          }
          const scale = Math.min(AVATAR_SIZE / img.width, AVATAR_SIZE / img.height, 1);
          const w = img.width * scale;
          const h = img.height * scale;
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, AVATAR_SIZE, AVATAR_SIZE);
          ctx.drawImage(img, (AVATAR_SIZE - w) / 2, (AVATAR_SIZE - h) / 2, w, h);
          resolve(canvas.toDataURL('image/jpeg', 0.85));
        } catch {
          resolve(raw);
        }
      };
      img.onerror = () => resolve(raw);
      img.src = raw;
    };
    reader.readAsDataURL(file);
  });
}
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebase';

export interface PlatformLimits {
  maxNotesPerUser: number; // 0 = ilimitado, or e.g. 50, 100, 500
  maxAttachmentSizeMB: number; // default 25 MB
  allowPublicSharing: boolean; // default true
  allowUserRegistration: boolean; // default true
  allowAnonymousNotes: boolean; // default true
  maintenanceMode: boolean; // default false
  announcementBanner: string; // broadcast banner for all visitors
  announcementActive: boolean;
}

const SETTINGS_STORAGE_KEY = '7notpad_platform_settings';

export const DEFAULT_PLATFORM_LIMITS: PlatformLimits = {
  maxNotesPerUser: 0, // 0 = ilimitado
  maxAttachmentSizeMB: 25,
  allowPublicSharing: true,
  allowUserRegistration: true,
  allowAnonymousNotes: true,
  maintenanceMode: false,
  announcementBanner: '',
  announcementActive: false,
};

type LimitsListener = (limits: PlatformLimits) => void;
const listeners = new Set<LimitsListener>();

export const PlatformSettingsService = {
  getLimits(): PlatformLimits {
    try {
      const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (raw) {
        return { ...DEFAULT_PLATFORM_LIMITS, ...JSON.parse(raw) };
      }
    } catch {}
    return { ...DEFAULT_PLATFORM_LIMITS };
  },

  async fetchLimits(): Promise<PlatformLimits> {
    const local = this.getLimits();
    try {
      const ref = doc(db, 'settings', 'platform_limits');
      const snap = await Promise.race([
        getDoc(ref),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 1500))
      ]);
      if (snap && snap.exists()) {
        const cloudData = snap.data() as Partial<PlatformLimits>;
        const merged: PlatformLimits = { ...local, ...cloudData };
        this.saveLocally(merged);
        return merged;
      }
    } catch {}
    return local;
  },

  saveLocally(limits: PlatformLimits) {
    try {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(limits));
      listeners.forEach((fn) => {
        try {
          fn(limits);
        } catch {}
      });
    } catch {}
  },

  async updateLimits(partial: Partial<PlatformLimits>): Promise<PlatformLimits> {
    const current = this.getLimits();
    const updated: PlatformLimits = { ...current, ...partial };
    this.saveLocally(updated);

    try {
      const ref = doc(db, 'settings', 'platform_limits');
      await Promise.race([
        setDoc(ref, updated, { merge: true }),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 1500))
      ]);
    } catch (err) {
      console.warn('Could not sync platform limits to cloud:', err);
    }

    return updated;
  },

  subscribe(listener: LimitsListener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }
};


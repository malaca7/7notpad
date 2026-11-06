import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import { CloudShareService } from './cloudShare';

export type AnnouncementType = 'info' | 'warning' | 'critical' | 'success';
export type AnnouncementAudience = 'all' | 'authenticated' | 'anonymous';

export interface AnnouncementItem {
  id: string;
  title?: string;
  message: string;
  type: AnnouncementType; // 'info' | 'warning' | 'critical' | 'success'
  audience: AnnouncementAudience; // 'all' | 'authenticated' | 'anonymous'
  is_active: boolean;
  link_url?: string;
  link_text?: string;
  dismissible?: boolean;
  created_at: string;
  updated_at: string;
}

export interface PlatformLimits {
  maxNotesPerUser: number; // 0 = ilimitado, or e.g. 50, 100, 500
  maxAttachmentSizeMB: number; // default 25 MB
  allowPublicSharing: boolean; // default true
  allowUserRegistration: boolean; // default true
  allowAnonymousNotes: boolean; // default true
  maintenanceMode: boolean; // default false
  announcements?: AnnouncementItem[]; // Multiple announcements
  // Legacy fields kept synchronized with active announcements for 100% backward compatibility:
  announcementBanner: string; // broadcast banner for all visitors
  announcementActive: boolean;
  announcementType?: AnnouncementType; // visual variant: info, warning, critical, success
  announcementLink?: string; // optional call-to-action URL
  announcementLinkLabel?: string; // e.g. "Saiba mais", "Ver detalhes"
  announcementDismissible?: boolean; // user can close banner for session
  announcementAudience?: AnnouncementAudience; // 'all' | 'authenticated' | 'anonymous'
}

const SETTINGS_STORAGE_KEY = '7notpad_platform_settings';

export const DEFAULT_PLATFORM_LIMITS: PlatformLimits = {
  maxNotesPerUser: 0, // 0 = ilimitado
  maxAttachmentSizeMB: 25,
  allowPublicSharing: true,
  allowUserRegistration: true,
  allowAnonymousNotes: true,
  maintenanceMode: false,
  announcements: [],
  announcementBanner: '',
  announcementActive: false,
  announcementType: 'info',
  announcementLink: '',
  announcementLinkLabel: 'Saiba mais',
  announcementDismissible: true,
  announcementAudience: 'all',
};

function normalizeAnnouncements(data: Partial<PlatformLimits>): AnnouncementItem[] {
  if (Array.isArray(data.announcements) && data.announcements.length > 0) {
    return data.announcements.map((a, idx) => ({
      id: a.id || `ann_${Date.now()}_${idx}`,
      title: a.title || '',
      message: a.message || '',
      type: a.type || 'info',
      audience: a.audience || 'all',
      is_active: a.is_active !== false,
      link_url: a.link_url || '',
      link_text: a.link_text || 'Saiba mais',
      dismissible: a.dismissible !== false,
      created_at: a.created_at || new Date().toISOString(),
      updated_at: a.updated_at || new Date().toISOString(),
    }));
  }

  // Fallback to legacy single banner if present
  if (data.announcementBanner && data.announcementBanner.trim()) {
    return [
      {
        id: 'ann_legacy_initial',
        title: '',
        message: data.announcementBanner.trim(),
        type: data.announcementType || 'info',
        audience: data.announcementAudience || 'all',
        is_active: data.announcementActive !== false,
        link_url: data.announcementLink || '',
        link_text: data.announcementLinkLabel || 'Saiba mais',
        dismissible: data.announcementDismissible !== false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];
  }

  return [];
}

type LimitsListener = (limits: PlatformLimits) => void;
const listeners = new Set<LimitsListener>();

export const PlatformSettingsService = {
  getLimits(): PlatformLimits {
    try {
      const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        const announcements = normalizeAnnouncements(parsed);
        const firstActive = announcements.find((a) => a.is_active);
        return {
          ...DEFAULT_PLATFORM_LIMITS,
          ...parsed,
          announcements,
          announcementActive: Boolean(firstActive),
          announcementBanner: firstActive ? firstActive.message : (parsed.announcementBanner || ''),
        };
      }
    } catch {}
    return { ...DEFAULT_PLATFORM_LIMITS, announcements: [] };
  },

  async fetchLimits(): Promise<PlatformLimits> {
    const local = this.getLimits();

    // 1. Fetch from CloudShareService global cloud settings
    try {
      const cloudSettings = await CloudShareService.fetchPlatformSettingsFromCloud();
      if (cloudSettings && typeof cloudSettings === 'object') {
        const announcements = normalizeAnnouncements(cloudSettings);
        const firstActive = announcements.find((a) => a.is_active);
        const merged: PlatformLimits = {
          ...local,
          ...cloudSettings,
          announcements,
          announcementActive: Boolean(firstActive),
          announcementBanner: firstActive ? firstActive.message : (cloudSettings.announcementBanner || local.announcementBanner),
        };
        this.saveLocally(merged);
        return merged;
      }
    } catch {}

    // 2. Fallback to Firestore non-blocking with short timeout
    try {
      const ref = doc(db, 'settings', 'platform_limits');
      const snap = await Promise.race([
        getDoc(ref),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 1000))
      ]);
      if (snap && snap.exists()) {
        const cloudData = snap.data() as Partial<PlatformLimits>;
        const announcements = normalizeAnnouncements(cloudData);
        const firstActive = announcements.find((a) => a.is_active);
        const merged: PlatformLimits = {
          ...local,
          ...cloudData,
          announcements,
          announcementActive: Boolean(firstActive),
          announcementBanner: firstActive ? firstActive.message : (cloudData.announcementBanner || local.announcementBanner),
        };
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

    // Handle announcements sync
    let mergedAnnouncements: AnnouncementItem[] = partial.announcements !== undefined
      ? partial.announcements
      : current.announcements || [];

    // If caller updated legacy fields directly (e.g. announcementBanner), update first announcement or create one
    if (partial.announcements === undefined && partial.announcementBanner !== undefined) {
      if (mergedAnnouncements.length > 0) {
        mergedAnnouncements = mergedAnnouncements.map((item, idx) =>
          idx === 0
            ? {
                ...item,
                message: partial.announcementBanner || item.message,
                type: partial.announcementType || item.type,
                audience: partial.announcementAudience || item.audience,
                is_active: partial.announcementActive !== undefined ? partial.announcementActive : item.is_active,
                link_url: partial.announcementLink !== undefined ? partial.announcementLink : item.link_url,
                link_text: partial.announcementLinkLabel !== undefined ? partial.announcementLinkLabel : item.link_text,
                dismissible: partial.announcementDismissible !== undefined ? partial.announcementDismissible : item.dismissible,
                updated_at: new Date().toISOString(),
              }
            : item
        );
      } else if (partial.announcementBanner.trim()) {
        mergedAnnouncements = [
          {
            id: `ann_${Date.now()}`,
            message: partial.announcementBanner.trim(),
            type: partial.announcementType || 'info',
            audience: partial.announcementAudience || 'all',
            is_active: partial.announcementActive !== false,
            link_url: partial.announcementLink || '',
            link_text: partial.announcementLinkLabel || 'Saiba mais',
            dismissible: partial.announcementDismissible !== false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ];
      }
    }

    const firstActive = mergedAnnouncements.find((a) => a.is_active);
    const primaryItem = firstActive || mergedAnnouncements[0];

    const updated: PlatformLimits = {
      ...current,
      ...partial,
      announcements: mergedAnnouncements,
      announcementBanner: primaryItem?.message || partial.announcementBanner || '',
      announcementActive: Boolean(firstActive),
      announcementType: primaryItem?.type || partial.announcementType || 'info',
      announcementLink: primaryItem?.link_url || partial.announcementLink || '',
      announcementLinkLabel: primaryItem?.link_text || partial.announcementLinkLabel || 'Saiba mais',
      announcementDismissible: primaryItem ? primaryItem.dismissible !== false : true,
      announcementAudience: primaryItem?.audience || partial.announcementAudience || 'all',
    };

    // 1. Instant local persistence & notify memory listeners (0ms delay)
    this.saveLocally(updated);

    // 2. Broadcast immediately to all open tabs and network devices in real time (0ms delay)
    CloudShareService.syncPlatformSettingsToCloud(updated).catch((err) => {
      console.warn('Could not sync platform limits to CloudShareService:', err);
    });

    // 3. Fallback Firestore non-blocking
    try {
      const ref = doc(db, 'settings', 'platform_limits');
      setDoc(ref, updated, { merge: true }).catch(() => {});
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

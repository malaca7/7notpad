import type { Note, NoteShare } from '../types/note';

const KV_APP_KEY = '05twva90';
const KV_BASE_URL = `https://keyvalue.immanuel.co/api/KeyVal`;
const OBJECTS_API_URL = 'https://api.restful-api.dev/objects';
const CLOUD_IDS_STORAGE_KEY = '7notpad_cloud_object_ids';

// In-memory cache & serialization queues to prevent concurrent race conditions
const memoryCloudIds: Record<string, string> = {};
const inFlightSyncs = new Map<string, Promise<boolean>>();
const pendingSyncPayloads = new Map<string, { note: Note; explicitShare?: NoteShare | null }>();

function getCloudObjectIds(): Record<string, string> {
  try {
    const raw = localStorage.getItem(CLOUD_IDS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return { ...parsed, ...memoryCloudIds };
  } catch {
    return { ...memoryCloudIds };
  }
}

function saveCloudObjectId(key: string, cloudObjectId: string): void {
  if (!key || !cloudObjectId) return;
  memoryCloudIds[key] = cloudObjectId;
  try {
    const raw = localStorage.getItem(CLOUD_IDS_STORAGE_KEY);
    const map = raw ? JSON.parse(raw) : {};
    map[key] = cloudObjectId;
    localStorage.setItem(CLOUD_IDS_STORAGE_KEY, JSON.stringify(map));
  } catch {}
}

function withTimeout<T>(promise: Promise<T>, ms = 4000): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error('Cloud request timeout')), ms)
    ),
  ]);
}

// Sanitize key for keyvalue.immanuel.co path segment (alphanumeric, -, _)
function sanitizeKey(slug: string): string {
  return slug.trim().replace(/[^a-zA-Z0-9-_]/g, '_');
}

async function lookupCloudObjectIdFromKV(slug: string): Promise<string> {
  const cleanKey = sanitizeKey(slug);
  try {
    const kvRes = await withTimeout(
      fetch(`${KV_BASE_URL}/GetValue/${KV_APP_KEY}/${cleanKey}`, {
        cache: 'no-store',
      })
    );
    if (kvRes.ok) {
      const text = await kvRes.text();
      const val = text.replace(/^"+|"+$/g, '').trim();
      if (val && val !== 'null') {
        saveCloudObjectId(slug, val);
        return val;
      }
    }
  } catch {}
  return '';
}

async function performSyncNoteToCloud(note: Note, explicitShare?: NoteShare | null): Promise<boolean> {
  try {
    const now = new Date().toISOString();
    const effectiveShare: NoteShare = explicitShare ?? note.share ?? {
      id: note.id,
      note_id: note.id,
      custom_slug: note.id,
      is_password_protected: false,
      is_active: true,
      created_at: note.created_at,
      updated_at: note.updated_at || now,
      view_count: 0,
    };

    const payload = {
      sync_updated_at: now,
      share: effectiveShare,
      note: {
        id: note.id,
        title: note.title || 'Nota sem título',
        content: note.content || '',
        created_at: note.created_at,
        updated_at: note.updated_at || now,
        attachments: note.attachments || [],
      },
    };

    const cloudIds = getCloudObjectIds();
    let cloudObjectId = cloudIds[note.id] || (effectiveShare.custom_slug ? cloudIds[effectiveShare.custom_slug] : '');

    // If not in local cache yet, check KV store first so all devices share the same object ID
    if (!cloudObjectId) {
      cloudObjectId = await lookupCloudObjectIdFromKV(note.id);
    }

    // 1. Update existing cloud object if we already have an ID
    if (cloudObjectId) {
      const putRes = await withTimeout(
        fetch(`${OBJECTS_API_URL}/${cloudObjectId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: `7notpad_${note.id}`,
            data: payload,
          }),
        })
      );
      if (!putRes.ok) {
        cloudObjectId = '';
      }
    }

    // 2. Otherwise create a new cloud object
    if (!cloudObjectId) {
      const postRes = await withTimeout(
        fetch(OBJECTS_API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: `7notpad_${note.id}`,
            data: payload,
          }),
        })
      );
      if (!postRes.ok) return false;
      const postData = await postRes.json();
      cloudObjectId = postData?.id;
      if (!cloudObjectId) return false;
    }

    saveCloudObjectId(note.id, cloudObjectId);
    if (effectiveShare.custom_slug) {
      saveCloudObjectId(effectiveShare.custom_slug, cloudObjectId);
    }

    // 3. Map both note.id and custom_slug -> cloudObjectId in KV store
    const keysToMap = new Set<string>([sanitizeKey(note.id)]);
    if (effectiveShare.custom_slug) {
      keysToMap.add(sanitizeKey(effectiveShare.custom_slug));
    }

    await Promise.all(
      Array.from(keysToMap).map((k) =>
        withTimeout(
          fetch(`${KV_BASE_URL}/UpdateValue/${KV_APP_KEY}/${k}/${cloudObjectId}`, {
            method: 'POST',
          })
        ).catch(() => null)
      )
    );

    return true;
  } catch (err) {
    console.warn('CloudShareService.syncNoteToCloud warning:', err);
    return false;
  }
}

export const CloudShareService = {
  /**
   * Save or update a note & its share state in the cloud (serialized per note.id so rapid updates never race)
   */
  async syncNoteToCloud(note: Note, explicitShare?: NoteShare | null): Promise<boolean> {
    const existingPromise = inFlightSyncs.get(note.id);
    if (existingPromise) {
      // Queue latest state so as soon as current request finishes, the newest state is synced
      pendingSyncPayloads.set(note.id, { note, explicitShare });
      return existingPromise;
    }

    const runLoop = async (): Promise<boolean> => {
      let ok = await performSyncNoteToCloud(note, explicitShare);
      while (pendingSyncPayloads.has(note.id)) {
        const next = pendingSyncPayloads.get(note.id)!;
        pendingSyncPayloads.delete(note.id);
        ok = await performSyncNoteToCloud(next.note, next.explicitShare);
      }
      inFlightSyncs.delete(note.id);
      return ok;
    };

    const promise = runLoop();
    inFlightSyncs.set(note.id, promise);
    return promise;
  },

  /**
   * Fetch a shared note by its unique ID or custom slug from any browser (bypassing HTTP cache)
   */
  async fetchNoteFromCloud(slug: string): Promise<{
    found: boolean;
    share?: NoteShare;
    note?: Partial<Note>;
    rawContent?: string;
    syncUpdatedAt?: string;
    error?: string;
  }> {
    try {
      const cleanKey = sanitizeKey(slug);
      const cachedIds = getCloudObjectIds();
      let cloudObjectId = cachedIds[slug] || cachedIds[cleanKey] || '';

      // 1. Look up cloudObjectId from KV store if not cached yet
      if (!cloudObjectId) {
        cloudObjectId = await lookupCloudObjectIdFromKV(slug);
      }

      // If slug itself looks like a direct hex objectId (24-36 hex chars), try it directly as fallback
      if (!cloudObjectId && /^[a-f0-9]{24,36}$/i.test(cleanKey)) {
        cloudObjectId = cleanKey;
      }

      if (!cloudObjectId || cloudObjectId === 'null') {
        return { found: false };
      }

      // 2. Fetch full note payload from Objects API with cache: 'no-store'
      let objRes = await withTimeout(
        fetch(`${OBJECTS_API_URL}/${cloudObjectId}`, {
          cache: 'no-store',
        })
      );

      // If cached cloudObjectId became stale/replaced, re-query KV store once
      if (!objRes.ok) {
        const freshId = await lookupCloudObjectIdFromKV(slug);
        if (freshId && freshId !== cloudObjectId) {
          cloudObjectId = freshId;
          objRes = await withTimeout(
            fetch(`${OBJECTS_API_URL}/${cloudObjectId}`, {
              cache: 'no-store',
            })
          );
        }
      }

      if (!objRes.ok) {
        return { found: false };
      }

      const objJson = await objRes.json();
      const data = objJson?.data;
      if (!data || !data.note || !data.share) {
        return { found: false };
      }

      // Cache mapping for fast 1-hop polling on subsequent ticks
      saveCloudObjectId(slug, cloudObjectId);
      if (data.note.id) {
        saveCloudObjectId(data.note.id, cloudObjectId);
      }

      const share: NoteShare = data.share;
      if (share.is_active === false) {
        return {
          found: false,
          share,
          error: 'O compartilhamento desta nota foi desativado pelo proprietário.',
        };
      }

      const isProtected = Boolean(share.is_password_protected);
      const rawContent = data.note.content || '';

      return {
        found: true,
        share,
        rawContent,
        syncUpdatedAt: data.sync_updated_at || share.updated_at || data.note.updated_at,
        note: {
          id: data.note.id,
          title: data.note.title || 'Nota sem título',
          content: isProtected ? '' : rawContent,
          created_at: data.note.created_at,
          updated_at: data.note.updated_at,
          attachments: data.note.attachments || [],
        },
      };
    } catch (err) {
      console.warn('CloudShareService.fetchNoteFromCloud error:', err);
      return { found: false };
    }
  },
};

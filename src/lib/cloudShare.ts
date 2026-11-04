import type { Note, NoteShare } from '../types/note';

const KV_APP_KEY = '05twva90';
const KV_BASE_URL = `https://keyvalue.immanuel.co/api/KeyVal`;
const OBJECTS_API_URL = 'https://api.restful-api.dev/objects';
const CLOUD_IDS_STORAGE_KEY = '7notpad_cloud_object_ids';

function getCloudObjectIds(): Record<string, string> {
  try {
    const raw = localStorage.getItem(CLOUD_IDS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveCloudObjectId(noteId: string, cloudObjectId: string): void {
  try {
    const map = getCloudObjectIds();
    map[noteId] = cloudObjectId;
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

export const CloudShareService = {
  /**
   * Save or update a note & its share state in the cloud so `/notpad/<ID>` works in any browser
   */
  async syncNoteToCloud(note: Note, explicitShare?: NoteShare | null): Promise<boolean> {
    try {
      const effectiveShare: NoteShare = explicitShare ?? note.share ?? {
        id: note.id,
        note_id: note.id,
        custom_slug: note.id,
        is_password_protected: false,
        is_active: true,
        created_at: note.created_at,
        updated_at: note.updated_at,
        view_count: 0,
      };

      const payload = {
        share: effectiveShare,
        note: {
          id: note.id,
          title: note.title || 'Nota sem título',
          content: note.content || '',
          created_at: note.created_at,
          updated_at: note.updated_at,
          attachments: note.attachments || [],
        },
      };

      const cloudIds = getCloudObjectIds();
      let cloudObjectId = cloudIds[note.id];

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
        saveCloudObjectId(note.id, cloudObjectId);
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
  },

  /**
   * Fetch a shared note by its unique ID or custom slug from any browser
   */
  async fetchNoteFromCloud(slug: string): Promise<{
    found: boolean;
    share?: NoteShare;
    note?: Partial<Note>;
    rawContent?: string;
    error?: string;
  }> {
    try {
      const cleanKey = sanitizeKey(slug);

      // 1. Look up cloudObjectId from KV store
      let cloudObjectId = '';
      try {
        const kvRes = await withTimeout(
          fetch(`${KV_BASE_URL}/GetValue/${KV_APP_KEY}/${cleanKey}`)
        );
        if (kvRes.ok) {
          const text = await kvRes.text();
          cloudObjectId = text.replace(/^"+|"+$/g, '').trim();
        }
      } catch {}

      // If slug itself looks like a direct hex objectId (32 hex chars), try it directly as fallback
      if (!cloudObjectId && /^[a-f0-9]{24,36}$/i.test(cleanKey)) {
        cloudObjectId = cleanKey;
      }

      if (!cloudObjectId || cloudObjectId === 'null') {
        return { found: false };
      }

      // 2. Fetch full note payload from Objects API
      const objRes = await withTimeout(fetch(`${OBJECTS_API_URL}/${cloudObjectId}`));
      if (!objRes.ok) {
        return { found: false };
      }

      const objJson = await objRes.json();
      const data = objJson?.data;
      if (!data || !data.note || !data.share) {
        return { found: false };
      }

      const share: NoteShare = data.share;
      if (share.is_active === false) {
        return {
          found: false,
          error: 'O compartilhamento desta nota foi desativado pelo proprietário.',
        };
      }

      const isProtected = Boolean(share.is_password_protected);
      const rawContent = data.note.content || '';

      return {
        found: true,
        share,
        rawContent,
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

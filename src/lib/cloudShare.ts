import type { Note, NoteShare } from '../types/note';

const KV_APP_KEY = '05twva90';
const KV_BASE_URL = `https://keyvalue.immanuel.co/api/KeyVal`;
const TELEGRAPH_API_URL = 'https://api.telegra.ph';
const TELEGRAPH_DEFAULT_TOKEN = '58462b400e5834a86409addac7e876e3f1648478034b60f910f8a64c578e';
const NTFY_BASE_URL = 'https://ntfy.sh';
const CLOUD_IDS_STORAGE_KEY = '7notpad_cloud_paths_v2';
const GLOBAL_NOTES_CATALOG_KEY = '7notpad_global_notes_catalog_v2';
const GLOBAL_REALTIME_TOPIC = '7notpad_global_events_v2';
const GLOBAL_CHANNEL_NAME = '7notpad_global_realtime_events';

// Client Session ID to filter out self-echo in SSE pub/sub
let clientSessionId = '';
function getClientSessionId(): string {
  if (!clientSessionId) {
    try {
      const stored = sessionStorage.getItem('7notpad_session_id');
      if (stored) {
        clientSessionId = stored;
      } else {
        clientSessionId = `client_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        sessionStorage.setItem('7notpad_session_id', clientSessionId);
      }
    } catch {
      clientSessionId = `client_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    }
  }
  return clientSessionId;
}

let globalBroadcastChannel: BroadcastChannel | null = null;
try {
  if (typeof BroadcastChannel !== 'undefined') {
    globalBroadcastChannel = new BroadcastChannel(GLOBAL_CHANNEL_NAME);
  }
} catch {}

/**
 * Publish global real-time event to all screens/devices via Ntfy SSE + local BroadcastChannel
 */
export function publishGlobalRealtimeEvent(payload: Record<string, any>): void {
  const fullPayload = {
    ...payload,
    clientId: getClientSessionId(),
    timestamp: Date.now(),
  };

  // 1. Instant local inter-tab broadcast (0ms delay)
  try {
    globalBroadcastChannel?.postMessage(fullPayload);
  } catch {}

  // 2. Cross-device and cross-network SSE pub/sub via Ntfy
  try {
    fetch(`${NTFY_BASE_URL}/${GLOBAL_REALTIME_TOPIC}`, {
      method: 'POST',
      body: JSON.stringify(fullPayload),
      headers: {
        'Title': payload.type || '7notpad_event',
        'Priority': 'default',
      },
    }).catch(() => {});
  } catch {}
}

/**
 * Subscribe to global real-time events across all screens, tabs, and devices
 */
export function subscribeToGlobalRealtimeEvents(listener: (event: any) => void): () => void {
  const myId = getClientSessionId();

  // Local BroadcastChannel listener
  const handleBc = (evt: MessageEvent) => {
    if (evt.data && evt.data.clientId !== myId) {
      try {
        listener(evt.data);
      } catch (err) {
        console.warn('Broadcast listener warning:', err);
      }
    }
  };

  try {
    globalBroadcastChannel?.addEventListener('message', handleBc);
  } catch {}

  // Cross-device SSE listener with auto-reconnect
  let es: EventSource | null = null;
  let reconnectTimer: any = null;
  let isClosed = false;

  const connect = () => {
    if (isClosed || typeof EventSource === 'undefined') return;
    try {
      es = new EventSource(`${NTFY_BASE_URL}/${GLOBAL_REALTIME_TOPIC}/sse`);

      es.onmessage = (event) => {
        try {
          if (!event.data) return;
          const parsed = JSON.parse(event.data);
          let messageData = parsed;
          if (parsed.message && typeof parsed.message === 'string') {
            try {
              messageData = JSON.parse(parsed.message);
            } catch {
              messageData = parsed;
            }
          }
          if (messageData && messageData.clientId !== myId) {
            listener(messageData);
          }
        } catch {}
      };

      es.onerror = () => {
        es?.close();
        es = null;
        if (!isClosed && !reconnectTimer) {
          reconnectTimer = setTimeout(() => {
            reconnectTimer = null;
            connect();
          }, 3500);
        }
      };
    } catch {}
  };

  connect();

  return () => {
    isClosed = true;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    try {
      globalBroadcastChannel?.removeEventListener('message', handleBc);
    } catch {}
    try {
      es?.close();
    } catch {}
  };
}

// Known stable cloud paths for immediate fast bootstrap across all devices
const DEFAULT_KNOWN_PATHS: Record<string, string> = {
  '7notpad_global_notes_catalog_v2': '7np-11-05-37',
  '7notpad_global_users_store_v2': '7np-11-05-5',
  '7notpad_users_directory_v2': '7np-11-05-32',
  '7notpad_platform_settings_v2': '7np-11-05-69',
  '7notpad_announcement_reads_v2': '7np-11-05-72',
};

// In-memory cache & serialization queues to prevent concurrent race conditions
const memoryCloudPaths: Record<string, string> = { ...DEFAULT_KNOWN_PATHS };
const inFlightSyncs = new Map<string, Promise<boolean>>();
const pendingSyncPayloads = new Map<string, { note: Note; explicitShare?: NoteShare | null }>();

function isValidTelegraphPath(val: string): boolean {
  if (!val || val === 'null') return false;
  // Reject legacy 32-char hex IDs from restful-api.dev
  if (/^[0-9a-f]{32}$/i.test(val)) return false;
  return val.length >= 4;
}

function getCloudPaths(): Record<string, string> {
  try {
    const raw = localStorage.getItem(CLOUD_IDS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return { ...parsed, ...memoryCloudPaths };
  } catch {
    return { ...memoryCloudPaths };
  }
}

function saveCloudPath(key: string, cloudPath: string): void {
  if (!key || !isValidTelegraphPath(cloudPath)) return;
  memoryCloudPaths[key] = cloudPath;
  try {
    const raw = localStorage.getItem(CLOUD_IDS_STORAGE_KEY);
    const map = raw ? JSON.parse(raw) : {};
    map[key] = cloudPath;
    localStorage.setItem(CLOUD_IDS_STORAGE_KEY, JSON.stringify(map));
  } catch {}
}

function withTimeout<T>(promise: Promise<T>, ms = 4500): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error('Cloud request timeout')), ms)
    ),
  ]);
}

// Sanitize key for keyvalue.immanuel.co and ntfy.sh topic names (alphanumeric, -, _)
function sanitizeKey(slug: string): string {
  return slug.trim().replace(/[^a-zA-Z0-9-_]/g, '_');
}

async function lookupCloudPathFromKV(slug: string): Promise<string> {
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
      if (isValidTelegraphPath(val)) {
        saveCloudPath(slug, val);
        return val;
      }
    }
  } catch {}
  return '';
}

/**
 * Save JSON document to Telegraph (unlimited requests, CORS: *, permanent) + KV index + Ntfy backup
 */
async function saveCloudDocument(
  primaryKey: string,
  data: Record<string, any>,
  extraKeys: string[] = []
): Promise<string> {
  const cleanPrimary = sanitizeKey(primaryKey);
  const paths = getCloudPaths();
  let cloudPath = paths[primaryKey] || paths[cleanPrimary] || '';

  if (!isValidTelegraphPath(cloudPath)) {
    cloudPath = await lookupCloudPathFromKV(primaryKey);
  }

  const serializedData = JSON.stringify(data);
  const contentNodes = JSON.stringify([{ tag: 'p', children: [serializedData] }]);

  // 1. Update existing Telegraph page in-place if path exists
  if (isValidTelegraphPath(cloudPath)) {
    try {
      const form = new URLSearchParams();
      form.set('access_token', TELEGRAPH_DEFAULT_TOKEN);
      form.set('title', '7np');
      form.set('content', contentNodes);

      const editRes = await withTimeout(
        fetch(`${TELEGRAPH_API_URL}/editPage/${cloudPath}`, {
          method: 'POST',
          body: form,
        })
      );
      if (editRes.ok) {
        const editJson = await editRes.json();
        if (!editJson?.ok) {
          cloudPath = '';
        }
      } else {
        cloudPath = '';
      }
    } catch {
      cloudPath = '';
    }
  }

  // 2. Create new Telegraph page if needed (short title '7np' keeps path short for KV index)
  if (!isValidTelegraphPath(cloudPath)) {
    try {
      const form = new URLSearchParams();
      form.set('access_token', TELEGRAPH_DEFAULT_TOKEN);
      form.set('title', '7np');
      form.set('content', contentNodes);

      const createRes = await withTimeout(
        fetch(`${TELEGRAPH_API_URL}/createPage`, {
          method: 'POST',
          body: form,
        })
      );
      if (createRes.ok) {
        const createJson = await createRes.json();
        if (createJson?.ok && createJson?.result?.path) {
          cloudPath = createJson.result.path;
        }
      }
    } catch {}
  }

  const allKeys = Array.from(new Set([primaryKey, ...extraKeys].filter(Boolean)));

  if (isValidTelegraphPath(cloudPath)) {
    for (const k of allKeys) {
      saveCloudPath(k, cloudPath);
    }

    // Update KV index for all keys (note.id and custom_slug)
    await Promise.all(
      allKeys.map((k) =>
        withTimeout(
          fetch(`${KV_BASE_URL}/UpdateValue/${KV_APP_KEY}/${sanitizeKey(k)}/${cloudPath}`, {
            method: 'POST',
          })
        ).catch(() => null)
      )
    );
  }

  // 3. Also publish to Ntfy real-time backup channel (either full payload or telegraph_path pointer)
  const ntfyPayload =
    serializedData.length < 3500
      ? JSON.stringify({ ...data, _telegraph_path: cloudPath })
      : JSON.stringify({ _telegraph_path: cloudPath });

  for (const k of allKeys) {
    fetch(`${NTFY_BASE_URL}/7notpad_doc_${sanitizeKey(k)}`, {
      method: 'POST',
      body: ntfyPayload,
    }).catch(() => {});
  }

  return cloudPath || 'ntfy_synced';
}

/**
 * Fetch JSON document by key from Telegraph (via KV index) or Ntfy fallback
 */
async function fetchCloudDocument(key: string): Promise<Record<string, any> | null> {
  const cleanKey = sanitizeKey(key);
  const paths = getCloudPaths();
  let cloudPath = paths[key] || paths[cleanKey] || '';

  if (!isValidTelegraphPath(cloudPath)) {
    cloudPath = await lookupCloudPathFromKV(key);
  }

  const parseTelegraphResponse = async (pathToFetch: string): Promise<Record<string, any> | null> => {
    try {
      const res = await withTimeout(
        fetch(`${TELEGRAPH_API_URL}/getPage/${pathToFetch}?return_content=true&_t=${Date.now()}`, {
          cache: 'no-store',
        })
      );
      if (!res.ok) return null;
      const json = await res.json();
      const rawText = json?.result?.content?.[0]?.children?.[0];
      if (typeof rawText === 'string' && rawText.trim().startsWith('{')) {
        return JSON.parse(rawText);
      }
    } catch {}
    return null;
  };

  if (isValidTelegraphPath(cloudPath)) {
    let doc = await parseTelegraphResponse(cloudPath);
    if (!doc) {
      const freshPath = await lookupCloudPathFromKV(key);
      if (isValidTelegraphPath(freshPath) && freshPath !== cloudPath) {
        cloudPath = freshPath;
        doc = await parseTelegraphResponse(cloudPath);
      }
    }
    if (doc) {
      saveCloudPath(key, cloudPath);
      return doc;
    }
  }

  // Fallback: check Ntfy cached stream for this key
  try {
    const ntfyRes = await withTimeout(
      fetch(`${NTFY_BASE_URL}/7notpad_doc_${cleanKey}/json?poll=1&since=all`, {
        cache: 'no-store',
      })
    );
    if (ntfyRes.ok) {
      const text = (await ntfyRes.text()).trim();
      if (text) {
        const lines = text.split('\n').filter(Boolean);
        for (let i = lines.length - 1; i >= 0; i--) {
          try {
            const event = JSON.parse(lines[i]);
            if (event?.event === 'message' && typeof event.message === 'string') {
              const parsed = JSON.parse(event.message);
              if (parsed && typeof parsed === 'object') {
                if (parsed.note || parsed.users || parsed.config) {
                  if (parsed._telegraph_path && isValidTelegraphPath(parsed._telegraph_path)) {
                    saveCloudPath(key, parsed._telegraph_path);
                  }
                  return parsed;
                }
                if (parsed._telegraph_path && isValidTelegraphPath(parsed._telegraph_path)) {
                  const fromTelegraph = await parseTelegraphResponse(parsed._telegraph_path);
                  if (fromTelegraph) {
                    saveCloudPath(key, parsed._telegraph_path);
                    return fromTelegraph;
                  }
                }
              }
            }
          } catch {}
        }
      }
    }
  } catch {}

  return null;
}

async function performSyncNoteToCloud(note: Note, explicitShare?: NoteShare | null): Promise<boolean> {
  try {
    const now = new Date().toISOString();
    const effectiveShare: NoteShare = {
      ...(explicitShare ?? note.share ?? {
        id: note.id,
        note_id: note.id,
        custom_slug: note.id,
        is_password_protected: false,
        is_active: true,
        created_at: note.created_at,
        updated_at: note.updated_at || now,
        view_count: 0,
      }),
      owner_token: note.owner_token,
      owner_user_id: note.user_id,
      owner_username: note.owner_username,
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
        owner_token: note.owner_token,
        user_id: note.user_id,
        owner_username: note.owner_username,
        attachments: note.attachments || [],
      },
    };

    const extraKeys =
      effectiveShare.custom_slug && effectiveShare.custom_slug !== note.id
        ? [effectiveShare.custom_slug]
        : [];

    const savedPath = await saveCloudDocument(note.id, payload, extraKeys);

    // Also sync to global catalog & broadcast real-time update
    CloudShareService.syncNoteToGlobalCatalog(note, effectiveShare).catch(() => {});

    return Boolean(savedPath);
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
      const data = await fetchCloudDocument(slug);
      if (!data || !data.note || !data.share) {
        return { found: false };
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
          owner_token: data.note.owner_token || share.owner_token,
          user_id: data.note.user_id || share.owner_user_id,
          owner_username: data.note.owner_username || share.owner_username,
          attachments: data.note.attachments || [],
        },
      };
    } catch (err) {
      console.warn('CloudShareService.fetchNoteFromCloud error:', err);
      return { found: false };
    }
  },

  /**
   * Sync a public platform user profile (@username) so all users can discover and share notes with @username
   */
  async syncPlatformUser(user: { id: string; username: string; full_name: string }): Promise<void> {
    try {
      const dirKey = '7notpad_users_directory_v2';
      let existingUsers: Array<{ id: string; username: string; full_name: string }> = [
        { id: 'usr_malaca_admin', username: 'malaca', full_name: 'Malaca' },
      ];

      const currentDoc = await fetchCloudDocument(dirKey);
      if (currentDoc && Array.isArray(currentDoc.users)) {
        existingUsers = currentDoc.users;
      }

      const cleanUsername = user.username.trim().toLowerCase().replace(/^@+/, '');
      const filtered = existingUsers.filter((u) => u.username.toLowerCase() !== cleanUsername);
      filtered.unshift({
        id: user.id,
        username: cleanUsername,
        full_name: user.full_name || cleanUsername,
      });

      await saveCloudDocument(dirKey, { users: filtered });
    } catch {}
  },

  /**
   * Save or update a full user profile in the global cloud users database
   */
  async syncGlobalUser(user: Record<string, any>): Promise<void> {
    try {
      const usersKey = '7notpad_global_users_store_v2';
      let existingUsers: Record<string, any>[] = [];

      const currentDoc = await fetchCloudDocument(usersKey);
      if (currentDoc && Array.isArray(currentDoc.users)) {
        existingUsers = currentDoc.users;
      }

      const cleanUsername = (user.username || '').trim().toLowerCase().replace(/^@+/, '');
      const existingUser = existingUsers.find(
        (u) => u.id === user.id || u.username?.toLowerCase() === cleanUsername
      );
      const filtered = existingUsers.filter(
        (u) => u.id !== user.id && u.username?.toLowerCase() !== cleanUsername
      );

      // Preserve credentials & security fields if caller passed partial profile object!
      const mergedUser: Record<string, any> = {
        ...(existingUser || {}),
        ...user,
        id: user.id || existingUser?.id || `usr_${cleanUsername}`,
        full_name: user.full_name || existingUser?.full_name || cleanUsername,
        password_salt: user.password_salt || existingUser?.password_salt,
        password_hash: user.password_hash || existingUser?.password_hash,
        security_answer: user.security_answer || existingUser?.security_answer,
        username: cleanUsername,
        updated_at: user.updated_at || new Date().toISOString(),
      };

      filtered.unshift(mergedUser);

      await saveCloudDocument(usersKey, { users: filtered });

      // Also keep public directory in sync
      this.syncPlatformUser({
        id: mergedUser.id,
        username: cleanUsername,
        full_name: mergedUser.full_name || cleanUsername,
      }).catch(() => {});

      // Broadcast user updated to all screens in real time
      publishGlobalRealtimeEvent({
        type: 'user_updated',
        userId: mergedUser.id,
        username: cleanUsername,
        role: mergedUser.role,
        is_banned: Boolean(mergedUser.is_banned),
      });
    } catch (err) {
      console.warn('CloudShareService.syncGlobalUser warning:', err);
    }
  },

  /**
   * Fetch all registered users from the global cloud users database
   */
  async fetchGlobalUsers(): Promise<Record<string, any>[]> {
    try {
      const usersKey = '7notpad_global_users_store_v2';
      const doc = await fetchCloudDocument(usersKey);
      if (doc && Array.isArray(doc.users)) {
        return doc.users;
      }
      return [];
    } catch {
      return [];
    }
  },

  /**
   * Delete a user from the global cloud users database
   */
  async deleteGlobalUser(userId: string): Promise<void> {
    try {
      const usersKey = '7notpad_global_users_store_v2';
      const doc = await fetchCloudDocument(usersKey);
      if (doc && Array.isArray(doc.users)) {
        const remaining = doc.users.filter((u: any) => u.id !== userId);
        await saveCloudDocument(usersKey, { users: remaining });
      }

      // Also remove from directory
      const dirKey = '7notpad_users_directory_v2';
      const dirDoc = await fetchCloudDocument(dirKey);
      if (dirDoc && Array.isArray(dirDoc.users)) {
        const remainingDir = dirDoc.users.filter((u: any) => u.id !== userId);
        await saveCloudDocument(dirKey, { users: remainingDir });
      }

      // Broadcast user deleted to all screens in real time
      publishGlobalRealtimeEvent({
        type: 'user_deleted',
        userId,
      });
    } catch {}
  },

  /**
   * Real-time Pub/Sub helpers
   */
  publishGlobalRealtimeEvent,
  subscribeToGlobalRealtimeEvents,

  /**
   * Fetch all notes stored in the global cloud catalog
   */
  async fetchAllNotesFromGlobalCatalog(): Promise<Note[]> {
    try {
      const doc = await fetchCloudDocument(GLOBAL_NOTES_CATALOG_KEY);
      if (doc && Array.isArray(doc.notes)) {
        return doc.notes;
      }
      return [];
    } catch {
      return [];
    }
  },

  /**
   * Save or update a note in the global cloud catalog & notify real-time subscribers
   */
  async syncNoteToGlobalCatalog(note: Note, explicitShare?: NoteShare | null): Promise<void> {
    try {
      // Do not store welcome notes in global cloud catalog
      if (note.local_id === 'default_welcome_note' || note.title?.includes('Bem-vindo')) {
        return;
      }

      const existing = await this.fetchAllNotesFromGlobalCatalog();
      const now = new Date().toISOString();
      const effectiveShare: NoteShare | undefined = explicitShare ?? note.share ?? undefined;

      const cleanNote: Note = {
        ...note,
        updated_at: note.updated_at || now,
        share: effectiveShare,
      };

      const filtered = existing.filter(
        (n) =>
          n.id !== note.id &&
          (note.local_id ? n.local_id !== note.local_id : true) &&
          n.local_id !== 'default_welcome_note' &&
          !n.title?.includes('Bem-vindo')
      );
      filtered.unshift(cleanNote);

      await saveCloudDocument(GLOBAL_NOTES_CATALOG_KEY, {
        notes: filtered,
        updated_at: now,
      });

      publishGlobalRealtimeEvent({
        type: 'note_updated',
        noteId: note.id,
        userId: note.user_id,
        owner_username: note.owner_username,
        title: note.title,
      });
    } catch (err) {
      console.warn('CloudShareService.syncNoteToGlobalCatalog warning:', err);
    }
  },

  /**
   * Delete a note from the global cloud catalog & broadcast event
   */
  async deleteNoteFromGlobalCatalog(noteId: string): Promise<void> {
    try {
      const existing = await this.fetchAllNotesFromGlobalCatalog();
      const filtered = existing.filter((n) => n.id !== noteId && n.local_id !== noteId);

      await saveCloudDocument(GLOBAL_NOTES_CATALOG_KEY, {
        notes: filtered,
        updated_at: new Date().toISOString(),
      });

      publishGlobalRealtimeEvent({
        type: 'note_deleted',
        noteId,
      });
    } catch (err) {
      console.warn('CloudShareService.deleteNoteFromGlobalCatalog warning:', err);
    }
  },

  /**
   * Fetch public platform users directory (@malaca + registered users)
   */
  async fetchPlatformUsers(): Promise<Array<{ id: string; username: string; full_name: string }>> {
    const fallback = [{ id: 'usr_malaca_admin', username: 'malaca', full_name: 'Malaca' }];
    try {
      const dirKey = '7notpad_users_directory_v2';
      const doc = await fetchCloudDocument(dirKey);
      if (doc && Array.isArray(doc.users)) {
        const map = new Map<string, { id: string; username: string; full_name: string }>();
        for (const u of [...fallback, ...doc.users]) {
          if (u && u.username) {
            map.set(u.username.toLowerCase(), u);
          }
        }
        return Array.from(map.values());
      }
      return fallback;
    } catch {
      return fallback;
    }
  },

  /**
   * Sync global email provider configuration to the cloud so all browsers/visitors can send verification emails
   */
  async syncEmailConfigToCloud(config: Record<string, any>): Promise<void> {
    try {
      const cfgKey = '7notpad_email_config_v2';
      await saveCloudDocument(cfgKey, { config, updated_at: new Date().toISOString() });
    } catch {}
  },

  /**
   * Fetch global email provider configuration from the cloud
   */
  async fetchEmailConfigFromCloud(): Promise<Record<string, any> | null> {
    try {
      const cfgKey = '7notpad_email_config_v2';
      const doc = await fetchCloudDocument(cfgKey);
      if (doc?.config && typeof doc.config === 'object') {
        return doc.config;
      }
      return null;
    } catch {
      return null;
    }
  },

  /**
   * Sync global platform settings & announcement banner to the cloud in real time
   */
  async syncPlatformSettingsToCloud(settings: Record<string, any>): Promise<void> {
    try {
      const cfgKey = '7notpad_platform_settings_v2';
      await saveCloudDocument(cfgKey, { settings, updated_at: new Date().toISOString() });
      publishGlobalRealtimeEvent({
        type: 'settings_updated',
        settings,
      });
    } catch {}
  },

  /**
   * Fetch global platform settings & announcement banner from the cloud
   */
  async fetchPlatformSettingsFromCloud(): Promise<Record<string, any> | null> {
    try {
      const cfgKey = '7notpad_platform_settings_v2';
      const doc = await fetchCloudDocument(cfgKey);
      if (doc?.settings && typeof doc.settings === 'object') {
        return doc.settings;
      }
      return null;
    } catch {
      return null;
    }
  },

  /**
   * Fetch all announcement read receipts from the cloud
   */
  async fetchAnnouncementReads(): Promise<AnnouncementReadReceipt[]> {
    try {
      const cfgKey = '7notpad_announcement_reads_v2';
      const doc = await fetchCloudDocument(cfgKey);
      if (doc && Array.isArray(doc.reads)) {
        return doc.reads;
      }
      return [];
    } catch {
      return [];
    }
  },

  /**
   * Record that a user closed / marked as read the announcement banner
   */
  async recordAnnouncementRead(receipt: Omit<AnnouncementReadReceipt, 'id' | 'read_at'>): Promise<void> {
    try {
      const cfgKey = '7notpad_announcement_reads_v2';
      const existing = await this.fetchAnnouncementReads();
      const readItem: AnnouncementReadReceipt = {
        ...receipt,
        id: `read_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        read_at: new Date().toISOString(),
      };

      // Remove duplicate reads from same user for same banner
      const filtered = existing.filter(
        (r) => !(r.username === receipt.username && r.announcement_banner === receipt.announcement_banner)
      );
      filtered.unshift(readItem);

      await saveCloudDocument(cfgKey, {
        reads: filtered.slice(0, 150),
        updated_at: new Date().toISOString(),
      });

      publishGlobalRealtimeEvent({
        type: 'announcement_read_receipt',
        receipt: readItem,
      });
    } catch {}
  },

  /**
   * Clear all announcement read receipts (e.g. when admin wants to re-display to all users)
   */
  async clearAnnouncementReads(): Promise<void> {
    try {
      const cfgKey = '7notpad_announcement_reads_v2';
      await saveCloudDocument(cfgKey, {
        reads: [],
        updated_at: new Date().toISOString(),
      });
      publishGlobalRealtimeEvent({
        type: 'announcement_reset_dismissals',
      });
    } catch {}
  },
};

export interface AnnouncementReadReceipt {
  id: string;
  user_id?: string;
  username: string;
  full_name: string;
  is_anonymous: boolean;
  read_at: string;
  announcement_banner: string;
}

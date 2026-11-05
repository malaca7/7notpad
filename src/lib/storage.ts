import type { Note, NoteShare } from '../types/note';
import { getOrCreateOwnerToken } from './crypto';
import { FirebaseService } from './firebase';
import { CloudShareService } from './cloudShare';
import { parsePortablePayload, decryptContent, type PortableNoteData } from './portableShare';
import { AuthService } from './authService';

const LOCAL_STORAGE_NOTES_KEY = '7notpad_notes';
const LOCAL_STORAGE_SHARES_KEY = '7notpad_shares';
const PORTABLE_CACHE_KEY = '7notpad_portable_cache_';
const MIGRATED_FLAG_KEY = '7notpad_firebase_migrated';

// Real-time cross-tab BroadcastChannel for 0ms synchronization across open screens/tabs
const REALTIME_CHANNEL_NAME = '7notpad_realtime_sync';
let broadcastChannel: BroadcastChannel | null = null;
try {
  if (typeof BroadcastChannel !== 'undefined') {
    broadcastChannel = new BroadcastChannel(REALTIME_CHANNEL_NAME);
  }
} catch {}

// Per-tab in-memory record of unlocked password hashes so other tabs/screens lock immediately when a password is set or changed
const tabUnlockedHashes: Record<string, string> = {};

export function markNoteUnlockedInCurrentTab(noteId: string, passwordHash?: string): void {
  if (noteId && passwordHash) {
    tabUnlockedHashes[noteId] = passwordHash;
  }
}

export function isNoteUnlockedInCurrentTab(noteId: string, passwordHash?: string): boolean {
  if (!passwordHash) return true;
  return tabUnlockedHashes[noteId] === passwordHash;
}

/**
 * Check if the current browser/user is the creator/admin of the note or an authorized @username member.
 * Creator/admin and authorized @username members NEVER need to enter a password!
 */
export function hasDirectNoteAccess(
  note?: Partial<Note> | null,
  share?: NoteShare | null
): { allowed: boolean; isCreator: boolean; matchedUser?: string } {
  const currentOwnerToken = getOrCreateOwnerToken();
  const currentUser = AuthService.getCurrentUser();

  // 1. Check owner_token match (creator in same browser)
  if (
    (note?.owner_token && note.owner_token === currentOwnerToken) ||
    (share?.owner_token && share.owner_token === currentOwnerToken)
  ) {
    return { allowed: true, isCreator: true };
  }

  // 2. Check if note exists in this browser's local notes as owned by this browser
  const noteId = note?.id || share?.note_id;
  if (noteId) {
    try {
      const raw = localStorage.getItem(LOCAL_STORAGE_NOTES_KEY);
      if (raw) {
        const localNotes: Note[] = JSON.parse(raw);
        const found = localNotes.find((n) => n.id === noteId || n.share?.custom_slug === share?.custom_slug);
        if (found && (!found.owner_token || found.owner_token === currentOwnerToken)) {
          return { allowed: true, isCreator: true };
        }
      }
    } catch {}
  }

  // 3. Check logged-in user match (creator by user_id or owner_username, or authorized @username in allowed_users)
  if (currentUser) {
    const myUsername = currentUser.username.trim().toLowerCase().replace(/^@+/, '');

    if (
      (note?.user_id && note.user_id === currentUser.id) ||
      (share?.owner_user_id && share.owner_user_id === currentUser.id) ||
      (note?.owner_username && note.owner_username.toLowerCase() === myUsername) ||
      (share?.owner_username && share.owner_username.toLowerCase() === myUsername)
    ) {
      return { allowed: true, isCreator: true, matchedUser: `@${myUsername}` };
    }

    if (Array.isArray(share?.allowed_users)) {
      const match = share.allowed_users.find(
        (u) => u.username.trim().toLowerCase().replace(/^@+/, '') === myUsername
      );
      if (match) {
        return {
          allowed: true,
          isCreator: match.role === 'admin',
          matchedUser: `@${myUsername}`,
        };
      }
    }
  }

  return { allowed: false, isCreator: false };
}

export function notifyRealtimeSubscribers(payload?: { type: string; noteId?: string; slug?: string }): void {
  try {
    broadcastChannel?.postMessage({ ...payload, timestamp: Date.now() });
  } catch {}
}

export function subscribeToRealtimeSync(callback: () => void): () => void {
  const handleChannelMsg = () => callback();
  const handleStorageEvent = (e: StorageEvent) => {
    if (
      !e.key ||
      e.key === LOCAL_STORAGE_NOTES_KEY ||
      e.key === LOCAL_STORAGE_SHARES_KEY ||
      e.key === '7notpad_cloud_object_ids'
    ) {
      callback();
    }
  };

  let ch: BroadcastChannel | null = null;
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      ch = new BroadcastChannel(REALTIME_CHANNEL_NAME);
      ch.addEventListener('message', handleChannelMsg);
    }
  } catch {}

  window.addEventListener('storage', handleStorageEvent);

  return () => {
    try {
      ch?.removeEventListener('message', handleChannelMsg);
      ch?.close();
    } catch {}
    window.removeEventListener('storage', handleStorageEvent);
  };
}

// Initial starter note with helpful tips
const WELCOME_NOTE_HTML = `
<h2>✨ Bem-vindo ao <strong>7NotPad</strong>!</h2>
<p>Seu bloco de notas online rápido, moderno e <strong>sem necessidade de cadastro ou login</strong>.</p>
<hr/>
<h3>⚡ O que você pode fazer aqui:</h3>
<ul>
  <li><strong>Formatação Avançada:</strong> Digite em negrito, itálico, sublinhado, tachado, crie listas ordenadas, listas com marcadores e listas de tarefas.</li>
  <li><strong>Inserir Imagens &amp; Anexos:</strong> Adicione imagens diretamente pelo botão da barra de ferramentas ou anexe arquivos importantes (PDFs, documentos, etc).</li>
  <li><strong>Compartilhamento com Link Personalizado:</strong> Gere links no formato <code>7notpad.com/n/seu-link</code> e acesse de qualquer outro navegador ou celular!</li>
  <li><strong>Totalmente Privado &amp; Automático:</strong> Suas alterações são salvas automaticamente com sincronização em nuvem em tempo real.</li>
</ul>
<blockquote>
  <p><strong>Nuvem Ativa:</strong> Suas notas agora contam com sincronização global em tempo real para links compartilhados funcionarem perfeitamente em qualquer dispositivo.</p>
</blockquote>
`;

export function getLocalNotes(): Note[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_NOTES_KEY);
    if (!raw) {
      const token = getOrCreateOwnerToken();
      const defaultNote: Note = {
        id: crypto.randomUUID(),
        local_id: 'default_welcome_note',
        title: 'Bem-vindo ao 7NotPad ✨',
        content: WELCOME_NOTE_HTML,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        owner_token: token,
        is_pinned: true,
        attachments: [],
        share: null
      };
      saveLocalNotes([defaultNote]);
      return [defaultNote];
    }
    return JSON.parse(raw);
  } catch (err) {
    console.error('Error reading local notes:', err);
    return [];
  }
}

export function saveLocalNotes(notes: Note[]): void {
  try {
    localStorage.setItem(LOCAL_STORAGE_NOTES_KEY, JSON.stringify(notes));
    notifyRealtimeSubscribers({ type: 'notes_updated' });
  } catch (err) {
    console.error('Error saving local notes:', err);
  }
}

export function getLocalShares(): Record<string, NoteShare> {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_SHARES_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function saveLocalShares(shares: Record<string, NoteShare>): void {
  try {
    localStorage.setItem(LOCAL_STORAGE_SHARES_KEY, JSON.stringify(shares));
    notifyRealtimeSubscribers({ type: 'shares_updated' });
  } catch (err) {
    console.error('Error saving local shares:', err);
  }
}

// Temporary in-memory cache for decrypted portable or cloud-protected data
let activePortableData: (PortableNoteData & { slug: string }) | null = null;
let activeCloudProtectedContent: { slug: string; content: string } | null = null;

/**
 * Storage Service: combines Local-First with Firebase Firestore
 */
export const StorageService = {
  // Fetch all notes for current owner or user
  async fetchNotes(userId?: string): Promise<Note[]> {
    const ownerToken = getOrCreateOwnerToken();
    const currentUserId = userId || AuthService.getCurrentUser()?.id;
    const initialLocalNotes = getLocalNotes();

    try {
      // 1. Trigger migration in background if not done yet (never block UI load!)
      const isMigrated = localStorage.getItem(MIGRATED_FLAG_KEY);
      if (!isMigrated && initialLocalNotes.length > 0) {
        localStorage.setItem(MIGRATED_FLAG_KEY, 'true');
        const localShares = getLocalShares();
        FirebaseService.migrateLocalData(initialLocalNotes, localShares).catch(() => {});
      }

      // 2. Fetch fresh notes from Firebase (protected by timeout in FirebaseService)
      const remoteNotes = await FirebaseService.fetchNotes(ownerToken, currentUserId);

      // Always read the latest local notes AFTER the async call so we never overwrite notes created/edited while loading!
      const freshLocalNotes = getLocalNotes();

      if (remoteNotes && remoteNotes.length > 0) {
        // Merge remote notes with fresh local notes (prefer newest updated_at)
        const mergedMap = new Map<string, Note>();
        for (const n of freshLocalNotes) {
          mergedMap.set(n.id, n);
        }
        for (const n of remoteNotes) {
          const local = mergedMap.get(n.id);
          if (!local || new Date(n.updated_at).getTime() > new Date(local.updated_at).getTime()) {
            mergedMap.set(n.id, n);
          }
        }

        const mergedNotes = Array.from(mergedMap.values()).sort(
          (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
        );

        saveLocalNotes(mergedNotes);
        return mergedNotes;
      } else if (freshLocalNotes.length > 0) {
        // Sync local notes to Cloud & Firebase in background (non-blocking)
        const allLocalShares = getLocalShares();
        let updatedLocally = false;
        for (const localNote of freshLocalNotes) {
          if (currentUserId && !localNote.user_id) {
            localNote.user_id = currentUserId;
            updatedLocally = true;
          }
          const matchedShare =
            localNote.share ||
            allLocalShares[localNote.id] ||
            Object.values(allLocalShares).find((s) => s.note_id === localNote.id) ||
            null;
          FirebaseService.saveNote(localNote).catch(() => {});
          CloudShareService.syncNoteToCloud(localNote, matchedShare).catch(() => {});
        }
        if (updatedLocally) {
          saveLocalNotes(freshLocalNotes);
        }
      }

      return freshLocalNotes;
    } catch (err) {
      console.warn('Network or Firebase failure, using local notes:', err);
      return getLocalNotes();
    }
  },

  // Migrate local anonymous notes to user account
  async migrateLocalNotesToUser(userId: string): Promise<number> {
    const localNotes = getLocalNotes();
    let count = 0;
    for (const note of localNotes) {
      if (!note.user_id || note.user_id !== userId) {
        note.user_id = userId;
        FirebaseService.saveNote(note).catch(() => {});
        count++;
      }
    }
    saveLocalNotes(localNotes);
    return count;
  },

  // Save or update note (100% Local-First + Background Cloud Sync)
  async saveNote(note: Note): Promise<{ success: boolean }> {
    const currentUser = AuthService.getCurrentUser();
    if (currentUser) {
      if (!note.user_id) note.user_id = currentUser.id;
      if (!note.owner_username) note.owner_username = currentUser.username;
    }

    const updatedNote: Note = {
      ...note,
      updated_at: note.updated_at || new Date().toISOString(),
    };

    // 1. Update local storage synchronously first (instant persistence)
    const localNotes = getLocalNotes();
    const existingIndex = localNotes.findIndex(n => n.id === updatedNote.id || (updatedNote.local_id && n.local_id === updatedNote.local_id));
    
    if (existingIndex >= 0) {
      localNotes[existingIndex] = updatedNote;
    } else {
      localNotes.unshift(updatedNote);
    }
    saveLocalNotes(localNotes);

    // 2. Push to Cloud & Firebase Firestore in background (non-blocking so UI never hangs on "Salvando...")
    CloudShareService.syncNoteToCloud(updatedNote).catch(() => {});
    FirebaseService.saveNote(updatedNote).catch((err) => {
      console.warn('Firebase background saveNote warning:', err);
    });

    return { success: true };
  },

  // Save collaborative edit made by the Creator or an authorized Admin/Editor (@username with role 'admin')
  async saveCollaborativeNoteEdit(params: {
    slug: string;
    noteId: string;
    title: string;
    content: string;
    share: NoteShare;
    attachments?: Note['attachments'];
    createdAt?: string;
  }): Promise<{ success: boolean; updatedAt: string }> {
    const now = new Date().toISOString();
    const localNotes = getLocalNotes();
    const existingLocal = localNotes.find(
      (n) => n.id === params.noteId || n.id === params.slug || n.share?.custom_slug === params.slug
    );

    const updatedShare: NoteShare = {
      ...params.share,
      updated_at: now,
    };

    const noteObj: Note = existingLocal
      ? {
          ...existingLocal,
          title: params.title,
          content: params.content,
          updated_at: now,
          share: updatedShare,
          attachments: params.attachments ?? existingLocal.attachments ?? [],
        }
      : {
          id: params.noteId || params.slug,
          local_id: params.noteId || params.slug,
          title: params.title,
          content: params.content,
          created_at: params.createdAt || now,
          updated_at: now,
          owner_token: params.share.owner_token || getOrCreateOwnerToken(),
          user_id: params.share.owner_user_id,
          owner_username: params.share.owner_username,
          is_pinned: false,
          attachments: params.attachments || [],
          share: updatedShare,
        };

    // 1. Update local storage & local shares so all local tabs update in 0ms
    const idx = localNotes.findIndex((n) => n.id === noteObj.id);
    if (idx >= 0) {
      localNotes[idx] = noteObj;
    } else {
      localNotes.unshift(noteObj);
    }
    saveLocalNotes(localNotes);

    const localShares = getLocalShares();
    if (updatedShare.custom_slug) {
      localShares[updatedShare.custom_slug] = updatedShare;
    }
    localShares[noteObj.id] = updatedShare;
    saveLocalShares(localShares);

    activeCloudProtectedContent = { slug: params.slug, content: params.content };

    // 2. Sync to global CloudShareService & Firebase so all browsers/members see the edit immediately
    await CloudShareService.syncNoteToCloud(noteObj, updatedShare);
    FirebaseService.saveNote(noteObj).catch(() => {});

    return { success: true, updatedAt: now };
  },

  // Delete note
  async deleteNote(noteId: string): Promise<boolean> {
    // 1. Remove from local storage immediately
    const localNotes = getLocalNotes().filter(n => n.id !== noteId && n.local_id !== noteId);
    saveLocalNotes(localNotes);

    const shares = getLocalShares();
    const updatedShares = { ...shares };
    let shareRemoved = false;
    for (const [slug, share] of Object.entries(updatedShares)) {
      if (share.note_id === noteId) {
        delete updatedShares[slug];
        shareRemoved = true;
      }
    }
    if (shareRemoved) {
      saveLocalShares(updatedShares);
    }

    // 2. Delete from Firebase in background
    FirebaseService.deleteNote(noteId).catch((err) => {
      console.warn('Firebase delete note error:', err);
    });

    return true;
  },

  // Save / Update Share
  async saveShare(share: NoteShare): Promise<{ success: boolean; error?: string }> {
    // 1. Local storage persistence immediately
    const localShares = getLocalShares();
    localShares[share.custom_slug] = share;
    localShares[share.note_id] = share;
    saveLocalShares(localShares);

    const localNotes = getLocalNotes();
    const note = localNotes.find(n => n.id === share.note_id);
    if (note) {
      note.share = share;
      saveLocalNotes(localNotes);

      // 2. Sync to CloudShareService & Firebase so /notpad/<ID> works across browsers without #data=
      await CloudShareService.syncNoteToCloud(note, share);

      const res = await FirebaseService.saveShare(share, note);
      if (!res.success && res.error?.includes('já está em uso')) {
        return res;
      }
    }

    return { success: true };
  },

  // Revoke Share
  async revokeShare(_shareId: string, slug: string): Promise<boolean> {
    const localShares = getLocalShares();
    if (localShares[slug]) {
      localShares[slug].is_active = false;
      delete localShares[slug];
      saveLocalShares(localShares);
    }

    const localNotes = getLocalNotes();
    const note = localNotes.find(n => n.share?.custom_slug === slug || n.id === slug);
    if (note) {
      const revokedShare: NoteShare = {
        id: note.share?.id || note.id,
        note_id: note.id,
        custom_slug: slug,
        is_password_protected: false,
        is_active: false,
        created_at: note.created_at,
        updated_at: new Date().toISOString(),
      };
      note.share = null;
      saveLocalNotes(localNotes);
      CloudShareService.syncNoteToCloud(note, revokedShare).catch(() => {});
    }

    // Revoke from Firebase in background
    FirebaseService.revokeShare(slug).catch(() => {});

    return true;
  },

  // Check if a custom slug is already in use
  async isSlugTaken(slug: string, currentNoteId: string): Promise<boolean> {
    // 1. Check Firebase
    const takenInFirebase = await FirebaseService.isSlugTaken(slug, currentNoteId);
    if (takenInFirebase) return true;

    // 2. Check local shares
    const localShares = getLocalShares();
    if (localShares[slug] && localShares[slug].note_id !== currentNoteId) {
      return true;
    }

    return false;
  },

  // Fetch Public Shared Note by slug or unique note ID (for ANY visitor in ANY browser!)
  async fetchPublicNote(slug: string): Promise<{
    found: boolean;
    share?: NoteShare;
    note?: Partial<Note>;
    rawContent?: string;
    error?: string;
    isCloudConfigured?: boolean;
    isPortable?: boolean;
  }> {
    let cloudError: string | undefined = undefined;

    // 1. Local shares & local notes check (same browser, by note.id or custom_slug)
    const localShares = getLocalShares();
    const localNotes = getLocalNotes();
    const matchingLocalNote = localNotes.find(
      (n) => n.id === slug || n.share?.custom_slug === slug
    );
    const localShare =
      localShares[slug] ||
      matchingLocalNote?.share ||
      (matchingLocalNote
        ? {
            id: matchingLocalNote.id,
            note_id: matchingLocalNote.id,
            custom_slug: matchingLocalNote.id,
            is_password_protected: false,
            is_active: true,
            created_at: matchingLocalNote.created_at,
            updated_at: matchingLocalNote.updated_at,
          }
        : undefined);

    const localTimestamp = Math.max(
      matchingLocalNote?.updated_at ? new Date(matchingLocalNote.updated_at).getTime() : 0,
      localShare?.updated_at ? new Date(localShare.updated_at).getTime() : 0
    );

    // 2. Query CloudShareService (works globally in any browser by /notpad/<ID_UNICO>)
    try {
      const cloudRes = await CloudShareService.fetchNoteFromCloud(slug);
      if (cloudRes.found && cloudRes.share) {
        const cloudTimestamp = Math.max(
          cloudRes.note?.updated_at ? new Date(cloudRes.note.updated_at).getTime() : 0,
          cloudRes.share?.updated_at ? new Date(cloudRes.share.updated_at).getTime() : 0,
          cloudRes.syncUpdatedAt ? new Date(cloudRes.syncUpdatedAt).getTime() : 0
        );

        // If local browser has an even fresher edit (e.g., 0ms local tab edit while cloud PUT is in flight), prefer local
        if (matchingLocalNote && localShare && localTimestamp > cloudTimestamp) {
          if (localShare.is_active === false) {
            return {
              found: false,
              error: 'O compartilhamento desta nota foi desativado pelo proprietário.',
            };
          }
          activeCloudProtectedContent = { slug, content: matchingLocalNote.content || '' };
          return {
            found: true,
            isCloudConfigured: true,
            share: localShare,
            rawContent: matchingLocalNote.content || '',
            note: {
              id: matchingLocalNote.id,
              title: matchingLocalNote.title,
              content: localShare.is_password_protected ? '' : matchingLocalNote.content,
              created_at: matchingLocalNote.created_at,
              updated_at: matchingLocalNote.updated_at,
              owner_token: matchingLocalNote.owner_token,
              user_id: matchingLocalNote.user_id,
              owner_username: matchingLocalNote.owner_username,
              attachments: matchingLocalNote.attachments,
            },
          };
        }

        if (cloudRes.rawContent !== undefined) {
          activeCloudProtectedContent = { slug, content: cloudRes.rawContent };
        }
        return {
          found: true,
          isCloudConfigured: true,
          share: cloudRes.share,
          rawContent: cloudRes.rawContent,
          note: cloudRes.note,
        };
      }
      if (cloudRes.error) {
        // Check if local was just re-activated more recently than cloud deactivation
        if (matchingLocalNote && localShare && localShare.is_active && localTimestamp > (cloudRes.share?.updated_at ? new Date(cloudRes.share.updated_at).getTime() : 0)) {
          activeCloudProtectedContent = { slug, content: matchingLocalNote.content || '' };
          return {
            found: true,
            share: localShare,
            rawContent: matchingLocalNote.content || '',
            note: {
              id: matchingLocalNote.id,
              title: matchingLocalNote.title,
              content: localShare.is_password_protected ? '' : matchingLocalNote.content,
              created_at: matchingLocalNote.created_at,
              updated_at: matchingLocalNote.updated_at,
              owner_token: matchingLocalNote.owner_token,
              user_id: matchingLocalNote.user_id,
              owner_username: matchingLocalNote.owner_username,
              attachments: matchingLocalNote.attachments,
            },
          };
        }
        return {
          found: false,
          error: cloudRes.error,
        };
      }
    } catch {}

    if (localShare && localShare.is_active === false) {
      return {
        found: false,
        error: 'O compartilhamento desta nota foi desativado pelo proprietário.',
      };
    }

    // 3. Query Firebase Firestore
    try {
      const firebaseResult = await FirebaseService.fetchPublicNote(slug);
      if (firebaseResult.found && firebaseResult.share) {
        return {
          found: true,
          isCloudConfigured: true,
          share: firebaseResult.share,
          note: firebaseResult.note
        };
      }

      if (firebaseResult.error) {
        cloudError = firebaseResult.error;
        if (firebaseResult.error.toLowerCase().includes('desativad')) {
          return {
            found: false,
            error: 'O compartilhamento desta nota foi desativado pelo proprietário.'
          };
        }
      }
    } catch (err: any) {
      cloudError = err?.message;
      console.warn('Firebase fetch public note error:', err);
    }

    // 4. Local note match fallback (same browser)
    if (localShare && localShare.is_active && matchingLocalNote) {
      activeCloudProtectedContent = { slug, content: matchingLocalNote.content || '' };
      return {
        found: true,
        share: localShare,
        rawContent: matchingLocalNote.content || '',
        note: {
          id: matchingLocalNote.id,
          title: matchingLocalNote.title,
          content: localShare.is_password_protected ? '' : matchingLocalNote.content,
          created_at: matchingLocalNote.created_at,
          updated_at: matchingLocalNote.updated_at,
          attachments: matchingLocalNote.attachments,
        },
      };
    }

    // 5. Legacy fallback: Check if there is a portable payload in URL hash or query string
    const hash = window.location.hash;
    const search = window.location.search;
    const portableData = await parsePortablePayload(hash || search);

    if (portableData) {
      // Clean up ugly #data=... from the browser URL bar immediately!
      try {
        window.history.replaceState({}, '', window.location.pathname);
      } catch {}

      activePortableData = { ...portableData, slug };
      try {
        sessionStorage.setItem(PORTABLE_CACHE_KEY + slug, JSON.stringify(portableData));
      } catch {}

      const isProtected = Boolean(portableData.is_password_protected);
      return {
        found: true,
        isPortable: true,
        share: {
          id: 'portable_' + slug,
          note_id: 'portable_' + slug,
          custom_slug: slug,
          is_password_protected: isProtected,
          password_salt: portableData.password_salt,
          password_hash: portableData.password_hash,
          is_active: true,
          created_at: portableData.created_at,
          updated_at: portableData.updated_at,
        },
        note: {
          id: 'portable_' + slug,
          title: portableData.title,
          content: isProtected ? '' : (portableData.content || ''),
          created_at: portableData.created_at,
          updated_at: portableData.updated_at,
          attachments: portableData.attachments as any,
        }
      };
    }

    return { 
      found: false, 
      error: cloudError || 'Nota não encontrada.',
      isCloudConfigured: true
    };
  },

  // Retrieve protected content after valid password verification
  async unlockProtectedNoteContent(slug: string, passwordInput?: string): Promise<string | null> {
    // 1. CloudShareService cached protected content
    if (activeCloudProtectedContent && activeCloudProtectedContent.slug === slug) {
      return activeCloudProtectedContent.content;
    }

    // 2. Firebase Firestore
    const cloudContent = await FirebaseService.unlockProtectedNoteContent(slug);
    if (cloudContent) {
      return cloudContent;
    }

    // 3. Portable data with AES decryption
    if (activePortableData && activePortableData.slug === slug) {
      if (activePortableData.encrypted_content && activePortableData.encryption_iv && passwordInput && activePortableData.password_salt) {
        try {
          return await decryptContent(
            activePortableData.encrypted_content,
            activePortableData.encryption_iv,
            passwordInput,
            activePortableData.password_salt
          );
        } catch (err) {
          console.error('Failed to decrypt portable content:', err);
          return null;
        }
      }
      if (activePortableData.content) {
        return activePortableData.content;
      }
    }

    // 4. Local fallback (by note.id or custom_slug)
    const localNotes = getLocalNotes();
    const localShares = getLocalShares();
    const share = localShares[slug];
    const note = localNotes.find(
      (n) => n.id === slug || n.share?.custom_slug === slug || (share && n.id === share.note_id)
    );
    if (note) {
      return note.content;
    }

    return null;
  },

  // Manual Trigger to re-migrate all local data to Firebase
  async migrateAllToFirebase(): Promise<{ migratedNotes: number; migratedShares: number }> {
    const localNotes = getLocalNotes();
    const localShares = getLocalShares();
    const res = await FirebaseService.migrateLocalData(localNotes, localShares);
    localStorage.setItem(MIGRATED_FLAG_KEY, 'true');
    return res;
  }
};

import type { Note, NoteShare } from '../types/note';
import { getOrCreateOwnerToken } from './crypto';
import { FirebaseService } from './firebase';
import { CloudShareService } from './cloudShare';
import { parsePortablePayload, decryptContent, type PortableNoteData } from './portableShare';
import { AuthService } from './authService';
import { isUserAdmin } from '../types/auth';

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

const DELETED_NOTES_STORAGE_KEY = '7notpad_deleted_note_ids';

export function getDeletedNoteIds(): Set<string> {
  try {
    const raw = localStorage.getItem(DELETED_NOTES_STORAGE_KEY);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
}

export function markNoteAsDeletedLocally(noteId: string): void {
  if (!noteId) return;
  try {
    const ids = getDeletedNoteIds();
    ids.add(noteId);
    const arr = Array.from(ids).slice(-500);
    localStorage.setItem(DELETED_NOTES_STORAGE_KEY, JSON.stringify(arr));
  } catch {}
}

export function markNoteUnlockedInCurrentTab(noteId: string, passwordHash?: string): void {
  if (noteId && passwordHash) {
    tabUnlockedHashes[noteId] = passwordHash;
  }
}

export function isNoteUnlockedInCurrentTab(noteId: string, passwordHash?: string): boolean {
  if (!passwordHash) return true;
  return tabUnlockedHashes[noteId] === passwordHash;
}

export interface NoteAccessControl {
  allowed: boolean;
  isCreator: boolean;
  isAdmin: boolean;
  canEdit: boolean;
  canManageShare: boolean;
  canDelete: boolean;
  role: 'creator' | 'admin' | 'viewer';
  matchedUser?: string;
  creatorUsername?: string;
}

/**
 * Check if the current browser/user is the creator/admin of the note or an authorized @username member.
 * REGRA: Apenas o criador/admin da nota e quem foi adicionado como 'admin' da nota pode editar, gerenciar e alterar configurações de compartilhamento!
 */
export function hasDirectNoteAccess(
  note?: Partial<Note> | null,
  share?: NoteShare | null
): NoteAccessControl {
  const currentOwnerToken = getOrCreateOwnerToken();
  const currentUser = AuthService.getCurrentUser();

  const creatorUsername =
    note?.owner_username ||
    share?.owner_username ||
    (currentUser && (note?.user_id === currentUser.id || share?.owner_user_id === currentUser.id)
      ? currentUser.username
      : undefined);

  // 1. Check owner_token match (creator in same browser)
  if (
    (note?.owner_token && note.owner_token === currentOwnerToken) ||
    (share?.owner_token && share.owner_token === currentOwnerToken)
  ) {
    return {
      allowed: true,
      isCreator: true,
      isAdmin: true,
      canEdit: true,
      canManageShare: true,
      canDelete: true,
      role: 'creator',
      creatorUsername,
    };
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
          return {
            allowed: true,
            isCreator: true,
            isAdmin: true,
            canEdit: true,
            canManageShare: true,
            canDelete: true,
            role: 'creator',
            creatorUsername: found.owner_username || creatorUsername,
          };
        }
      }
    } catch {}
  }

  // 3. Check logged-in user match
  if (currentUser) {
    const myUsername = currentUser.username.trim().toLowerCase().replace(/^@+/, '');

    // 3a. Platform Admin (@malaca, etc.) has full editing and managing privileges everywhere
    if (isUserAdmin(currentUser)) {
      return {
        allowed: true,
        isCreator: true,
        isAdmin: true,
        canEdit: true,
        canManageShare: true,
        canDelete: true,
        role: 'admin',
        matchedUser: `@${myUsername} (Admin Global)`,
        creatorUsername,
      };
    }

    // 3b. Note creator by user_id or owner_username
    if (
      (note?.user_id && note.user_id === currentUser.id) ||
      (share?.owner_user_id && share.owner_user_id === currentUser.id) ||
      (note?.owner_username && note.owner_username.trim().toLowerCase().replace(/^@+/, '') === myUsername) ||
      (share?.owner_username && share.owner_username.trim().toLowerCase().replace(/^@+/, '') === myUsername)
    ) {
      return {
        allowed: true,
        isCreator: true,
        isAdmin: true,
        canEdit: true,
        canManageShare: true,
        canDelete: true,
        role: 'creator',
        matchedUser: `@${myUsername} (Criador)`,
        creatorUsername: myUsername,
      };
    }

    // 3c. Authorized user match in share.allowed_users or note.share.allowed_users
    const allowedList = share?.allowed_users || note?.share?.allowed_users || [];
    if (Array.isArray(allowedList)) {
      const match = allowedList.find(
        (u) => u.username.trim().toLowerCase().replace(/^@+/, '') === myUsername
      );
      if (match) {
        // REGRA DE OURO: Apenas 'admin' do bloco pode editar e mudar configurações de compartilhar!
        const isNoteAdmin = match.role === 'admin';
        return {
          allowed: true,
          isCreator: false,
          isAdmin: isNoteAdmin,
          canEdit: isNoteAdmin,
          canManageShare: isNoteAdmin,
          canDelete: false,
          role: isNoteAdmin ? 'admin' : 'viewer',
          matchedUser: isNoteAdmin ? `@${myUsername} (Admin do Bloco)` : `@${myUsername} (Leitor)`,
          creatorUsername,
        };
      }
    }
  }

  return {
    allowed: false,
    isCreator: false,
    isAdmin: false,
    canEdit: false,
    canManageShare: false,
    canDelete: false,
    role: 'viewer',
    creatorUsername,
  };
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

export function getLocalNotes(): Note[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_NOTES_KEY);
    if (!raw) {
      return [];
    }
    const parsed: Note[] = JSON.parse(raw);
    const cleanNotes = parsed.filter(
      (n) => n.local_id !== 'default_welcome_note' && !n.title?.includes('Bem-vindo ao 7NotPad')
    );
    if (cleanNotes.length !== parsed.length) {
      saveLocalNotes(cleanNotes);
    }
    return cleanNotes;
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
    const currentUser = AuthService.getCurrentUser();
    const currentUserId = userId || currentUser?.id;
    const currentUsername = currentUser?.username?.toLowerCase().replace(/^@+/, '');
    const isAdmin = currentUser ? isUserAdmin(currentUser) : false;
    const freshLocalNotes = getLocalNotes();

    try {
      // 1. Fetch fresh notes from CloudShareService Global Catalog (cross-device/all users)
      const cloudNotes = await CloudShareService.fetchAllNotesFromGlobalCatalog();
      const deletedIds = getDeletedNoteIds();

      let relevantRemoteNotes: Note[] = [];
      if (Array.isArray(cloudNotes) && cloudNotes.length > 0) {
        relevantRemoteNotes = cloudNotes.filter((n) => {
          if (!n || !n.id) return false;
          if (deletedIds.has(n.id) || (n.local_id && deletedIds.has(n.local_id))) return false;
          if (n.local_id === 'default_welcome_note' || n.title?.includes('Bem-vindo ao 7NotPad')) return false;
          // Anonymous visitor
          if (!currentUserId && !currentUsername) {
            return n.owner_token === ownerToken;
          }
          // Admin sees all notes
          if (isAdmin) {
            return true;
          }
          // Note owner by user_id, token, or owner_username
          if (n.user_id && n.user_id === currentUserId) return true;
          if (n.owner_token && n.owner_token === ownerToken) return true;
          if (n.owner_username && n.owner_username.toLowerCase().replace(/^@+/, '') === currentUsername) return true;

          // Note shared directly with this user
          if (n.share?.allowed_users?.some((u) => u.username.toLowerCase().replace(/^@+/, '') === currentUsername)) {
            return true;
          }
          return false;
        });
      }

      // Merge remote notes with fresh local notes (prefer newest updated_at, skip deleted tombstones)
      const mergedMap = new Map<string, Note>();
      for (const n of freshLocalNotes) {
        if (!deletedIds.has(n.id) && (!n.local_id || !deletedIds.has(n.local_id))) {
          mergedMap.set(n.id, n);
        }
      }
      for (const n of relevantRemoteNotes) {
        if (!deletedIds.has(n.id) && (!n.local_id || !deletedIds.has(n.local_id))) {
          const local = mergedMap.get(n.id);
          if (!local || new Date(n.updated_at).getTime() > new Date(local.updated_at).getTime()) {
            mergedMap.set(n.id, n);
          }
        }
      }

      const mergedNotes = Array.from(mergedMap.values()).sort(
        (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
      );

      saveLocalNotes(mergedNotes);

      // If local notes exist that aren't in cloud catalog yet, sync them non-blocking (never sync deleted notes!)
      for (const localNote of freshLocalNotes) {
        if (deletedIds.has(localNote.id) || (localNote.local_id && deletedIds.has(localNote.local_id))) {
          continue;
        }
        if (!cloudNotes.some(cn => cn.id === localNote.id)) {
          CloudShareService.syncNoteToCloud(localNote).catch(() => {});
          CloudShareService.syncNoteToGlobalCatalog(localNote).catch(() => {});
        }
      }

      return mergedNotes;
    } catch (err) {
      console.warn('Global catalog fetch warning, fallback to local notes:', err);
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

    // 2. Push to Cloud (both individual doc & global catalog & realtime event)
    CloudShareService.syncNoteToCloud(updatedNote).catch(() => {});
    CloudShareService.syncNoteToGlobalCatalog(updatedNote).catch(() => {});
    CloudShareService.publishGlobalRealtimeEvent({
      type: 'note_updated',
      noteId: updatedNote.id,
      userId: updatedNote.user_id,
      owner_username: updatedNote.owner_username,
      title: updatedNote.title,
    });
    notifyRealtimeSubscribers({ type: 'note_updated', noteId: updatedNote.id });
    FirebaseService.saveNote(updatedNote).catch((err) => {
      console.warn('Firebase background saveNote warning:', err);
    });

    return { success: true };
  },

  // Save collaborative edit made by the Creator or an authorized Admin (@username with role 'admin')
  async saveCollaborativeNoteEdit(params: {
    slug: string;
    noteId: string;
    title: string;
    content: string;
    share: NoteShare;
    attachments?: Note['attachments'];
    createdAt?: string;
  }): Promise<{ success: boolean; updatedAt: string; error?: string }> {
    const now = new Date().toISOString();
    const localNotes = getLocalNotes();
    const existingLocal = localNotes.find(
      (n) => n.id === params.noteId || n.id === params.slug || n.share?.custom_slug === params.slug
    );

    // REGRA DE OURO: Apenas criador/admin da nota e admin adicionado podem editar!
    const access = hasDirectNoteAccess(existingLocal, params.share);
    if (!access.canEdit) {
      return {
        success: false,
        updatedAt: now,
        error: 'Apenas o criador ou administradores adicionados a este bloco de notas podem editar.',
      };
    }

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

    // 2. Sync to global CloudShareService & Global Catalog so all browsers/members see the edit immediately
    await CloudShareService.syncNoteToCloud(noteObj, updatedShare);
    await CloudShareService.syncNoteToGlobalCatalog(noteObj, updatedShare);
    CloudShareService.publishGlobalRealtimeEvent({
      type: 'note_updated',
      noteId: noteObj.id,
      slug: params.slug,
      title: noteObj.title,
    });
    FirebaseService.saveNote(noteObj).catch(() => {});
    FirebaseService.saveShare(updatedShare, noteObj).catch(() => {});
    notifyRealtimeSubscribers({ type: 'note_updated', noteId: noteObj.id, slug: params.slug });

    return { success: true, updatedAt: now };
  },

  // Delete note (only creator or global admin can delete)
  async deleteNote(noteId: string): Promise<boolean> {
    const localNotes = getLocalNotes();
    const existing = localNotes.find(n => n.id === noteId || n.local_id === noteId);
    if (existing) {
      const access = hasDirectNoteAccess(existing, existing.share);
      if (!access.canDelete) {
        console.warn('Unauthorized attempt to delete note:', noteId);
        return false;
      }
    }

    // 1. Mark as tombstone locally so background fetch never resurrects it
    markNoteAsDeletedLocally(noteId);

    // 2. Remove from local storage immediately
    const filteredNotes = localNotes.filter(n => n.id !== noteId && n.local_id !== noteId);
    saveLocalNotes(filteredNotes);

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

    // 2. Delete from Global Catalog & broadcast
    CloudShareService.deleteNoteFromGlobalCatalog(noteId).catch(() => {});
    CloudShareService.publishGlobalRealtimeEvent({
      type: 'note_deleted',
      noteId,
    });
    notifyRealtimeSubscribers({ type: 'note_deleted', noteId });

    // Delete from Firebase in background
    FirebaseService.deleteNote(noteId).catch((err) => {
      console.warn('Firebase delete note error:', err);
    });

    return true;
  },

  // Save / Update Share
  async saveShare(share: NoteShare): Promise<{ success: boolean; error?: string }> {
    const localNotes = getLocalNotes();
    const note = localNotes.find(n => n.id === share.note_id);

    // REGRA DE OURO: Apenas criador/admin da nota e quem foi adicionado como admin do bloco de nota podem mudar configurações de compartilhar!
    const access = hasDirectNoteAccess(note, share);
    if (!access.canManageShare) {
      return {
        success: false,
        error: 'Apenas o criador ou administradores adicionados a este bloco de notas podem alterar as configurações de compartilhamento.',
      };
    }

    // 1. Local storage persistence immediately
    const localShares = getLocalShares();
    localShares[share.custom_slug] = share;
    localShares[share.note_id] = share;
    saveLocalShares(localShares);
    if (note) {
      note.share = share;
      saveLocalNotes(localNotes);

      // 2. Broadcast real-time update immediately (0ms delay)
      CloudShareService.publishGlobalRealtimeEvent({
        type: 'note_updated',
        noteId: note.id,
        slug: share.custom_slug,
        title: note.title,
      });

      // 3. Sync to CloudShareService & Global Catalog non-blocking in background
      Promise.all([
        CloudShareService.syncNoteToCloud(note, share),
        CloudShareService.syncNoteToGlobalCatalog(note, share),
      ]).catch((err) => {
        console.warn('saveShare cloud sync error:', err);
      });

      FirebaseService.saveShare(share, note).catch(() => {});
      FirebaseService.saveNote(note).catch(() => {});
    }

    notifyRealtimeSubscribers({ type: 'share_updated', noteId: share.note_id, slug: share.custom_slug });
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

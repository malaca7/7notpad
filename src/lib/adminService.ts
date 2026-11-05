import { 
  collection, 
  doc, 
  setDoc, 
  getDocs, 
  deleteDoc, 
  updateDoc 
} from 'firebase/firestore';
import { db } from './firebase';
import { type StoredUser } from './authService';
import { CloudShareService } from './cloudShare';
import { generateSalt, hashPassword, getOrCreateOwnerToken } from './crypto';
import { getLocalNotes, saveLocalNotes, getLocalShares, saveLocalShares } from './storage';
import { PlatformSettingsService, type PlatformLimits } from './platformSettings';
import type { UserProfile, UserRole } from '../types/auth';
import type { Note, NoteShare } from '../types/note';

const LOCAL_USERS_KEY = '7notpad_users_store';

function getLocalUsersList(): StoredUser[] {
  try {
    const raw = localStorage.getItem(LOCAL_USERS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveLocalUsersList(users: StoredUser[]) {
  try {
    localStorage.setItem(LOCAL_USERS_KEY, JSON.stringify(users));
  } catch {}
}

export interface AdminStats {
  totalUsers: number;
  adminUsers: number;
  totalNotes: number;
  pinnedNotes: number;
  totalShares: number;
  activeShares: number;
  passwordProtectedShares: number;
}

export const AdminService = {
  // ----------------------------------------------------
  // ESTATÍSTICAS GERAIS
  // ----------------------------------------------------
  async getStats(): Promise<AdminStats> {
    const users = await this.getAllUsers();
    const notes = await this.getAllNotes();
    const shares = await this.getAllShares();

    return {
      totalUsers: users.length,
      adminUsers: users.filter((u) => u.role === 'admin' || u.username.toLowerCase() === 'malaca').length,
      totalNotes: notes.length,
      pinnedNotes: notes.filter((n) => n.is_pinned).length,
      totalShares: shares.length,
      activeShares: shares.filter((s) => s.is_active).length,
      passwordProtectedShares: shares.filter((s) => s.is_password_protected).length,
    };
  },

  // ----------------------------------------------------
  // GESTÃO DE USUÁRIOS
  // ----------------------------------------------------
  async getAllUsers(): Promise<UserProfile[]> {
    const userMap = new Map<string, UserProfile>();
    const storedUserMap = new Map<string, StoredUser>();

    // 1. Load local users
    const localUsers = getLocalUsersList();
    for (const u of localUsers) {
      const isMalaca = u.username.toLowerCase() === 'malaca';
      storedUserMap.set(u.id, u);
      userMap.set(u.id, {
        id: u.id,
        full_name: u.full_name,
        username: u.username,
        email: u.email,
        avatar_url: u.avatar_url,
        role: isMalaca ? 'admin' : (u.role || 'user'),
        birth_date: u.birth_date,
        security_question: u.security_question,
        email_verified: true,
        is_banned: isMalaca ? false : Boolean(u.is_banned),
        created_at: u.created_at,
        updated_at: u.updated_at,
      });
    }

    // 2. Fetch full global cloud users database
    try {
      const cloudUsers = await CloudShareService.fetchGlobalUsers();
      if (Array.isArray(cloudUsers) && cloudUsers.length > 0) {
        for (const data of cloudUsers) {
          if (data && data.username) {
            const isMalaca = data.username.toLowerCase() === 'malaca';
            const id = data.id || `usr_${data.username}`;
            storedUserMap.set(id, data as StoredUser);
            userMap.set(id, {
              id,
              full_name: data.full_name || data.username,
              username: data.username,
              email: data.email || `${data.username}@7notpad.local`,
              avatar_url: data.avatar_url,
              role: isMalaca ? 'admin' : (data.role || 'user'),
              birth_date: data.birth_date,
              security_question: data.security_question,
              email_verified: true,
              is_banned: isMalaca ? false : Boolean(data.is_banned),
              created_at: data.created_at || new Date().toISOString(),
              updated_at: data.updated_at || new Date().toISOString(),
            });
          }
        }
      }
    } catch {}

    // 3. Check public platform users directory (recovers users registered across all browsers)
    try {
      const platformDirectory = await CloudShareService.fetchPlatformUsers();
      for (const dirUser of platformDirectory) {
        if (dirUser && dirUser.username) {
          const cleanUser = dirUser.username.toLowerCase();
          const alreadyInMap = Array.from(userMap.values()).some(
            (u) => u.username.toLowerCase() === cleanUser
          );
          if (!alreadyInMap) {
            const isMalaca = cleanUser === 'malaca';
            const id = dirUser.id || `usr_${cleanUser}`;
            userMap.set(id, {
              id,
              full_name: dirUser.full_name || dirUser.username,
              username: dirUser.username,
              email: `${cleanUser}@7notpad.local`,
              role: isMalaca ? 'admin' : 'user',
              email_verified: true,
              is_banned: false,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            });
          }
        }
      }
    } catch {}

    // 4. Also non-blocking fetch from Firestore if configured
    try {
      const snap = await Promise.race([
        getDocs(collection(db, 'users')),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 1200)),
      ]);

      if (snap && !snap.empty) {
        snap.forEach((d) => {
          const data = d.data() as Partial<StoredUser>;
          if (data && data.username) {
            const isMalaca = data.username.toLowerCase() === 'malaca';
            const id = data.id || d.id;
            userMap.set(id, {
              id,
              full_name: data.full_name || data.username,
              username: data.username,
              email: data.email || `${data.username}@7notpad.local`,
              avatar_url: data.avatar_url,
              role: isMalaca ? 'admin' : (data.role || 'user'),
              birth_date: data.birth_date,
              security_question: data.security_question,
              email_verified: true,
              is_banned: isMalaca ? false : Boolean(data.is_banned),
              created_at: data.created_at || new Date().toISOString(),
              updated_at: data.updated_at || new Date().toISOString(),
            });
          }
        });
      }
    } catch {}

    // Ensure @malaca is always present in users and is admin
    let malacaFound = false;
    for (const u of userMap.values()) {
      if (u.username.toLowerCase() === 'malaca') {
        malacaFound = true;
        u.role = 'admin';
        u.is_banned = false;
        break;
      }
    }
    if (!malacaFound) {
      const now = new Date().toISOString();
      userMap.set('usr_malaca_admin', {
        id: 'usr_malaca_admin',
        full_name: 'Malaca',
        username: 'malaca',
        email: 'malaca@7notpad.com.br',
        role: 'admin',
        birth_date: '2000-01-01',
        security_question: 'Qual o nome do seu primeiro animal de estimação?',
        email_verified: true,
        is_banned: false,
        created_at: now,
        updated_at: now,
      });
    }

    // Keep local cache synced with all discovered users
    if (storedUserMap.size > 0) {
      saveLocalUsersList(Array.from(storedUserMap.values()));
    }

    return Array.from(userMap.values()).sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  },

  async createUser(data: {
    full_name: string;
    username: string;
    password: string;
    email?: string;
    role?: UserRole;
    birth_date?: string;
  }): Promise<{ success: boolean; user?: UserProfile; error?: string }> {
    const username = data.username.replace(/^@/, '').trim().toLowerCase();
    const fullName = data.full_name.trim();
    const email = (data.email || '').trim().toLowerCase() || `${username}@7notpad.local`;
    const role: UserRole = username === 'malaca' ? 'admin' : (data.role || 'user');

    if (!username || !fullName || !data.password) {
      return { success: false, error: 'Preencha nome completo, nome de usuário e senha.' };
    }

    if (data.password.length < 6) {
      return { success: false, error: 'A senha deve conter no mínimo 6 dígitos.' };
    }

    const localUsers = getLocalUsersList();
    if (localUsers.some((u) => u.username.toLowerCase() === username)) {
      return { success: false, error: `O nome de usuário @${username} já está cadastrado.` };
    }

    const salt = generateSalt();
    const hash = await hashPassword(data.password, salt);
    const userId = `usr_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date().toISOString();

    const storedUser: StoredUser = {
      id: userId,
      full_name: fullName,
      username,
      email,
      role,
      password_salt: salt,
      password_hash: hash,
      birth_date: data.birth_date || '2000-01-01',
      security_question: 'Qual a sua comida ou prato favorito?',
      security_answer: 'padrao',
      email_verified: true,
      is_banned: false,
      created_at: now,
      updated_at: now,
    };

    localUsers.push(storedUser);
    saveLocalUsersList(localUsers);

    // Sync to CloudShareService global database immediately!
    await CloudShareService.syncGlobalUser(storedUser).catch(() => {});

    // Sync to Firestore non-blocking
    try {
      setDoc(doc(db, 'users', userId), storedUser).catch(() => {});
    } catch {}

    const profile: UserProfile = {
      id: userId,
      full_name: fullName,
      username,
      email,
      role,
      birth_date: storedUser.birth_date,
      security_question: storedUser.security_question,
      email_verified: true,
      is_banned: false,
      created_at: now,
      updated_at: now,
    };

    return { success: true, user: profile };
  },

  async updateUser(
    userId: string,
    updates: {
      full_name?: string;
      username?: string;
      role?: UserRole;
      email?: string;
      is_banned?: boolean;
    }
  ): Promise<{ success: boolean; error?: string }> {
    const localUsers = getLocalUsersList();
    const user = localUsers.find((u) => u.id === userId);

    const isMalaca = (user?.username?.toLowerCase() === 'malaca') || (updates.username?.toLowerCase() === 'malaca');

    if (isMalaca) {
      if (updates.role && updates.role !== 'admin') {
        return { success: false, error: 'O usuário principal @malaca deve ser sempre Administrador.' };
      }
      if (updates.is_banned) {
        return { success: false, error: 'O usuário principal @malaca não pode ser desativado.' };
      }
    }

    const now = new Date().toISOString();

    if (user) {
      if (updates.full_name) user.full_name = updates.full_name.trim();
      if (updates.username) user.username = updates.username.replace(/^@/, '').trim().toLowerCase();
      if (updates.email) user.email = updates.email.trim().toLowerCase();
      if (updates.role) user.role = isMalaca ? 'admin' : updates.role;
      if (typeof updates.is_banned === 'boolean') user.is_banned = isMalaca ? false : updates.is_banned;
      user.updated_at = now;
      saveLocalUsersList(localUsers);

      // Sync to CloudShareService global database!
      await CloudShareService.syncGlobalUser(user).catch(() => {});
    }

    // Update in Firestore non-blocking
    try {
      const cleanUpdates: any = { updated_at: now };
      if (updates.full_name) cleanUpdates.full_name = updates.full_name.trim();
      if (updates.username) cleanUpdates.username = updates.username.replace(/^@/, '').trim().toLowerCase();
      if (updates.email) cleanUpdates.email = updates.email.trim().toLowerCase();
      if (updates.role) cleanUpdates.role = isMalaca ? 'admin' : updates.role;
      if (typeof updates.is_banned === 'boolean') cleanUpdates.is_banned = isMalaca ? false : updates.is_banned;

      updateDoc(doc(db, 'users', userId), cleanUpdates).catch(() => {});
    } catch {}

    return { success: true };
  },

  async resetUserPassword(userId: string, newPass: string): Promise<{ success: boolean; error?: string }> {
    if (!newPass || newPass.length < 6) {
      return { success: false, error: 'A nova senha deve ter no mínimo 6 dígitos.' };
    }

    const salt = generateSalt();
    const hash = await hashPassword(newPass, salt);
    const now = new Date().toISOString();

    const localUsers = getLocalUsersList();
    const user = localUsers.find((u) => u.id === userId);
    if (user) {
      user.password_salt = salt;
      user.password_hash = hash;
      user.updated_at = now;
      saveLocalUsersList(localUsers);

      // Sync updated password to CloudShareService global database!
      await CloudShareService.syncGlobalUser(user).catch(() => {});
    }

    try {
      updateDoc(doc(db, 'users', userId), {
        password_salt: salt,
        password_hash: hash,
        updated_at: now,
      }).catch(() => {});
    } catch {}

    return { success: true };
  },

  async deleteUser(userId: string): Promise<{ success: boolean; error?: string }> {
    const localUsers = getLocalUsersList();
    const user = localUsers.find((u) => u.id === userId);

    if (user?.username?.toLowerCase() === 'malaca' || userId === 'usr_malaca_admin') {
      return { success: false, error: 'O usuário principal @malaca não pode ser excluído.' };
    }

    const filtered = localUsers.filter((u) => u.id !== userId);
    saveLocalUsersList(filtered);

    // Delete from CloudShareService global database & public directory!
    await CloudShareService.deleteGlobalUser(userId).catch(() => {});

    try {
      deleteDoc(doc(db, 'users', userId)).catch(() => {});
    } catch {}

    return { success: true };
  },

  // ----------------------------------------------------
  // GESTÃO DE BLOCOS DE NOTAS
  // ----------------------------------------------------
  async getAllNotes(): Promise<Note[]> {
    const notesMap = new Map<string, Note>();

    // 1. Fetch from global cloud notes catalog (cross-device/all users)
    try {
      const cloudNotes = await CloudShareService.fetchAllNotesFromGlobalCatalog();
      for (const n of cloudNotes) {
        if (n && n.id && n.local_id !== 'default_welcome_note' && !n.title?.includes('Bem-vindo')) {
          notesMap.set(n.id, n);
        }
      }
    } catch {}

    // 2. Merge local notes (if newer or not in cloud yet)
    const local = getLocalNotes();
    for (const n of local) {
      if (n.local_id === 'default_welcome_note' || n.title?.includes('Bem-vindo')) continue;
      if (!notesMap.has(n.id)) {
        notesMap.set(n.id, n);
      } else {
        const existing = notesMap.get(n.id)!;
        if (new Date(n.updated_at).getTime() > new Date(existing.updated_at).getTime()) {
          notesMap.set(n.id, n);
        }
      }
    }

    return Array.from(notesMap.values()).sort(
      (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    );
  },

  async createNote(params: {
    title: string;
    content?: string;
    owner_username?: string;
    user_id?: string;
    is_pinned?: boolean;
    share_slug?: string;
    share_password?: string;
  }): Promise<{ success: boolean; note?: Note; error?: string }> {
    const now = new Date().toISOString();
    const noteId = crypto.randomUUID();
    const ownerToken = getOrCreateOwnerToken();

    const cleanUsername = params.owner_username?.trim().toLowerCase().replace(/^@+/, '') || 'malaca';
    let targetUserId = params.user_id;

    if (!targetUserId) {
      const allUsers = await this.getAllUsers();
      const match = allUsers.find((u) => u.username.toLowerCase() === cleanUsername);
      targetUserId = match?.id || `usr_${cleanUsername}`;
    }

    let share: NoteShare | null = null;
    if (params.share_slug && params.share_slug.trim()) {
      const cleanSlug = params.share_slug.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-');
      let password_hash: string | undefined;
      let password_salt: string | undefined;

      if (params.share_password && params.share_password.trim()) {
        password_salt = generateSalt();
        password_hash = await hashPassword(params.share_password.trim(), password_salt);
      }

      share = {
        id: crypto.randomUUID(),
        note_id: noteId,
        custom_slug: cleanSlug,
        is_password_protected: Boolean(params.share_password && params.share_password.trim()),
        password_hash,
        password_salt,
        is_active: true,
        created_at: now,
        updated_at: now,
        owner_token: ownerToken,
        owner_user_id: targetUserId,
        owner_username: cleanUsername,
        allowed_users: [],
      };

      const shares = getLocalShares();
      shares[cleanSlug] = share;
      shares[noteId] = share;
      saveLocalShares(shares);
    }

    const newNote: Note = {
      id: noteId,
      local_id: noteId,
      title: params.title.trim() || 'Sem título',
      content: params.content || '',
      created_at: now,
      updated_at: now,
      owner_token: ownerToken,
      user_id: targetUserId,
      owner_username: cleanUsername,
      is_pinned: Boolean(params.is_pinned),
      attachments: [],
      share,
    };

    // 1. Save to local storage
    const localNotes = getLocalNotes();
    saveLocalNotes([newNote, ...localNotes]);

    // 2. Sync to cloud and global catalog
    try {
      await CloudShareService.syncNoteToCloud(newNote, share);
      await CloudShareService.syncNoteToGlobalCatalog(newNote, share);
      CloudShareService.publishGlobalRealtimeEvent({
        type: 'note_updated',
        noteId: newNote.id,
        title: newNote.title,
        owner_username: newNote.owner_username,
        user_id: newNote.user_id,
      });
    } catch (err) {
      console.warn('AdminService.createNote cloud sync warning:', err);
    }

    // 3. Sync to Firestore non-blocking
    try {
      setDoc(doc(db, 'notes', newNote.id), newNote).catch(() => {});
    } catch {}

    return { success: true, note: newNote };
  },

  async updateNote(
    noteId: string,
    updates: {
      title?: string;
      content?: string;
      is_pinned?: boolean;
      owner_username?: string;
      user_id?: string;
      share_slug?: string;
      share_active?: boolean;
      share_password?: string;
      remove_share_password?: boolean;
      remove_share?: boolean;
    }
  ): Promise<{ success: boolean; error?: string }> {
    const now = new Date().toISOString();

    // 1. Update local notes
    const localNotes = getLocalNotes();
    let updatedNoteObj: Note | null = null;
    const cleanUsername = updates.owner_username?.trim().toLowerCase().replace(/^@+/, '');

    const updatedLocal = await Promise.all(
      localNotes.map(async (n) => {
        if (n.id === noteId || n.local_id === noteId) {
          let updatedShare: NoteShare | null | undefined = n.share;

          if (updates.remove_share) {
            updatedShare = null;
          } else if (
            updates.share_slug !== undefined ||
            typeof updates.share_active === 'boolean' ||
            updates.share_password !== undefined ||
            updates.remove_share_password
          ) {
            const currentShare = n.share;
            const newSlug = updates.share_slug?.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-') || currentShare?.custom_slug || noteId;

            let password_hash = currentShare?.password_hash;
            let password_salt = currentShare?.password_salt;
            let is_protected = currentShare?.is_password_protected || false;

            if (updates.remove_share_password) {
              password_hash = undefined;
              password_salt = undefined;
              is_protected = false;
            } else if (updates.share_password && updates.share_password.trim()) {
              password_salt = generateSalt();
              password_hash = await hashPassword(updates.share_password.trim(), password_salt);
              is_protected = true;
            }

            updatedShare = {
              id: currentShare?.id || crypto.randomUUID(),
              note_id: noteId,
              custom_slug: newSlug,
              is_active: typeof updates.share_active === 'boolean' ? updates.share_active : (currentShare?.is_active ?? true),
              is_password_protected: is_protected,
              password_hash,
              password_salt,
              created_at: currentShare?.created_at || now,
              updated_at: now,
              owner_token: n.owner_token,
              owner_user_id: updates.user_id || n.user_id,
              owner_username: cleanUsername || n.owner_username,
              allowed_users: currentShare?.allowed_users || [],
            };

            const shares = getLocalShares();
            shares[newSlug] = updatedShare;
            shares[noteId] = updatedShare;
            saveLocalShares(shares);
          }

          updatedNoteObj = {
            ...n,
            title: updates.title !== undefined ? updates.title : n.title,
            content: updates.content !== undefined ? updates.content : n.content,
            is_pinned: typeof updates.is_pinned === 'boolean' ? updates.is_pinned : n.is_pinned,
            owner_username: cleanUsername || n.owner_username,
            user_id: updates.user_id || n.user_id,
            share: updatedShare,
            updated_at: now,
          };
          return updatedNoteObj;
        }
        return n;
      })
    );
    saveLocalNotes(updatedLocal);

    // 2. Update in Global Cloud Catalog & push realtime event
    try {
      const cloudNotes = await CloudShareService.fetchAllNotesFromGlobalCatalog();
      const target = cloudNotes.find((n) => n.id === noteId || n.local_id === noteId);
      const noteToSync: Note | null = (updatedNoteObj || target) as Note | null;

      if (noteToSync) {
        const merged: Note = {
          ...((target || noteToSync) as Note),
          ...noteToSync,
          updated_at: now,
        };
        await CloudShareService.syncNoteToGlobalCatalog(merged);
        await CloudShareService.syncNoteToCloud(merged);
        CloudShareService.publishGlobalRealtimeEvent({
          type: 'note_updated',
          noteId: merged.id,
          title: merged.title,
          owner_username: merged.owner_username,
          user_id: merged.user_id,
        });
      }
    } catch {}

    // 3. Update Firestore non-blocking
    try {
      if (updatedNoteObj) {
        const objToSave = updatedNoteObj as Note;
        updateDoc(doc(db, 'notes', noteId), {
          ...objToSave,
          updated_at: now,
        }).catch(() => {});
      }
    } catch {}

    return { success: true };
  },

  async deleteNote(noteId: string): Promise<{ success: boolean; error?: string }> {
    // 1. Delete local
    const localNotes = getLocalNotes();
    const filtered = localNotes.filter((n) => n.id !== noteId && n.local_id !== noteId);
    saveLocalNotes(filtered);

    const shares = getLocalShares();
    const updatedShares = { ...shares };
    let shareRemoved = false;
    for (const [slug, share] of Object.entries(updatedShares)) {
      if (share.note_id === noteId || slug === noteId) {
        delete updatedShares[slug];
        shareRemoved = true;
      }
    }
    if (shareRemoved) {
      saveLocalShares(updatedShares);
    }

    // 2. Delete from global cloud catalog & notify all screens
    try {
      await CloudShareService.deleteNoteFromGlobalCatalog(noteId);
      CloudShareService.publishGlobalRealtimeEvent({
        type: 'note_deleted',
        noteId,
      });
    } catch {}

    // 3. Delete from Firestore non-blocking
    try {
      deleteDoc(doc(db, 'notes', noteId)).catch(() => {});
    } catch {}

    return { success: true };
  },

  // ----------------------------------------------------
  // GESTÃO DE LINKS DE COMPARTILHAMENTO
  // ----------------------------------------------------
  async getAllShares(): Promise<Array<NoteShare & { note_title?: string }>> {
    const sharesMap = new Map<string, NoteShare & { note_title?: string }>();
    const allNotes = await this.getAllNotes();

    for (const n of allNotes) {
      if (n.share && (n.share.custom_slug || n.share.id)) {
        const slug = n.share.custom_slug || n.share.id || n.id;
        sharesMap.set(slug, {
          ...n.share,
          id: n.share.id || n.id,
          note_id: n.share.note_id || n.id,
          custom_slug: slug,
          note_title: n.title || 'Sem título',
          owner_user_id: n.share.owner_user_id || n.user_id,
          owner_username: n.share.owner_username || n.owner_username,
          allowed_users: n.share.allowed_users || [],
        });
      }
    }

    return Array.from(sharesMap.values()).sort(
      (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    );
  },

  async updateShare(
    slug: string,
    updates: {
      is_active?: boolean;
      remove_password?: boolean;
      new_password?: string;
    }
  ): Promise<{ success: boolean; error?: string }> {
    const now = new Date().toISOString();
    const updatePayload: any = { updated_at: now };

    if (typeof updates.is_active === 'boolean') {
      updatePayload.is_active = updates.is_active;
    }

    if (updates.remove_password) {
      updatePayload.is_password_protected = false;
      updatePayload.password_hash = null;
      updatePayload.password_salt = null;
    } else if (updates.new_password) {
      if (updates.new_password.length < 3) {
        return { success: false, error: 'A senha da nota deve conter no mínimo 3 dígitos.' };
      }
      const salt = generateSalt();
      const hash = await hashPassword(updates.new_password, salt);
      updatePayload.is_password_protected = true;
      updatePayload.password_salt = salt;
      updatePayload.password_hash = hash;
    }

    // Update in local notes if exists
    const localNotes = getLocalNotes();
    let modifiedLocal = false;
    const updatedLocal = localNotes.map((n) => {
      if (n.share && (n.share.custom_slug === slug || n.share.id === slug || n.id === slug)) {
        modifiedLocal = true;
        return {
          ...n,
          share: {
            ...n.share,
            ...updatePayload,
          },
        };
      }
      return n;
    });
    if (modifiedLocal) {
      saveLocalNotes(updatedLocal);
    }

    // Update in Global Cloud Catalog
    try {
      const cloudNotes = await CloudShareService.fetchAllNotesFromGlobalCatalog();
      const target = cloudNotes.find(
        (n) => n.share && (n.share.custom_slug === slug || n.share.id === slug || n.id === slug)
      );
      if (target && target.share) {
        const updatedShare: NoteShare = {
          ...target.share,
          ...updatePayload,
        };
        const updatedNote: Note = {
          ...target,
          share: updatedShare,
          updated_at: now,
        };
        await CloudShareService.syncNoteToGlobalCatalog(updatedNote, updatedShare);
        await CloudShareService.syncNoteToCloud(updatedNote, updatedShare);
      }
    } catch {}

    return { success: true };
  },

  async deleteShare(slug: string): Promise<{ success: boolean; error?: string }> {
    // 1. Remove from local note
    const localNotes = getLocalNotes();
    let modified = false;
    const updated = localNotes.map((n) => {
      if (n.share && (n.share.custom_slug === slug || n.share.id === slug || n.id === slug)) {
        modified = true;
        return { ...n, share: undefined };
      }
      return n;
    });
    if (modified) saveLocalNotes(updated);

    // 2. Remove share in Global Catalog & Cloud
    try {
      const cloudNotes = await CloudShareService.fetchAllNotesFromGlobalCatalog();
      const target = cloudNotes.find(
        (n) => n.share && (n.share.custom_slug === slug || n.share.id === slug || n.id === slug)
      );
      if (target) {
        const updatedNote: Note = {
          ...target,
          share: undefined,
          updated_at: new Date().toISOString(),
        };
        await CloudShareService.syncNoteToGlobalCatalog(updatedNote, null);
        await CloudShareService.syncNoteToCloud(updatedNote, null);
      }
    } catch {}

    return { success: true };
  },

  // ----------------------------------------------------
  // GESTÃO DE LIMITES E REGRAS DA PLATAFORMA
  // ----------------------------------------------------
  getPlatformLimits(): PlatformLimits {
    return PlatformSettingsService.getLimits();
  },

  async updatePlatformLimits(partial: Partial<PlatformLimits>): Promise<PlatformLimits> {
    return PlatformSettingsService.updateLimits(partial);
  },
};

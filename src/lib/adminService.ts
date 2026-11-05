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
import { generateSalt, hashPassword } from './crypto';
import { getLocalNotes, saveLocalNotes } from './storage';
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

    // 1. Local notes
    const local = getLocalNotes();
    for (const n of local) {
      notesMap.set(n.id, n);
    }

    // 2. Fetch from Firestore
    try {
      const snap = await Promise.race([
        getDocs(collection(db, 'notes')),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 1800)),
      ]);

      if (snap && !snap.empty) {
        snap.forEach((d) => {
          const data = d.data() as Partial<Note>;
          if (data && data.id) {
            notesMap.set(data.id, {
              id: data.id,
              local_id: data.local_id || data.id,
              title: data.title || '',
              content: data.content || '',
              created_at: data.created_at || new Date().toISOString(),
              updated_at: data.updated_at || new Date().toISOString(),
              owner_token: data.owner_token || '',
              user_id: data.user_id,
              owner_username: data.owner_username,
              is_pinned: Boolean(data.is_pinned),
              color: data.color,
              attachments: data.attachments || [],
              share: data.share || null,
            });
          }
        });
      }
    } catch {}

    return Array.from(notesMap.values()).sort(
      (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    );
  },

  async updateNote(
    noteId: string,
    updates: { title?: string; content?: string; is_pinned?: boolean }
  ): Promise<{ success: boolean; error?: string }> {
    const now = new Date().toISOString();

    // 1. Update local notes
    const localNotes = getLocalNotes();
    const updatedLocal = localNotes.map((n) => {
      if (n.id === noteId) {
        return {
          ...n,
          ...updates,
          updated_at: now,
        };
      }
      return n;
    });
    saveLocalNotes(updatedLocal);

    // 2. Update Firestore
    try {
      await Promise.race([
        updateDoc(doc(db, 'notes', noteId), {
          ...updates,
          updated_at: now,
        }),
        new Promise<null>((res) => setTimeout(() => res(null), 1500)),
      ]);
    } catch {}

    return { success: true };
  },

  async deleteNote(noteId: string): Promise<{ success: boolean; error?: string }> {
    // 1. Delete local
    const localNotes = getLocalNotes();
    const filtered = localNotes.filter((n) => n.id !== noteId);
    saveLocalNotes(filtered);

    // 2. Delete Firestore
    try {
      await Promise.race([
        deleteDoc(doc(db, 'notes', noteId)),
        new Promise<null>((res) => setTimeout(() => res(null), 1500)),
      ]);
    } catch {}

    return { success: true };
  },

  // ----------------------------------------------------
  // GESTÃO DE LINKS DE COMPARTILHAMENTO
  // ----------------------------------------------------
  async getAllShares(): Promise<Array<NoteShare & { note_title?: string }>> {
    const sharesMap = new Map<string, NoteShare & { note_title?: string }>();

    // 1. From local notes
    const localNotes = getLocalNotes();
    for (const n of localNotes) {
      if (n.share && n.share.custom_slug) {
        sharesMap.set(n.share.custom_slug, {
          ...n.share,
          note_title: n.title || 'Sem título',
        });
      }
    }

    // 2. From Firestore note_shares collection
    try {
      const snap = await Promise.race([
        getDocs(collection(db, 'note_shares')),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 1800)),
      ]);

      if (snap && !snap.empty) {
        snap.forEach((d) => {
          const data = d.data() as any;
          if (data && (data.custom_slug || d.id)) {
            const slug = data.custom_slug || d.id;
            sharesMap.set(slug, {
              id: data.id || d.id,
              note_id: data.note_id || slug,
              custom_slug: slug,
              is_password_protected: Boolean(data.is_password_protected),
              password_hash: data.password_hash,
              password_salt: data.password_salt,
              is_active: data.is_active !== false,
              created_at: data.created_at || new Date().toISOString(),
              updated_at: data.updated_at || new Date().toISOString(),
              view_count: data.view_count || 0,
              owner_token: data.owner_token,
              owner_username: data.owner_username,
              allowed_users: data.allowed_users || [],
              note_title: data.note_title || sharesMap.get(slug)?.note_title || 'Nota Compartilhada',
            });
          }
        });
      }
    } catch {}

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
      if (n.share && n.share.custom_slug === slug) {
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

    // Update in Firestore
    try {
      await Promise.race([
        updateDoc(doc(db, 'note_shares', slug), updatePayload),
        new Promise<null>((res) => setTimeout(() => res(null), 1500)),
      ]);
    } catch {}

    return { success: true };
  },

  async deleteShare(slug: string): Promise<{ success: boolean; error?: string }> {
    // 1. Remove from local note
    const localNotes = getLocalNotes();
    let modified = false;
    const updated = localNotes.map((n) => {
      if (n.share && n.share.custom_slug === slug) {
        modified = true;
        return { ...n, share: null };
      }
      return n;
    });
    if (modified) saveLocalNotes(updated);

    // 2. Delete Firestore doc
    try {
      await Promise.race([
        deleteDoc(doc(db, 'note_shares', slug)),
        new Promise<null>((res) => setTimeout(() => res(null), 1500)),
      ]);
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

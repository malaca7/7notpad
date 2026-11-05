import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getFirestore, 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs, 
  deleteDoc, 
  query, 
  where, 
  updateDoc,
  increment,
  type Firestore
} from 'firebase/firestore';
import type { Note, NoteShare, SharedUserAccess } from '../types/note';

export const firebaseConfig = {
  apiKey: "AIzaSyD1kR3dRwS_K8ZNximxR10v0Ea1OnQt38I",
  authDomain: "malacagroup.firebaseapp.com",
  projectId: "malacagroup",
  storageBucket: "malacagroup.firebasestorage.app",
  messagingSenderId: "769206753468",
  appId: "1:769206753468:web:14b773be3e9ade5ccf18b9",
  measurementId: "G-MDLKV24XCN"
};

// Initialize Firebase App
export const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const db: Firestore = getFirestore(app);

// Helper to prevent Firestore calls from hanging indefinitely when offline or unconfigured
function withTimeout<T>(promise: Promise<T>, ms = 1500): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error('Firestore timeout')), ms)
    )
  ]);
}

// Firestore Collections:
// 1. 'notes': doc id is note.id
// 2. 'note_shares': doc id is custom_slug

export const FirebaseService = {
  // Save or update note in Firestore
  async saveNote(note: Note): Promise<boolean> {
    try {
      const allowedUsers = note.share?.allowed_users || [];
      const allowedUsernames = allowedUsers.map((u) =>
        u.username.toLowerCase().replace(/^@+/, '')
      );

      const noteRef = doc(db, 'notes', note.id);
      await withTimeout(setDoc(noteRef, {
        id: note.id,
        local_id: note.local_id || note.id,
        title: note.title || '',
        content: note.content || '',
        created_at: note.created_at,
        updated_at: note.updated_at,
        owner_token: note.owner_token,
        user_id: note.user_id || null,
        owner_username: note.owner_username || null,
        is_pinned: Boolean(note.is_pinned),
        color: note.color || null,
        share: note.share || null,
        attachments: note.attachments || [],
        allowed_usernames: allowedUsernames,
      }, { merge: true }));

      // If note has a share, also sync the note_shares collection!
      if (note.share) {
        await this.saveShare(note.share, note);
      }

      return true;
    } catch (err) {
      console.warn('Firebase saveNote error:', err);
      return false;
    }
  },

  // Fetch all notes for a specific owner_token, user_id, or shared with user
  async fetchNotes(ownerToken: string, userId?: string, username?: string): Promise<Note[]> {
    try {
      const notesRef = collection(db, 'notes');
      const notesMap = new Map<string, Note>();

      const addDocToMap = (docSnap: any) => {
        const data = docSnap.data();
        const id = data.id || docSnap.id;
        notesMap.set(id, {
          id,
          local_id: data.local_id || id,
          title: data.title || '',
          content: data.content || '',
          created_at: data.created_at || new Date().toISOString(),
          updated_at: data.updated_at || new Date().toISOString(),
          owner_token: data.owner_token || ownerToken,
          user_id: data.user_id || undefined,
          owner_username: data.owner_username || undefined,
          is_pinned: Boolean(data.is_pinned),
          color: data.color || undefined,
          share: data.share || null,
          attachments: data.attachments || [],
        });
      };

      // 1. Fetch by user_id
      if (userId) {
        try {
          const userSnap = await withTimeout(getDocs(query(notesRef, where('user_id', '==', userId))), 2000);
          userSnap.forEach(addDocToMap);
        } catch {}
      }

      // 2. Fetch by owner_token
      if (ownerToken) {
        try {
          const ownerSnap = await withTimeout(getDocs(query(notesRef, where('owner_token', '==', ownerToken))), 2000);
          ownerSnap.forEach(addDocToMap);
        } catch {}
      }

      // 3. Fetch notes shared with this user (@username)
      if (username) {
        const cleanUser = username.trim().toLowerCase().replace(/^@+/, '');
        try {
          const sharedSnap = await withTimeout(
            getDocs(query(notesRef, where('allowed_usernames', 'array-contains', cleanUser))),
            2000
          );
          sharedSnap.forEach(addDocToMap);
        } catch {}
      }

      const notes = Array.from(notesMap.values());
      return notes.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
    } catch (err) {
      console.warn('Firebase fetchNotes error:', err);
      return [];
    }
  },

  // Delete note from Firestore
  async deleteNote(noteId: string): Promise<boolean> {
    try {
      // 1. Delete note document
      await withTimeout(deleteDoc(doc(db, 'notes', noteId)));

      // 2. Also query and delete any corresponding shares
      const sharesRef = collection(db, 'note_shares');
      const q = query(sharesRef, where('note_id', '==', noteId));
      const snapshot = await withTimeout(getDocs(q));
      const deletePromises = snapshot.docs.map(d => withTimeout(deleteDoc(d.ref)));
      await Promise.all(deletePromises);

      return true;
    } catch (err) {
      console.warn('Firebase deleteNote error:', err);
      return false;
    }
  },

  // Save or update public share in Firestore
  async saveShare(share: NoteShare, note: Note): Promise<{ success: boolean; error?: string }> {
    try {
      const targetSlug = (share.custom_slug || note.id).trim();
      const allowedUsers = share.allowed_users || note.share?.allowed_users || [];
      const allowedUsernames = allowedUsers.map((u) => u.username.toLowerCase().replace(/^@+/, ''));

      // Check if targetSlug is already taken by another note
      const shareDocRef = doc(db, 'note_shares', targetSlug);
      const existing = await withTimeout(getDoc(shareDocRef));

      if (existing.exists()) {
        const existingData = existing.data();
        if (existingData.note_id && existingData.note_id !== note.id) {
          return { success: false, error: 'Este link já está em uso por outra nota.' };
        }
      }

      const sharePayload = {
        id: share.id || crypto.randomUUID(),
        note_id: note.id,
        custom_slug: targetSlug,
        is_password_protected: Boolean(share.is_password_protected),
        password_salt: share.password_salt || null,
        password_hash: share.password_hash || null,
        is_active: share.is_active ?? true,
        created_at: share.created_at || new Date().toISOString(),
        updated_at: share.updated_at || new Date().toISOString(),
        view_count: share.view_count || 0,
        owner_token: note.owner_token || share.owner_token || null,
        owner_user_id: note.user_id || share.owner_user_id || null,
        owner_username: note.owner_username || share.owner_username || null,
        allowed_users: allowedUsers,
        allowed_usernames: allowedUsernames,
        // Public note presentation fields
        note_title: note.title || '',
        note_content: note.content || '',
        note_created_at: note.created_at,
        note_updated_at: note.updated_at,
        note_attachments: note.attachments || []
      };

      // 1. Save share doc at targetSlug
      await withTimeout(setDoc(shareDocRef, sharePayload, { merge: true }));

      // 2. If targetSlug is different from note.id, ALSO save alias at note_shares/{note.id}
      // so visiting /notpad/<note.id> works 100% reliably across all devices!
      if (targetSlug !== note.id) {
        const aliasDocRef = doc(db, 'note_shares', note.id);
        await withTimeout(setDoc(aliasDocRef, sharePayload, { merge: true })).catch(() => {});
      }

      // 3. Keep notes collection in sync with the share and allowed_usernames
      const noteDocRef = doc(db, 'notes', note.id);
      await withTimeout(
        setDoc(
          noteDocRef,
          {
            share: { ...share, custom_slug: targetSlug, allowed_users: allowedUsers },
            allowed_usernames: allowedUsernames,
            updated_at: share.updated_at || new Date().toISOString(),
          },
          { merge: true }
        )
      ).catch(() => {});

      return { success: true };
    } catch (err: any) {
      console.warn('Firebase saveShare error:', err);
      return { success: false, error: err?.message || 'Erro ao salvar na nuvem.' };
    }
  },

  // Revoke share in Firestore
  async revokeShare(slug: string): Promise<boolean> {
    try {
      const shareDocRef = doc(db, 'note_shares', slug);
      await withTimeout(deleteDoc(shareDocRef));
      return true;
    } catch (err) {
      console.warn('Firebase revokeShare error:', err);
      return false;
    }
  },

  // Check if a slug is already taken
  async isSlugTaken(slug: string, currentNoteId: string): Promise<boolean> {
    try {
      const shareDocRef = doc(db, 'note_shares', slug);
      const snap = await withTimeout(getDoc(shareDocRef), 1000);
      if (snap.exists()) {
        const data = snap.data();
        return data.note_id !== currentNoteId;
      }
      return false;
    } catch {
      return false;
    }
  },

  // Fetch Public Shared Note by slug (for ANY visitor in ANY browser!)
  async fetchPublicNote(slug: string): Promise<{
    found: boolean;
    share?: NoteShare;
    note?: Partial<Note>;
    error?: string;
  }> {
    try {
      let data: any = null;
      let shareDocRef = doc(db, 'note_shares', slug);
      let snap = await withTimeout(getDoc(shareDocRef));

      // 1. Try directly from note_shares/{slug}
      if (snap.exists()) {
        data = snap.data();
      }

      // 2. If not found in note_shares, try notes/{slug} (UUID / ID match)!
      if (!data) {
        const noteDocRef = doc(db, 'notes', slug);
        const noteSnap = await withTimeout(getDoc(noteDocRef));
        if (noteSnap.exists()) {
          const noteRaw = noteSnap.data();
          data = {
            id: noteRaw.id || noteSnap.id,
            note_id: noteRaw.id || noteSnap.id,
            custom_slug: noteRaw.share?.custom_slug || slug,
            is_password_protected: Boolean(noteRaw.share?.is_password_protected),
            password_salt: noteRaw.share?.password_salt,
            password_hash: noteRaw.share?.password_hash,
            is_active: noteRaw.share ? noteRaw.share.is_active : true,
            created_at: noteRaw.created_at,
            updated_at: noteRaw.updated_at,
            view_count: noteRaw.share?.view_count || 0,
            owner_token: noteRaw.owner_token,
            owner_user_id: noteRaw.user_id,
            owner_username: noteRaw.owner_username,
            allowed_users: noteRaw.share?.allowed_users || [],
            note_title: noteRaw.title || '',
            note_content: noteRaw.content || '',
            note_created_at: noteRaw.created_at,
            note_updated_at: noteRaw.updated_at,
            note_attachments: noteRaw.attachments || [],
          };
        }
      }

      // 3. If still not found, search note_shares where note_id == slug
      if (!data) {
        const sharesRef = collection(db, 'note_shares');
        const qSnap = await withTimeout(getDocs(query(sharesRef, where('note_id', '==', slug))));
        if (!qSnap.empty) {
          data = qSnap.docs[0].data();
          shareDocRef = qSnap.docs[0].ref as any;
        }
      }

      if (!data) {
        return { found: false, error: 'Nota não encontrada.' };
      }

      if (data.is_active === false) {
        return { found: false, error: 'O compartilhamento desta nota foi desativado.' };
      }

      // Increment view count asynchronously
      try {
        if (shareDocRef) {
          updateDoc(shareDocRef, { view_count: increment(1) }).catch(() => {});
        }
      } catch {}

      const isProtected = Boolean(data.is_password_protected);
      const allowedUsers: SharedUserAccess[] = data.allowed_users || data.share?.allowed_users || [];

      return {
        found: true,
        share: {
          id: data.id || data.note_id || slug,
          note_id: data.note_id || data.id || slug,
          custom_slug: data.custom_slug || slug,
          is_password_protected: isProtected,
          password_salt: data.password_salt,
          password_hash: data.password_hash,
          is_active: data.is_active ?? true,
          created_at: data.created_at || data.note_created_at || new Date().toISOString(),
          updated_at: data.updated_at || data.note_updated_at || new Date().toISOString(),
          view_count: (data.view_count || 0) + 1,
          owner_token: data.owner_token,
          owner_user_id: data.owner_user_id || data.user_id,
          owner_username: data.owner_username,
          allowed_users: allowedUsers,
        },
        note: {
          id: data.note_id || data.id || slug,
          title: data.note_title ?? data.title ?? 'Nota sem título',
          // If password protected, do NOT expose content until password verified!
          content: isProtected ? '' : (data.note_content ?? data.content ?? ''),
          created_at: data.note_created_at || data.created_at,
          updated_at: data.note_updated_at || data.updated_at,
          attachments: data.note_attachments || data.attachments || [],
          owner_token: data.owner_token,
          user_id: data.owner_user_id || data.user_id,
          owner_username: data.owner_username,
        }
      };
    } catch (err: any) {
      console.warn('Firebase fetchPublicNote error:', err);
      return { found: false, error: err?.message || 'Erro ao carregar do servidor.' };
    }
  },

  // Retrieve protected content after valid password verification
  async unlockProtectedNoteContent(slug: string): Promise<string | null> {
    try {
      const shareDocRef = doc(db, 'note_shares', slug);
      const snap = await withTimeout(getDoc(shareDocRef));
      if (snap.exists()) {
        const data = snap.data();
        if (data.note_content) return data.note_content;
      }
      const noteDocRef = doc(db, 'notes', slug);
      const noteSnap = await withTimeout(getDoc(noteDocRef));
      if (noteSnap.exists()) {
        const data = noteSnap.data();
        return data.content || null;
      }
      return null;
    } catch (err) {
      console.warn('Firebase unlock error:', err);
      return null;
    }
  },

  // Migrate all local notes and shares to Firebase Firestore
  async migrateLocalData(localNotes: Note[], localShares: Record<string, NoteShare>): Promise<{ migratedNotes: number; migratedShares: number }> {
    let migratedNotes = 0;
    let migratedShares = 0;

    for (const note of localNotes) {
      try {
        await this.saveNote(note);
        migratedNotes++;
      } catch (err) {
        console.warn(`Failed to migrate note ${note.id}:`, err);
      }
    }

    for (const [slug, share] of Object.entries(localShares)) {
      try {
        const matchingNote = localNotes.find(n => n.id === share.note_id);
        if (matchingNote) {
          await this.saveShare(share, matchingNote);
          migratedShares++;
        }
      } catch (err) {
        console.warn(`Failed to migrate share ${slug}:`, err);
      }
    }

    return { migratedNotes, migratedShares };
  }
};

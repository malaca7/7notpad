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
import type { Note, NoteShare } from '../types/note';

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

// Firestore Collections:
// 1. 'notes': doc id is note.id
// 2. 'note_shares': doc id is custom_slug

export const FirebaseService = {
  // Save or update note in Firestore
  async saveNote(note: Note): Promise<boolean> {
    try {
      const noteRef = doc(db, 'notes', note.id);
      await setDoc(noteRef, {
        id: note.id,
        local_id: note.local_id || note.id,
        title: note.title,
        content: note.content,
        created_at: note.created_at,
        updated_at: note.updated_at,
        owner_token: note.owner_token,
        is_pinned: Boolean(note.is_pinned),
        color: note.color || null,
        share: note.share || null,
        attachments: note.attachments || []
      }, { merge: true });

      // If note has an active share, also update the note_shares collection!
      if (note.share && note.share.custom_slug) {
        await this.saveShare(note.share, note);
      }

      return true;
    } catch (err) {
      console.warn('Firebase saveNote error:', err);
      return false;
    }
  },

  // Fetch all notes for a specific owner_token
  async fetchNotes(ownerToken: string): Promise<Note[]> {
    try {
      const notesRef = collection(db, 'notes');
      const q = query(notesRef, where('owner_token', '==', ownerToken));
      const snapshot = await getDocs(q);

      const notes: Note[] = [];
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        notes.push({
          id: data.id || docSnap.id,
          local_id: data.local_id || docSnap.id,
          title: data.title || '',
          content: data.content || '',
          created_at: data.created_at || new Date().toISOString(),
          updated_at: data.updated_at || new Date().toISOString(),
          owner_token: data.owner_token || ownerToken,
          is_pinned: Boolean(data.is_pinned),
          color: data.color || undefined,
          share: data.share || null,
          attachments: data.attachments || []
        });
      });

      // Sort by updated_at descending
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
      await deleteDoc(doc(db, 'notes', noteId));

      // 2. Also query and delete any corresponding shares
      const sharesRef = collection(db, 'note_shares');
      const q = query(sharesRef, where('note_id', '==', noteId));
      const snapshot = await getDocs(q);
      const deletePromises = snapshot.docs.map(d => deleteDoc(d.ref));
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
      // Check if custom_slug is already taken by another note
      const shareDocRef = doc(db, 'note_shares', share.custom_slug);
      const existing = await getDoc(shareDocRef);

      if (existing.exists()) {
        const existingData = existing.data();
        if (existingData.note_id && existingData.note_id !== note.id) {
          return { success: false, error: 'Este link já está em uso por outra nota.' };
        }
      }

      // Save share doc (accessible by any visitor)
      await setDoc(shareDocRef, {
        id: share.id,
        note_id: note.id,
        custom_slug: share.custom_slug,
        is_password_protected: Boolean(share.is_password_protected),
        password_salt: share.password_salt || null,
        password_hash: share.password_hash || null,
        is_active: share.is_active,
        created_at: share.created_at,
        updated_at: share.updated_at,
        view_count: share.view_count || 0,
        // Public note presentation fields
        note_title: note.title,
        note_content: note.content,
        note_created_at: note.created_at,
        note_updated_at: note.updated_at,
        note_attachments: note.attachments || []
      }, { merge: true });

      return { success: true };
    } catch (err: any) {
      console.warn('Firebase saveShare error:', err);
      return { success: false, error: err?.message || 'Erro ao salvar no Firebase.' };
    }
  },

  // Revoke share in Firestore
  async revokeShare(slug: string): Promise<boolean> {
    try {
      const shareDocRef = doc(db, 'note_shares', slug);
      await deleteDoc(shareDocRef);
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
      const snap = await getDoc(shareDocRef);
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
      const shareDocRef = doc(db, 'note_shares', slug);
      const snap = await getDoc(shareDocRef);

      if (!snap.exists()) {
        return { found: false, error: 'Nota não encontrada.' };
      }

      const data = snap.data();
      if (!data.is_active) {
        return { found: false, error: 'O compartilhamento desta nota foi desativado.' };
      }

      // Increment view count asynchronously
      updateDoc(shareDocRef, { view_count: increment(1) }).catch(() => {});

      const isProtected = Boolean(data.is_password_protected);

      return {
        found: true,
        share: {
          id: data.id || snap.id,
          note_id: data.note_id,
          custom_slug: data.custom_slug || slug,
          is_password_protected: isProtected,
          password_salt: data.password_salt,
          password_hash: data.password_hash,
          is_active: data.is_active,
          created_at: data.created_at || new Date().toISOString(),
          updated_at: data.updated_at || new Date().toISOString(),
          view_count: (data.view_count || 0) + 1
        },
        note: {
          id: data.note_id,
          title: data.note_title || 'Nota sem título',
          // If password protected, do NOT expose content until password verified!
          content: isProtected ? '' : (data.note_content || ''),
          created_at: data.note_created_at,
          updated_at: data.note_updated_at,
          attachments: data.note_attachments || []
        }
      };
    } catch (err: any) {
      console.warn('Firebase fetchPublicNote error:', err);
      return { found: false, error: err?.message || 'Erro ao carregar do Firebase.' };
    }
  },

  // Retrieve protected content after valid password verification
  async unlockProtectedNoteContent(slug: string): Promise<string | null> {
    try {
      const shareDocRef = doc(db, 'note_shares', slug);
      const snap = await getDoc(shareDocRef);
      if (snap.exists()) {
        const data = snap.data();
        return data.note_content || null;
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

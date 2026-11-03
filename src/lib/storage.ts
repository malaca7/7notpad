import type { Note, NoteShare } from '../types/note';
import { getOrCreateOwnerToken } from './crypto';
import { FirebaseService } from './firebase';
import { parsePortablePayload, decryptContent, type PortableNoteData } from './portableShare';

const LOCAL_STORAGE_NOTES_KEY = '7notpad_notes';
const LOCAL_STORAGE_SHARES_KEY = '7notpad_shares';
const PORTABLE_CACHE_KEY = '7notpad_portable_cache_';
const MIGRATED_FLAG_KEY = '7notpad_firebase_migrated';

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
  <li><strong>Totalmente Privado &amp; Automático:</strong> Suas alterações são salvas automaticamente na nuvem Firebase.</li>
</ul>
<blockquote>
  <p><strong>Nuvem Ativa:</strong> Suas notas agora contam com sincronização global no Firebase para links compartilhados funcionarem perfeitamente em qualquer dispositivo.</p>
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
  } catch (err) {
    console.error('Error saving local shares:', err);
  }
}

// Temporary in-memory cache for decrypted portable data
let activePortableData: (PortableNoteData & { slug: string }) | null = null;

/**
 * Storage Service: combines Local-First with Firebase Firestore
 */
export const StorageService = {
  // Fetch all notes for current owner
  async fetchNotes(): Promise<Note[]> {
    const ownerToken = getOrCreateOwnerToken();
    const localNotes = getLocalNotes();

    try {
      // 1. Trigger migration if not done yet
      const isMigrated = localStorage.getItem(MIGRATED_FLAG_KEY);
      if (!isMigrated && localNotes.length > 0) {
        const localShares = getLocalShares();
        await FirebaseService.migrateLocalData(localNotes, localShares);
        localStorage.setItem(MIGRATED_FLAG_KEY, 'true');
      }

      // 2. Fetch fresh notes from Firebase
      const remoteNotes = await FirebaseService.fetchNotes(ownerToken);

      if (remoteNotes && remoteNotes.length > 0) {
        // Merge remote notes with local notes (prefer newest updated_at)
        const mergedMap = new Map<string, Note>();
        for (const n of localNotes) {
          mergedMap.set(n.id, n);
        }
        for (const n of remoteNotes) {
          const local = mergedMap.get(n.id);
          if (!local || new Date(n.updated_at) >= new Date(local.updated_at)) {
            mergedMap.set(n.id, n);
          }
        }

        const mergedNotes = Array.from(mergedMap.values()).sort(
          (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
        );

        saveLocalNotes(mergedNotes);
        return mergedNotes;
      } else if (localNotes.length > 0) {
        // If Firebase is empty, sync local notes to Firebase
        for (const localNote of localNotes) {
          await FirebaseService.saveNote(localNote);
        }
      }

      return localNotes;
    } catch (err) {
      console.warn('Network or Firebase failure, using local notes:', err);
      return localNotes;
    }
  },

  // Save or update note
  async saveNote(note: Note): Promise<{ success: boolean }> {
    // 1. Update local storage first (instant responsiveness)
    const localNotes = getLocalNotes();
    const existingIndex = localNotes.findIndex(n => n.id === note.id || n.local_id === note.local_id);
    
    if (existingIndex >= 0) {
      localNotes[existingIndex] = { ...note, updated_at: new Date().toISOString() };
    } else {
      localNotes.unshift(note);
    }
    saveLocalNotes(localNotes);

    // 2. Push to Firebase Firestore
    try {
      await FirebaseService.saveNote(note);
      return { success: true };
    } catch (err) {
      console.warn('Firebase save note warning:', err);
      return { success: true }; // still saved locally
    }
  },

  // Delete note
  async deleteNote(noteId: string): Promise<boolean> {
    // 1. Remove from local storage
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

    // 2. Delete from Firebase
    try {
      await FirebaseService.deleteNote(noteId);
    } catch (err) {
      console.warn('Firebase delete note error:', err);
    }

    return true;
  },

  // Save / Update Share
  async saveShare(share: NoteShare): Promise<{ success: boolean; error?: string }> {
    // 1. Local storage persistence
    const localShares = getLocalShares();
    localShares[share.custom_slug] = share;
    saveLocalShares(localShares);

    const localNotes = getLocalNotes();
    const note = localNotes.find(n => n.id === share.note_id);
    if (note) {
      note.share = share;
      saveLocalNotes(localNotes);

      // 2. Save directly to Firebase Firestore
      return await FirebaseService.saveShare(share, note);
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
    const note = localNotes.find(n => n.share?.custom_slug === slug);
    if (note) {
      note.share = null;
      saveLocalNotes(localNotes);
    }

    // Revoke from Firebase
    await FirebaseService.revokeShare(slug);

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

  // Fetch Public Shared Note by slug (for ANY visitor in ANY browser!)
  async fetchPublicNote(slug: string): Promise<{
    found: boolean;
    share?: NoteShare;
    note?: Partial<Note>;
    error?: string;
    isCloudConfigured?: boolean;
    isPortable?: boolean;
  }> {
    // 1. Query Firebase Firestore first (live global cloud database!)
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
    } catch (err) {
      console.warn('Firebase fetch public note error:', err);
    }

    // 2. Check if there is a portable payload in URL hash or query string
    const hash = window.location.hash;
    const search = window.location.search;
    const portableData = await parsePortablePayload(hash || search);

    if (portableData) {
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

    // 3. Local shares fallback (same browser)
    const localShares = getLocalShares();
    const share = localShares[slug];
    if (share && share.is_active) {
      const localNotes = getLocalNotes();
      const note = localNotes.find(n => n.id === share.note_id);
      if (note) {
        return {
          found: true,
          share,
          note: {
            id: note.id,
            title: note.title,
            content: share.is_password_protected ? '' : note.content,
            created_at: note.created_at,
            updated_at: note.updated_at,
            attachments: note.attachments
          }
        };
      }
    }

    return { 
      found: false, 
      error: 'Nota não encontrada.',
      isCloudConfigured: true
    };
  },

  // Retrieve protected content after valid password verification
  async unlockProtectedNoteContent(slug: string, passwordInput?: string): Promise<string | null> {
    // 1. Firebase Firestore
    const cloudContent = await FirebaseService.unlockProtectedNoteContent(slug);
    if (cloudContent) {
      return cloudContent;
    }

    // 2. Portable data with AES decryption
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

    // 3. Local fallback
    const localShares = getLocalShares();
    const share = localShares[slug];
    if (share) {
      const localNotes = getLocalNotes();
      const note = localNotes.find(n => n.id === share.note_id);
      if (note) {
        return note.content;
      }
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

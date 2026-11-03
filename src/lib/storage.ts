import type { Note, NoteShare } from '../types/note';
import { getSupabase, isSupabaseConfigured } from './supabase';
import { getOrCreateOwnerToken } from './crypto';

const LOCAL_STORAGE_NOTES_KEY = '7notpad_notes';
const LOCAL_STORAGE_SHARES_KEY = '7notpad_shares';

// Initial starter note with helpful tips
const WELCOME_NOTE_HTML = `
<h2>✨ Bem-vindo ao <strong>7NotPad</strong>!</h2>
<p>Seu bloco de notas online rápido, moderno e <strong>sem necessidade de cadastro ou login</strong>.</p>
<hr/>
<h3>⚡ O que você pode fazer aqui:</h3>
<ul>
  <li><strong>Formatação Avançada:</strong> Digite em negrito, itálico, sublinhado, tachado, crie listas ordenadas, listas com marcadores e listas de tarefas.</li>
  <li><strong>Inserir Imagens &amp; Anexos:</strong> Adicione imagens diretamente pelo botão da barra de ferramentas ou anexe arquivos importantes (PDFs, documentos, etc).</li>
  <li><strong>Compartilhamento com Link Personalizado:</strong> Gere links no formato <code>7notpad.com/n/seu-link</code> e proteja com senha se desejar!</li>
  <li><strong>Totalmente Privado &amp; Automático:</strong> Suas alterações são salvas automaticamente a cada digitação.</li>
</ul>
<blockquote>
  <p><strong>Dica de Segurança:</strong> Como não exigimos login, suas notas são vinculadas com segurança a este navegador. Não limpe o cache do navegador sem antes exportar um backup se desejar guardá-las permanentemente!</p>
</blockquote>
`;

export function getLocalNotes(): Note[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_NOTES_KEY);
    if (!raw) {
      // First access: generate default welcome note
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

/**
 * Storage Service: combines Local-First with Supabase Cloud Sync
 */
export const StorageService = {
  // Fetch all notes for current owner
  async fetchNotes(): Promise<Note[]> {
    const ownerToken = getOrCreateOwnerToken();
    const localNotes = getLocalNotes();

    if (!isSupabaseConfigured()) {
      return localNotes;
    }

    const supabase = getSupabase();
    if (!supabase) return localNotes;

    try {
      // Fetch notes from Supabase
      const { data: remoteNotes, error: notesError } = await supabase
        .from('notes')
        .select(`
          id, local_id, title, content, created_at, updated_at, owner_token, is_pinned, color,
          note_shares (*),
          attachments (*)
        `)
        .eq('owner_token', ownerToken)
        .order('updated_at', { ascending: false });

      if (notesError) {
        console.warn('Supabase fetch error, fallback to local:', notesError);
        return localNotes;
      }

      if (remoteNotes && remoteNotes.length > 0) {
        // Map to Note structure
        const mappedNotes: Note[] = remoteNotes.map(n => ({
          id: n.id,
          local_id: n.local_id || n.id,
          title: n.title || '',
          content: n.content || '',
          created_at: n.created_at,
          updated_at: n.updated_at,
          owner_token: n.owner_token,
          is_pinned: Boolean(n.is_pinned),
          color: n.color || undefined,
          share: Array.isArray(n.note_shares) && n.note_shares.length > 0 ? n.note_shares[0] : null,
          attachments: Array.isArray(n.attachments) ? n.attachments : []
        }));

        saveLocalNotes(mappedNotes);
        return mappedNotes;
      } else if (localNotes.length > 0) {
        // Sync local notes to Supabase for the first time
        for (const localNote of localNotes) {
          await this.saveNote(localNote);
        }
      }

      return localNotes;
    } catch (err) {
      console.warn('Network or Supabase failure, using local notes:', err);
      return localNotes;
    }
  },

  // Save or update note
  async saveNote(note: Note): Promise<{ success: boolean; remoteId?: string }> {
    // 1. Always update local storage first (instant responsiveness)
    const localNotes = getLocalNotes();
    const existingIndex = localNotes.findIndex(n => n.id === note.id || n.local_id === note.local_id);
    
    if (existingIndex >= 0) {
      localNotes[existingIndex] = { ...note, updated_at: new Date().toISOString() };
    } else {
      localNotes.unshift(note);
    }
    saveLocalNotes(localNotes);

    // 2. If Supabase configured, push to cloud
    if (isSupabaseConfigured()) {
      const supabase = getSupabase();
      if (supabase) {
        try {
          const { data, error } = await supabase
            .from('notes')
            .upsert({
              id: note.id,
              local_id: note.local_id,
              title: note.title,
              content: note.content,
              owner_token: note.owner_token,
              is_pinned: Boolean(note.is_pinned),
              color: note.color || null,
              updated_at: new Date().toISOString(),
            }, { onConflict: 'id' })
            .select()
            .single();

          if (error) {
            console.error('Supabase save note error:', error);
            return { success: false };
          }
          return { success: true, remoteId: data?.id };
        } catch (err) {
          console.error('Supabase network error saving note:', err);
          return { success: false };
        }
      }
    }

    return { success: true };
  },

  // Delete note
  async deleteNote(noteId: string): Promise<boolean> {
    // 1. Remove from local storage
    const localNotes = getLocalNotes().filter(n => n.id !== noteId && n.local_id !== noteId);
    saveLocalNotes(localNotes);

    // Also remove any local shares
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

    // 2. Remove from Supabase if configured
    if (isSupabaseConfigured()) {
      const supabase = getSupabase();
      if (supabase) {
        try {
          const { error } = await supabase
            .from('notes')
            .delete()
            .eq('id', noteId)
            .eq('owner_token', getOrCreateOwnerToken());

          if (error) {
            console.error('Supabase delete error:', error);
            return false;
          }
        } catch (err) {
          console.error('Supabase network error deleting note:', err);
          return false;
        }
      }
    }

    return true;
  },

  // Save / Update Share
  async saveShare(share: NoteShare): Promise<{ success: boolean; error?: string }> {
    // Local storage persistence
    const localShares = getLocalShares();
    localShares[share.custom_slug] = share;
    saveLocalShares(localShares);

    // Update note reference locally
    const localNotes = getLocalNotes();
    const note = localNotes.find(n => n.id === share.note_id);
    if (note) {
      note.share = share;
      saveLocalNotes(localNotes);
    }

    if (isSupabaseConfigured()) {
      const supabase = getSupabase();
      if (supabase) {
        try {
          // Check slug conflict
          const { data: existingShare } = await supabase
            .from('note_shares')
            .select('id, note_id')
            .eq('custom_slug', share.custom_slug)
            .single();

          if (existingShare && existingShare.note_id !== share.note_id) {
            return { success: false, error: 'Este link já está em uso por outra nota. Escolha um nome diferente.' };
          }

          const { error } = await supabase
            .from('note_shares')
            .upsert({
              id: share.id,
              note_id: share.note_id,
              custom_slug: share.custom_slug,
              is_password_protected: share.is_password_protected,
              password_hash: share.password_hash || null,
              password_salt: share.password_salt || null,
              is_active: share.is_active,
              updated_at: new Date().toISOString()
            }, { onConflict: 'custom_slug' });

          if (error) {
            console.error('Supabase save share error:', error);
            return { success: false, error: error.message };
          }
        } catch (err: any) {
          return { success: false, error: err?.message || 'Falha ao salvar compartilhamento na nuvem.' };
        }
      }
    }

    return { success: true };
  },

  // Revoke Share
  async revokeShare(shareId: string, slug: string): Promise<boolean> {
    const localShares = getLocalShares();
    if (localShares[slug]) {
      localShares[slug].is_active = false;
      delete localShares[slug];
      saveLocalShares(localShares);
    }

    const localNotes = getLocalNotes();
    const note = localNotes.find(n => n.share?.id === shareId || n.share?.custom_slug === slug);
    if (note) {
      note.share = null;
      saveLocalNotes(localNotes);
    }

    if (isSupabaseConfigured()) {
      const supabase = getSupabase();
      if (supabase) {
        try {
          await supabase.from('note_shares').delete().eq('id', shareId);
        } catch (err) {
          console.error('Error deleting share from Supabase:', err);
        }
      }
    }

    return true;
  },

  // Check if a custom slug is already in use
  async isSlugTaken(slug: string, currentNoteId: string): Promise<boolean> {
    // 1. Check local shares
    const localShares = getLocalShares();
    if (localShares[slug] && localShares[slug].note_id !== currentNoteId) {
      return true;
    }

    // 2. Check Supabase
    if (isSupabaseConfigured()) {
      const supabase = getSupabase();
      if (supabase) {
        try {
          const { data } = await supabase
            .from('note_shares')
            .select('id, note_id')
            .eq('custom_slug', slug)
            .maybeSingle();

          if (data && data.note_id !== currentNoteId) {
            return true;
          }
        } catch (err) {
          console.warn('Error checking slug:', err);
        }
      }
    }

    return false;
  },

  // Fetch Public Shared Note by slug (for visitor reading page)
  async fetchPublicNote(slug: string): Promise<{
    found: boolean;
    share?: NoteShare;
    note?: Partial<Note>;
    error?: string;
  }> {
    // Check Supabase first if configured
    if (isSupabaseConfigured()) {
      const supabase = getSupabase();
      if (supabase) {
        try {
          const { data: shareData, error: shareError } = await supabase
            .from('note_shares')
            .select(`
              id, note_id, custom_slug, is_password_protected, password_salt, password_hash, is_active,
              notes (id, title, content, created_at, updated_at)
            `)
            .eq('custom_slug', slug)
            .eq('is_active', true)
            .single();

          if (shareError || !shareData) {
            // Check local fallback
          } else {
            const noteData = shareData.notes as any;
            return {
              found: true,
              share: {
                id: shareData.id,
                note_id: shareData.note_id,
                custom_slug: shareData.custom_slug,
                is_password_protected: shareData.is_password_protected,
                password_hash: shareData.password_hash,
                password_salt: shareData.password_salt,
                is_active: shareData.is_active,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
              },
              note: {
                id: noteData?.id,
                title: noteData?.title || 'Sem título',
                // If password protected, do NOT expose content yet!
                content: shareData.is_password_protected ? '' : (noteData?.content || ''),
                created_at: noteData?.created_at,
                updated_at: noteData?.updated_at
              }
            };
          }
        } catch (err) {
          console.warn('Error querying Supabase for public note:', err);
        }
      }
    }

    // Local shares fallback
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
            // If password protected, content will only be revealed upon password verification
            content: share.is_password_protected ? '' : note.content,
            created_at: note.created_at,
            updated_at: note.updated_at,
            attachments: note.attachments
          }
        };
      }
    }

    return { found: false, error: 'Nota não encontrada ou link desativado.' };
  },

  // Retrieve protected content after valid password verification
  async unlockProtectedNoteContent(slug: string): Promise<string | null> {
    // 1. Supabase
    if (isSupabaseConfigured()) {
      const supabase = getSupabase();
      if (supabase) {
        try {
          const { data } = await supabase
            .from('note_shares')
            .select('notes (content)')
            .eq('custom_slug', slug)
            .single();
          
          if (data && (data.notes as any)?.content) {
            return (data.notes as any).content;
          }
        } catch (err) {
          console.error('Error unlocking note from Supabase:', err);
        }
      }
    }

    // 2. Local fallback
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
  }
};

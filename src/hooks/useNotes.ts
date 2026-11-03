import { useState, useEffect, useCallback, useRef } from 'react';
import type { Note, SaveStatus, NoteShare } from '../types/note';
import { StorageService } from '../lib/storage';
import { getOrCreateOwnerToken } from '../lib/crypto';
import { useToast } from '../components/common/Toast';

export function useNotes() {
  const { error } = useToast();
  const [notes, setNotes] = useState<Note[]>([]);
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const saveTimeoutRef = useRef<any>(null);
  const pendingUpdatesRef = useRef<Partial<Note> | null>(null);

  // Load notes on mount
  const loadNotes = useCallback(async () => {
    setIsLoading(true);
    try {
      const fetched = await StorageService.fetchNotes();
      setNotes(fetched);
      if (fetched.length > 0 && !activeNoteId) {
        // Find pinned or most recently updated
        const sorted = [...fetched].sort((a, b) => {
          if (a.is_pinned && !b.is_pinned) return -1;
          if (!a.is_pinned && b.is_pinned) return 1;
          return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
        });
        setActiveNoteId(sorted[0].id);
      }
    } catch (err) {
      console.error('Failed to load notes:', err);
    } finally {
      setIsLoading(false);
    }
  }, [activeNoteId]);

  useEffect(() => {
    loadNotes();
  }, []);

  // Get active note object
  const activeNote = notes.find((n) => n.id === activeNoteId) || null;

  // Create new note
  const createNote = useCallback((initialData?: { title?: string; content?: string }) => {
    const ownerToken = getOrCreateOwnerToken();
    const newNote: Note = {
      id: crypto.randomUUID(),
      local_id: crypto.randomUUID(),
      title: initialData?.title || '',
      content: initialData?.content || '',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      owner_token: ownerToken,
      is_pinned: false,
      attachments: [],
      share: null,
    };

    setNotes((prev) => [newNote, ...prev]);
    setActiveNoteId(newNote.id);
    setSaveStatus('saving');

    StorageService.saveNote(newNote)
      .then(() => setSaveStatus('saved'))
      .catch(() => setSaveStatus('error'));

    return newNote;
  }, []);

  // Flush pending save immediately
  const flushSave = useCallback(async () => {
    if (!activeNoteId || !pendingUpdatesRef.current) return;

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }

    const currentPending = pendingUpdatesRef.current;
    pendingUpdatesRef.current = null;
    setSaveStatus('saving');

    setNotes((prev) => {
      const note = prev.find((n) => n.id === activeNoteId);
      if (!note) return prev;
      const updated: Note = {
        ...note,
        ...currentPending,
        updated_at: new Date().toISOString(),
      };
      StorageService.saveNote(updated)
        .then(() => setSaveStatus('saved'))
        .catch(() => setSaveStatus('error'));

      return prev.map((n) => (n.id === activeNoteId ? updated : n));
    });
  }, [activeNoteId]);

  // Debounced auto-save function
  const updateNote = useCallback(
    (updates: Partial<Note>) => {
      if (!activeNoteId) return;

      setSaveStatus('unsaved');
      pendingUpdatesRef.current = {
        ...(pendingUpdatesRef.current || {}),
        ...updates,
      };

      // Optimistic state update in React
      setNotes((prev) =>
        prev.map((n) => (n.id === activeNoteId ? { ...n, ...updates } : n))
      );

      // Debounce saving by 600ms
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      setSaveStatus('saving');
      saveTimeoutRef.current = setTimeout(async () => {
        if (!pendingUpdatesRef.current) return;
        const toSave = pendingUpdatesRef.current;
        pendingUpdatesRef.current = null;

        // Fetch fresh note
        const noteToSave = notes.find((n) => n.id === activeNoteId);
        if (noteToSave) {
          const finalNote: Note = {
            ...noteToSave,
            ...toSave,
            updated_at: new Date().toISOString(),
          };

          try {
            const res = await StorageService.saveNote(finalNote);
            setSaveStatus(res.success ? 'saved' : 'error');
          } catch {
            setSaveStatus('error');
          }
        }
      }, 600);
    },
    [activeNoteId, notes]
  );

  // Delete note
  const deleteNote = useCallback(
    async (noteId: string) => {
      try {
        await StorageService.deleteNote(noteId);
        setNotes((prev) => {
          const remaining = prev.filter((n) => n.id !== noteId);
          if (activeNoteId === noteId) {
            setActiveNoteId(remaining.length > 0 ? remaining[0].id : null);
          }
          return remaining;
        });
      } catch (err) {
        error('Erro ao excluir nota');
      }
    },
    [activeNoteId, error]
  );

  // Toggle pin
  const togglePin = useCallback(() => {
    if (!activeNote) return;
    const newPinned = !activeNote.is_pinned;
    updateNote({ is_pinned: newPinned });
  }, [activeNote, updateNote]);

  // Update note's share status
  const updateShare = useCallback(
    (share: NoteShare | null) => {
      if (!activeNote) return;
      setNotes((prev) =>
        prev.map((n) => (n.id === activeNote.id ? { ...n, share } : n))
      );
    },
    [activeNote]
  );

  // Keyboard shortcut listener (Ctrl+N, Ctrl+S)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        createNote();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        flushSave();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [createNote, flushSave]);

  return {
    notes,
    activeNote,
    activeNoteId,
    setActiveNoteId,
    saveStatus,
    isLoading,
    createNote,
    updateNote,
    deleteNote,
    togglePin,
    updateShare,
    loadNotes,
    flushSave,
  };
}

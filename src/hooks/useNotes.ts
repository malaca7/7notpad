import { useState, useEffect, useCallback, useRef } from 'react';
import type { Note, SaveStatus, NoteShare } from '../types/note';
import { StorageService, getLocalNotes, saveLocalNotes } from '../lib/storage';
import { getOrCreateOwnerToken } from '../lib/crypto';
import { AuthService, subscribeToAuth } from '../lib/authService';
import { useToast } from '../components/common/Toast';

const ACTIVE_NOTE_STORAGE_KEY = '7notpad_active_note_id';

function getInitialActiveNoteId(initialNotes: Note[]): string | null {
  try {
    const savedId = localStorage.getItem(ACTIVE_NOTE_STORAGE_KEY);
    if (savedId && initialNotes.some((n) => n.id === savedId)) {
      return savedId;
    }
  } catch {}

  if (initialNotes.length > 0) {
    const sorted = [...initialNotes].sort((a, b) => {
      if (a.is_pinned && !b.is_pinned) return -1;
      if (!a.is_pinned && b.is_pinned) return 1;
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    });
    return sorted[0].id;
  }
  return null;
}

export function useNotes() {
  const { error } = useToast();
  // Hydrate synchronously from localStorage on first render so notes never vanish on reload
  const [notes, setNotes] = useState<Note[]>(() => getLocalNotes());
  const [activeNoteId, setActiveNoteId] = useState<string | null>(() =>
    getInitialActiveNoteId(getLocalNotes())
  );
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const saveTimeoutRef = useRef<any>(null);
  const pendingNoteRef = useRef<Note | null>(null);
  const activeNoteIdRef = useRef<string | null>(activeNoteId);

  useEffect(() => {
    activeNoteIdRef.current = activeNoteId;
    try {
      if (activeNoteId) {
        localStorage.setItem(ACTIVE_NOTE_STORAGE_KEY, activeNoteId);
      } else {
        localStorage.removeItem(ACTIVE_NOTE_STORAGE_KEY);
      }
    } catch {}
  }, [activeNoteId]);

  // Load & sync notes on mount and auth change
  const loadNotes = useCallback(async () => {
    // 1. Immediately sync from localStorage first
    const local = getLocalNotes();
    setNotes(local);
    setActiveNoteId((prevId) => {
      if (prevId && local.some((n) => n.id === prevId)) return prevId;
      return getInitialActiveNoteId(local);
    });

    // 2. Background sync with Firebase
    try {
      const fetched = await StorageService.fetchNotes();
      setNotes(fetched);
      setActiveNoteId((prevId) => {
        if (prevId && fetched.some((n) => n.id === prevId)) return prevId;
        return getInitialActiveNoteId(fetched);
      });
    } catch (err) {
      console.error('Failed to load notes:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadNotes();

    const unsub = subscribeToAuth(() => {
      loadNotes();
    });
    return unsub;
  }, [loadNotes]);

  // Get active note object
  const activeNote = notes.find((n) => n.id === activeNoteId) || null;

  // Create new note (saves to localStorage synchronously!)
  const createNote = useCallback((initialData?: { title?: string; content?: string }) => {
    const ownerToken = getOrCreateOwnerToken();
    const currentUser = AuthService.getCurrentUser();
    const now = new Date().toISOString();
    const newNote: Note = {
      id: crypto.randomUUID(),
      local_id: crypto.randomUUID(),
      title: initialData?.title || '',
      content: initialData?.content || '',
      created_at: now,
      updated_at: now,
      owner_token: ownerToken,
      user_id: currentUser?.id,
      is_pinned: false,
      attachments: [],
      share: null,
    };

    // Synchronously update React state AND localStorage
    setNotes((prev) => {
      const next = [newNote, ...prev];
      saveLocalNotes(next);
      return next;
    });
    setActiveNoteId(newNote.id);
    setSaveStatus('saving');

    StorageService.saveNote(newNote)
      .then(() => {
        setTimeout(() => setSaveStatus('saved'), 150);
      })
      .catch(() => setSaveStatus('saved')); // Still saved in localStorage

    return newNote;
  }, []);

  // Flush pending save immediately
  const flushSave = useCallback(async () => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }

    if (pendingNoteRef.current) {
      const noteToFlush = pendingNoteRef.current;
      pendingNoteRef.current = null;
      await StorageService.saveNote(noteToFlush);
    }
    setSaveStatus('saved');
  }, []);

  // Auto-save function: writes to localStorage immediately (0ms) and syncs to cloud after 300ms
  const updateNote = useCallback((updates: Partial<Note>) => {
    const targetId = activeNoteIdRef.current;
    if (!targetId) return;

    const now = new Date().toISOString();

    // 1. Update React state AND write to localStorage synchronously so reload never loses data
    setNotes((prev) => {
      const next = prev.map((n) => {
        if (n.id === targetId) {
          const updated: Note = {
            ...n,
            ...updates,
            updated_at: now,
          };
          pendingNoteRef.current = updated;
          return updated;
        }
        return n;
      });
      saveLocalNotes(next);
      return next;
    });

    // 2. Show brief saving indicator and sync to StorageService after 300ms
    setSaveStatus('saving');
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(async () => {
      const noteToSync = pendingNoteRef.current;
      pendingNoteRef.current = null;
      if (noteToSync) {
        try {
          await StorageService.saveNote(noteToSync);
        } catch {
          // LocalStorage already saved synchronously
        }
      }
      setSaveStatus('saved');
    }, 300);
  }, []);

  // Delete note
  const deleteNote = useCallback(
    async (noteId: string) => {
      try {
        setNotes((prev) => {
          const remaining = prev.filter((n) => n.id !== noteId);
          saveLocalNotes(remaining);
          if (activeNoteIdRef.current === noteId) {
            setActiveNoteId(remaining.length > 0 ? remaining[0].id : null);
          }
          return remaining;
        });
        await StorageService.deleteNote(noteId);
      } catch (err) {
        error('Erro ao excluir nota');
      }
    },
    [error]
  );

  // Toggle pin
  const togglePin = useCallback(() => {
    if (!activeNote) return;
    const newPinned = !activeNote.is_pinned;
    updateNote({ is_pinned: newPinned });
  }, [activeNote, updateNote]);

  // Update note's share status
  const updateShare = useCallback((share: NoteShare | null) => {
    const targetId = activeNoteIdRef.current;
    if (!targetId) return;
    setNotes((prev) => {
      const next = prev.map((n) => (n.id === targetId ? { ...n, share } : n));
      saveLocalNotes(next);
      return next;
    });
  }, []);

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

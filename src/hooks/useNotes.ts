import { useState, useEffect, useCallback, useRef } from 'react';
import type { Note, SaveStatus, NoteShare } from '../types/note';
import { StorageService, getLocalNotes, saveLocalNotes, subscribeToRealtimeSync, markNoteAsDeletedLocally } from '../lib/storage';
import { CloudShareService } from '../lib/cloudShare';
import { getOrCreateOwnerToken } from '../lib/crypto';
import { AuthService, subscribeToAuth } from '../lib/authService';
import { useToast } from '../components/common/Toast';

const ACTIVE_NOTE_STORAGE_KEY = '7notpad_active_note_id';

function getInitialActiveNoteId(initialNotes: Note[]): string | null {
  try {
    const path = window.location.pathname;
    const hash = window.location.hash;

    // Only set active note if URL specifically points to /notpad/:id or #/notpad/:id
    if (path.includes('/notpad/')) {
      const parts = path.split('/notpad/');
      const slug = parts[parts.length - 1]?.replace(/\/+$/, '').trim();
      if (slug && slug !== 'notpad' && slug !== '2de4bdef-8afd-4ee7-a238-74193628bf4f') {
        const found = initialNotes.find((n) => n.id === slug && n.local_id !== 'default_welcome_note');
        if (found) return found.id;
      }
    }
    if (hash.includes('#/notpad/')) {
      const parts = hash.split('#/notpad/');
      const slug = parts[parts.length - 1]?.split('#')[0]?.replace(/\/+$/, '').trim();
      if (slug && slug !== 'notpad' && slug !== '2de4bdef-8afd-4ee7-a238-74193628bf4f') {
        const found = initialNotes.find((n) => n.id === slug && n.local_id !== 'default_welcome_note');
        if (found) return found.id;
      }
    }
  } catch {}

  // If user navigated to /notpad without note ID, return null to show Logged-in Dashboard!
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

    const unsubAuth = subscribeToAuth((session) => {
      if (session && session.user) {
        // When user logs in, reset active note to land on /notpad dashboard
        setActiveNoteId(null);
      }
      loadNotes();
    });

    // 1. Instant 0ms sync across tabs/screens in the same browser
    const unsubRealtime = subscribeToRealtimeSync(() => {
      if (pendingNoteRef.current) return; // Don't interrupt active local typing
      const freshLocal = getLocalNotes();
      setNotes(freshLocal);
    });

    // 2. Global Real-time Pub/Sub across all browsers and devices via Ntfy SSE
    const unsubGlobal = CloudShareService.subscribeToGlobalRealtimeEvents((event) => {
      if (event.type === 'note_deleted') {
        const delId = event.noteId;
        markNoteAsDeletedLocally(delId);
        setNotes((prev) => prev.filter((n) => n.id !== delId && n.local_id !== delId));
        setActiveNoteId((prevId) => (prevId === delId ? null : prevId));
        const local = getLocalNotes().filter((n) => n.id !== delId && n.local_id !== delId);
        saveLocalNotes(local);
        return;
      }
      if (
        event.type === 'note_updated' ||
        event.type === 'note_created' ||
        event.type === 'notes_updated' ||
        event.type === 'share_updated' ||
        event.type === 'shares_updated' ||
        event.type === 'catalog_updated' ||
        event.type === 'user_updated'
      ) {
        if (pendingNoteRef.current || saveTimeoutRef.current) return;
        loadNotes();
      }
    });

    // 3. Periodic background catalog sync to auto-reconcile without refresh (every 3s)
    const autoSyncInterval = setInterval(() => {
      if (pendingNoteRef.current || saveTimeoutRef.current) return;
      const freshLocal = getLocalNotes();
      setNotes(freshLocal);
    }, 3000);

    // 4. Focus & visibility change auto-sync (switching tabs or unlocking phone/screen)
    const handleVisibilitySync = () => {
      if (pendingNoteRef.current || saveTimeoutRef.current) return;
      loadNotes();
    };
    window.addEventListener('focus', handleVisibilitySync);
    document.addEventListener('visibilitychange', handleVisibilitySync);

    return () => {
      unsubAuth();
      unsubRealtime();
      unsubGlobal();
      clearInterval(autoSyncInterval);
      window.removeEventListener('focus', handleVisibilitySync);
      document.removeEventListener('visibilitychange', handleVisibilitySync);
    };
  }, [loadNotes]);

  // 2. Real-time cloud sync for active note across different browsers/devices
  useEffect(() => {
    if (!activeNoteId) return;

    const syncActiveNoteFromCloud = async () => {
      if (pendingNoteRef.current || saveTimeoutRef.current) return;
      try {
        const cloudRes = await CloudShareService.fetchNoteFromCloud(activeNoteId);
        if (!cloudRes.found || !cloudRes.note) return;
        if (pendingNoteRef.current || saveTimeoutRef.current) return;

        setNotes((prev) => {
          const current = prev.find((n) => n.id === activeNoteId);
          if (!current) return prev;

          const localNoteTime = current.updated_at ? new Date(current.updated_at).getTime() : 0;
          const localShareTime = current.share?.updated_at ? new Date(current.share.updated_at).getTime() : 0;
          const localMaxTime = Math.max(localNoteTime, localShareTime);

          const cloudNoteTime = cloudRes.note?.updated_at ? new Date(cloudRes.note.updated_at).getTime() : 0;
          const cloudShareTime = cloudRes.share?.updated_at ? new Date(cloudRes.share.updated_at).getTime() : 0;
          const cloudSyncTime = cloudRes.syncUpdatedAt ? new Date(cloudRes.syncUpdatedAt).getTime() : 0;
          const cloudMaxTime = Math.max(cloudNoteTime, cloudShareTime, cloudSyncTime);

          const remoteContent = cloudRes.rawContent ?? cloudRes.note?.content ?? current.content;
          const hasDataChanged =
            cloudRes.note?.title !== current.title ||
            remoteContent !== current.content ||
            JSON.stringify(cloudRes.note?.attachments || []) !== JSON.stringify(current.attachments || []) ||
            JSON.stringify(cloudRes.share || null) !== JSON.stringify(current.share || null);

          if (cloudMaxTime > localMaxTime && hasDataChanged) {
            const next = prev.map((n) => {
              if (n.id === activeNoteId) {
                return {
                  ...n,
                  title: cloudRes.note?.title ?? n.title,
                  content: remoteContent,
                  updated_at: cloudRes.note?.updated_at || n.updated_at,
                  attachments: (cloudRes.note?.attachments as any) ?? n.attachments,
                  share: cloudRes.share ?? n.share,
                };
              }
              return n;
            });
            try {
              localStorage.setItem('7notpad_notes', JSON.stringify(next));
            } catch {}
            return next;
          }
          return prev;
        });
      } catch {}
    };

    const interval = setInterval(syncActiveNoteFromCloud, 2000);
    const handleFocus = () => syncActiveNoteFromCloud();
    window.addEventListener('focus', handleFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
    };
  }, [activeNoteId]);

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
      owner_username: currentUser?.username,
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

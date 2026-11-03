import { useState, useEffect } from 'react';
import { ToastProvider } from './components/common/Toast';
import { Navbar } from './components/layout/Navbar';
import { Sidebar } from './components/layout/Sidebar';
import { NoteEditor } from './components/editor/NoteEditor';
import { EmptyState } from './components/layout/EmptyState';
import { ShareModal } from './components/share/ShareModal';
import { SettingsModal } from './components/settings/SettingsModal';
import { PublicNoteView } from './components/share/PublicNoteView';
import { BrowserWarningBanner } from './components/settings/BrowserWarningBanner';
import { useNotes } from './hooks/useNotes';

export function MainLayout() {
  const {
    notes,
    activeNote,
    activeNoteId,
    setActiveNoteId,
    saveStatus,
    createNote,
    updateNote,
    deleteNote,
    togglePin,
    updateShare,
    loadNotes,
  } = useNotes();

  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);

  // Simple routing for /n/:slug or #/n/:slug
  const [publicSlug, setPublicSlug] = useState<string | null>(() => {
    const path = window.location.pathname;
    const hash = window.location.hash;
    
    // Check path: /n/minha-nota
    if (path.startsWith('/n/')) {
      const slug = path.replace('/n/', '').trim();
      return slug || null;
    }
    // Check hash fallback: #/n/minha-nota
    if (hash.startsWith('#/n/')) {
      const slug = hash.replace('#/n/', '').trim();
      return slug || null;
    }
    return null;
  });

  useEffect(() => {
    const handleLocationChange = () => {
      const path = window.location.pathname;
      const hash = window.location.hash;
      if (path.startsWith('/n/')) {
        setPublicSlug(path.replace('/n/', '').trim());
      } else if (hash.startsWith('#/n/')) {
        setPublicSlug(hash.replace('#/n/', '').trim());
      } else {
        setPublicSlug(null);
      }
    };

    window.addEventListener('popstate', handleLocationChange);
    window.addEventListener('hashchange', handleLocationChange);
    return () => {
      window.removeEventListener('popstate', handleLocationChange);
      window.removeEventListener('hashchange', handleLocationChange);
    };
  }, []);

  const handleGoHome = () => {
    window.history.pushState({}, '', '/');
    setPublicSlug(null);
  };

  // If visiting public note link
  if (publicSlug) {
    return <PublicNoteView slug={publicSlug} onGoHome={handleGoHome} />;
  }

  return (
    <div className="flex flex-col h-screen w-screen bg-gray-50 dark:bg-dark-bg text-gray-900 dark:text-gray-100 overflow-hidden font-sans">
      {/* Browser Data Persistence Notice */}
      <BrowserWarningBanner />

      {/* Top Navbar */}
      <Navbar
        onToggleMobileSidebar={() => setIsMobileSidebarOpen(prev => !prev)}
        onOpenSettings={() => setIsSettingsModalOpen(true)}
        totalNotes={notes.length}
      />

      {/* Main Workspace Body */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* Mobile backdrop */}
        {isMobileSidebarOpen && (
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-30 md:hidden animate-in fade-in"
            onClick={() => setIsMobileSidebarOpen(false)}
          />
        )}

        {/* Sidebar */}
        <Sidebar
          notes={notes}
          activeNoteId={activeNoteId}
          onSelectNote={(id) => {
            setActiveNoteId(id);
            setIsMobileSidebarOpen(false);
          }}
          onCreateNote={(tpl) => {
            createNote(tpl);
            setIsMobileSidebarOpen(false);
          }}
          onDeleteNote={deleteNote}
          isMobileOpen={isMobileSidebarOpen}
          onCloseMobile={() => setIsMobileSidebarOpen(false)}
        />

        {/* Editor or Empty State */}
        <main className="flex-1 flex flex-col h-full overflow-hidden bg-white dark:bg-dark-surface">
          {activeNote ? (
            <NoteEditor
              key={activeNote.id}
              note={activeNote}
              onUpdateNote={updateNote}
              saveStatus={saveStatus}
              onOpenShareModal={() => setIsShareModalOpen(true)}
              onTogglePin={togglePin}
            />
          ) : (
            <EmptyState onCreateNote={(tpl) => createNote(tpl)} />
          )}
        </main>
      </div>

      {/* Share Modal */}
      {activeNote && (
        <ShareModal
          isOpen={isShareModalOpen}
          onClose={() => setIsShareModalOpen(false)}
          note={activeNote}
          onShareUpdated={updateShare}
        />
      )}

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        onNotesImported={loadNotes}
      />
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <MainLayout />
    </ToastProvider>
  );
}

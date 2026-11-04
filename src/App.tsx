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
import { AuthModal, type AuthModalView } from './components/auth/AuthModal';
import { EmailNotificationToast } from './components/auth/EmailNotificationToast';
import { useNotes } from './hooks/useNotes';
import { getLocalNotes } from './lib/storage';

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
  const [settingsInitialTab, setSettingsInitialTab] = useState<'account' | 'email' | 'editor' | 'cloud' | 'security' | 'backup'>('editor');

  // Auth Modal states
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authModalView, setAuthModalView] = useState<AuthModalView>('login');
  const [authEmail, setAuthEmail] = useState('');
  const [resetTokenParam, setResetTokenParam] = useState('');

  // Routing helper for /notpad/:slug, /7notpad/notpad/:slug, /n/:slug or #/notpad/:slug
  const getSlugFromLocation = () => {
    const path = window.location.pathname;
    const hash = window.location.hash;
    
    // Check /notpad/ first
    if (path.includes('/notpad/')) {
      const parts = path.split('/notpad/');
      const slug = parts[parts.length - 1]?.replace(/\/+$/, '').trim();
      if (slug) return slug;
    }
    // Check /n/
    if (path.includes('/n/')) {
      const parts = path.split('/n/');
      const slug = parts[parts.length - 1]?.replace(/\/+$/, '').trim();
      if (slug) return slug;
    }
    // Check hash fallback: #/notpad/ or #/n/
    if (hash.includes('#/notpad/')) {
      const parts = hash.split('#/notpad/');
      const slug = parts[parts.length - 1]?.split('#')[0]?.replace(/\/+$/, '').trim();
      if (slug) return slug;
    }
    if (hash.includes('#/n/')) {
      const parts = hash.split('#/n/');
      const slug = parts[parts.length - 1]?.split('#')[0]?.replace(/\/+$/, '').trim();
      if (slug) return slug;
    }
    return null;
  };

  const resolveRoute = () => {
    const slug = getSlugFromLocation();
    if (!slug) {
      return { publicSlug: null as string | null, editorNoteId: null as string | null };
    }

    const params = new URLSearchParams(window.location.search);
    const forcePublic = params.get('view') === 'public' || window.location.hash.includes('data=');

    if (!forcePublic) {
      const localNotes = getLocalNotes();
      const ownedNote = localNotes.find((n) => n.id === slug);
      if (ownedNote) {
        return { publicSlug: null as string | null, editorNoteId: ownedNote.id };
      }
    }

    return { publicSlug: slug, editorNoteId: null as string | null };
  };

  const [publicSlug, setPublicSlug] = useState<string | null>(() => resolveRoute().publicSlug);

  // Sync initial URL note ID into activeNoteId if owner opened /notpad/<note.id>
  useEffect(() => {
    const route = resolveRoute();
    if (route.editorNoteId) {
      setActiveNoteId(route.editorNoteId);
    }
  }, [setActiveNoteId]);

  // Keep browser address bar at /notpad/<ID_UNICO_DO_BLOCO_DE_NOTA> when editing a note
  useEffect(() => {
    if (publicSlug || !activeNoteId) return;
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('reset_token')) return;

      const baseUrl = (import.meta as any).env?.BASE_URL || '/';
      const cleanBase = baseUrl === '/' ? '' : baseUrl.replace(/\/+$/, '');
      const targetPath = `${cleanBase}/notpad/${activeNoteId}`;

      if (window.location.pathname !== targetPath || window.location.hash.includes('data=')) {
        window.history.replaceState({}, '', targetPath);
      }
    } catch {}
  }, [activeNoteId, publicSlug]);

  // Check URL parameters for reset_token or password-reset hash
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const token = params.get('reset_token');
      const email = params.get('email') || '';

      if (token) {
        setResetTokenParam(token);
        setAuthEmail(email);
        setAuthModalView('reset-link');
        setIsAuthModalOpen(true);
      }
    } catch {}
  }, []);

  useEffect(() => {
    const handleLocationChange = () => {
      const route = resolveRoute();
      setPublicSlug(route.publicSlug);
      if (route.editorNoteId) {
        setActiveNoteId(route.editorNoteId);
      }
    };

    window.addEventListener('popstate', handleLocationChange);
    window.addEventListener('hashchange', handleLocationChange);
    return () => {
      window.removeEventListener('popstate', handleLocationChange);
      window.removeEventListener('hashchange', handleLocationChange);
    };
  }, [setActiveNoteId]);

  const handleGoHome = () => {
    const baseUrl = (import.meta as any).env?.BASE_URL || '/';
    const cleanBase = baseUrl === '/' ? '' : baseUrl.replace(/\/+$/, '');
    const targetPath = activeNoteId ? `${cleanBase}/notpad/${activeNoteId}` : baseUrl;
    window.history.pushState({}, '', targetPath);
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
        onOpenSettings={(tab) => {
          if (tab) setSettingsInitialTab(tab);
          setIsSettingsModalOpen(true);
        }}
        onOpenAuthModal={() => {
          setAuthModalView('login');
          setIsAuthModalOpen(true);
        }}
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
        initialTab={settingsInitialTab}
        onOpenAuthModal={() => {
          setIsSettingsModalOpen(false);
          setAuthModalView('signup');
          setIsAuthModalOpen(true);
        }}
      />

      {/* Auth Modal (Login, Cadastro, Verificação 6 dígitos, Recuperação de Senha) */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        initialView={authModalView}
        initialEmail={authEmail}
        resetToken={resetTokenParam}
        onSuccess={() => {
          loadNotes();
        }}
        onOpenSettings={(tab) => {
          if (tab) setSettingsInitialTab(tab);
          setIsSettingsModalOpen(true);
        }}
      />

      {/* In-app Transactional Email Toast Dispatcher */}
      <EmailNotificationToast />
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

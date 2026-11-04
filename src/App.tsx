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
import { LandingHome } from './components/home/LandingHome';
import { useNotes } from './hooks/useNotes';
import { useAuth } from './hooks/useAuth';
import { getLocalNotes } from './lib/storage';
import { FileText, Plus, Share2, Copy, Check, Settings, Home } from 'lucide-react';

export function MainLayout() {
  const { isAuthenticated } = useAuth();
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

  const [hasEnteredWorkspace, setHasEnteredWorkspace] = useState(() => {
    const path = window.location.pathname;
    const hash = window.location.hash;
    return Boolean(path.includes('/notpad/') || hash.includes('/notpad/') || path.includes('/n/'));
  });

  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState<'account' | 'email' | 'editor' | 'cloud' | 'security' | 'backup'>('editor');
  const [mobileCopiedLink, setMobileCopiedLink] = useState(false);

  const handleMobileCopyLink = async () => {
    if (!activeNoteId) return;
    try {
      const baseUrl = (import.meta as any).env?.BASE_URL || '/';
      const cleanBase = baseUrl === '/' ? '' : baseUrl.replace(/\/+$/, '');
      const url = `${window.location.origin}${cleanBase}/notpad/${activeNoteId}`;
      await navigator.clipboard.writeText(url);
      setMobileCopiedLink(true);
      setTimeout(() => setMobileCopiedLink(false), 2000);
    } catch {}
  };

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
    return (
      <>
        <PublicNoteView
          slug={publicSlug}
          onGoHome={handleGoHome}
          onOpenAuthModal={() => {
            setAuthModalView('login');
            setIsAuthModalOpen(true);
          }}
        />
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
        <EmailNotificationToast />
      </>
    );
  }

  // If user is unlogged and hasn't explicitly entered the workspace, display the Clean Landing Home!
  if (!isAuthenticated && !hasEnteredWorkspace) {
    return (
      <>
        <LandingHome
          onStartWriting={() => {
            if (!activeNote && notes.length === 0) {
              createNote();
            }
            setHasEnteredWorkspace(true);
          }}
          onOpenAuth={(view) => {
            setAuthModalView(view);
            setIsAuthModalOpen(true);
          }}
          localNotesCount={notes.length}
        />
        <AuthModal
          isOpen={isAuthModalOpen}
          onClose={() => setIsAuthModalOpen(false)}
          initialView={authModalView}
          initialEmail={authEmail}
          resetToken={resetTokenParam}
          onSuccess={() => {
            loadNotes();
            setHasEnteredWorkspace(true);
          }}
          onOpenSettings={(tab) => {
            if (tab) setSettingsInitialTab(tab);
            setIsSettingsModalOpen(true);
          }}
        />
        <EmailNotificationToast />
      </>
    );
  }

  return (
    <div className="flex flex-col h-[100dvh] w-screen bg-black text-gray-100 overflow-hidden font-sans">
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
        onReturnHome={!isAuthenticated ? () => setHasEnteredWorkspace(false) : undefined}
      />

      {/* Main Workspace Body */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* Mobile backdrop */}
        {isMobileSidebarOpen && (
          <div
            className="fixed inset-0 bg-black/75 backdrop-blur-sm z-30 md:hidden animate-in fade-in"
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
        <main className="flex-1 flex flex-col h-full overflow-hidden bg-black">
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

      {/* Dedicated Mobile Bottom Navigation Bar */}
      <nav className="md:hidden h-14 border-t border-[#1c1c1c] bg-[#050505]/95 backdrop-blur-md px-2 flex items-center justify-around shrink-0 z-20 select-none">
        {!isAuthenticated && (
          <button
            type="button"
            onClick={() => setHasEnteredWorkspace(false)}
            className="flex flex-col items-center justify-center gap-0.5 py-1 px-2.5 rounded-xl text-[10px] font-medium text-gray-400 active:text-white transition-colors"
          >
            <Home className="w-4 h-4 text-brand-400" />
            <span>Início</span>
          </button>
        )}

        <button
          type="button"
          onClick={() => setIsMobileSidebarOpen(prev => !prev)}
          className={`flex flex-col items-center justify-center gap-0.5 py-1 px-2.5 rounded-xl text-[10px] font-medium transition-colors relative ${
            isMobileSidebarOpen ? 'text-brand-400' : 'text-gray-400 active:text-white'
          }`}
        >
          <div className="relative">
            <FileText className="w-4 h-4" />
            <span className="absolute -top-1.5 -right-2.5 min-w-[14px] h-[14px] px-1 rounded-full bg-brand-600 text-white text-[9px] font-bold flex items-center justify-center">
              {notes.length}
            </span>
          </div>
          <span>Notas</span>
        </button>

        <button
          type="button"
          onClick={() => {
            createNote();
            setIsMobileSidebarOpen(false);
          }}
          className="flex flex-col items-center justify-center gap-0.5 py-1 px-2.5 rounded-xl text-[10px] font-semibold text-brand-400 active:scale-95 transition-all"
        >
          <div className="w-6 h-6 rounded-lg bg-brand-600 text-white flex items-center justify-center shadow-sm shadow-brand-600/30">
            <Plus className="w-4 h-4" />
          </div>
          <span>Nova Nota</span>
        </button>

        {activeNote && (
          <button
            type="button"
            onClick={() => setIsShareModalOpen(true)}
            className={`flex flex-col items-center justify-center gap-0.5 py-1 px-2.5 rounded-xl text-[10px] font-medium transition-colors ${
              activeNote.share?.is_active ? 'text-emerald-400' : 'text-gray-400 active:text-white'
            }`}
          >
            <Share2 className="w-4 h-4" />
            <span>Compartilhar</span>
          </button>
        )}

        {activeNote && (
          <button
            type="button"
            onClick={handleMobileCopyLink}
            className="flex flex-col items-center justify-center gap-0.5 py-1 px-2.5 rounded-xl text-[10px] font-medium text-gray-400 active:text-white transition-colors"
          >
            {mobileCopiedLink ? (
              <Check className="w-4 h-4 text-emerald-400" />
            ) : (
              <Copy className="w-4 h-4" />
            )}
            <span>{mobileCopiedLink ? 'Copiado!' : 'Copiar Link'}</span>
          </button>
        )}

        <button
          type="button"
          onClick={() => {
            setSettingsInitialTab('account');
            setIsSettingsModalOpen(true);
          }}
          className="flex flex-col items-center justify-center gap-0.5 py-1 px-2.5 rounded-xl text-[10px] font-medium text-gray-400 active:text-white transition-colors"
        >
          <Settings className="w-4 h-4" />
          <span>Ajustes</span>
        </button>
      </nav>

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

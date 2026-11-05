import { useState, useEffect } from 'react';
import { ToastProvider } from './components/common/Toast';
import { Navbar } from './components/layout/Navbar';
import { Sidebar } from './components/layout/Sidebar';
import { NoteEditor } from './components/editor/NoteEditor';
import { UserDashboard } from './components/dashboard/UserDashboard';
import { ShareModal } from './components/share/ShareModal';
import { SettingsModal } from './components/settings/SettingsModal';
import { PublicNoteView } from './components/share/PublicNoteView';
import { BrowserWarningBanner } from './components/settings/BrowserWarningBanner';
import { AuthModal, type AuthModalView } from './components/auth/AuthModal';
import { EmailNotificationToast } from './components/auth/EmailNotificationToast';
import { LandingHome } from './components/home/LandingHome';
import { AdminModal } from './components/admin/AdminModal';
import { useNotes } from './hooks/useNotes';
import { useAuth } from './hooks/useAuth';
import { isUserAdmin } from './types/auth';
import { PlatformSettingsService, type PlatformLimits } from './lib/platformSettings';
import { getLocalNotes } from './lib/storage';
import { CloudShareService } from './lib/cloudShare';
import { FileText, Plus, Share2, Copy, Check, Settings, Home, ShieldCheck, Megaphone } from 'lucide-react';

export function MainLayout() {
  const { user, isAuthenticated } = useAuth();
  const isAdmin = isUserAdmin(user);
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
  const [isAdminModalOpen, setIsAdminModalOpen] = useState(false);
  const [platformLimits, setPlatformLimits] = useState<PlatformLimits>(() => PlatformSettingsService.getLimits());
  const [settingsInitialTab, setSettingsInitialTab] = useState<'account' | 'editor' | 'cloud' | 'security' | 'backup'>('editor');
  const [mobileCopiedLink, setMobileCopiedLink] = useState(false);

  // Sync and subscribe to platform limits
  useEffect(() => {
    PlatformSettingsService.fetchLimits().then(setPlatformLimits);
    return PlatformSettingsService.subscribe(setPlatformLimits);
  }, []);

  // Sync active user profile to global cloud directory
  useEffect(() => {
    if (user) {
      CloudShareService.syncPlatformUser({
        id: user.id,
        username: user.username,
        full_name: user.full_name,
      }).catch(() => {});
    }
  }, [user]);

  // Admin route check: /admin or #admin
  useEffect(() => {
    if (isAdmin) {
      const path = window.location.pathname;
      const hash = window.location.hash;
      if (path.includes('/admin') || hash.includes('admin')) {
        setIsAdminModalOpen(true);
      }
    }
  }, [isAdmin]);

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
      if (slug && slug !== 'notpad') return slug;
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
      if (slug && slug !== 'notpad') return slug;
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
      const ownedNote = localNotes.find((n) => n.id === slug || n.share?.custom_slug === slug);
      if (ownedNote) {
        return { publicSlug: null as string | null, editorNoteId: ownedNote.id };
      }
    }

    return { publicSlug: slug, editorNoteId: null as string | null };
  };

  const [publicSlug, setPublicSlug] = useState<string | null>(() => resolveRoute().publicSlug);

  // REGRA: SE NÃO TIVER LOGADO, QUALQUER URL E SUB-URL VAI PARA A TELA DE INÍCIO!
  useEffect(() => {
    if (!isAuthenticated) {
      const slug = getSlugFromLocation();
      if (slug) {
        try {
          sessionStorage.setItem('7notpad_pending_redirect', slug);
        } catch {}
      }
      try {
        const baseUrl = (import.meta as any).env?.BASE_URL || '/';
        const cleanBase = baseUrl === '/' ? '' : baseUrl.replace(/\/+$/, '');
        const currentPath = window.location.pathname;
        if (currentPath !== cleanBase && currentPath !== `${cleanBase}/` && currentPath !== '/') {
          window.history.replaceState({}, '', cleanBase || '/');
        }
      } catch {}
    }
  }, [isAuthenticated]);

  // REGRA: SE TIVER LOGADO, AO ACESSAR A RAIZ VAI PARA /notpad!
  useEffect(() => {
    if (isAuthenticated) {
      try {
        const baseUrl = (import.meta as any).env?.BASE_URL || '/';
        const cleanBase = baseUrl === '/' ? '' : baseUrl.replace(/\/+$/, '');
        
        // Check if there was a pending note link saved before login
        const pending = sessionStorage.getItem('7notpad_pending_redirect');
        if (pending) {
          sessionStorage.removeItem('7notpad_pending_redirect');
          const targetPath = `${cleanBase}/notpad/${pending}`;
          window.history.replaceState({}, '', targetPath);
          setPublicSlug(pending);
          return;
        }

        const currentPath = window.location.pathname;
        if (currentPath === cleanBase || currentPath === `${cleanBase}/` || currentPath === '/') {
          const targetPath = `${cleanBase}/notpad`;
          window.history.replaceState({}, '', targetPath);
        }
      } catch {}
    }
  }, [isAuthenticated]);

  // Sync initial URL note ID into activeNoteId if owner opened /notpad/<note.id>
  useEffect(() => {
    if (!isAuthenticated) return;
    const route = resolveRoute();
    if (route.editorNoteId) {
      setActiveNoteId(route.editorNoteId);
    }
  }, [setActiveNoteId, isAuthenticated]);

  // Keep browser address bar in sync: /notpad/:id when editing, or /notpad when on dashboard
  useEffect(() => {
    if (!isAuthenticated || publicSlug) return;
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('reset_token')) return;

      const baseUrl = (import.meta as any).env?.BASE_URL || '/';
      const cleanBase = baseUrl === '/' ? '' : baseUrl.replace(/\/+$/, '');
      const targetPath = activeNoteId ? `${cleanBase}/notpad/${activeNoteId}` : `${cleanBase}/notpad`;

      if (window.location.pathname !== targetPath && !window.location.hash.includes('data=')) {
        window.history.replaceState({}, '', targetPath);
      }
    } catch {}
  }, [activeNoteId, publicSlug, isAuthenticated]);

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
    if (!isAuthenticated) return;
    const handleLocationChange = () => {
      const route = resolveRoute();
      setPublicSlug(route.publicSlug);
      setActiveNoteId(route.editorNoteId);
    };

    window.addEventListener('popstate', handleLocationChange);
    window.addEventListener('hashchange', handleLocationChange);
    return () => {
      window.removeEventListener('popstate', handleLocationChange);
      window.removeEventListener('hashchange', handleLocationChange);
    };
  }, [setActiveNoteId, isAuthenticated]);

  const handleGoToDashboard = () => {
    setActiveNoteId(null);
    setPublicSlug(null);
    const baseUrl = (import.meta as any).env?.BASE_URL || '/';
    const cleanBase = baseUrl === '/' ? '' : baseUrl.replace(/\/+$/, '');
    window.history.pushState({}, '', `${cleanBase}/notpad`);
  };

  const handleGoHome = () => {
    handleGoToDashboard();
  };

  // ========================================================
  // 1. SE NÃO TIVER LOGADO: QUALQUER URL/SUB-URL VAI PARA TELA DE INÍCIO!
  // ========================================================
  if (!isAuthenticated) {
    return (
      <>
        <LandingHome
          onStartWriting={() => {
            setAuthModalView('signup');
            setIsAuthModalOpen(true);
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

  // ========================================================
  // 2. SE TIVER LOGADO: VISUALIZAÇÃO PÚBLICA / COLABORATIVA
  // ========================================================
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

  // ========================================================
  // 3. SE TIVER LOGADO: WORKSPACE EM /notpad
  // ========================================================

  return (
    <div className="flex flex-col h-[100dvh] w-screen bg-black text-gray-100 overflow-hidden font-sans">
      {/* Global Broadcast Announcement Banner */}
      {platformLimits.announcementActive && platformLimits.announcementBanner && (
        <aside aria-label="Aviso Global" className="bg-gradient-to-r from-brand-600 via-cyan-600 to-brand-600 text-white text-xs py-1.5 px-4 text-center font-medium shadow-md flex items-center justify-center gap-2 shrink-0 z-30">
          <Megaphone className="w-3.5 h-3.5 shrink-0" />
          <span>{platformLimits.announcementBanner}</span>
        </aside>
      )}

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
        onGoToDashboard={handleGoToDashboard}
        isDashboard={!activeNoteId}
        onOpenAdmin={() => setIsAdminModalOpen(true)}
        isAdmin={isAdmin}
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
          onGoToDashboard={handleGoToDashboard}
          isDashboard={!activeNoteId}
          onOpenAdmin={() => setIsAdminModalOpen(true)}
          isAdmin={isAdmin}
        />

        {/* Editor or Dashboard */}
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
            <UserDashboard
              user={user}
              notes={notes}
              onCreateNote={(tpl) => createNote(tpl)}
              onSelectNote={(id) => setActiveNoteId(id)}
              onDeleteNote={deleteNote}
              onTogglePin={togglePin}
            />
          )}
        </main>
      </div>

      {/* Dedicated Mobile Bottom Navigation Bar */}
      <nav className="md:hidden h-14 border-t border-[#1c1c1c] bg-[#050505]/95 backdrop-blur-md px-2 flex items-center justify-around shrink-0 z-20 select-none">
        <button
          type="button"
          onClick={handleGoToDashboard}
          className={`flex flex-col items-center justify-center gap-0.5 py-1 px-2.5 rounded-xl text-[10px] font-medium transition-colors ${
            !activeNoteId ? 'text-brand-400 font-semibold' : 'text-gray-400 active:text-white'
          }`}
          title="Painel de Início"
        >
          <Home className="w-4 h-4" />
          <span>Início</span>
        </button>

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

        {isAdmin && (
          <button
            type="button"
            onClick={() => setIsAdminModalOpen(true)}
            className="flex flex-col items-center justify-center gap-0.5 py-1 px-2 rounded-xl text-[10px] font-bold text-amber-400 active:scale-95 transition-all"
            title="Painel Admin"
          >
            <ShieldCheck className="w-4 h-4 text-amber-400" />
            <span>Admin</span>
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

      {/* Admin Management Modal */}
      <AdminModal
        isOpen={isAdminModalOpen}
        onClose={() => setIsAdminModalOpen(false)}
        currentUser={user}
        onNotesChanged={loadNotes}
        onSelectNote={(noteId) => {
          setActiveNoteId(noteId);
          setIsAdminModalOpen(false);
        }}
      />

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

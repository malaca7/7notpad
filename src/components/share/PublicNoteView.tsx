import React, { useState, useEffect, useRef, useCallback } from 'react';
import { StorageService, subscribeToRealtimeSync, hasDirectNoteAccess } from '../../lib/storage';
import { subscribeToAuth } from '../../lib/authService';
import { verifyPassword } from '../../lib/crypto';
import type { NoteShare, Attachment } from '../../types/note';
import { useToast } from '../common/Toast';
import { 
  Lock, 
  KeyRound, 
  Copy, 
  Check, 
  FileText, 
  Download, 
  Clock, 
  Calendar, 
  ArrowLeft, 
  ShieldAlert, 
  Sparkles,
  Sun,
  Moon,
  Info,
  Radio,
  ShieldCheck
} from 'lucide-react';
import { useTheme } from '../../hooks/useTheme';

interface PublicNoteViewProps {
  slug: string;
  onGoHome: () => void;
}

export const PublicNoteView: React.FC<PublicNoteViewProps> = ({ slug, onGoHome }) => {
  const { theme, toggleTheme } = useTheme();
  const { success, error } = useToast();

  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [share, setShare] = useState<NoteShare | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [createdAt, setCreatedAt] = useState('');
  const [updatedAt, setUpdatedAt] = useState('');

  // Password protection state
  const [isLocked, setIsLocked] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [attempts, setAttempts] = useState(0);
  const [lockoutTime, setLockoutTime] = useState(0);
  const [isVerifying, setIsVerifying] = useState(false);
  const [copied, setCopied] = useState(false);
  const [directAccessBadge, setDirectAccessBadge] = useState<string | null>(null);

  // Track which password_hash the visitor unlocked so password changes immediately re-lock all views
  const unlockedPasswordHashRef = useRef<string | null>(null);
  const unlockedPasswordInputRef = useRef<string>('');
  const isLockedRef = useRef<boolean>(false);
  isLockedRef.current = isLocked;

  const syncPublicNoteState = useCallback(async (isInitial = false) => {
    if (isInitial) {
      setIsLoading(true);
      setNotFound(false);
      setErrorMessage('');
    }

    try {
      const result = await StorageService.fetchPublicNote(slug);

      if (!result.found || !result.share) {
        setNotFound(true);
        setErrorMessage(result.error || '');
        if (isInitial) setIsLoading(false);
        return;
      }

      // Recover automatically if note was previously deactivated/not found and is now active
      setNotFound(false);
      setErrorMessage('');
      setShare(result.share);
      setTitle(result.note?.title || 'Nota sem título');
      setCreatedAt(result.note?.created_at || '');
      setUpdatedAt(result.note?.updated_at || '');
      setAttachments((result.note as any)?.attachments || []);

      // Creator/Admin of the note OR authorized @username member NEVER needs to enter a password!
      const directAccess = hasDirectNoteAccess(result.note, result.share);
      if (directAccess.allowed) {
        setDirectAccessBadge(
          directAccess.isCreator
            ? `Criador / Admin${directAccess.matchedUser ? ` (${directAccess.matchedUser})` : ''}`
            : `Acesso Liberado (${directAccess.matchedUser || 'Membro'})`
        );
        setIsLocked(false);
        setPasswordError('');
        const fullContent =
          result.rawContent ??
          result.note?.content ??
          (await StorageService.unlockProtectedNoteContent(slug)) ??
          '';
        setContent(fullContent);
        return;
      } else {
        setDirectAccessBadge(null);
      }

      if (result.share.is_password_protected) {
        const currentHash = result.share.password_hash || '';
        const alreadyUnlockedSamePassword =
          Boolean(unlockedPasswordHashRef.current) &&
          unlockedPasswordHashRef.current === currentHash;

        if (alreadyUnlockedSamePassword) {
          // Viewer already unlocked with the current password: keep unlocked & sync content live!
          setIsLocked(false);
          const freshContent =
            result.rawContent ??
            (await StorageService.unlockProtectedNoteContent(slug, unlockedPasswordInputRef.current)) ??
            '';
          setContent(freshContent);
        } else {
          // Either initial load, or password was added/changed by owner -> lock immediately!
          const wasUnlocked = !isInitial && !isLockedRef.current;
          unlockedPasswordHashRef.current = null;
          unlockedPasswordInputRef.current = '';
          setIsLocked(true);
          setContent('');
          if (wasUnlocked) {
            setPasswordInput('');
            setPasswordError('A senha deste bloco de notas foi definida ou alterada. Digite a nova senha para continuar.');
          }
        }
      } else {
        // Password protection disabled or not active -> unlock automatically across all views!
        unlockedPasswordHashRef.current = null;
        unlockedPasswordInputRef.current = '';
        setIsLocked(false);
        setPasswordError('');
        setContent(result.rawContent ?? result.note?.content ?? '');
      }
    } catch (err: any) {
      if (isInitial) {
        setNotFound(true);
        setErrorMessage(err?.message || '');
      }
    } finally {
      if (isInitial) setIsLoading(false);
    }
  }, [slug]);

  // Initial load + Real-time auto-sync across tabs and browsers
  useEffect(() => {
    syncPublicNoteState(true);

    // 1. Instant 0ms sync across tabs in the same browser & auth session changes
    const unsubRealtime = subscribeToRealtimeSync(() => {
      syncPublicNoteState(false);
    });
    const unsubAuth = subscribeToAuth(() => {
      syncPublicNoteState(false);
    });

    // 2. Live cloud polling every 2.5s when tab is visible for visitors across any browser/device
    const pollInterval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        syncPublicNoteState(false);
      }
    }, 2500);

    // 3. Immediate sync on tab focus / visibility change
    const handleFocus = () => syncPublicNoteState(false);
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        syncPublicNoteState(false);
      }
    };
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      unsubRealtime();
      unsubAuth();
      clearInterval(pollInterval);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [syncPublicNoteState]);

  // Lockout countdown timer
  useEffect(() => {
    if (lockoutTime <= 0) return;
    const interval = setInterval(() => {
      setLockoutTime((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [lockoutTime]);

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (lockoutTime > 0) return;

    if (!passwordInput || passwordInput.trim().length < 3) {
      setPasswordError('A senha do bloco de nota deve ter no mínimo 3 dígitos.');
      return;
    }

    if (!share?.password_hash || !share?.password_salt) {
      setPasswordError('Configuração de senha inválida nesta nota.');
      return;
    }

    setIsVerifying(true);
    setPasswordError('');

    try {
      const isValid = await verifyPassword(
        passwordInput,
        share.password_salt,
        share.password_hash
      );

      if (isValid) {
        // Record the exact password_hash used to unlock so if password changes later, it re-locks automatically
        unlockedPasswordHashRef.current = share.password_hash;
        unlockedPasswordInputRef.current = passwordInput;
        const fullContent = await StorageService.unlockProtectedNoteContent(slug, passwordInput);
        setContent(fullContent || '<p>Nota desbloqueada com sucesso.</p>');
        setIsLocked(false);
        setAttempts(0);
        setPasswordError('');
        success('Nota Desbloqueada!', 'Conteúdo protegido liberado para leitura em tempo real.');
      } else {
        const nextAttempts = attempts + 1;
        setAttempts(nextAttempts);

        if (nextAttempts >= 5) {
          setLockoutTime(30); // 30s lockout against brute-force attacks
          setPasswordError('Muitas tentativas incorretas. Aguarde 30 segundos.');
        } else {
          setPasswordError(`Senha incorreta. ${5 - nextAttempts} tentativa(s) restante(s).`);
        }
      }
    } catch {
      setPasswordError('Erro ao validar a senha. Tente novamente.');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleCopyContent = async () => {
    try {
      const tempEl = document.createElement('div');
      tempEl.innerHTML = content;
      const plainText = tempEl.textContent || tempEl.innerText || '';
      await navigator.clipboard.writeText(`${title}\n\n${plainText}`);
      setCopied(true);
      success('Conteúdo copiado!');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      error('Erro ao copiar');
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-dark-bg text-gray-900 dark:text-gray-100 p-4">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-3 border-brand-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-gray-500 dark:text-gray-400">Carregando nota compartilhada...</p>
        </div>
      </div>
    );
  }

  if (notFound) {
    const isDeactivated = errorMessage.toLowerCase().includes('desativad');

    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-dark-bg text-gray-900 dark:text-gray-100 p-4">
        <div className="max-w-md w-full text-center space-y-5 p-8 rounded-3xl bg-white dark:bg-[#11131a] border border-gray-200 dark:border-[#232838] shadow-2xl">
          <div className="w-16 h-16 mx-auto rounded-3xl bg-rose-500/10 text-rose-500 flex items-center justify-center border border-rose-500/20">
            <ShieldAlert className="w-8 h-8" />
          </div>
          
          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {isDeactivated ? 'Compartilhamento Desativado' : 'Nota Não Encontrada'}
            </h1>
            <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
              O link <code className="text-brand-400 font-mono bg-brand-500/10 px-1.5 py-0.5 rounded">/notpad/{slug}</code> {isDeactivated ? 'foi desativado pelo proprietário.' : 'ainda não foi sincronizado ou não existe.'}
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-brand-500/5 border border-brand-500/20 text-left text-xs text-gray-600 dark:text-gray-300 space-y-2">
            <div className="font-semibold text-brand-400 flex items-center gap-1.5">
              <Info className="w-4 h-4 shrink-0" />
              {isDeactivated ? 'Status do Compartilhamento' : 'Como sincronizar esta nota?'}
            </div>
            <p className="leading-relaxed opacity-90">
              {isDeactivated 
                ? 'O proprietário da nota desativou o link público nas opções de compartilhamento.'
                : 'Se você criou esta nota, basta abrir o painel principal do 7NotPad ou clicar em Salvar Alterações em Compartilhar para sincronizá-la instantaneamente com a nuvem.'}
            </p>
          </div>

          <div className="pt-1 flex flex-col gap-2">
            <button
              onClick={() => syncPublicNoteState(true)}
              className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-5 rounded-xl bg-gray-100 dark:bg-[#181b24] hover:bg-gray-200 dark:hover:bg-[#222634] text-gray-800 dark:text-gray-200 text-xs font-semibold transition-colors border border-gray-200 dark:border-[#232838]"
            >
              Tentar Carregar Novamente
            </button>
            <button
              onClick={onGoHome}
              className="w-full inline-flex items-center justify-center gap-2 py-3 px-5 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-sm font-semibold transition-colors shadow-lg shadow-brand-600/20"
            >
              <ArrowLeft className="w-4 h-4" />
              Acessar 7NotPad
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-dark-bg text-gray-900 dark:text-gray-100 flex flex-col transition-colors duration-200">
      {/* Top Header */}
      <header className="sticky top-0 z-30 bg-white/80 dark:bg-dark-surface/80 backdrop-blur-md border-b border-gray-200 dark:border-[#232838] px-4 lg:px-8 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={onGoHome}
            className="flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-xl border border-gray-200 dark:border-[#232838] hover:bg-gray-100 dark:hover:bg-[#181b24] text-gray-700 dark:text-gray-300 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Voltar ao 7NotPad</span>
          </button>
          <div className="hidden sm:flex items-center gap-2 pl-2 border-l border-gray-200 dark:border-[#232838]">
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-brand-500/10 text-brand-400 font-medium border border-brand-500/20">
              Modo Somente Leitura
            </span>
            <span className="inline-flex items-center gap-1.5 text-[11px] px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 font-medium border border-emerald-500/20">
              <Radio className="w-3 h-3 animate-pulse" />
              <span>Sincronizado ao vivo</span>
            </span>
            {directAccessBadge && (
              <span className="inline-flex items-center gap-1.5 text-[11px] px-2.5 py-0.5 rounded-full bg-purple-500/10 text-purple-400 font-medium border border-purple-500/20">
                <ShieldCheck className="w-3 h-3" />
                <span>{directAccessBadge}</span>
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={toggleTheme}
            className="p-2 rounded-xl border border-gray-200 dark:border-[#232838] text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-[#181b24] transition-colors"
            title="Alternar tema"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-brand-600" />}
          </button>

          {!isLocked && (
            <button
              onClick={handleCopyContent}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gray-100 dark:bg-[#181b24] hover:bg-gray-200 dark:hover:bg-[#202430] border border-gray-200 dark:border-[#232838] text-xs font-medium transition-colors"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copiado!' : 'Copiar Texto'}</span>
            </button>
          )}

          <button
            onClick={onGoHome}
            className="hidden sm:inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold shadow-sm transition-colors"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Criar Minha Nota
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-4xl w-full mx-auto p-4 sm:p-8 flex flex-col justify-center">
        {isLocked ? (
          /* Password Protection Screen */
          <div className="max-w-md w-full mx-auto my-auto p-8 rounded-3xl bg-white dark:bg-[#11131a] border border-gray-200 dark:border-[#232838] shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-brand-500/10 text-brand-400 border border-brand-500/20 flex items-center justify-center mb-6">
              <Lock className="w-7 h-7" />
            </div>

            <h2 className="text-xl font-bold text-center text-gray-900 dark:text-gray-100 mb-2">
              Nota Protegida por Senha
            </h2>
            <p className="text-xs text-center text-gray-500 dark:text-gray-400 mb-6">
              O autor desta nota configurou uma senha de proteção. Insira a senha correta para visualizar o conteúdo.
            </p>

            <form onSubmit={handleUnlock} className="space-y-4">
              <div>
                <div className="relative">
                  <input
                    type="password"
                    disabled={lockoutTime > 0}
                    value={passwordInput}
                    onChange={(e) => {
                      setPasswordInput(e.target.value);
                      setPasswordError('');
                    }}
                    placeholder="Digite a senha da nota (mín. 3 dígitos)..."
                    className="w-full px-4 py-3 rounded-xl bg-gray-50 dark:bg-[#181b24] border border-gray-200 dark:border-[#232838] text-sm text-gray-900 dark:text-gray-100 outline-none focus:ring-2 focus:ring-brand-500/50 disabled:opacity-50"
                  />
                  <KeyRound className="w-4 h-4 text-gray-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
                </div>

                {passwordError && (
                  <p className="text-xs text-rose-500 mt-2 font-medium">
                    {passwordError}
                  </p>
                )}

                {lockoutTime > 0 && (
                  <p className="text-xs text-amber-500 mt-2 font-medium">
                    Tentativas bloqueadas. Tente novamente em {lockoutTime}s.
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={isVerifying || lockoutTime > 0}
                className="w-full py-3 rounded-xl bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white text-sm font-semibold shadow-lg shadow-brand-600/20 transition-all flex items-center justify-center gap-2"
              >
                {isVerifying ? 'Verificando...' : 'Desbloquear Conteúdo'}
              </button>
            </form>
          </div>
        ) : (
          /* Unlocked Note Article */
          <article className="bg-white dark:bg-[#11131a] rounded-3xl border border-gray-200 dark:border-[#232838] p-6 sm:p-12 shadow-xl my-4">
            {/* Header info */}
            <div className="border-b border-gray-100 dark:border-[#232838] pb-6 mb-8">
              <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900 dark:text-gray-100 tracking-tight mb-4">
                {title || 'Nota sem título'}
              </h1>

              <div className="flex flex-wrap items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
                {createdAt && (
                  <div className="flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5" />
                    <span>Criada em {new Date(createdAt).toLocaleDateString('pt-BR')}</span>
                  </div>
                )}
                {updatedAt && (
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" />
                    <span>Atualizada às {new Date(updatedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                )}
                <div className="ml-auto text-xs text-brand-400 font-mono">
                  7notpad.com/notpad/{slug}
                </div>
              </div>
            </div>

            {/* Note Content */}
            <div 
              className="tiptap prose prose-invert max-w-none text-gray-800 dark:text-gray-200 leading-relaxed min-h-[200px]"
              dangerouslySetInnerHTML={{ __html: content }}
            />

            {/* Attachments Section if any */}
            {attachments && attachments.length > 0 && (
              <div className="mt-12 pt-6 border-t border-gray-100 dark:border-[#232838]">
                <h2 className="text-sm font-bold uppercase tracking-wider text-gray-600 dark:text-gray-400 mb-3 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-brand-400" />
                  Anexos ({attachments.length})
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {attachments.map((att) => (
                    <div
                      key={att.id}
                      className="flex items-center justify-between p-3 rounded-xl bg-gray-50 dark:bg-[#181b24] border border-gray-200 dark:border-[#232838]"
                    >
                      <div className="flex items-center gap-2.5 truncate">
                        <FileText className="w-4 h-4 text-brand-400 shrink-0" />
                        <div className="truncate text-xs">
                          <div className="font-medium text-gray-800 dark:text-gray-200 truncate">{att.file_name}</div>
                          <div className="text-[10px] text-gray-400">{(att.file_size / 1024).toFixed(1)} KB</div>
                        </div>
                      </div>
                      {att.data_url ? (
                        <a
                          href={att.data_url}
                          download={att.file_name}
                          className="p-2 text-gray-500 hover:text-brand-400 transition-colors"
                          title="Baixar arquivo"
                        >
                          <Download className="w-4 h-4" />
                        </a>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </article>
        )}
      </main>

      {/* Public Footer */}
      <footer className="text-center py-6 text-xs text-gray-500 dark:text-gray-400 border-t border-gray-200 dark:border-[#232838]">
        Desenvolvido com <span className="text-brand-400">7NotPad</span> — Bloco de notas rápido e anônimo.
      </footer>
    </div>
  );
};

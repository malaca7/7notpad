import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';

import { StorageService, subscribeToRealtimeSync, hasDirectNoteAccess } from '../../lib/storage';
import { AuthService, subscribeToAuth } from '../../lib/authService';
import { verifyPassword } from '../../lib/crypto';
import type { NoteShare, Attachment } from '../../types/note';
import { EditorToolbar } from '../editor/EditorToolbar';
import { ImageUploadModal } from '../editor/ImageUploadModal';
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
  ShieldCheck,
  Edit3,
  CheckCircle2,
  Loader2,
  UserCheck,
  LogIn
} from 'lucide-react';
import { useTheme } from '../../hooks/useTheme';

interface PublicNoteViewProps {
  slug: string;
  onGoHome: () => void;
  onOpenAuthModal?: () => void;
}

export const PublicNoteView: React.FC<PublicNoteViewProps> = ({ slug, onGoHome, onOpenAuthModal }) => {
  const { theme, toggleTheme } = useTheme();
  const { success, error } = useToast();

  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [noteId, setNoteId] = useState('');
  const [share, setShare] = useState<NoteShare | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [createdAt, setCreatedAt] = useState('');
  const [updatedAt, setUpdatedAt] = useState('');

  // Collaborative Editor / Admin state
  const [canEdit, setCanEdit] = useState(false);
  const [collabSaveStatus, setCollabSaveStatus] = useState<'saved' | 'saving'>('saved');
  const [isImageModalOpen, setIsImageModalOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState(() => AuthService.getCurrentUser());

  // Password protection state
  const [isLocked, setIsLocked] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [attempts, setAttempts] = useState(0);
  const [lockoutTime, setLockoutTime] = useState(0);
  const [isVerifying, setIsVerifying] = useState(false);
  const [copied, setCopied] = useState(false);
  const [directAccessBadge, setDirectAccessBadge] = useState<string | null>(null);

  // Refs to coordinate real-time polling with local collaborative editing
  const unlockedPasswordHashRef = useRef<string | null>(null);
  const unlockedPasswordInputRef = useRef<string>('');
  const isLockedRef = useRef<boolean>(false);
  isLockedRef.current = isLocked;

  const lastLocalEditTimeRef = useRef<number>(0);
  const saveTimerRef = useRef<any>(null);
  const latestTitleRef = useRef<string>(title);
  const latestContentRef = useRef<string>(content);
  const latestShareRef = useRef<NoteShare | null>(share);
  const latestNoteIdRef = useRef<string>(noteId);
  const latestAttachmentsRef = useRef<Attachment[]>(attachments);
  const latestCreatedAtRef = useRef<string>(createdAt);

  latestTitleRef.current = title;
  latestContentRef.current = content;
  latestShareRef.current = share;
  latestNoteIdRef.current = noteId;
  latestAttachmentsRef.current = attachments;
  latestCreatedAtRef.current = createdAt;

  // Trigger debounced collaborative save when Admin/Editor modifies title or content
  const scheduleCollaborativeSave = useCallback(
    (nextTitle: string, nextContent: string) => {
      const activeShare = latestShareRef.current || {
        id: slug,
        note_id: latestNoteIdRef.current || slug,
        custom_slug: slug,
        is_password_protected: false,
        is_active: true,
        created_at: latestCreatedAtRef.current || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      lastLocalEditTimeRef.current = Date.now();
      setCollabSaveStatus('saving');

      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }

      saveTimerRef.current = setTimeout(async () => {
        saveTimerRef.current = null;
        try {
          const res = await StorageService.saveCollaborativeNoteEdit({
            slug,
            noteId: latestNoteIdRef.current || activeShare.note_id || slug,
            title: nextTitle,
            content: nextContent,
            share: activeShare,
            attachments: latestAttachmentsRef.current,
            createdAt: latestCreatedAtRef.current,
          });
          if (res.success) {
            setUpdatedAt(res.updatedAt);
          }
        } catch {}
        setCollabSaveStatus('saved');
      }, 350);
    },
    [slug]
  );

  // Tiptap Rich Text Editor instance for Creator / Admin / Editor
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
      }),
      Underline,
      Image.configure({
        inline: true,
        allowBase64: true,
      }),
      Placeholder.configure({
        placeholder: 'Digite ou edite o conteúdo deste bloco de notas...',
      }),
      TaskList,
      TaskItem.configure({
        nested: true,
      }),
    ],
    content: content || '',
    editable: canEdit,
    editorProps: {
      attributes: {
        class: 'focus:outline-none min-h-[280px] leading-relaxed',
      },
    },
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      latestContentRef.current = html;
      setContent(html);
      scheduleCollaborativeSave(latestTitleRef.current, html);
    },
  });

  // Keep editor editable state in sync with canEdit
  useEffect(() => {
    if (editor) {
      editor.setEditable(canEdit);
    }
  }, [editor, canEdit]);

  // Keep Tiptap editor content synced when remote updates arrive (without disrupting active local typing)
  useEffect(() => {
    if (!editor) return;
    const isActivelyTyping =
      Date.now() - lastLocalEditTimeRef.current < 2500 || Boolean(saveTimerRef.current);
    if (isActivelyTyping) return;

    const currentHtml = editor.getHTML();
    if (content !== currentHtml) {
      editor.commands.setContent(content || '', { emitUpdate: false });
    }
  }, [content, editor]);

  const handleTitleEdit = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nextTitle = e.target.value;
    latestTitleRef.current = nextTitle;
    setTitle(nextTitle);
    scheduleCollaborativeSave(nextTitle, latestContentRef.current);
  };

  const handleInsertImage = (url: string) => {
    if (editor && canEdit) {
      editor.chain().focus().setImage({ src: url }).run();
    }
  };

  const syncPublicNoteState = useCallback(async (isInitial = false) => {
    if (isInitial) {
      setIsLoading(true);
      setNotFound(false);
      setErrorMessage('');
    }

    // Do not overwrite local state while Admin/Editor is actively typing
    if (!isInitial && (Date.now() - lastLocalEditTimeRef.current < 2500 || saveTimerRef.current)) {
      return;
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
      setNoteId(result.note?.id || result.share.note_id || slug);
      setTitle(result.note?.title ?? '');
      setCreatedAt(result.note?.created_at || '');
      setUpdatedAt(result.note?.updated_at || '');
      setAttachments((result.note as any)?.attachments || []);

      // Creator/Admin of the note OR authorized @username member NEVER needs to enter a password!
      const directAccess = hasDirectNoteAccess(result.note, result.share);
      if (directAccess.allowed) {
        const hasAdminEditRole = Boolean(directAccess.canEdit || directAccess.isCreator);
        setCanEdit(hasAdminEditRole);
        const roleLabel = directAccess.isCreator
          ? 'Criador'
          : directAccess.role === 'admin'
          ? 'Admin'
          : directAccess.role === 'editor'
          ? 'Editor'
          : 'Leitor Liberado';
        setDirectAccessBadge(
          `${roleLabel}${directAccess.matchedUser ? ` (${directAccess.matchedUser})` : ''}`
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
        setCanEdit(false);
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
    const unsubAuth = subscribeToAuth((session) => {
      setCurrentUser(session?.user || null);
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
          setLockoutTime(30);
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
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = content;
      const plainText = tempDiv.textContent || tempDiv.innerText || '';
      await navigator.clipboard.writeText(plainText);
      setCopied(true);
      success('Conteúdo copiado!', 'O texto da nota foi copiado para a área de transferência.');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      error('Erro ao copiar');
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-black text-gray-100">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-brand-600/20 border border-brand-500/30 flex items-center justify-center animate-pulse">
            <Sparkles className="w-5 h-5 text-brand-400" />
          </div>
          <p className="text-xs text-gray-400 font-medium">Carregando nota compartilhada...</p>
        </div>
      </div>
    );
  }

  if (notFound) {
    const isDeactivated = errorMessage.toLowerCase().includes('desativad');

    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-black text-gray-100 p-4">
        <div className="max-w-md w-full text-center space-y-5 p-6 sm:p-8 rounded-3xl bg-[#050505] border border-[#1c1c1c] shadow-2xl">
          <div className="w-16 h-16 mx-auto rounded-3xl bg-rose-500/10 text-rose-500 flex items-center justify-center border border-rose-500/20">
            <ShieldAlert className="w-8 h-8" />
          </div>
          
          <div className="space-y-2">
            <h1 className="text-xl sm:text-2xl font-bold text-gray-100">
              {isDeactivated ? 'Compartilhamento Desativado' : 'Nota Não Encontrada'}
            </h1>
            <p className="text-xs text-gray-400 leading-relaxed break-all">
              O link <code className="text-brand-400 font-mono bg-brand-500/10 px-1.5 py-0.5 rounded">/notpad/{slug}</code> {isDeactivated ? 'foi desativado pelo proprietário.' : 'ainda não foi sincronizado ou não existe.'}
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-brand-500/5 border border-brand-500/20 text-left text-xs text-gray-300 space-y-2">
            <div className="font-semibold text-brand-400 flex items-center gap-1.5">
              <Info className="w-4 h-4 shrink-0" />
              {isDeactivated ? 'Status do Compartilhamento' : 'Como acessar esta nota?'}
            </div>
            <p className="leading-relaxed opacity-90">
              {isDeactivated 
                ? 'O proprietário da nota desativou o link nas opções de compartilhamento.'
                : 'Se esta nota foi compartilhada com você (@usuario), certifique-se de estar conectado com sua conta. Caso o proprietário tenha acabado de salvar, clique no botão abaixo para tentar recarregar.'}
            </p>
          </div>

          <div className="pt-1 flex flex-col gap-2">
            <button
              onClick={() => syncPublicNoteState(true)}
              className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-5 rounded-xl bg-[#0f0f0f] hover:bg-[#171717] text-gray-200 text-xs font-semibold transition-colors border border-[#1c1c1c]"
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
    <div className="min-h-[100dvh] bg-black text-gray-100 flex flex-col">
      {/* Top Header */}
      <header className="sticky top-0 z-30 bg-black/95 backdrop-blur-md border-b border-[#1c1c1c] px-3 sm:px-6 lg:px-8 py-2.5 sm:py-3.5 flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <button
              onClick={onGoHome}
              className="flex items-center gap-1.5 text-xs font-semibold px-2.5 sm:px-3 py-1.5 rounded-xl border border-[#1c1c1c] bg-[#080808] hover:bg-[#121212] text-gray-200 transition-colors shrink-0"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Painel 7NotPad</span>
            </button>

            <div className="hidden md:flex items-center gap-2 pl-2 border-l border-[#1c1c1c]">
              {canEdit ? (
                <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-0.5 rounded-full bg-purple-500/15 text-purple-400 font-semibold border border-purple-500/30">
                  <Edit3 className="w-3 h-3" />
                  <span>Modo Editor / Admin</span>
                </span>
              ) : (
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-brand-500/10 text-brand-400 font-medium border border-brand-500/20">
                  Modo Somente Leitura
                </span>
              )}

              <span className="inline-flex items-center gap-1.5 text-[11px] px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 font-medium border border-emerald-500/20">
                <Radio className="w-3 h-3 animate-pulse" />
                <span>Sincronizado ao vivo</span>
              </span>

              {directAccessBadge && (
                <span className="inline-flex items-center gap-1.5 text-[11px] px-2.5 py-0.5 rounded-full bg-brand-500/10 text-brand-400 font-medium border border-brand-500/20">
                  <ShieldCheck className="w-3 h-3" />
                  <span>{directAccessBadge}</span>
                </span>
              )}

              {canEdit && (
                <span className="inline-flex items-center gap-1 text-[11px] pl-1">
                  {collabSaveStatus === 'saving' ? (
                    <span className="flex items-center gap-1 text-brand-400 font-medium animate-pulse">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      <span>Salvando...</span>
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-emerald-400 font-medium">
                      <CheckCircle2 className="w-3 h-3" />
                      <span>Salvo</span>
                    </span>
                  )}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* User / Auth status button so Admins/Members can log in directly on this URL */}
            {currentUser ? (
              <button
                type="button"
                onClick={onOpenAuthModal}
                title="Sua conta conectada"
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-mono font-semibold"
              >
                <UserCheck className="w-3.5 h-3.5 shrink-0" />
                <span className="max-w-[95px] sm:max-w-[140px] truncate">@{currentUser.username}</span>
              </button>
            ) : onOpenAuthModal ? (
              <button
                type="button"
                onClick={onOpenAuthModal}
                className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl bg-brand-500/10 hover:bg-brand-500/20 border border-brand-500/30 text-brand-400 text-xs font-semibold transition-colors"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>Entrar</span>
              </button>
            ) : null}

            <button
              onClick={toggleTheme}
              className="hidden sm:flex p-2 rounded-xl border border-[#1c1c1c] bg-[#080808] text-gray-300 hover:bg-[#121212] transition-colors"
              title="Tema Preto"
            >
              {theme === 'dark' ? <Moon className="w-4 h-4 text-brand-400" /> : <Sun className="w-4 h-4 text-amber-400" />}
            </button>

            {!isLocked && (
              <button
                onClick={handleCopyContent}
                className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl bg-[#0a0a0a] hover:bg-[#141414] border border-[#1c1c1c] text-xs font-medium text-gray-200 transition-colors"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span className="hidden xs:inline">{copied ? 'Copiado!' : 'Copiar'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Mobile Status Row (visible on smartphones) */}
        <div className="flex md:hidden items-center gap-1.5 overflow-x-auto no-scrollbar pt-0.5">
          {canEdit ? (
            <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-400 font-semibold border border-purple-500/30 shrink-0">
              <Edit3 className="w-2.5 h-2.5" />
              <span>Modo Editor / Admin</span>
            </span>
          ) : (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-brand-500/10 text-brand-400 font-medium border border-brand-500/20 shrink-0">
              Modo Leitura
            </span>
          )}

          <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 font-medium border border-emerald-500/20 shrink-0">
            <Radio className="w-2.5 h-2.5 animate-pulse" />
            <span>Ao vivo</span>
          </span>

          {canEdit && (
            <span className="inline-flex items-center gap-1 text-[10px] pl-1 shrink-0">
              {collabSaveStatus === 'saving' ? (
                <span className="flex items-center gap-1 text-brand-400 font-medium animate-pulse">
                  <Loader2 className="w-2.5 h-2.5 animate-spin" />
                  <span>Salvando...</span>
                </span>
              ) : (
                <span className="flex items-center gap-1 text-emerald-400 font-medium">
                  <CheckCircle2 className="w-2.5 h-2.5" />
                  <span>Salvo</span>
                </span>
              )}
            </span>
          )}
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-4xl w-full mx-auto p-3 sm:p-8 flex flex-col justify-center">
        {isLocked ? (
          /* Password Protection Screen */
          <div className="max-w-md w-full mx-auto my-auto p-6 sm:p-8 rounded-3xl bg-[#050505] border border-[#1c1c1c] shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-brand-500/10 text-brand-400 border border-brand-500/20 flex items-center justify-center mb-6">
              <Lock className="w-7 h-7" />
            </div>

            <h2 className="text-xl font-bold text-center text-gray-100 mb-2">
              Nota Protegida por Senha
            </h2>
            <p className="text-xs text-center text-gray-400 mb-6">
              O autor desta nota configurou uma senha de proteção. Insira a senha correta ou entre na sua conta autorizada para acessar.
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
                    className="w-full px-4 py-3 rounded-xl bg-[#0a0a0a] border border-[#1c1c1c] text-sm text-gray-100 outline-none focus:ring-2 focus:ring-brand-500/50 disabled:opacity-50"
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

              {!currentUser && onOpenAuthModal && (
                <button
                  type="button"
                  onClick={onOpenAuthModal}
                  className="w-full py-2.5 rounded-xl bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30 text-purple-300 text-xs font-semibold transition-colors flex items-center justify-center gap-1.5"
                >
                  <LogIn className="w-3.5 h-3.5" />
                  <span>É Admin ou Membro autorizado? Entrar na Conta</span>
                </button>
              )}
            </form>
          </div>
        ) : (
          /* Unlocked Note Article / Collaborative Editor */
          <article className="bg-[#050505] rounded-2xl sm:rounded-3xl border border-[#1c1c1c] shadow-xl my-2 sm:my-4 overflow-hidden">
            {/* Rich Text Toolbar for Creator / Admin / Editor */}
            {canEdit && (
              <div className="border-b border-[#1c1c1c] bg-[#080808]">
                <EditorToolbar
                  editor={editor}
                  noteTitle={title}
                  onOpenImageModal={() => setIsImageModalOpen(true)}
                />
              </div>
            )}

            <div className="p-4 sm:p-10 lg:p-12">
              {/* Header info & Title */}
              <div className="border-b border-[#1c1c1c] pb-5 sm:pb-6 mb-6 sm:mb-8">
                {canEdit ? (
                  <div className="mb-3 sm:mb-4">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider text-purple-400 flex items-center gap-1">
                        <Edit3 className="w-3 h-3 shrink-0" />
                        <span>Edição Liberada (Admin / Editor) — Sincronização ao vivo</span>
                      </span>
                    </div>
                    <input
                      type="text"
                      value={title}
                      onChange={handleTitleEdit}
                      placeholder="Título da nota..."
                      className="w-full text-2xl sm:text-4xl font-extrabold text-gray-100 bg-transparent border-b border-transparent focus:border-brand-500/50 pb-1 tracking-tight outline-none placeholder:text-gray-600 transition-colors"
                    />
                  </div>
                ) : (
                  <h1 className="text-2xl sm:text-4xl font-extrabold text-gray-100 tracking-tight mb-4">
                    {title || 'Nota sem título'}
                  </h1>
                )}

                <div className="flex flex-wrap items-center gap-3 sm:gap-4 text-xs text-gray-400">
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
                  <div className="sm:ml-auto text-[11px] text-brand-400 font-mono truncate max-w-full">
                    /notpad/{slug}
                  </div>
                </div>
              </div>

              {/* Note Content: Interactive Editor for Admin/Editor, Read-Only HTML for Viewer */}
              {canEdit ? (
                <div className="tiptap prose prose-invert max-w-none text-gray-200 leading-relaxed min-h-[260px]">
                  <EditorContent editor={editor} />
                </div>
              ) : (
                <div 
                  className="tiptap prose prose-invert max-w-none text-gray-200 leading-relaxed min-h-[200px]"
                  dangerouslySetInnerHTML={{ __html: content }}
                />
              )}

              {/* Attachments Section if any */}
              {attachments && attachments.length > 0 && (
                <div className="mt-10 sm:mt-12 pt-6 border-t border-[#1c1c1c]">
                  <h2 className="text-sm font-bold uppercase tracking-wider text-gray-400 mb-3 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-brand-400" />
                    Anexos ({attachments.length})
                  </h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {attachments.map((att) => (
                      <div
                        key={att.id}
                        className="flex items-center justify-between p-3 rounded-xl bg-[#0a0a0a] border border-[#1c1c1c]"
                      >
                        <div className="flex items-center gap-2.5 truncate">
                          <FileText className="w-4 h-4 text-brand-400 shrink-0" />
                          <div className="truncate text-xs">
                            <div className="font-medium text-gray-200 truncate">{att.file_name}</div>
                            <div className="text-[10px] text-gray-400">{(att.file_size / 1024).toFixed(1)} KB</div>
                          </div>
                        </div>
                        {att.data_url ? (
                          <a
                            href={att.data_url}
                            download={att.file_name}
                            className="p-2 text-gray-400 hover:text-brand-400 transition-colors"
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
            </div>
          </article>
        )}
      </main>

      {/* Image Upload Modal for Collaborative Editor */}
      {canEdit && (
        <ImageUploadModal
          isOpen={isImageModalOpen}
          onClose={() => setIsImageModalOpen(false)}
          onInsertImage={handleInsertImage}
        />
      )}

      {/* Public Footer */}
      <footer className="text-center py-5 sm:py-6 px-4 text-xs text-gray-500 border-t border-[#1c1c1c] bg-black">
        Desenvolvido com <span className="text-brand-400">7NotPad</span> — Bloco de notas rápido e colaborativo.
      </footer>
    </div>
  );
};

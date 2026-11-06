import React, { useState, useEffect } from 'react';
import { Modal } from '../common/Modal';
import type { Note, NoteShare, SharedUserAccess, ShareAccessType } from '../../types/note';
import { StorageService, markNoteUnlockedInCurrentTab, hasDirectNoteAccess } from '../../lib/storage';
import { AuthService } from '../../lib/authService';
import { generateSalt, hashPassword, slugify } from '../../lib/crypto';
import { useToast } from '../common/Toast';
import confetti from 'canvas-confetti';
import { 
  Share2, 
  Lock, 
  Unlock,
  Copy, 
  Check, 
  ExternalLink, 
  Trash2, 
  Sparkles, 
  Eye, 
  EyeOff, 
  AlertCircle,
  Link as LinkIcon,
  Cloud,
  AtSign,
  UserPlus,
  Users,
  X,
  Globe,
  Clock,
  QrCode,
  Download,
  MessageCircle,
  Send,
  Edit3,
  ShieldAlert,
  ShieldCheck
} from 'lucide-react';

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  note: Note;
  onShareUpdated: (share: NoteShare | null) => void;
}

export const ShareModal: React.FC<ShareModalProps> = ({
  isOpen,
  onClose,
  note,
  onShareUpdated,
}) => {
  const { success, error } = useToast();

  // Apenas o criador/admin da nota ou quem foi adicionado como Admin do Bloco pode alterar/gerenciar configurações
  const access = hasDirectNoteAccess(note, note.share);
  const canManageShare = access.canManageShare;

  // Core share activation and link slug
  const [isActive, setIsActive] = useState<boolean>(note.share ? note.share.is_active : true);
  const [slug, setSlug] = useState<string>(note.share?.custom_slug || note.id);
  const [isSlugConflict, setIsSlugConflict] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  // 1. Public vs Private Access Mode
  const [accessType, setAccessType] = useState<ShareAccessType>(
    note.share?.access_type || 'public'
  );

  // 2. Password Protection (Activate / Deactivate Password)
  const [isPasswordProtected, setIsPasswordProtected] = useState<boolean>(
    note.share?.is_password_protected ?? false
  );
  const [password, setPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const hasExistingPassword = Boolean(note.share?.password_hash);

  // 3. Collaborative Editing vs Read-Only
  const [allowEditing, setAllowEditing] = useState<boolean>(
    Boolean(note.share?.allow_editing)
  );

  // 4. Content Copying Permission
  const [allowCopy, setAllowCopy] = useState<boolean>(
    note.share?.allow_copy !== false
  );

  // 5. Hide Author / Anonymous Sharing
  const [hideAuthor, setHideAuthor] = useState<boolean>(
    Boolean(note.share?.hide_author)
  );

  // 6. Expiration Option
  const [expirationOption, setExpirationOption] = useState<'never' | '1h' | '24h' | '7d' | '30d'>('never');
  const [expiresAt, setExpiresAt] = useState<string | null>(
    note.share?.expires_at || null
  );

  // 7. Platform users (@malaca, etc.) access management
  const [allowedUsers, setAllowedUsers] = useState<SharedUserAccess[]>(
    note.share?.allowed_users || []
  );
  const [platformUsers, setPlatformUsers] = useState<
    Array<{ id: string; username: string; full_name: string }>
  >(() => AuthService.getPlatformUsers());
  const [userSearchInput, setUserSearchInput] = useState<string>('');
  const [newUserRole, setNewUserRole] = useState<'admin' | 'viewer'>('admin');

  // UI helpers
  const [copied, setCopied] = useState<boolean>(false);
  const [showQrCodeModal, setShowQrCodeModal] = useState<boolean>(false);

  // Sync state when modal opens or note changes
  useEffect(() => {
    if (isOpen) {
      setPlatformUsers(AuthService.getPlatformUsers());
      AuthService.fetchPlatformUsers().then((users) => {
        setPlatformUsers(users);
      });

      if (note.share) {
        setIsActive(note.share.is_active);
        const titleSlug = note.title.trim() ? slugify(note.title) : '';
        const initialSlug =
          note.share.custom_slug && note.share.custom_slug !== titleSlug
            ? note.share.custom_slug
            : note.id;
        setSlug(initialSlug);
        setAccessType(note.share.access_type || 'public');
        setIsPasswordProtected(note.share.is_password_protected);
        setAllowEditing(Boolean(note.share.allow_editing));
        setAllowCopy(note.share.allow_copy !== false);
        setHideAuthor(Boolean(note.share.hide_author));
        setExpiresAt(note.share.expires_at || null);
        setExpirationOption(note.share.expires_at ? '24h' : 'never');
        setAllowedUsers(note.share.allowed_users || []);
        setPassword('');
      } else {
        // Default new share
        setIsActive(true);
        setSlug(note.id);
        setAccessType('public');
        setIsPasswordProtected(false);
        setAllowEditing(false);
        setAllowCopy(true);
        setHideAuthor(false);
        setExpiresAt(null);
        setExpirationOption('never');
        setAllowedUsers([]);
        setPassword('');
      }

      setUserSearchInput('');
      setIsSlugConflict(false);
      setCopied(false);
      setShowQrCodeModal(false);
    }
  }, [isOpen, note.id]);

  // Keep share state synced if updated remotely while modal is open
  useEffect(() => {
    if (!isOpen || !note.share || isSaving) return;
    setIsActive(note.share.is_active);
    if (note.share.access_type) setAccessType(note.share.access_type);
    setIsPasswordProtected(note.share.is_password_protected);
    if (note.share.allow_editing !== undefined) setAllowEditing(note.share.allow_editing);
    if (note.share.allow_copy !== undefined) setAllowCopy(note.share.allow_copy);
    if (note.share.hide_author !== undefined) setHideAuthor(note.share.hide_author);
    if (note.share.custom_slug) setSlug(note.share.custom_slug);
    if (Array.isArray(note.share.allowed_users)) setAllowedUsers(note.share.allowed_users);
    if (note.share.expires_at !== undefined) setExpiresAt(note.share.expires_at);
  }, [
    isOpen,
    isSaving,
    note.share?.updated_at,
    note.share?.is_active,
    note.share?.access_type,
    note.share?.is_password_protected,
    note.share?.allow_editing,
    note.share?.allow_copy,
    note.share?.hide_author,
    note.share?.custom_slug,
    note.share?.allowed_users,
    note.share?.expires_at,
  ]);

  // Check slug availability in background
  useEffect(() => {
    const cleanSlug = slugify(slug);
    if (!cleanSlug) {
      setIsSlugConflict(false);
      return;
    }

    const checkAvailability = async () => {
      const taken = await StorageService.isSlugTaken(cleanSlug, note.id);
      setIsSlugConflict(taken);
    };

    const timer = setTimeout(checkAvailability, 300);
    return () => clearTimeout(timer);
  }, [slug, note.id]);

  const handleSlugChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    setSlug(raw);
  };

  const handleUseNoteUniqueId = () => {
    setSlug(note.id);
  };

  // Add platform user (@username) to allowedUsers
  const handleAddPlatformUser = async (rawUsername?: string, fullName?: string) => {
    if (!canManageShare) {
      error('Permissão Negada', 'Apenas o criador ou administradores podem adicionar membros.');
      return;
    }

    const target = (rawUsername ?? userSearchInput).trim().toLowerCase().replace(/^@+/, '');
    if (!target || target.length < 2) {
      error('Usuário inválido', 'Digite um @usuario válido (ex: @malaca).');
      return;
    }

    if (allowedUsers.some((u) => u.username.toLowerCase() === target)) {
      setUserSearchInput('');
      return;
    }

    const knownUser = platformUsers.find((u) => u.username.toLowerCase() === target);
    const entry: SharedUserAccess = {
      username: target,
      full_name: fullName || knownUser?.full_name || target,
      role: newUserRole,
      added_at: new Date().toISOString(),
    };

    const nextUsers = [...allowedUsers, entry];
    setAllowedUsers(nextUsers);
    setUserSearchInput('');
    await executeSave(false, nextUsers);
  };

  const handleRemovePlatformUser = async (username: string) => {
    if (!canManageShare) {
      error('Permissão Negada', 'Apenas o criador ou administradores podem remover membros.');
      return;
    }

    const nextUsers = allowedUsers.filter((u) => u.username.toLowerCase() !== username.toLowerCase());
    setAllowedUsers(nextUsers);
    await executeSave(false, nextUsers);
  };

  const handleToggleUserRole = async (username: string) => {
    if (!canManageShare) {
      error('Permissão Negada', 'Apenas o criador ou administradores podem alterar cargos.');
      return;
    }

    const nextUsers = allowedUsers.map((u) =>
      u.username.toLowerCase() === username.toLowerCase()
        ? { ...u, role: (u.role === 'admin' ? 'viewer' : 'admin') as 'admin' | 'viewer' }
        : u
    );
    setAllowedUsers(nextUsers);
    await executeSave(false, nextUsers);
  };

  const filteredSuggestions = platformUsers.filter((u) => {
    const alreadyAdded = allowedUsers.some(
      (added) => added.username.toLowerCase() === u.username.toLowerCase()
    );
    if (alreadyAdded) return false;
    const q = userSearchInput.trim().toLowerCase().replace(/^@+/, '');
    if (!q) return true;
    return (
      u.username.toLowerCase().includes(q) ||
      (u.full_name && u.full_name.toLowerCase().includes(q))
    );
  });

  const getCleanBaseUrl = () => {
    const baseUrl = (import.meta as any).env?.BASE_URL || '/';
    const origin = window.location.origin;
    const cleanBase = baseUrl === '/' ? '' : baseUrl.replace(/\/+$/, '');
    const cleanSlug = slugify(slug) || note.id;
    return `${origin}${cleanBase}/notpad/${cleanSlug}`;
  };

  const getShareUrl = () => {
    return getCleanBaseUrl();
  };

  // Helper to save share state to storage/Firebase
  const executeSave = async (
    forceActive = false, 
    customAllowedUsers?: SharedUserAccess[],
    overridePasswordProtected?: boolean
  ): Promise<{ success: boolean; error?: string; cloudSynced?: boolean }> => {
    if (!canManageShare) {
      return {
        success: false,
        error: 'Apenas o criador ou administradores adicionados a este bloco de notas podem alterar as configurações de compartilhamento.',
      };
    }

    const cleanSlug = slugify(slug);
    if (!cleanSlug || cleanSlug.length < 3) {
      return { success: false, error: 'O identificador precisa conter pelo menos 3 caracteres.' };
    }

    if (isSlugConflict) {
      return { success: false, error: 'Este link já está em uso por outra nota. Escolha outro.' };
    }

    const effectivePasswordProtected = overridePasswordProtected !== undefined
      ? overridePasswordProtected
      : isPasswordProtected;

    if (effectivePasswordProtected) {
      if (!note.share?.password_hash && !password.trim()) {
        return { success: false, error: 'Você ativou a proteção por senha, informe uma senha de no mínimo 3 dígitos.' };
      }
      if (password.trim() && password.trim().length < 3) {
        return { success: false, error: 'A senha do bloco de nota deve ter no mínimo 3 dígitos.' };
      }
    }

    let salt = note.share?.password_salt;
    let hash = note.share?.password_hash;

    if (effectivePasswordProtected) {
      if (password.trim()) {
        salt = generateSalt();
        hash = await hashPassword(password.trim(), salt);
      }
      if (hash) {
        markNoteUnlockedInCurrentTab(note.id, hash);
      }
    } else {
      salt = undefined;
      hash = undefined;
    }

    // Compute expiration date
    let computedExpiresAt = expiresAt;
    if (expirationOption === 'never') {
      computedExpiresAt = null;
    } else if (expirationOption === '1h') {
      computedExpiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    } else if (expirationOption === '24h') {
      computedExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    } else if (expirationOption === '7d') {
      computedExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    } else if (expirationOption === '30d') {
      computedExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    }

    const activeState = forceActive ? true : isActive;
    const currentUser = AuthService.getCurrentUser();

    const shareData: NoteShare = {
      id: note.share?.id || crypto.randomUUID(),
      note_id: note.id,
      custom_slug: cleanSlug,
      is_password_protected: effectivePasswordProtected,
      password_salt: salt,
      password_hash: hash,
      is_active: activeState,
      created_at: note.share?.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
      view_count: note.share?.view_count || 0,
      owner_token: note.owner_token,
      owner_user_id: note.user_id || currentUser?.id,
      owner_username: note.owner_username || currentUser?.username,
      allowed_users: customAllowedUsers ?? allowedUsers,
      access_type: accessType,
      allow_editing: allowEditing,
      allow_copy: allowCopy,
      hide_author: hideAuthor,
      expires_at: computedExpiresAt,
    };

    setIsActive(activeState);

    const result = await StorageService.saveShare(shareData);
    if (result.success) {
      onShareUpdated(shareData);
      return { success: true, cloudSynced: true };
    } else {
      onShareUpdated(shareData);
      return { success: true, cloudSynced: false, error: result.error };
    }
  };

  const handleCopyLink = async () => {
    setIsSaving(true);
    try {
      const res = await executeSave(true);
      if (!res.success) {
        error('Falha ao compartilhar', res.error || 'Erro ao validar compartilhamento.');
        return;
      }

      const urlToCopy = getShareUrl();
      await navigator.clipboard.writeText(urlToCopy);
      setCopied(true);
      confetti({
        particleCount: 40,
        spread: 60,
        origin: { y: 0.8 }
      });

      const cleanSlug = slugify(slug) || note.id;
      success('Link copiado!', `URL /notpad/${cleanSlug} copiada para a área de transferência.`);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      error('Erro ao copiar link', 'Não foi possível copiar automaticamente.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleOpenPublicView = async () => {
    setIsSaving(true);
    try {
      const res = await executeSave(true);
      if (!res.success) {
        error('Falha ao compartilhar', res.error || 'Erro ao validar compartilhamento.');
        return;
      }
      window.open(`${getShareUrl()}?view=public`, '_blank', 'noopener,noreferrer');
    } finally {
      setIsSaving(false);
    }
  };

  const handleShareWhatsApp = async () => {
    await executeSave(true);
    const text = `${note.title ? `*${note.title}*\n` : ''}Confira esta nota no 7NotPad:\n${getShareUrl()}`;
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
  };

  const handleShareTelegram = async () => {
    await executeSave(true);
    const text = note.title ? `${note.title} - 7NotPad` : '7NotPad';
    window.open(`https://t.me/share/url?url=${encodeURIComponent(getShareUrl())}&text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
  };

  const handleDownloadQr = async () => {
    try {
      const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=${encodeURIComponent(getShareUrl())}`;
      const res = await fetch(qrUrl);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `qrcode-7notpad-${slugify(slug) || note.id}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
      success('QR Code baixado com sucesso!');
    } catch {
      error('Erro ao baixar QR Code.');
    }
  };

  // Instant password deactivation
  const handleDeactivatePassword = async () => {
    setIsPasswordProtected(false);
    setPassword('');
    setIsSaving(true);
    try {
      await executeSave(false, undefined, false);
      success('Senha Desativada!', 'O bloco de notas agora está acessível livremente sem senha.');
    } catch {
      error('Erro ao desativar senha.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveShare = async () => {
    setIsSaving(true);
    try {
      const res = await executeSave(false);
      if (!res.success) {
        error('Falha ao compartilhar', res.error || 'Erro desconhecido.');
        return;
      }

      const cleanSlug = slugify(slug);
      success(
        isActive ? 'Compartilhamento salvo!' : 'Compartilhamento desativado',
        `Configurações atualizadas para /notpad/${cleanSlug}`
      );
    } catch (err: any) {
      error('Erro ao salvar', err?.message || 'Erro ao salvar compartilhamento.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleRevokeShare = async () => {
    if (!note.share) return;
    try {
      await StorageService.revokeShare(note.share.id, note.share.custom_slug);
      onShareUpdated(null);
      setIsActive(false);
      success('Compartilhamento revogado', 'O link anterior não funcionará mais.');
      onClose();
    } catch {
      error('Erro', 'Não foi possível revogar o compartilhamento.');
    }
  };

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              <Share2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-100">Compartilhar Nota</h2>
              <p className="text-xs text-gray-400 font-normal">
                Visibilidade público/privado, senha, permissões de edição e opções avançadas
              </p>
            </div>
          </div>
        }
        maxWidth="lg"
      >
        <div className="space-y-4 max-h-[78vh] overflow-y-auto pr-1">
          {/* Read-Only Alert Banner if user is not creator and not added as note admin */}
          {!canManageShare && (
            <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-3 text-xs text-amber-200">
              <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <div className="font-bold text-amber-300 flex items-center gap-1.5">
                  <span>Modo Somente Leitura</span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30 font-mono">
                    Visualizador
                  </span>
                </div>
                <p className="text-[11px] text-amber-200/80 leading-relaxed">
                  Apenas o <strong>criador</strong> {access.creatorUsername ? `(@${access.creatorUsername})` : ''} ou quem foi adicionado como <strong>Admin do Bloco</strong> tem permissão para editar o conteúdo e alterar as opções de compartilhamento desta nota.
                </p>
              </div>
            </div>
          )}

          {/* Active Switch Bar */}
          <div className="flex items-center justify-between p-3.5 rounded-2xl bg-[#080808] border border-[#1c1c1c]">
            <div className="space-y-0.5">
              <div className="text-xs font-semibold text-gray-200 flex items-center gap-2">
                <span>Disponibilizar Link na Web</span>
                {isActive ? (
                  <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase font-mono px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
                    </span>
                    Link Ativo no Ar
                  </span>
                ) : (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-800 text-gray-400 border border-gray-700">
                    Desativado
                  </span>
                )}
              </div>
              <p className="text-[11px] text-gray-400">
                Sincroniza alterações em tempo real nas telas de todos os leitores e colaboradores.
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-cyan-600"></div>
            </label>
          </div>

          {/* 1. MODO DE VISIBILIDADE: PÚBLICO VS PRIVADO */}
          <div className="p-3.5 rounded-2xl bg-[#080808] border border-[#1c1c1c] space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-gray-200 uppercase tracking-wider flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5 text-cyan-400" />
                <span>Modo de Visibilidade (Público / Privado)</span>
              </label>
              <span className="text-[10px] text-gray-400 font-mono">
                {accessType === 'public' ? 'Geral' : 'Restrito'}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {/* Option: Público */}
              <button
                type="button"
                onClick={() => setAccessType('public')}
                className={`p-3 rounded-xl border text-left transition-all ${
                  accessType === 'public'
                    ? 'border-cyan-500/60 bg-cyan-950/20 text-cyan-100 shadow-sm shadow-cyan-950/30'
                    : 'border-[#1c1c1c] bg-[#0c0c0c] text-gray-400 hover:border-gray-700 hover:text-gray-200'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2 font-bold text-xs text-gray-100">
                    <Globe className="w-4 h-4 text-cyan-400" />
                    <span>Público</span>
                  </div>
                  <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded border ${
                    accessType === 'public' ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40' : 'bg-gray-800 text-gray-500 border-gray-700'
                  }`}>
                    Qualquer Link
                  </span>
                </div>
                <p className="text-[11px] text-gray-400 leading-relaxed">
                  Qualquer pessoa que receber o link pode acessar. Você pode definir uma senha opcional para proteção extra.
                </p>
              </button>

              {/* Option: Privado */}
              <button
                type="button"
                onClick={() => setAccessType('private')}
                className={`p-3 rounded-xl border text-left transition-all ${
                  accessType === 'private'
                    ? 'border-purple-500/60 bg-purple-950/20 text-purple-100 shadow-sm shadow-purple-950/30'
                    : 'border-[#1c1c1c] bg-[#0c0c0c] text-gray-400 hover:border-gray-700 hover:text-gray-200'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2 font-bold text-xs text-gray-100">
                    <Lock className="w-4 h-4 text-purple-400" />
                    <span>Privado</span>
                  </div>
                  <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded border ${
                    accessType === 'private' ? 'bg-purple-500/20 text-purple-300 border-purple-500/40' : 'bg-gray-800 text-gray-500 border-gray-700'
                  }`}>
                    Apenas Autorizados
                  </span>
                </div>
                <p className="text-[11px] text-gray-400 leading-relaxed">
                  Apenas você e os usuários cadastrados da plataforma selecionados abaixo (@usuario) têm permissão para acessar.
                </p>
              </button>
            </div>
          </div>

          {/* 2. PROTEÇÃO POR SENHA (ATIVAR / DESATIVAR SENHA) */}
          <div className="p-3.5 rounded-2xl bg-[#080808] border border-[#1c1c1c] space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className={`p-1 rounded-lg border ${
                  isPasswordProtected
                    ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                    : 'bg-gray-800 text-gray-400 border-gray-700'
                }`}>
                  {isPasswordProtected ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                </div>
                <div>
                  <span className="text-xs font-bold text-gray-200 flex items-center gap-2">
                    <span>Proteção por Senha</span>
                    {isPasswordProtected ? (
                      <span className="text-[10px] font-bold px-2 py-0.2 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30">
                        Ativada
                      </span>
                    ) : (
                      <span className="text-[10px] font-semibold px-2 py-0.2 rounded-full bg-gray-800 text-gray-400 border border-gray-700">
                        Desativada
                      </span>
                    )}
                  </span>
                  <p className="text-[11px] text-gray-400">
                    {isPasswordProtected
                      ? 'Exige senha para visitantes abrirem o bloco de notas.'
                      : 'Acesso livre pelo link direto sem solicitar senha.'}
                  </p>
                </div>
              </div>

              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={isPasswordProtected}
                  onChange={(e) => setIsPasswordProtected(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500"></div>
              </label>
            </div>

            {/* Password input & controls when active */}
            {isPasswordProtected && (
              <div className="pt-2 border-t border-[#1a1a1a] space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <label className="text-gray-300 font-medium">
                    {hasExistingPassword
                      ? 'Alterar Senha de Acesso (deixe em branco para manter a atual):'
                      : 'Defina a Senha de Acesso (mínimo 3 dígitos):'}
                  </label>
                  {hasExistingPassword && (
                    <button
                      type="button"
                      onClick={handleDeactivatePassword}
                      className="text-[11px] font-semibold text-rose-400 hover:text-rose-300 transition-colors"
                      title="Desativar senha e liberar acesso público direto"
                    >
                      Desativar Senha Agora
                    </button>
                  )}
                </div>

                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={hasExistingPassword ? '●●●●● (Senha ativa — digite nova para trocar)' : 'Ex: 1234, segredo2026...'}
                    className="w-full bg-[#0c0c0c] border border-[#1c1c1c] rounded-xl px-3 py-2 text-xs text-gray-100 outline-none focus:border-amber-500 pr-10 font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-200"
                  >
                    {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>

                <p className="text-[11px] text-gray-500">
                  🔒 O criador da nota e os usuários autorizados selecionados abaixo entram diretamente sem precisar digitar esta senha.
                </p>
              </div>
            )}
          </div>

          {/* 3. PERMISSÕES DE COLABORAÇÃO & OUTRAS OPÇÕES */}
          <div className="p-3.5 rounded-2xl bg-[#080808] border border-[#1c1c1c] space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-gray-200 uppercase tracking-wider flex items-center gap-1.5">
                <Edit3 className="w-3.5 h-3.5 text-cyan-400" />
                <span>Permissão de Edição &amp; Opções do Link</span>
              </label>
            </div>

            {/* Read-Only vs Collaborative Edit */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setAllowEditing(false)}
                className={`p-2.5 rounded-xl border text-left transition-all ${
                  !allowEditing
                    ? 'border-cyan-500/60 bg-cyan-950/20 text-cyan-200'
                    : 'border-[#1c1c1c] bg-[#0c0c0c] text-gray-400 hover:border-gray-700 hover:text-gray-200'
                }`}
              >
                <div className="flex items-center gap-2 font-bold text-xs mb-0.5">
                  <Eye className="w-3.5 h-3.5" />
                  <span>Somente Leitura (Padrão)</span>
                </div>
                <div className="text-[10px] text-gray-400">
                  Visitantes podem visualizar mas não podem alterar o conteúdo.
                </div>
              </button>

              <button
                type="button"
                onClick={() => setAllowEditing(true)}
                className={`p-2.5 rounded-xl border text-left transition-all ${
                  allowEditing
                    ? 'border-purple-500/60 bg-purple-950/20 text-purple-200'
                    : 'border-[#1c1c1c] bg-[#0c0c0c] text-gray-400 hover:border-gray-700 hover:text-gray-200'
                }`}
              >
                <div className="flex items-center gap-2 font-bold text-xs mb-0.5">
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>Edição Colaborativa</span>
                </div>
                <div className="text-[10px] text-gray-400">
                  Visitantes com o link podem editar e salvar texto em tempo real.
                </div>
              </button>
            </div>

            {/* Expiration + Copy + Hide Author controls */}
            <div className="pt-2 border-t border-[#1a1a1a] grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {/* Expiration Select */}
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-gray-300 flex items-center gap-1">
                  <Clock className="w-3 h-3 text-cyan-400" />
                  <span>Expiração do Link:</span>
                </label>
                <select
                  value={expirationOption}
                  onChange={(e) => setExpirationOption(e.target.value as any)}
                  className="w-full px-2.5 py-1.5 rounded-xl bg-[#0c0c0c] border border-[#1c1c1c] text-xs text-gray-200 outline-none focus:border-cyan-500"
                >
                  <option value="never">Nunca expira (Permanente)</option>
                  <option value="1h">Expira em 1 hora</option>
                  <option value="24h">Expira em 24 horas (1 dia)</option>
                  <option value="7d">Expira em 7 dias (1 semana)</option>
                  <option value="30d">Expira em 30 dias (1 mês)</option>
                </select>
              </div>

              {/* Allow Copy */}
              <label className="flex items-center gap-2 p-2 rounded-xl bg-[#0c0c0c] border border-[#1c1c1c] cursor-pointer hover:bg-[#121212] transition-colors self-end">
                <input
                  type="checkbox"
                  checked={allowCopy}
                  onChange={(e) => setAllowCopy(e.target.checked)}
                  className="w-3.5 h-3.5 rounded text-cyan-500 focus:ring-0 bg-transparent"
                />
                <div className="text-xs">
                  <span className="font-semibold text-gray-200 block text-[11px]">Permitir Cópia</span>
                  <span className="text-gray-500 text-[10px]">Exibe botão copiar texto</span>
                </div>
              </label>

              {/* Hide Author */}
              <label className="flex items-center gap-2 p-2 rounded-xl bg-[#0c0c0c] border border-[#1c1c1c] cursor-pointer hover:bg-[#121212] transition-colors self-end">
                <input
                  type="checkbox"
                  checked={hideAuthor}
                  onChange={(e) => setHideAuthor(e.target.checked)}
                  className="w-3.5 h-3.5 rounded text-cyan-500 focus:ring-0 bg-transparent"
                />
                <div className="text-xs">
                  <span className="font-semibold text-gray-200 block text-[11px]">Ocultar Autor</span>
                  <span className="text-gray-500 text-[10px]">Compartilhar anônimo</span>
                </div>
              </label>
            </div>
          </div>

          {/* 4. ID ÚNICO / SLUG PERSONALIZADO */}
          <div className="p-3.5 rounded-2xl bg-[#080808] border border-[#1c1c1c] space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-gray-200 uppercase tracking-wider flex items-center gap-1.5">
                <LinkIcon className="w-3.5 h-3.5 text-cyan-400" />
                <span>ID Único da Nota (/notpad/:id)</span>
              </label>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex-1 flex items-center bg-[#0c0c0c] border border-[#1c1c1c] rounded-xl px-3 py-2 focus-within:border-cyan-500 transition-colors">
                <span className="text-xs text-gray-500 select-none pr-1 truncate font-mono">
                  {window.location.host}/notpad/
                </span>
                <input
                  type="text"
                  value={slug}
                  onChange={handleSlugChange}
                  placeholder={note.id}
                  className="flex-1 bg-transparent text-xs text-gray-100 outline-none font-mono"
                />
              </div>
              <button
                type="button"
                onClick={handleUseNoteUniqueId}
                title="Restaurar ID único original da nota"
                className="p-2.5 rounded-xl border border-[#1c1c1c] bg-[#0c0c0c] hover:bg-[#141414] text-gray-300 transition-colors"
              >
                <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
              </button>
            </div>

            {isSlugConflict && (
              <div className="flex items-center gap-1.5 text-xs text-rose-400">
                <AlertCircle className="w-3.5 h-3.5" />
                <span>Este identificador já está em uso por outro bloco. Por favor, escolha outro.</span>
              </div>
            )}
          </div>

          {/* 5. USUÁRIOS AUTORIZADOS DA PLATAFORMA (@username) */}
          <div className="p-3.5 rounded-2xl bg-[#080808] border border-[#1c1c1c] space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="w-3.5 h-3.5 text-purple-400" />
                <span className="text-xs font-bold text-gray-200 uppercase tracking-wider">
                  Usuários Autorizados da Plataforma (@username)
                </span>
              </div>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-300 border border-purple-500/20 font-mono">
                {allowedUsers.length} {allowedUsers.length === 1 ? 'autorizado' : 'autorizados'}
              </span>
            </div>

            <p className="text-[11px] text-gray-400">
              Libere acesso direto sem senha ou dê permissão de edição para contas cadastradas (ex: <strong className="text-cyan-400">@malaca</strong>).
            </p>

            {/* Input to search/add user */}
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <AtSign className="w-3.5 h-3.5 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  disabled={!canManageShare}
                  value={userSearchInput}
                  onChange={(e) => setUserSearchInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddPlatformUser();
                    }
                  }}
                  placeholder={canManageShare ? "Buscar ou digitar usuario (ex: @malaca)..." : "Apenas o criador/admin pode adicionar membros"}
                  className={`w-full bg-[#0c0c0c] border border-[#1c1c1c] rounded-xl pl-8 pr-3 py-2 text-xs text-gray-100 outline-none focus:border-cyan-500 font-mono ${!canManageShare ? 'opacity-50 cursor-not-allowed' : ''}`}
                />
              </div>

              <select
                disabled={!canManageShare}
                value={newUserRole}
                onChange={(e) => setNewUserRole(e.target.value as 'admin' | 'viewer')}
                className={`bg-[#0c0c0c] border border-[#1c1c1c] rounded-xl px-2.5 py-2 text-xs text-gray-200 outline-none focus:border-cyan-500 ${!canManageShare ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <option value="admin">🛡️ Admin do Bloco (Pode Editar & Compartilhar)</option>
                <option value="viewer">👁️ Leitor (Apenas Visualização)</option>
              </select>

              <button
                type="button"
                disabled={!canManageShare}
                onClick={() => handleAddPlatformUser()}
                className={`flex items-center gap-1 px-3 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold transition-colors shrink-0 ${!canManageShare ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>Adicionar</span>
              </button>
            </div>

            {/* Quick-add suggestions */}
            {canManageShare && filteredSuggestions.length > 0 && (
              <div className="space-y-1.5 pt-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 block">
                  Usuários sugeridos na plataforma (clique para adicionar):
                </span>
                <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                  {filteredSuggestions.map((u) => (
                    <button
                      key={u.username}
                      type="button"
                      onClick={() => handleAddPlatformUser(u.username, u.full_name)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#0c0c0c] hover:bg-[#141414] border border-[#1c1c1c] hover:border-purple-500/40 text-xs text-gray-300 transition-all"
                    >
                      <span className="w-4 h-4 rounded-full bg-purple-500/20 text-purple-400 font-bold text-[10px] flex items-center justify-center uppercase">
                        {(u.full_name || u.username)[0]}
                      </span>
                      <span className="font-mono font-semibold text-purple-400">@{u.username}</span>
                      {u.full_name && u.full_name.toLowerCase() !== u.username.toLowerCase() && (
                        <span className="text-[11px] text-gray-500">({u.full_name})</span>
                      )}
                      <span className="text-[10px] text-emerald-400 font-bold ml-0.5">+</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Added users and Creator list */}
            <div className="space-y-1.5 pt-2 border-t border-[#1a1a1a]">
              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {/* Note Creator Header Entry */}
                <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/30">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-6 h-6 rounded-full bg-amber-500/20 text-amber-400 font-bold text-xs flex items-center justify-center shrink-0">
                      👑
                    </div>
                    <div className="truncate">
                      <span className="text-xs font-mono font-bold text-amber-300">
                        @{access.creatorUsername || note.owner_username || 'Criador'}
                      </span>
                      <span className="text-[11px] text-amber-400/80 ml-1.5 font-semibold">
                        (Criador / Dono)
                      </span>
                    </div>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3 text-amber-400" />
                    <span>Criador / Admin</span>
                  </span>
                </div>

                {allowedUsers.map((u) => (
                  <div
                    key={u.username}
                    className="flex items-center justify-between px-3 py-1.5 rounded-xl bg-[#0c0c0c] border border-[#1c1c1c]"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-6 h-6 rounded-full bg-purple-500/20 text-purple-400 font-bold text-xs flex items-center justify-center uppercase shrink-0">
                        {(u.full_name || u.username)[0]}
                      </div>
                      <div className="truncate">
                        <span className="text-xs font-mono font-bold text-purple-400">
                          @{u.username}
                        </span>
                        {u.full_name && (
                          <span className="text-[11px] text-gray-400 ml-1.5">
                            {u.full_name}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        disabled={!canManageShare}
                        onClick={() => handleToggleUserRole(u.username)}
                        title={canManageShare ? "Clique para alternar permissão" : "Apenas o criador ou admins podem mudar cargos"}
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded-md border transition-colors ${
                          u.role === 'admin'
                            ? 'bg-purple-500/10 text-purple-400 border-purple-500/30'
                            : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                        } ${!canManageShare ? 'opacity-60 cursor-not-allowed' : ''}`}
                      >
                        {u.role === 'admin' ? '🛡️ Admin do Bloco (Pode Editar & Compartilhar)' : '👁️ Leitor (Apenas Visualização)'}
                      </button>
                      {canManageShare && (
                        <button
                          type="button"
                          onClick={() => handleRemovePlatformUser(u.username)}
                          className="p-1 text-gray-400 hover:text-rose-400 rounded-lg transition-colors"
                          title="Remover permissão"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 6. CAIXA DO LINK & AÇÕES RÁPIDAS (WHATSAPP, TELEGRAM, QR CODE, COPIAR) */}
          {isActive && (
            <div className="p-3.5 rounded-2xl bg-cyan-950/20 border border-cyan-500/30 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-gray-100 flex items-center gap-1.5">
                  <LinkIcon className="w-3.5 h-3.5 text-cyan-400" />
                  <span>URL de Compartilhamento:</span>
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-gray-400 font-mono">
                    {note.share?.view_count || 0} visualizações
                  </span>
                  <span className="text-[10px] text-emerald-400 font-semibold flex items-center gap-1">
                    <Cloud className="w-3 h-3" />
                    <span>Nuvem Ativa</span>
                  </span>
                </div>
              </div>

              {/* URL Box */}
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={getShareUrl()}
                  className="flex-1 bg-[#050505] border border-[#1c1c1c] rounded-xl px-3 py-2 text-xs text-cyan-300 font-mono outline-none truncate"
                />
                <button
                  type="button"
                  onClick={handleCopyLink}
                  disabled={isSaving}
                  className="flex items-center gap-1.5 px-3.5 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-cyan-600/30 shrink-0"
                >
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? 'Copiado!' : 'Copiar Link'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleOpenPublicView}
                  disabled={isSaving}
                  className="p-2 border border-[#1c1c1c] bg-[#0c0c0c] hover:bg-[#141414] text-gray-300 hover:text-white rounded-xl transition-colors shrink-0"
                  title="Abrir em Nova Guia"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Social & QR Code Share Row */}
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleShareWhatsApp}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/25 text-xs font-semibold transition-colors"
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  <span>WhatsApp</span>
                </button>

                <button
                  type="button"
                  onClick={handleShareTelegram}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 border border-sky-500/25 text-xs font-semibold transition-colors"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Telegram</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowQrCodeModal(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#121212] hover:bg-[#1a1a1a] text-gray-200 border border-[#222] text-xs font-semibold transition-colors"
                >
                  <QrCode className="w-3.5 h-3.5 text-cyan-400" />
                  <span>QR Code</span>
                </button>
              </div>
            </div>
          )}

          {/* Footer Actions */}
          <div className="flex items-center justify-between pt-2 border-t border-[#1c1c1c]">
            {note.share ? (
              <button
                type="button"
                onClick={handleRevokeShare}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-xl transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Revogar Link</span>
              </button>
            ) : (
              <div />
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl bg-[#141414] hover:bg-[#1a1a1a] text-gray-300 text-xs font-semibold transition-colors"
              >
                Fechar
              </button>
              <button
                type="button"
                onClick={handleSaveShare}
                disabled={isSaving || isSlugConflict}
                className="px-5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold shadow-lg shadow-cyan-600/30 transition-all flex items-center gap-1.5"
              >
                {isSaving ? 'Salvando...' : 'Salvar Alterações'}
              </button>
            </div>
          </div>
        </div>
      </Modal>

      {/* QR Code Popup Modal */}
      <Modal
        isOpen={showQrCodeModal}
        onClose={() => setShowQrCodeModal(false)}
        maxWidth="sm"
        title={
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              <QrCode className="w-4 h-4" />
            </div>
            <span className="text-sm font-bold text-gray-100">QR Code da Nota</span>
          </div>
        }
      >
        <div className="p-4 flex flex-col items-center gap-4 text-center">
          <div className="p-3 bg-white rounded-2xl shadow-xl">
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(getShareUrl())}`}
              alt="QR Code da Nota"
              className="w-56 h-56 rounded-lg block"
            />
          </div>

          <div className="space-y-1">
            <p className="text-xs font-semibold text-gray-200">
              Aponte a câmera do seu celular
            </p>
            <p className="text-[11px] text-gray-400 font-mono truncate max-w-xs">
              {getShareUrl()}
            </p>
          </div>

          <div className="flex items-center gap-2 w-full pt-1">
            <button
              type="button"
              onClick={handleDownloadQr}
              className="flex-1 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold shadow-lg shadow-cyan-600/30 transition-all flex items-center justify-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Baixar Imagem PNG</span>
            </button>
            <button
              type="button"
              onClick={() => setShowQrCodeModal(false)}
              className="px-4 py-2.5 rounded-xl bg-[#141414] hover:bg-[#1a1a1a] text-gray-300 text-xs font-semibold transition-colors"
            >
              Fechar
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
};

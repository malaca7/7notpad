import React, { useState, useEffect } from 'react';
import { Modal } from '../common/Modal';
import type { Note, NoteShare, SharedUserAccess } from '../../types/note';
import { StorageService, markNoteUnlockedInCurrentTab } from '../../lib/storage';
import { AuthService } from '../../lib/authService';
import { generateSalt, hashPassword, slugify } from '../../lib/crypto';
import { useToast } from '../common/Toast';
import confetti from 'canvas-confetti';
import { 
  Share2, 
  Lock, 
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

  // Always default to true when sharing a note so the user doesn't copy an inactive link!
  const [isActive, setIsActive] = useState<boolean>(note.share ? note.share.is_active : true);
  const [slug, setSlug] = useState<string>(note.share?.custom_slug || note.id);
  const [isPasswordProtected, setIsPasswordProtected] = useState<boolean>(
    note.share?.is_password_protected ?? false
  );
  const [password, setPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [isSlugConflict, setIsSlugConflict] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  // Platform users (@malaca, etc.) selection state
  const [allowedUsers, setAllowedUsers] = useState<SharedUserAccess[]>(
    note.share?.allowed_users || []
  );
  const [platformUsers, setPlatformUsers] = useState<
    Array<{ id: string; username: string; full_name: string }>
  >(() => AuthService.getPlatformUsers());
  const [userSearchInput, setUserSearchInput] = useState<string>('');
  const [newUserRole, setNewUserRole] = useState<'admin' | 'viewer'>('admin');

  // Sync state when modal opens or active note ID changes
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
        setIsPasswordProtected(note.share.is_password_protected);
        setAllowedUsers(note.share.allowed_users || []);
        setPassword('');
      } else {
        // Default to active and use the unique ID of the note!
        setIsActive(true);
        setSlug(note.id);
        setIsPasswordProtected(false);
        setAllowedUsers([]);
        setPassword('');
      }
      setUserSearchInput('');
      setIsSlugConflict(false);
      setCopied(false);
    }
  }, [isOpen, note.id]);

  // Keep share state synced if updated from another screen/tab while modal is open
  useEffect(() => {
    if (!isOpen || !note.share || isSaving) return;
    setIsActive(note.share.is_active);
    setIsPasswordProtected(note.share.is_password_protected);
    if (note.share.custom_slug) {
      setSlug(note.share.custom_slug);
    }
    if (Array.isArray(note.share.allowed_users)) {
      setAllowedUsers(note.share.allowed_users);
    }
  }, [
    isOpen,
    isSaving,
    note.share?.updated_at,
    note.share?.is_active,
    note.share?.is_password_protected,
    note.share?.custom_slug,
    note.share?.allowed_users,
  ]);

  // Check slug availability when slug changes
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
  const handleAddPlatformUser = (rawUsername?: string, fullName?: string) => {
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

    setAllowedUsers((prev) => [...prev, entry]);
    setUserSearchInput('');
  };

  const handleRemovePlatformUser = (username: string) => {
    setAllowedUsers((prev) => prev.filter((u) => u.username.toLowerCase() !== username.toLowerCase()));
  };

  const handleToggleUserRole = (username: string) => {
    setAllowedUsers((prev) =>
      prev.map((u) =>
        u.username.toLowerCase() === username.toLowerCase()
          ? { ...u, role: u.role === 'admin' ? 'viewer' : 'admin' }
          : u
      )
    );
  };

  // Filtered platform user suggestions
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
  const executeSave = async (forceActive = false, customAllowedUsers?: SharedUserAccess[]): Promise<{ success: boolean; error?: string; cloudSynced?: boolean }> => {
    const cleanSlug = slugify(slug);
    if (!cleanSlug || cleanSlug.length < 3) {
      return { success: false, error: 'O identificador precisa conter pelo menos 3 caracteres.' };
    }

    if (isSlugConflict) {
      return { success: false, error: 'Este link já está em uso por outra nota. Escolha outro.' };
    }

    if (isPasswordProtected && !note.share?.password_hash && !password.trim()) {
      return { success: false, error: 'Você ativou a proteção por senha, informe uma senha válida.' };
    }

    let salt = note.share?.password_salt;
    let hash = note.share?.password_hash;

    if (isPasswordProtected) {
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

    const activeState = forceActive ? true : isActive;
    const currentUser = AuthService.getCurrentUser();

    const shareData: NoteShare = {
      id: note.share?.id || crypto.randomUUID(),
      note_id: note.id,
      custom_slug: cleanSlug,
      is_password_protected: isPasswordProtected,
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
    };

    setIsActive(activeState);

    const result = await StorageService.saveShare(shareData);
    if (result.success) {
      onShareUpdated(shareData);
      return { success: true, cloudSynced: true };
    } else {
      // Still saved locally!
      onShareUpdated(shareData);
      return { success: true, cloudSynced: false, error: result.error };
    }
  };

  const handleCopyLink = async () => {
    setIsSaving(true);
    try {
      // 1. Automatically activate and save the share!
      await executeSave(true);

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
      await executeSave(true);
      window.open(`${getShareUrl()}?view=public`, '_blank', 'noopener,noreferrer');
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
        isActive ? 'Compartilhamento atualizado!' : 'Compartilhamento desativado',
        `Sincronizado em tempo real para /notpad/${cleanSlug}`
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
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-brand-500/10 text-brand-400">
            <Share2 className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-gray-900 dark:text-gray-100">Compartilhar Nota</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 font-normal">
              Gerencie o link único, usuários autorizados (@username) e senha
            </p>
          </div>
        </div>
      }
      maxWidth="lg"
    >
      <div className="space-y-5">
        {/* Active Toggle Switch */}
        <div className="flex items-center justify-between p-4 rounded-xl bg-gray-50 dark:bg-[#181b24] border border-gray-200 dark:border-[#232838]">
          <div>
            <div className="text-sm font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <span>Permitir acesso público por link</span>
              {isActive && (
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  Ativo
                </span>
              )}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              Sincroniza alterações automaticamente em todas as telas abertas
            </div>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-300 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-600"></div>
          </label>
        </div>

        {/* Custom Slug Config */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-2">
            ID Único do Bloco de Nota (/notpad/:id)
          </label>
          <div className="flex items-center gap-2">
            <div className="flex-1 flex items-center bg-gray-50 dark:bg-[#181b24] border border-gray-200 dark:border-[#232838] rounded-xl px-3 py-2.5 focus-within:ring-2 focus-within:ring-brand-500/50">
              <span className="text-xs text-gray-400 select-none pr-1 truncate max-w-[170px] sm:max-w-none font-mono">
                {window.location.host}{((import.meta as any).env?.BASE_URL || '/').replace(/\/+$/, '')}/notpad/
              </span>
              <input
                type="text"
                value={slug}
                onChange={handleSlugChange}
                placeholder={note.id}
                className="flex-1 bg-transparent text-sm text-gray-900 dark:text-gray-100 outline-none font-mono"
              />
            </div>
            <button
              type="button"
              onClick={handleUseNoteUniqueId}
              title="Restaurar ID único original da nota"
              className="p-2.5 rounded-xl border border-gray-200 dark:border-[#232838] bg-gray-50 dark:bg-[#181b24] hover:bg-gray-100 dark:hover:bg-[#202430] text-gray-600 dark:text-gray-300 transition-colors"
            >
              <Sparkles className="w-4 h-4 text-brand-400" />
            </button>
          </div>

          {isSlugConflict && (
            <div className="flex items-center gap-1.5 mt-2 text-xs text-rose-500">
              <AlertCircle className="w-3.5 h-3.5" />
              <span>Este identificador já está em uso. Por favor, escolha outro.</span>
            </div>
          )}
        </div>

        {/* Share with Platform Users (@malaca, etc.) */}
        <div className="p-4 rounded-xl bg-gray-50 dark:bg-[#181b24] border border-gray-200 dark:border-[#232838] space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-brand-400" />
              <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                Compartilhar com Usuários da Plataforma
              </span>
            </div>
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-brand-500/10 text-brand-400 border border-brand-500/20">
              Acesso sem senha
            </span>
          </div>

          <p className="text-xs text-gray-500 dark:text-gray-400">
            Selecione usuários cadastrados (como <strong className="text-brand-400">@malaca</strong>) para liberar acesso direto ao bloco de notas sem solicitar senha.
          </p>

          {/* Search / Add @username Input */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <AtSign className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={userSearchInput}
                onChange={(e) => setUserSearchInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddPlatformUser();
                  }
                }}
                placeholder="Buscar ou digitar usuario (ex: @malaca)..."
                className="w-full bg-white dark:bg-[#11131a] border border-gray-200 dark:border-[#232838] rounded-xl pl-8 pr-3 py-2 text-xs text-gray-900 dark:text-gray-100 outline-none focus:ring-2 focus:ring-brand-500/50"
              />
            </div>

            <select
              value={newUserRole}
              onChange={(e) => setNewUserRole(e.target.value as 'admin' | 'viewer')}
              className="bg-white dark:bg-[#11131a] border border-gray-200 dark:border-[#232838] rounded-xl px-2.5 py-2 text-xs text-gray-700 dark:text-gray-200 outline-none focus:ring-2 focus:ring-brand-500/50"
            >
              <option value="admin">Admin / Editor</option>
              <option value="viewer">Leitor Direto</option>
            </select>

            <button
              type="button"
              onClick={() => handleAddPlatformUser()}
              className="flex items-center gap-1 px-3 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold transition-colors shrink-0"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Adicionar</span>
            </button>
          </div>

          {/* Available Platform Users Quick-Select Pills */}
          {filteredSuggestions.length > 0 && (
            <div className="space-y-1.5 pt-1">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 block">
                Usuários disponíveis na plataforma (clique para selecionar):
              </span>
              <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                {filteredSuggestions.map((u) => (
                  <button
                    key={u.username}
                    type="button"
                    onClick={() => handleAddPlatformUser(u.username, u.full_name)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white dark:bg-[#11131a] hover:bg-brand-500/10 border border-gray-200 dark:border-[#232838] hover:border-brand-500/40 text-xs text-gray-700 dark:text-gray-200 transition-all group"
                  >
                    <span className="w-4 h-4 rounded-full bg-brand-500/20 text-brand-400 font-bold text-[10px] flex items-center justify-center uppercase">
                      {(u.full_name || u.username)[0]}
                    </span>
                    <span className="font-mono font-semibold text-brand-400">@{u.username}</span>
                    {u.full_name && u.full_name.toLowerCase() !== u.username.toLowerCase() && (
                      <span className="text-[11px] text-gray-400">({u.full_name})</span>
                    )}
                    <span className="text-[10px] text-emerald-400 font-bold ml-0.5">+</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Selected Allowed Users List */}
          {allowedUsers.length > 0 && (
            <div className="space-y-1.5 pt-2 border-t border-gray-200/70 dark:border-[#232838]">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400 flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5" />
                Usuários com acesso liberado ({allowedUsers.length}):
              </span>
              <div className="space-y-1.5 max-h-32 overflow-y-auto">
                {allowedUsers.map((u) => (
                  <div
                    key={u.username}
                    className="flex items-center justify-between px-3 py-1.5 rounded-xl bg-white dark:bg-[#11131a] border border-gray-200 dark:border-[#232838]"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-6 h-6 rounded-full bg-brand-500/20 text-brand-400 font-bold text-xs flex items-center justify-center uppercase shrink-0">
                        {(u.full_name || u.username)[0]}
                      </div>
                      <div className="truncate">
                        <span className="text-xs font-mono font-bold text-brand-400">
                          @{u.username}
                        </span>
                        {u.full_name && (
                          <span className="text-[11px] text-gray-500 dark:text-gray-400 ml-1.5">
                            {u.full_name}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleToggleUserRole(u.username)}
                        title="Clique para alternar permissão"
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded-md border transition-colors ${
                          u.role === 'admin'
                            ? 'bg-purple-500/10 text-purple-400 border-purple-500/30'
                            : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                        }`}
                      >
                        {u.role === 'admin' ? 'Admin / Sem Senha' : 'Leitor / Sem Senha'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemovePlatformUser(u.username)}
                        className="p-1 text-gray-400 hover:text-rose-500 rounded-lg transition-colors"
                        title="Remover usuário"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Password Protection */}
        <div className="p-4 rounded-xl bg-gray-50 dark:bg-[#181b24] border border-gray-200 dark:border-[#232838] space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4 text-brand-400" />
              <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                Proteger com Senha (para visitantes externos)
              </span>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={isPasswordProtected}
                onChange={(e) => setIsPasswordProtected(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-300 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-600"></div>
            </label>
          </div>

          {isPasswordProtected && (
            <div className="pt-2">
              <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                {note.share?.password_hash ? 'Nova senha (deixe vazio para manter a atual):' : 'Digite uma senha para leitura:'}
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Defina uma senha segura..."
                  className="w-full bg-white dark:bg-[#11131a] border border-gray-200 dark:border-[#232838] rounded-xl px-3 py-2 text-sm text-gray-900 dark:text-gray-100 outline-none focus:ring-2 focus:ring-brand-500/50 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-200"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-[11px] text-gray-500 mt-1.5">
                🔒 O criador/admin do bloco de nota e os usuários selecionados acima (ex: <strong>@malaca</strong>) entram diretamente sem precisar digitar esta senha.
              </p>
            </div>
          )}
        </div>

        {/* Copy Link Preview Section */}
        {isActive && (
          <div className="p-4 rounded-2xl bg-brand-500/5 border border-brand-500/25 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-gray-800 dark:text-gray-200 flex items-center gap-1.5">
                <LinkIcon className="w-4 h-4 text-brand-400" />
                URL Única do Bloco de Nota:
              </span>
              <span className="text-[11px] text-emerald-400 font-semibold flex items-center gap-1">
                <Cloud className="w-3.5 h-3.5" />
                Nuvem Ativa
              </span>
            </div>

            {/* URL Box */}
            <div className="flex items-center gap-2 pt-1">
              <input
                readOnly
                value={getShareUrl()}
                className="flex-1 bg-white dark:bg-[#11131a] border border-gray-200 dark:border-[#232838] rounded-xl px-3 py-2 text-xs text-gray-700 dark:text-gray-300 font-mono outline-none truncate"
              />
              <button
                type="button"
                onClick={handleCopyLink}
                disabled={isSaving}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded-xl text-xs font-semibold transition-colors shadow-sm shrink-0"
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Copiado!' : 'Copiar Link'}
              </button>
              <button
                type="button"
                onClick={handleOpenPublicView}
                disabled={isSaving}
                className="p-2 border border-gray-200 dark:border-[#232838] bg-white dark:bg-[#11131a] hover:bg-gray-100 dark:hover:bg-[#181b24] text-gray-600 dark:text-gray-300 rounded-xl transition-colors shrink-0"
                title="Abrir página pública"
              >
                <ExternalLink className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Actions Footer */}
        <div className="flex items-center justify-between pt-2 border-t border-gray-100 dark:border-[#232838]">
          {note.share ? (
            <button
              type="button"
              onClick={handleRevokeShare}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-rose-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-xl transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              Revogar link
            </button>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-gray-200 dark:border-[#232838] text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-[#181b24] transition-colors"
            >
              Fechar
            </button>
            <button
              type="button"
              onClick={handleSaveShare}
              disabled={isSaving || isSlugConflict}
              className="px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold shadow-md shadow-brand-600/20 transition-all flex items-center gap-2"
            >
              {isSaving ? 'Salvando...' : 'Salvar Alterações'}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
};

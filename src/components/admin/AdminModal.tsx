import React, { useState, useEffect, useMemo } from 'react';
import { 
  ShieldCheck, 
  Users, 
  FileText, 
  Share2, 
  Sliders, 
  Search, 
  Plus, 
  Trash2, 
  Edit3, 
  Key, 
  Lock, 
  Unlock, 
  Check, 
  Copy, 
  X, 
  CheckCircle2, 
  Pin, 
  BarChart3,
  Megaphone,
  ExternalLink,
  AlertTriangle,
  AlertOctagon,
  Eye,
  Radio,
  Globe,
  UserCheck
} from 'lucide-react';
import { Modal } from '../common/Modal';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { useToast } from '../common/Toast';
import { AdminService, type AdminStats } from '../../lib/adminService';
import { CloudShareService } from '../../lib/cloudShare';
import { PlatformSettingsService, type PlatformLimits, type AnnouncementType, type AnnouncementAudience } from '../../lib/platformSettings';
import type { UserProfile, UserRole } from '../../types/auth';
import type { Note, NoteShare } from '../../types/note';

interface AdminModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserProfile | null;
  onNotesChanged?: () => void;
  onSelectNote?: (noteId: string) => void;
}

type AdminTab = 'overview' | 'users' | 'notes' | 'shares' | 'broadcast' | 'limits';

export const AdminModal: React.FC<AdminModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onNotesChanged,
  onSelectNote,
}) => {
  const { success, error } = useToast();
  const [activeTab, setActiveTab] = useState<AdminTab>('overview');

  // Data states
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [shares, setShares] = useState<Array<NoteShare & { note_title?: string }>>([]);
  const [limits, setLimits] = useState<PlatformLimits>(() => PlatformSettingsService.getLimits());

  // Search & Filter states
  const [userSearch, setUserSearch] = useState('');
  const [userRoleFilter, setUserRoleFilter] = useState<'all' | 'admin' | 'user' | 'banned'>('all');
  const [noteSearch, setNoteSearch] = useState('');
  const [noteStatusFilter, setNoteStatusFilter] = useState<'all' | 'pinned' | 'shared' | 'protected'>('all');
  const [shareSearch, setShareSearch] = useState('');

  // Sub-modal states
  // 1. Create User
  const [isCreateUserOpen, setIsCreateUserOpen] = useState(false);
  const [newFullName, setNewFullName] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<UserRole>('user');
  const [isSubmittingUser, setIsSubmittingUser] = useState(false);

  // 2. Edit User
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [editFullName, setEditFullName] = useState('');
  const [editUsername, setEditUsername] = useState('');
  const [editRole, setEditRole] = useState<UserRole>('user');
  const [editIsBanned, setEditIsBanned] = useState(false);
  const [isSavingUserEdit, setIsSavingUserEdit] = useState(false);

  // 3. Reset User Password
  const [passwordResetUser, setPasswordResetUser] = useState<UserProfile | null>(null);
  const [adminNewPassword, setAdminNewPassword] = useState('');
  const [isResettingPassword, setIsResettingPassword] = useState(false);

  // 4. Delete Confirmation
  const [userToDelete, setUserToDelete] = useState<UserProfile | null>(null);
  const [noteToDelete, setNoteToDelete] = useState<Note | null>(null);
  const [shareToDelete, setShareToDelete] = useState<string | null>(null);

  // 5. Create Note
  const [isCreateNoteOpen, setIsCreateNoteOpen] = useState(false);
  const [newNoteTitle, setNewNoteTitle] = useState('');
  const [newNoteContent, setNewNoteContent] = useState('');
  const [newNoteOwner, setNewNoteOwner] = useState('');
  const [newNotePinned, setNewNotePinned] = useState(false);
  const [newNoteEnableShare, setNewNoteEnableShare] = useState(false);
  const [newNoteShareSlug, setNewNoteShareSlug] = useState('');
  const [newNoteSharePassword, setNewNoteSharePassword] = useState('');
  const [isSubmittingNote, setIsSubmittingNote] = useState(false);

  // 6. Edit Note
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [editNoteTitle, setEditNoteTitle] = useState('');
  const [editNoteContent, setEditNoteContent] = useState('');
  const [editNoteOwner, setEditNoteOwner] = useState('');
  const [editNotePinned, setEditNotePinned] = useState(false);
  const [editNoteEnableShare, setEditNoteEnableShare] = useState(false);
  const [editNoteShareSlug, setEditNoteShareSlug] = useState('');
  const [editNoteSharePassword, setEditNoteSharePassword] = useState('');
  const [editNoteRemovePassword, setEditNoteRemovePassword] = useState(false);
  const [isSavingNote, setIsSavingNote] = useState(false);

  // 7. Share password edit
  const [shareForPassword, setShareForPassword] = useState<string | null>(null);
  const [newSharePassword, setNewSharePassword] = useState('');
  const [isSettingSharePassword, setIsSettingSharePassword] = useState(false);

  // Copied link toast helper
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);

  // Fetch all admin data
  const loadAdminData = async (refreshLimits = false) => {
    try {
      const promises: [
        Promise<AdminStats>,
        Promise<UserProfile[]>,
        Promise<Note[]>,
        Promise<Array<NoteShare & { note_title?: string }>>,
        Promise<PlatformLimits | null>
      ] = [
        AdminService.getStats(),
        AdminService.getAllUsers(),
        AdminService.getAllNotes(),
        AdminService.getAllShares(),
        refreshLimits ? PlatformSettingsService.fetchLimits() : Promise.resolve(null),
      ];

      const [freshStats, freshUsers, freshNotes, freshShares, freshLimits] = await Promise.all(promises);
      setStats(freshStats);
      setUsers(freshUsers);
      setNotes(freshNotes);
      setShares(freshShares);
      if (freshLimits) {
        setLimits(freshLimits);
      }
    } catch (err: any) {
      if (refreshLimits) {
        error('Erro ao carregar dados', err?.message || 'Falha ao sincronizar painel.');
      }
    }
  };

  useEffect(() => {
    if (!isOpen) return;

    // Load initial data including platform limits
    loadAdminData(true);

    // Auto-sync in real time whenever any user creates/edits notes or accounts across the platform
    const unsub = CloudShareService.subscribeToGlobalRealtimeEvents((event) => {
      // If a settings update arrives from another admin, only update if not actively on broadcast/limits tab
      if (event?.type === 'settings_updated') {
        if (activeTab !== 'broadcast' && activeTab !== 'limits') {
          PlatformSettingsService.fetchLimits().then(fresh => {
            if (fresh) setLimits(fresh);
          });
        }
      } else {
        loadAdminData(false);
      }
    });

    // Auto-refresh stats, users, notes, shares in the background (NEVER overwrite limits or form fields!)
    const pollInterval = setInterval(() => {
      loadAdminData(false);
    }, 4000);

    return () => {
      unsub();
      clearInterval(pollInterval);
    };
  }, [isOpen, activeTab]);

  // Filtered Users
  const filteredUsers = useMemo(() => {
    const q = userSearch.toLowerCase().trim();
    return users.filter((u) => {
      const matchSearch =
        !q ||
        u.full_name.toLowerCase().includes(q) ||
        u.username.toLowerCase().includes(q);

      if (!matchSearch) return false;

      if (userRoleFilter === 'admin' && u.role !== 'admin' && u.username.toLowerCase() !== 'malaca') return false;
      if (userRoleFilter === 'user' && (u.role === 'admin' || u.username.toLowerCase() === 'malaca')) return false;
      if (userRoleFilter === 'banned' && !u.is_banned) return false;

      return true;
    });
  }, [users, userSearch, userRoleFilter]);

  // Filtered Notes
  const filteredNotes = useMemo(() => {
    const q = noteSearch.toLowerCase().trim();
    return notes.filter((n) => {
      const matchSearch =
        !q ||
        n.title.toLowerCase().includes(q) ||
        n.content.toLowerCase().includes(q) ||
        (n.owner_username || '').toLowerCase().includes(q) ||
        (n.share?.custom_slug || '').toLowerCase().includes(q);

      if (!matchSearch) return false;

      if (noteStatusFilter === 'pinned' && !n.is_pinned) return false;
      if (noteStatusFilter === 'shared' && (!n.share || !n.share.is_active)) return false;
      if (noteStatusFilter === 'protected' && (!n.share || !n.share.is_password_protected)) return false;

      return true;
    });
  }, [notes, noteSearch, noteStatusFilter]);

  // Filtered Shares
  const filteredShares = useMemo(() => {
    const q = shareSearch.toLowerCase().trim();
    if (!q) return shares;
    return shares.filter((s) => {
      const matchSlug = s.custom_slug.toLowerCase().includes(q);
      const matchTitle = (s.note_title || '').toLowerCase().includes(q);
      return matchSlug || matchTitle;
    });
  }, [shares, shareSearch]);

  // Handlers for User Management
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      error('Senha curta', 'A senha deve conter no mínimo 6 dígitos.');
      return;
    }
    setIsSubmittingUser(true);
    try {
      const cleanUsername = newUsername.trim().toLowerCase().replace(/^@+/, '');
      const res = await AdminService.createUser({
        full_name: newFullName.trim(),
        username: cleanUsername,
        password: newPassword,
        email: `${cleanUsername}@7notpad.local`,
        role: newRole,
      });
      if (res.success && res.user) {
        success('Usuário criado!', `@${res.user.username} foi cadastrado com sucesso.`);
        setIsCreateUserOpen(false);
        setNewFullName('');
        setNewUsername('');
        setNewPassword('');
        setNewRole('user');
        loadAdminData();
      } else {
        error('Falha ao criar usuário', res.error || 'Erro desconhecido.');
      }
    } finally {
      setIsSubmittingUser(false);
    }
  };

  const handleSaveUserEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    setIsSavingUserEdit(true);
    try {
      const res = await AdminService.updateUser(editingUser.id, {
        full_name: editFullName,
        username: editUsername,
        role: editRole,
        is_banned: editIsBanned,
      });
      if (res.success) {
        success('Usuário atualizado!', 'Alterações salvas com sucesso.');
        setEditingUser(null);
        loadAdminData();
      } else {
        error('Erro ao atualizar', res.error || 'Não foi possível salvar.');
      }
    } finally {
      setIsSavingUserEdit(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordResetUser) return;
    if (adminNewPassword.length < 6) {
      error('Senha curta', 'A nova senha deve ter no mínimo 6 dígitos.');
      return;
    }
    setIsResettingPassword(true);
    try {
      const res = await AdminService.resetUserPassword(passwordResetUser.id, adminNewPassword);
      if (res.success) {
        success('Senha redefinida!', `Nova senha salva para @${passwordResetUser.username}.`);
        setPasswordResetUser(null);
        setAdminNewPassword('');
      } else {
        error('Erro ao redefinir', res.error || 'Falha na gravação.');
      }
    } finally {
      setIsResettingPassword(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!userToDelete) return;
    try {
      const res = await AdminService.deleteUser(userToDelete.id);
      if (res.success) {
        success('Usuário excluído', `@${userToDelete.username} foi removido da plataforma.`);
        setUserToDelete(null);
        loadAdminData();
      } else {
        error('Erro ao excluir', res.error);
      }
    } catch {
      error('Erro ao excluir usuário');
    }
  };

  // Handlers for Notes Management
  const handleCreateNote = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmittingNote(true);
    try {
      const cleanOwner = newNoteOwner.trim().toLowerCase().replace(/^@+/, '') || currentUser?.username || 'malaca';
      const res = await AdminService.createNote({
        title: newNoteTitle.trim() || 'Novo Bloco de Nota',
        content: newNoteContent,
        owner_username: cleanOwner,
        is_pinned: newNotePinned,
        share_slug: newNoteEnableShare && newNoteShareSlug.trim() ? newNoteShareSlug.trim() : undefined,
        share_password: newNoteEnableShare && newNoteSharePassword.trim() ? newNoteSharePassword.trim() : undefined,
      });

      if (res.success && res.note) {
        success('Bloco de nota criado!', `A nota "${res.note.title}" foi criada com sucesso.`);
        setIsCreateNoteOpen(false);
        setNewNoteTitle('');
        setNewNoteContent('');
        setNewNoteOwner(currentUser?.username || 'malaca');
        setNewNotePinned(false);
        setNewNoteEnableShare(false);
        setNewNoteShareSlug('');
        setNewNoteSharePassword('');
        loadAdminData();
        if (onNotesChanged) onNotesChanged();
      } else {
        error('Falha ao criar nota', res.error || 'Erro desconhecido.');
      }
    } catch {
      error('Erro ao criar bloco de nota');
    } finally {
      setIsSubmittingNote(false);
    }
  };

  const handleSaveNoteEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingNote) return;
    setIsSavingNote(true);
    try {
      const cleanOwner = editNoteOwner.trim().toLowerCase().replace(/^@+/, '') || editingNote.owner_username || 'malaca';
      const res = await AdminService.updateNote(editingNote.id, {
        title: editNoteTitle.trim() || 'Sem título',
        content: editNoteContent,
        owner_username: cleanOwner,
        is_pinned: editNotePinned,
        remove_share: !editNoteEnableShare && Boolean(editingNote.share),
        share_slug: editNoteEnableShare && editNoteShareSlug.trim() ? editNoteShareSlug.trim() : undefined,
        share_active: editNoteEnableShare,
        share_password: editNoteEnableShare && editNoteSharePassword.trim() ? editNoteSharePassword.trim() : undefined,
        remove_share_password: editNoteRemovePassword,
      });

      if (res.success) {
        success('Nota atualizada!', 'Alterações salvas e sincronizadas em toda a plataforma.');
        setEditingNote(null);
        loadAdminData();
        if (onNotesChanged) onNotesChanged();
      } else {
        error('Erro ao atualizar nota', res.error);
      }
    } catch {
      error('Erro ao salvar alterações da nota');
    } finally {
      setIsSavingNote(false);
    }
  };

  const handleTogglePinNote = async (note: Note) => {
    try {
      const res = await AdminService.updateNote(note.id, { is_pinned: !note.is_pinned });
      if (res.success) {
        success(note.is_pinned ? 'Nota desafixada' : 'Nota fixada no topo!');
        loadAdminData();
        if (onNotesChanged) onNotesChanged();
      }
    } catch {
      error('Erro ao alterar fixação');
    }
  };

  const handleOpenNoteInEditor = (noteId: string) => {
    if (onSelectNote) {
      onSelectNote(noteId);
      onClose();
    } else {
      const baseUrl = (import.meta as any).env?.BASE_URL || '/';
      const cleanBase = baseUrl === '/' ? '' : baseUrl.replace(/\/+$/, '');
      window.location.href = `${window.location.origin}${cleanBase}/notpad/${noteId}`;
    }
  };

  const handleDeleteNote = async () => {
    if (!noteToDelete) return;
    try {
      const res = await AdminService.deleteNote(noteToDelete.id);
      if (res.success) {
        success('Nota excluída!', 'O bloco de notas foi removido da plataforma.');
        setNoteToDelete(null);
        loadAdminData();
        if (onNotesChanged) onNotesChanged();
      } else {
        error('Erro ao excluir nota');
      }
    } catch {
      error('Erro ao excluir');
    }
  };

  // Handlers for Shares Management
  const handleToggleShare = async (slug: string, currentActive: boolean) => {
    try {
      const res = await AdminService.updateShare(slug, { is_active: !currentActive });
      if (res.success) {
        success('Compartilhamento atualizado!', !currentActive ? 'Link ativado.' : 'Link desativado.');
        loadAdminData();
      } else {
        error('Erro ao alterar status');
      }
    } catch {
      error('Falha na operação');
    }
  };

  const handleRemoveSharePassword = async (slug: string) => {
    try {
      const res = await AdminService.updateShare(slug, { remove_password: true });
      if (res.success) {
        success('Senha removida!', 'O link agora é público sem senha.');
        loadAdminData();
      } else {
        error('Erro ao remover senha');
      }
    } catch {
      error('Falha na operação');
    }
  };

  const handleSaveSharePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shareForPassword) return;
    if (newSharePassword.length < 3) {
      error('Senha curta', 'A senha do bloco deve ter no mínimo 3 dígitos.');
      return;
    }
    setIsSettingSharePassword(true);
    try {
      const res = await AdminService.updateShare(shareForPassword, { new_password: newSharePassword });
      if (res.success) {
        success('Senha gravada!', 'Nova senha definida para este link.');
        setShareForPassword(null);
        setNewSharePassword('');
        loadAdminData();
      } else {
        error('Erro ao definir senha', res.error);
      }
    } finally {
      setIsSettingSharePassword(false);
    }
  };

  const handleDeleteShare = async () => {
    if (!shareToDelete) return;
    try {
      const res = await AdminService.deleteShare(shareToDelete);
      if (res.success) {
        success('Link revogado!', 'O link compartilhado foi excluído.');
        setShareToDelete(null);
        loadAdminData();
      } else {
        error('Erro ao revogar link');
      }
    } catch {
      error('Falha na exclusão');
    }
  };

  // Copy share URL
  const handleCopyLink = async (slug: string) => {
    try {
      const baseUrl = (import.meta as any).env?.BASE_URL || '/';
      const cleanBase = baseUrl === '/' ? '' : baseUrl.replace(/\/+$/, '');
      const url = `${window.location.origin}${cleanBase}/notpad/${slug}`;
      await navigator.clipboard.writeText(url);
      setCopiedSlug(slug);
      setTimeout(() => setCopiedSlug(null), 2000);
    } catch {}
  };

  // Handlers for Platform Limits & Broadcast
  const handleSaveLimits = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await AdminService.updatePlatformLimits(limits);
      success('Regras e Limites Atualizados!', 'As novas configurações já estão valendo na plataforma.');
    } catch {
      error('Erro ao salvar regras');
    }
  };

  const handleSaveBroadcast = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    try {
      await AdminService.updatePlatformLimits(limits);
      success('Aviso Global Salvo!', 'As alterações do banner foram salvas e transmitidas na plataforma.');
    } catch {
      error('Erro ao salvar aviso global');
    }
  };

  const handleToggleBroadcast = async (newActiveState: boolean) => {
    if (newActiveState && !limits.announcementBanner?.trim()) {
      error('Mensagem vazia', 'Escreva uma mensagem antes de ativar a transmissão no ar.');
      return;
    }
    const updated = { ...limits, announcementActive: newActiveState };
    setLimits(updated);
    try {
      await AdminService.updatePlatformLimits(updated);
      if (newActiveState) {
        success('Transmissão Ativada no Topo!', 'O banner já está sendo exibido em tempo real no site.');
      } else {
        success('Transmissão Desativada!', 'O banner foi removido do topo do site.');
      }
    } catch {
      error('Erro ao atualizar transmissão.');
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="5xl"
      title={
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-gray-100">Painel de Administração</h2>
                <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30">
                  Acesso Restrito
                </span>
              </div>
              <p className="text-xs text-gray-400 font-normal">
                Gestão central de usuários, blocos de notas, links e regras da plataforma
              </p>
            </div>
          </div>
        </div>
      }
    >
      <div className="space-y-5 max-h-[78vh] overflow-y-auto pr-1">
        {/* Navigation Tabs */}
        <div className="flex border-b border-[#1c1c1c] gap-1 overflow-x-auto pb-1 select-none">
          <button
            type="button"
            onClick={() => setActiveTab('overview')}
            className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'overview'
                ? 'border-brand-500 text-brand-400 bg-brand-500/5 rounded-t-xl'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            <span>Visão Geral</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('users')}
            className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'users'
                ? 'border-brand-500 text-brand-400 bg-brand-500/5 rounded-t-xl'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Usuários ({users.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('notes')}
            className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'notes'
                ? 'border-brand-500 text-brand-400 bg-brand-500/5 rounded-t-xl'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Blocos de Notas ({notes.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('shares')}
            className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'shares'
                ? 'border-brand-500 text-brand-400 bg-brand-500/5 rounded-t-xl'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            <Share2 className="w-3.5 h-3.5" />
            <span>Links de Acesso ({shares.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('broadcast')}
            className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'broadcast'
                ? 'border-cyan-500 text-cyan-400 bg-cyan-500/5 rounded-t-xl'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            <Megaphone className="w-3.5 h-3.5" />
            <span>Aviso Global (Banner)</span>
            {limits.announcementActive && limits.announcementBanner && (
              <span className="relative flex h-2 w-2 ml-0.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500" />
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('limits')}
            className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'limits'
                ? 'border-brand-500 text-brand-400 bg-brand-500/5 rounded-t-xl'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Limites &amp; Regras</span>
          </button>
        </div>

        {/* ==================================================== */}
        {/* TAB 1: VISÃO GERAL */}
        {/* ==================================================== */}
        {activeTab === 'overview' && (
          <div className="space-y-5">
            {/* Metric Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-4 rounded-2xl bg-[#080808] border border-[#1c1c1c] space-y-1">
                <div className="flex items-center justify-between text-gray-400 text-xs">
                  <span>Total Usuários</span>
                  <Users className="w-4 h-4 text-brand-400" />
                </div>
                <div className="text-2xl font-bold text-gray-100">{stats?.totalUsers ?? '...'}</div>
                <div className="text-[11px] text-amber-400 font-medium">
                  {stats?.adminUsers ?? 0} Administrador(es)
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-[#080808] border border-[#1c1c1c] space-y-1">
                <div className="flex items-center justify-between text-gray-400 text-xs">
                  <span>Blocos de Notas</span>
                  <FileText className="w-4 h-4 text-cyan-400" />
                </div>
                <div className="text-2xl font-bold text-gray-100">{stats?.totalNotes ?? '...'}</div>
                <div className="text-[11px] text-gray-400">
                  {stats?.pinnedNotes ?? 0} fixadas no topo
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-[#080808] border border-[#1c1c1c] space-y-1">
                <div className="flex items-center justify-between text-gray-400 text-xs">
                  <span>Links Gerados</span>
                  <Share2 className="w-4 h-4 text-emerald-400" />
                </div>
                <div className="text-2xl font-bold text-gray-100">{stats?.totalShares ?? '...'}</div>
                <div className="text-[11px] text-emerald-400 font-medium">
                  {stats?.activeShares ?? 0} ativos agora
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-[#080808] border border-[#1c1c1c] space-y-1">
                <div className="flex items-center justify-between text-gray-400 text-xs">
                  <span>Com Senha</span>
                  <Lock className="w-4 h-4 text-purple-400" />
                </div>
                <div className="text-2xl font-bold text-gray-100">
                  {stats?.passwordProtectedShares ?? '...'}
                </div>
                <div className="text-[11px] text-gray-400">Proteção criptografada</div>
              </div>
            </div>

            {/* Quick Status & Shortcuts */}
            <div className="p-5 rounded-2xl bg-gradient-to-br from-[#0c0d14] via-[#070707] to-black border border-[#1c1c1c] space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-xs font-bold text-gray-200">Plataforma Operacional</span>
                </div>
                <span className="text-xs font-mono text-gray-400">
                  Admin Logado: <strong className="text-amber-400">@{currentUser?.username || 'malaca'}</strong>
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('users');
                    setIsCreateUserOpen(true);
                  }}
                  className="p-3 rounded-xl bg-[#0f0f0f] hover:bg-[#161616] border border-[#1c1c1c] text-left transition-colors flex items-center gap-3 group"
                >
                  <div className="w-8 h-8 rounded-lg bg-brand-500/10 text-brand-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Plus className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-gray-100">Novo Usuário</div>
                    <div className="text-[10px] text-gray-400">Cadastrar admin ou membro</div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('shares')}
                  className="p-3 rounded-xl bg-[#0f0f0f] hover:bg-[#161616] border border-[#1c1c1c] text-left transition-colors flex items-center gap-3 group"
                >
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Share2 className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-gray-100">Auditar Links</div>
                    <div className="text-[10px] text-gray-400">Gerenciar acessos e senhas</div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('limits')}
                  className="p-3 rounded-xl bg-[#0f0f0f] hover:bg-[#161616] border border-[#1c1c1c] text-left transition-colors flex items-center gap-3 group"
                >
                  <div className="w-8 h-8 rounded-lg bg-purple-500/10 text-purple-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Sliders className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-gray-100">Ajustar Limites</div>
                    <div className="text-[10px] text-gray-400">Capacidade e regras globais</div>
                  </div>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ==================================================== */}
        {/* TAB 2: GESTÃO DE USUÁRIOS */}
        {/* ==================================================== */}
        {activeTab === 'users' && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              {/* Search Bar */}
              <div className="flex-1 flex items-center px-3 py-2 rounded-xl bg-[#0a0a0a] border border-[#1c1c1c] focus-within:ring-2 focus-within:ring-brand-500/40">
                <Search className="w-4 h-4 text-gray-400 mr-2 shrink-0" />
                <input
                  type="text"
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  placeholder="Pesquisar por nome ou @username..."
                  className="w-full bg-transparent text-xs text-gray-100 placeholder:text-gray-500 outline-none"
                />
              </div>

              {/* Action: New User */}
              <button
                type="button"
                onClick={() => setIsCreateUserOpen(true)}
                className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-xs font-bold transition-all shadow-md shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Novo Usuário</span>
              </button>
            </div>

            {/* Filter Pills */}
            <div className="flex items-center gap-1.5 text-xs overflow-x-auto pb-1">
              {(['all', 'admin', 'user', 'banned'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setUserRoleFilter(mode)}
                  className={`px-3 py-1 rounded-xl font-medium transition-colors ${
                    userRoleFilter === mode
                      ? 'bg-brand-500/20 text-brand-300 border border-brand-500/40'
                      : 'bg-[#0a0a0a] border border-[#1c1c1c] text-gray-400 hover:text-white'
                  }`}
                >
                  {mode === 'all' && `Todos (${users.length})`}
                  {mode === 'admin' && 'Administradores'}
                  {mode === 'user' && 'Usuários Padrão'}
                  {mode === 'banned' && 'Suspensos'}
                </button>
              ))}
            </div>

            {/* User List Table */}
            <div className="rounded-2xl border border-[#1c1c1c] bg-[#050505] overflow-hidden">
              <div className="divide-y divide-[#141414]">
                {filteredUsers.length === 0 ? (
                  <div className="p-8 text-center text-xs text-gray-500">
                    Nenhum usuário localizado.
                  </div>
                ) : (
                  filteredUsers.map((u) => {
                    const isMalaca = u.username.toLowerCase() === 'malaca';
                    const isAdmin = u.role === 'admin' || isMalaca;

                    return (
                      <div
                        key={u.id}
                        className="p-3.5 sm:p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 hover:bg-[#080808] transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          {u.avatar_url ? (
                            <img
                              src={u.avatar_url}
                              alt={u.full_name}
                              className="w-9 h-9 rounded-xl object-cover border border-[#1c1c1c] shrink-0"
                            />
                          ) : (
                            <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 ${
                              isAdmin 
                                ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30' 
                                : 'bg-brand-500/10 text-brand-400 border border-brand-500/20'
                            }`}>
                              {u.full_name ? u.full_name[0].toUpperCase() : 'U'}
                            </div>
                          )}

                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-bold text-gray-100">
                                {u.full_name}
                              </span>
                              <span className="text-xs font-mono text-gray-400">
                                @{u.username}
                              </span>
                              {isAdmin && (
                                <span className="text-[10px] uppercase font-bold font-mono px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-300 border border-amber-500/30">
                                  Admin
                                </span>
                              )}
                              {u.is_banned && (
                                <span className="text-[10px] uppercase font-bold font-mono px-2 py-0.5 rounded-md bg-rose-500/15 text-rose-300 border border-rose-500/30">
                                  Suspenso
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-gray-500 mt-0.5">
                              ID: {u.id} • Cadastro em {new Date(u.created_at).toLocaleDateString('pt-BR')}
                            </div>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1.5 self-end sm:self-center">
                          <button
                            type="button"
                            onClick={() => {
                              setPasswordResetUser(u);
                              setAdminNewPassword('');
                            }}
                            className="p-2 rounded-xl text-gray-400 hover:text-amber-400 hover:bg-[#141414] border border-[#1c1c1c] transition-colors"
                            title="Redefinir senha"
                          >
                            <Key className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setEditingUser(u);
                              setEditFullName(u.full_name);
                              setEditUsername(u.username);
                              setEditRole(u.role || 'user');
                              setEditIsBanned(Boolean(u.is_banned));
                            }}
                            className="p-2 rounded-xl text-gray-400 hover:text-brand-400 hover:bg-[#141414] border border-[#1c1c1c] transition-colors"
                            title="Editar usuário"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>

                          {!isMalaca && (
                            <button
                              type="button"
                              onClick={() => setUserToDelete(u)}
                              className="p-2 rounded-xl text-gray-400 hover:text-rose-500 hover:bg-rose-500/10 border border-[#1c1c1c] transition-colors"
                              title="Excluir usuário"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        )}

        {/* ==================================================== */}
        {/* TAB 3: GESTÃO DE BLOCOS DE NOTAS */}
        {/* ==================================================== */}
        {activeTab === 'notes' && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
              <div className="flex-1 flex items-center px-3 py-2 rounded-xl bg-[#0a0a0a] border border-[#1c1c1c] focus-within:ring-2 focus-within:ring-brand-500/40">
                <Search className="w-4 h-4 text-gray-400 mr-2 shrink-0" />
                <input
                  type="text"
                  value={noteSearch}
                  onChange={(e) => setNoteSearch(e.target.value)}
                  placeholder="Pesquisar por título, texto, autor ou link /slug..."
                  className="w-full bg-transparent text-xs text-gray-100 placeholder:text-gray-500 outline-none"
                />
              </div>

              <button
                type="button"
                onClick={() => {
                  setNewNoteTitle('');
                  setNewNoteContent('');
                  setNewNoteOwner(currentUser?.username || 'malaca');
                  setNewNotePinned(false);
                  setNewNoteEnableShare(false);
                  setNewNoteShareSlug('');
                  setNewNoteSharePassword('');
                  setIsCreateNoteOpen(true);
                }}
                className="px-3.5 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-colors shadow-lg shadow-brand-500/20 shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Novo Bloco de Nota</span>
              </button>
            </div>

            {/* Filter Pills */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={() => setNoteStatusFilter('all')}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                  noteStatusFilter === 'all'
                    ? 'bg-brand-500/20 text-brand-300 border border-brand-500/30'
                    : 'bg-[#0a0a0a] text-gray-400 border border-[#1c1c1c] hover:text-white'
                }`}
              >
                Todas ({notes.length})
              </button>
              <button
                type="button"
                onClick={() => setNoteStatusFilter('pinned')}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors flex items-center gap-1 ${
                  noteStatusFilter === 'pinned'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    : 'bg-[#0a0a0a] text-gray-400 border border-[#1c1c1c] hover:text-white'
                }`}
              >
                <Pin className="w-3 h-3" /> Fixadas ({notes.filter((n) => n.is_pinned).length})
              </button>
              <button
                type="button"
                onClick={() => setNoteStatusFilter('shared')}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors flex items-center gap-1 ${
                  noteStatusFilter === 'shared'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                    : 'bg-[#0a0a0a] text-gray-400 border border-[#1c1c1c] hover:text-white'
                }`}
              >
                <Share2 className="w-3 h-3" /> Compartilhadas ({notes.filter((n) => n.share && n.share.is_active).length})
              </button>
              <button
                type="button"
                onClick={() => setNoteStatusFilter('protected')}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors flex items-center gap-1 ${
                  noteStatusFilter === 'protected'
                    ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                    : 'bg-[#0a0a0a] text-gray-400 border border-[#1c1c1c] hover:text-white'
                }`}
              >
                <Lock className="w-3 h-3" /> Com Senha ({notes.filter((n) => n.share && n.share.is_password_protected).length})
              </button>
            </div>

            <div className="rounded-2xl border border-[#1c1c1c] bg-[#050505] overflow-hidden divide-y divide-[#141414]">
              {filteredNotes.length === 0 ? (
                <div className="p-8 text-center text-xs text-gray-500">
                  Nenhum bloco de notas localizado.
                </div>
              ) : (
                filteredNotes.map((note) => {
                  const isShared = Boolean(note.share && note.share.is_active);
                  const isProtected = Boolean(note.share && note.share.is_password_protected);
                  const author = note.owner_username 
                    ? `@${note.owner_username}`
                    : (note.user_id ? `@${users.find(u => u.id === note.user_id)?.username || 'usuario'}` : '@malaca');

                  return (
                    <div
                      key={note.id}
                      className="p-3.5 sm:p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 hover:bg-[#080808] transition-colors"
                    >
                      <div className="space-y-1.5 max-w-xl">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="text-xs font-bold text-gray-100">
                            {note.title || 'Sem título'}
                          </h4>

                          <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-[#121212] text-gray-300 border border-[#222]">
                            {author}
                          </span>

                          {note.is_pinned && (
                            <span className="text-[10px] text-amber-400 flex items-center gap-1 font-mono">
                              <Pin className="w-3 h-3 fill-amber-400" /> Fixada
                            </span>
                          )}
                          {isShared && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-mono">
                              /notpad/{note.share?.custom_slug}
                            </span>
                          )}
                          {isProtected && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20 font-mono flex items-center gap-1">
                              <Lock className="w-2.5 h-2.5" /> Senha
                            </span>
                          )}
                        </div>

                        <p className="text-[11px] text-gray-400 line-clamp-1">
                          {note.content.replace(/<[^>]*>/g, '').trim() || 'Nota vazia'}
                        </p>

                        <div className="text-[10px] text-gray-500 flex items-center gap-2 flex-wrap">
                          <span>ID: <span className="font-mono">{note.id.slice(0, 10)}...</span></span>
                          <span>•</span>
                          <span>Atualizado em {new Date(note.updated_at).toLocaleString('pt-BR')}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 self-end sm:self-center">
                        <button
                          type="button"
                          onClick={() => handleTogglePinNote(note)}
                          className={`p-2 rounded-xl border border-[#1c1c1c] transition-colors ${
                            note.is_pinned
                              ? 'text-amber-400 bg-amber-500/10 hover:bg-amber-500/20'
                              : 'text-gray-400 hover:text-amber-400 hover:bg-[#141414]'
                          }`}
                          title={note.is_pinned ? 'Desafixar nota' : 'Fixar nota no topo'}
                        >
                          <Pin className={`w-3.5 h-3.5 ${note.is_pinned ? 'fill-amber-400' : ''}`} />
                        </button>

                        <button
                          type="button"
                          onClick={() => handleOpenNoteInEditor(note.id)}
                          className="p-2 rounded-xl text-gray-400 hover:text-cyan-400 hover:bg-[#141414] border border-[#1c1c1c] transition-colors"
                          title="Abrir no Editor 7NotPad"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </button>

                        {isShared && (
                          <button
                            type="button"
                            onClick={() => handleCopyLink(note.share!.custom_slug)}
                            className="p-2 rounded-xl text-gray-400 hover:text-brand-400 hover:bg-[#141414] border border-[#1c1c1c] transition-colors"
                            title="Copiar link compartilhado"
                          >
                            {copiedSlug === note.share!.custom_slug ? (
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => {
                            setEditingNote(note);
                            setEditNoteTitle(note.title);
                            setEditNoteContent(note.content);
                            setEditNoteOwner(
                              note.owner_username ||
                              (note.user_id ? users.find((u) => u.id === note.user_id)?.username || '' : 'malaca')
                            );
                            setEditNotePinned(Boolean(note.is_pinned));
                            setEditNoteEnableShare(Boolean(note.share && note.share.is_active));
                            setEditNoteShareSlug(note.share?.custom_slug || '');
                            setEditNoteSharePassword('');
                            setEditNoteRemovePassword(false);
                          }}
                          className="p-2 rounded-xl text-gray-400 hover:text-brand-400 hover:bg-[#141414] border border-[#1c1c1c] transition-colors"
                          title="Visualizar e Editar configurações da nota"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>

                        <button
                          type="button"
                          onClick={() => setNoteToDelete(note)}
                          className="p-2 rounded-xl text-gray-400 hover:text-rose-500 hover:bg-rose-500/10 border border-[#1c1c1c] transition-colors"
                          title="Excluir nota"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* ==================================================== */}
        {/* TAB 4: GESTÃO DE LINKS DE COMPARTILHAMENTO */}
        {/* ==================================================== */}
        {activeTab === 'shares' && (
          <div className="space-y-4">
            <div className="flex items-center px-3 py-2 rounded-xl bg-[#0a0a0a] border border-[#1c1c1c] focus-within:ring-2 focus-within:ring-brand-500/40">
              <Search className="w-4 h-4 text-gray-400 mr-2 shrink-0" />
              <input
                type="text"
                value={shareSearch}
                onChange={(e) => setShareSearch(e.target.value)}
                placeholder="Pesquisar por link /slug ou título da nota..."
                className="w-full bg-transparent text-xs text-gray-100 placeholder:text-gray-500 outline-none"
              />
            </div>

            <div className="rounded-2xl border border-[#1c1c1c] bg-[#050505] overflow-hidden divide-y divide-[#141414]">
              {filteredShares.length === 0 ? (
                <div className="p-8 text-center text-xs text-gray-500">
                  Nenhum link de compartilhamento registrado.
                </div>
              ) : (
                filteredShares.map((s) => (
                  <div
                    key={s.custom_slug}
                    className="p-3.5 sm:p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 hover:bg-[#080808] transition-colors"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold font-mono text-cyan-400">
                          /notpad/{s.custom_slug}
                        </span>

                        <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${
                          s.is_active 
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                            : 'bg-gray-500/10 text-gray-400 border border-gray-500/20'
                        }`}>
                          {s.is_active ? 'Ativo' : 'Desativado'}
                        </span>

                        {s.is_password_protected ? (
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20 flex items-center gap-1">
                            <Lock className="w-2.5 h-2.5" /> Com Senha
                          </span>
                        ) : (
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-gray-500/10 text-gray-400 border border-gray-500/20">
                            Público
                          </span>
                        )}
                      </div>

                      <div className="text-xs text-gray-300 font-medium">
                        Nota: {s.note_title || 'Sem título'}
                      </div>

                      <div className="text-[10px] text-gray-500">
                        {s.view_count || 0} visualizações • Criado em {new Date(s.created_at).toLocaleDateString('pt-BR')}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1.5 self-end sm:self-center">
                      <button
                        type="button"
                        onClick={() => handleCopyLink(s.custom_slug)}
                        className="p-2 rounded-xl text-gray-400 hover:text-brand-400 hover:bg-[#141414] border border-[#1c1c1c] transition-colors"
                        title="Copiar link"
                      >
                        {copiedSlug === s.custom_slug ? (
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleToggleShare(s.custom_slug, s.is_active)}
                        className={`p-2 rounded-xl border border-[#1c1c1c] transition-colors ${
                          s.is_active 
                            ? 'text-emerald-400 hover:bg-emerald-500/10' 
                            : 'text-gray-400 hover:text-white hover:bg-[#141414]'
                        }`}
                        title={s.is_active ? 'Desativar link' : 'Ativar link'}
                      >
                        {s.is_active ? <CheckCircle2 className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
                      </button>

                      {s.is_password_protected ? (
                        <button
                          type="button"
                          onClick={() => handleRemoveSharePassword(s.custom_slug)}
                          className="p-2 rounded-xl text-purple-400 hover:text-purple-300 hover:bg-purple-500/10 border border-[#1c1c1c] transition-colors"
                          title="Remover proteção por senha"
                        >
                          <Unlock className="w-3.5 h-3.5" />
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setShareForPassword(s.custom_slug);
                            setNewSharePassword('');
                          }}
                          className="p-2 rounded-xl text-gray-400 hover:text-purple-400 hover:bg-[#141414] border border-[#1c1c1c] transition-colors"
                          title="Definir senha de acesso"
                        >
                          <Lock className="w-3.5 h-3.5" />
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => setShareToDelete(s.custom_slug)}
                        className="p-2 rounded-xl text-gray-400 hover:text-rose-500 hover:bg-rose-500/10 border border-[#1c1c1c] transition-colors"
                        title="Excluir link permanentemente"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* ==================================================== */}
        {/* TAB 5: LIMITES E REGRAS DA PLATAFORMA */}
        {/* ==================================================== */}
        {activeTab === 'limits' && (
          <form onSubmit={handleSaveLimits} className="space-y-4">
            <div className="p-4 rounded-2xl bg-[#080808] border border-[#1c1c1c] space-y-4">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gray-200">
                <Sliders className="w-4 h-4 text-brand-400" />
                Limites Globais de Armazenamento
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-gray-300">
                    Limite Máximo de Notas por Usuário
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={limits.maxNotesPerUser}
                    onChange={(e) => setLimits(prev => ({ ...prev, maxNotesPerUser: parseInt(e.target.value) || 0 }))}
                    className="w-full px-3 py-2 rounded-xl bg-[#0d0d0d] border border-[#1c1c1c] text-xs text-gray-100 outline-none focus:border-brand-500"
                  />
                  <p className="text-[10px] text-gray-500">Defina 0 para ilimitado.</p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-gray-300">
                    Tamanho Máximo por Anexo (MB)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={limits.maxAttachmentSizeMB}
                    onChange={(e) => setLimits(prev => ({ ...prev, maxAttachmentSizeMB: parseInt(e.target.value) || 25 }))}
                    className="w-full px-3 py-2 rounded-xl bg-[#0d0d0d] border border-[#1c1c1c] text-xs text-gray-100 outline-none focus:border-brand-500"
                  />
                  <p className="text-[10px] text-gray-500">Padrão da plataforma: 25 MB.</p>
                </div>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-[#080808] border border-[#1c1c1c] space-y-3.5">
              <div className="text-xs font-bold uppercase tracking-wider text-gray-200">
                Políticas de Acesso &amp; Recursos
              </div>

              <label className="flex items-center justify-between p-3 rounded-xl bg-[#0d0d0d] border border-[#1c1c1c] cursor-pointer hover:bg-[#121212] transition-colors">
                <div>
                  <div className="text-xs font-semibold text-gray-200">Permitir Links Compartilhados Públicos</div>
                  <div className="text-[11px] text-gray-500">Habilita ou bloqueia a criação de links /notpad/:slug</div>
                </div>
                <input
                  type="checkbox"
                  checked={limits.allowPublicSharing}
                  onChange={(e) => setLimits(prev => ({ ...prev, allowPublicSharing: e.target.checked }))}
                  className="w-4 h-4 rounded text-brand-600 focus:ring-0 bg-transparent"
                />
              </label>

              <label className="flex items-center justify-between p-3 rounded-xl bg-[#0d0d0d] border border-[#1c1c1c] cursor-pointer hover:bg-[#121212] transition-colors">
                <div>
                  <div className="text-xs font-semibold text-gray-200">Permitir Novos Cadastros de Usuários</div>
                  <div className="text-[11px] text-gray-500">Se desativado, apenas administradores podem criar contas</div>
                </div>
                <input
                  type="checkbox"
                  checked={limits.allowUserRegistration}
                  onChange={(e) => setLimits(prev => ({ ...prev, allowUserRegistration: e.target.checked }))}
                  className="w-4 h-4 rounded text-brand-600 focus:ring-0 bg-transparent"
                />
              </label>

              <label className="flex items-center justify-between p-3 rounded-xl bg-[#0d0d0d] border border-[#1c1c1c] cursor-pointer hover:bg-[#121212] transition-colors">
                <div>
                  <div className="text-xs font-semibold text-gray-200">Permitir Criação Anônima de Notas</div>
                  <div className="text-[11px] text-gray-500">Visitantes sem login podem criar rascunhos locais</div>
                </div>
                <input
                  type="checkbox"
                  checked={limits.allowAnonymousNotes}
                  onChange={(e) => setLimits(prev => ({ ...prev, allowAnonymousNotes: e.target.checked }))}
                  className="w-4 h-4 rounded text-brand-600 focus:ring-0 bg-transparent"
                />
              </label>

              <label className="flex items-center justify-between p-3 rounded-xl bg-rose-500/5 border border-rose-500/20 cursor-pointer hover:bg-rose-500/10 transition-colors">
                <div>
                  <div className="text-xs font-semibold text-rose-300">Modo de Manutenção</div>
                  <div className="text-[11px] text-rose-400/80">Bloqueia acesso para visitantes e usuários comuns (somente Admins têm acesso)</div>
                </div>
                <input
                  type="checkbox"
                  checked={limits.maintenanceMode}
                  onChange={(e) => setLimits(prev => ({ ...prev, maintenanceMode: e.target.checked }))}
                  className="w-4 h-4 rounded text-rose-600 focus:ring-0 bg-transparent"
                />
              </label>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                className="px-6 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-xs font-bold shadow-lg shadow-brand-600/30 transition-all"
              >
                Salvar Regras da Plataforma
              </button>
            </div>
          </form>
        )}



        {/* ==================================================== */}
        {/* TAB 5: TRANSMISSÃO DE AVISO GLOBAL (BANNER) */}
        {/* ==================================================== */}
        {activeTab === 'broadcast' && (
          <form onSubmit={handleSaveBroadcast} className="space-y-4">
            {/* Broadcast Banner Control Center */}
            <div className="p-5 rounded-2xl bg-[#080808] border border-[#1c1c1c] space-y-4">
              {/* Header with Switch */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#1c1c1c]">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                      <Megaphone className="w-4 h-4" />
                    </div>
                    <span className="text-sm font-bold text-gray-100">Transmissão de Aviso Global (Banner)</span>
                    {limits.announcementActive ? (
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
                        </span>
                        NO AR
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-800 text-gray-400 border border-gray-700">
                        DESLIGADO
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400">
                    Transmita avisos e comunicados em tempo real no topo do site para todos os visitantes e usuários conectados.
                  </p>
                </div>

                {/* Instant On/Off Button */}
                <button
                  type="button"
                  onClick={() => handleToggleBroadcast(!limits.announcementActive)}
                  className={`inline-flex items-center justify-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                    limits.announcementActive
                      ? 'bg-rose-500/15 border-rose-500/30 text-rose-300 hover:bg-rose-500/25'
                      : 'bg-cyan-500/15 border-cyan-500/30 text-cyan-300 hover:bg-cyan-500/25'
                  }`}
                >
                  <Radio className="w-3.5 h-3.5" />
                  <span>{limits.announcementActive ? 'Desativar Transmissão' : 'Ativar no Topo Agora'}</span>
                </button>
              </div>

              {/* 1. Tipo / Severidade do Aviso */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-gray-300 flex items-center justify-between">
                  <span>Estilo &amp; Severidade do Aviso</span>
                  <span className="text-[11px] text-gray-400 font-normal">Define cores, ícone e destaque visual</span>
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { id: 'info', label: 'Informativo', desc: 'Geral & Anúncios', icon: <Megaphone className="w-3.5 h-3.5 text-cyan-400" />, activeClass: 'border-cyan-500 bg-cyan-500/15 text-cyan-200' },
                    { id: 'warning', label: 'Atenção', desc: 'Alertas & Avisos', icon: <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />, activeClass: 'border-amber-500 bg-amber-500/15 text-amber-200' },
                    { id: 'critical', label: 'Urgente', desc: 'Crítico & Parada', icon: <AlertOctagon className="w-3.5 h-3.5 text-rose-400" />, activeClass: 'border-rose-500 bg-rose-500/15 text-rose-200' },
                    { id: 'success', label: 'Novidade', desc: 'Lançamentos & Info', icon: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />, activeClass: 'border-emerald-500 bg-emerald-500/15 text-emerald-200' },
                  ].map((item) => {
                    const isSelected = (limits.announcementType || 'info') === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setLimits(prev => ({ ...prev, announcementType: item.id as AnnouncementType }))}
                        className={`p-2.5 rounded-xl border text-left transition-all ${
                          isSelected
                            ? item.activeClass
                            : 'border-[#1c1c1c] bg-[#0c0c0c] text-gray-400 hover:border-gray-700 hover:text-gray-200'
                        }`}
                      >
                        <div className="flex items-center gap-1.5 font-bold text-xs mb-0.5">
                          {item.icon}
                          <span>{item.label}</span>
                        </div>
                        <div className="text-[10px] text-gray-400">{item.desc}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 2. Público-Alvo da Transmissão */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-gray-300 flex items-center justify-between">
                  <span>Público-Alvo da Transmissão</span>
                  <span className="text-[11px] text-gray-400 font-normal">Quem poderá visualizar o banner</span>
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {[
                    { id: 'all', label: 'Todos os Visitantes & Membros', icon: <Globe className="w-3.5 h-3.5" /> },
                    { id: 'authenticated', label: 'Apenas Usuários Logados', icon: <UserCheck className="w-3.5 h-3.5" /> },
                    { id: 'anonymous', label: 'Apenas Visitantes (Landing)', icon: <Users className="w-3.5 h-3.5" /> },
                  ].map((aud) => {
                    const isSelected = (limits.announcementAudience || 'all') === aud.id;
                    return (
                      <button
                        key={aud.id}
                        type="button"
                        onClick={() => setLimits(prev => ({ ...prev, announcementAudience: aud.id as AnnouncementAudience }))}
                        className={`px-3 py-2 rounded-xl border text-xs font-medium flex items-center gap-2 transition-all ${
                          isSelected
                            ? 'border-brand-500 bg-brand-500/15 text-brand-200'
                            : 'border-[#1c1c1c] bg-[#0c0c0c] text-gray-400 hover:border-gray-700 hover:text-gray-200'
                        }`}
                      >
                        {aud.icon}
                        <span className="truncate">{aud.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 3. Mensagem do Aviso */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-gray-300">Mensagem da Transmissão</label>
                  <span className="text-[10px] text-gray-400 font-mono">
                    {(limits.announcementBanner || '').length} caracteres
                  </span>
                </div>
                <textarea
                  rows={2}
                  value={limits.announcementBanner || ''}
                  onChange={(e) => setLimits(prev => ({ ...prev, announcementBanner: e.target.value }))}
                  placeholder="Ex: Estamos realizando melhorias de infraestrutura programadas na nuvem..."
                  className="w-full px-3 py-2 rounded-xl bg-[#0c0c0c] border border-[#1c1c1c] text-xs text-gray-100 outline-none focus:border-cyan-500 transition-colors resize-none"
                />

                {/* Modelos Rápidos de Mensagem */}
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <span className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider mr-1">Modelos:</span>
                  {[
                    { label: '📢 Atualização', text: 'Nova atualização disponível! Sincronização em tempo real e perfil aprimorados.' },
                    { label: '🛠️ Manutenção', text: 'Manutenção programada hoje das 22h às 23h. Suas notas salvas continuam intactas.' },
                    { label: '🚀 Dica de Nuvem', text: 'Vincule seu usuário para manter seus blocos de notas acessíveis de qualquer aparelho.' },
                  ].map((tpl, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setLimits(prev => ({ ...prev, announcementBanner: tpl.text }))}
                      className="px-2 py-0.5 rounded-lg bg-[#141414] hover:bg-[#1f1f1f] border border-[#222] text-[11px] text-gray-300 transition-colors"
                    >
                      {tpl.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 4. Link & Ação (Opcional) + Opção de Fechar */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-300">Link de Ação (URL Opcional)</label>
                  <input
                    type="url"
                    value={limits.announcementLink || ''}
                    onChange={(e) => setLimits(prev => ({ ...prev, announcementLink: e.target.value }))}
                    placeholder="https://exemplo.com ou /notpad"
                    className="w-full px-3 py-2 rounded-xl bg-[#0c0c0c] border border-[#1c1c1c] text-xs text-gray-100 outline-none focus:border-brand-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-300">Texto do Botão de Ação</label>
                  <input
                    type="text"
                    value={limits.announcementLinkLabel || ''}
                    onChange={(e) => setLimits(prev => ({ ...prev, announcementLinkLabel: e.target.value }))}
                    placeholder="Ex: Ver Detalhes, Saiba Mais, Acessar"
                    className="w-full px-3 py-2 rounded-xl bg-[#0c0c0c] border border-[#1c1c1c] text-xs text-gray-100 outline-none focus:border-brand-500"
                  />
                </div>
              </div>

              {/* Dismissible Toggle */}
              <label className="flex items-center gap-2.5 p-2.5 rounded-xl bg-[#0c0c0c] border border-[#1c1c1c] cursor-pointer hover:bg-[#121212] transition-colors">
                <input
                  type="checkbox"
                  checked={limits.announcementDismissible !== false}
                  onChange={(e) => setLimits(prev => ({ ...prev, announcementDismissible: e.target.checked }))}
                  className="w-4 h-4 rounded text-cyan-500 focus:ring-0 bg-transparent"
                />
                <div className="text-xs">
                  <span className="font-semibold text-gray-200">Permitir que o usuário feche o aviso</span>
                  <span className="text-gray-400 block text-[11px]">
                    Se marcado, exibe o botão (X). O usuário dispensa o aviso apenas para a sessão atual. Se o admin alterar a mensagem, o aviso reaparece automaticamente.
                  </span>
                </div>
              </label>

              {/* 5. Pré-visualização ao Vivo */}
              <div className="pt-2 space-y-1.5">
                <div className="flex items-center gap-1.5 text-[11px] font-bold text-gray-400 uppercase tracking-wider">
                  <Eye className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Pré-visualização em Tempo Real (Como aparecerá no site)</span>
                </div>

                <div className="p-2 rounded-xl bg-black border border-[#222]">
                  {limits.announcementBanner?.trim() ? (
                    <div className={`w-full py-2 px-3 sm:px-4 rounded-lg flex items-center justify-between gap-3 text-xs select-none transition-all ${
                      {
                        info: 'border border-cyan-500/30 bg-gradient-to-r from-cyan-950/95 via-[#0c1629] to-cyan-950/95 text-cyan-100 shadow-md',
                        warning: 'border border-amber-500/30 bg-gradient-to-r from-amber-950/95 via-[#1b1406] to-amber-950/95 text-amber-100 shadow-md',
                        critical: 'border border-rose-500/40 bg-gradient-to-r from-rose-950/95 via-[#220910] to-rose-950/95 text-rose-100 shadow-md',
                        success: 'border border-emerald-500/30 bg-gradient-to-r from-emerald-950/95 via-[#081a12] to-emerald-950/95 text-emerald-100 shadow-md',
                      }[limits.announcementType || 'info']
                    }`}>
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span className="relative flex h-2 w-2 shrink-0">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-current opacity-75" />
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-current" />
                        </span>
                        {{
                          info: <Megaphone className="w-3.5 h-3.5 text-cyan-400 shrink-0" />,
                          warning: <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />,
                          critical: <AlertOctagon className="w-3.5 h-3.5 text-rose-400 shrink-0 animate-pulse" />,
                          success: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />,
                        }[limits.announcementType || 'info']}
                        <span className="text-[10px] font-bold uppercase font-mono px-1.5 py-0.5 rounded border shrink-0 bg-white/10 border-white/20">
                          {{
                            info: 'Aviso',
                            warning: 'Atenção',
                            critical: 'Urgente',
                            success: 'Novidade',
                          }[limits.announcementType || 'info']}
                        </span>
                        <p className="text-xs font-medium leading-tight truncate">
                          {limits.announcementBanner}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {limits.announcementLink && limits.announcementLink.trim() && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-white/15 border border-white/25">
                            {limits.announcementLinkLabel || 'Ver Mais'}
                            <ExternalLink className="w-2.5 h-2.5" />
                          </span>
                        )}
                        {limits.announcementDismissible !== false && (
                          <span className="p-0.5 text-gray-400">
                            <X className="w-3 h-3" />
                          </span>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="py-3 text-center text-xs text-gray-500 italic">
                      Digite uma mensagem acima para visualizar o banner em tempo real.
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <div className="text-xs text-gray-400">
                {limits.announcementActive ? (
                  <span className="text-cyan-400 flex items-center gap-1.5 font-medium">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500" />
                    </span>
                    Transmissão ativa e visível no topo da plataforma
                  </span>
                ) : (
                  <span className="text-gray-500">Transmissão desligada no momento</span>
                )}
              </div>

              <div className="flex items-center gap-3">
                {limits.announcementActive && (
                  <button
                    type="button"
                    onClick={() => handleToggleBroadcast(false)}
                    className="px-4 py-2.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/20 text-xs font-semibold transition-all"
                  >
                    Desativar Transmissão
                  </button>
                )}

                <button
                  type="submit"
                  className="px-6 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold shadow-lg shadow-cyan-600/30 transition-all flex items-center gap-2"
                >
                  <Megaphone className="w-4 h-4" />
                  <span>Salvar &amp; Transmitir no Site</span>
                </button>
              </div>
            </div>
          </form>
        )}


      </div>

      {/* ==================================================== */}
      {/* SUB-MODAIS (CRIAR, EDITAR, SENHA, EXCLUSÃO) */}
      {/* ==================================================== */}

      {/* 1. Modal Criar Usuário */}
      <Modal isOpen={isCreateUserOpen} onClose={() => setIsCreateUserOpen(false)} maxWidth="md" title="Cadastrar Novo Usuário">
        <form onSubmit={handleCreateUser} className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-300">Nome Completo</label>
            <input
              type="text"
              required
              value={newFullName}
              onChange={(e) => setNewFullName(e.target.value)}
              placeholder="Ex: João da Silva"
              className="w-full px-3 py-2 rounded-xl bg-[#0d0d0d] border border-[#1c1c1c] text-xs text-gray-100 outline-none focus:border-brand-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-300">Nome de Usuário (@)</label>
              <input
                type="text"
                required
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                placeholder="usuario"
                className="w-full px-3 py-2 rounded-xl bg-[#0d0d0d] border border-[#1c1c1c] text-xs font-mono text-gray-100 outline-none focus:border-brand-500"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-300">Cargo / Permissão</label>
              <select
                value={newRole}
                onChange={(e) => setNewRole(e.target.value as UserRole)}
                className="w-full px-3 py-2 rounded-xl bg-[#0d0d0d] border border-[#1c1c1c] text-xs text-gray-100 outline-none focus:border-brand-500"
              >
                <option value="user">Usuário Padrão</option>
                <option value="admin">Administrador</option>
              </select>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-300">Senha Inicial (mín. 6 dígitos)</label>
            <input
              type="password"
              required
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-3 py-2 rounded-xl bg-[#0d0d0d] border border-[#1c1c1c] text-xs text-gray-100 outline-none focus:border-brand-500"
            />
          </div>

          <div className="flex items-center gap-2 pt-2">
            <button
              type="button"
              onClick={() => setIsCreateUserOpen(false)}
              className="flex-1 py-2 rounded-xl border border-[#1c1c1c] text-xs text-gray-400 hover:text-white"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmittingUser}
              className="flex-1 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-xs font-bold"
            >
              {isSubmittingUser ? 'Criando...' : 'Cadastrar'}
            </button>
          </div>
        </form>
      </Modal>

      {/* 2. Modal Editar Usuário */}
      <Modal isOpen={Boolean(editingUser)} onClose={() => setEditingUser(null)} maxWidth="md" title={`Editar Usuário @${editingUser?.username}`}>
        <form onSubmit={handleSaveUserEdit} className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-300">Nome Completo</label>
            <input
              type="text"
              required
              value={editFullName}
              onChange={(e) => setEditFullName(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-[#0d0d0d] border border-[#1c1c1c] text-xs text-gray-100 outline-none focus:border-brand-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-300">Username (@)</label>
              <input
                type="text"
                required
                disabled={editingUser?.username.toLowerCase() === 'malaca'}
                value={editUsername}
                onChange={(e) => setEditUsername(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-[#0d0d0d] border border-[#1c1c1c] text-xs font-mono text-gray-100 outline-none disabled:opacity-50"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-300">Cargo</label>
              <select
                disabled={editingUser?.username.toLowerCase() === 'malaca'}
                value={editRole}
                onChange={(e) => setEditRole(e.target.value as UserRole)}
                className="w-full px-3 py-2 rounded-xl bg-[#0d0d0d] border border-[#1c1c1c] text-xs text-gray-100 outline-none disabled:opacity-50"
              >
                <option value="user">Usuário Padrão</option>
                <option value="admin">Administrador</option>
              </select>
            </div>
          </div>

          {editingUser?.username.toLowerCase() !== 'malaca' && (
            <label className="flex items-center gap-2 p-3 rounded-xl bg-rose-500/5 border border-rose-500/20 cursor-pointer">
              <input
                type="checkbox"
                checked={editIsBanned}
                onChange={(e) => setEditIsBanned(e.target.checked)}
                className="w-4 h-4 rounded text-rose-600 focus:ring-0"
              />
              <span className="text-xs text-rose-300 font-medium">Suspender / Bloquear Acesso deste Usuário</span>
            </label>
          )}

          <div className="flex items-center gap-2 pt-2">
            <button
              type="button"
              onClick={() => setEditingUser(null)}
              className="flex-1 py-2 rounded-xl border border-[#1c1c1c] text-xs text-gray-400 hover:text-white"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSavingUserEdit}
              className="flex-1 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-xs font-bold"
            >
              {isSavingUserEdit ? 'Salvando...' : 'Salvar Alterações'}
            </button>
          </div>
        </form>
      </Modal>

      {/* 3. Modal Redefinir Senha do Usuário */}
      <Modal isOpen={Boolean(passwordResetUser)} onClose={() => setPasswordResetUser(null)} maxWidth="sm" title="Redefinir Senha">
        <form onSubmit={handleResetPassword} className="space-y-4">
          <p className="text-xs text-gray-400">
            Defina uma nova senha para <strong className="text-gray-200">@{passwordResetUser?.username}</strong>. A senha deve ter no mínimo 6 dígitos.
          </p>

          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-300">Nova Senha</label>
            <input
              type="text"
              required
              value={adminNewPassword}
              onChange={(e) => setAdminNewPassword(e.target.value)}
              placeholder="Mínimo 6 dígitos"
              className="w-full px-3 py-2 rounded-xl bg-[#0d0d0d] border border-[#1c1c1c] text-xs text-gray-100 outline-none focus:border-brand-500 font-mono"
            />
          </div>

          <div className="flex items-center gap-2 pt-2">
            <button
              type="button"
              onClick={() => setPasswordResetUser(null)}
              className="flex-1 py-2 rounded-xl border border-[#1c1c1c] text-xs text-gray-400 hover:text-white"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isResettingPassword}
              className="flex-1 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold"
            >
              {isResettingPassword ? 'Gravando...' : 'Gravar Nova Senha'}
            </button>
          </div>
        </form>
      </Modal>

      {/* 4. Modal Criar Novo Bloco de Nota */}
      <Modal
        isOpen={isCreateNoteOpen}
        onClose={() => setIsCreateNoteOpen(false)}
        maxWidth="2xl"
        title="Criar Novo Bloco de Nota"
      >
        <form onSubmit={handleCreateNote} className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-300">Título da Nota</label>
            <input
              type="text"
              required
              value={newNoteTitle}
              onChange={(e) => setNewNoteTitle(e.target.value)}
              placeholder="Ex: Tarefas Semanais, Brainstorm, Ideias..."
              className="w-full px-3 py-2 rounded-xl bg-[#0d0d0d] border border-[#1c1c1c] text-xs font-bold text-gray-100 outline-none focus:border-brand-500"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-300">Proprietário / Autor</label>
              <select
                value={newNoteOwner}
                onChange={(e) => setNewNoteOwner(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-[#0d0d0d] border border-[#1c1c1c] text-xs text-gray-100 outline-none focus:border-brand-500"
              >
                {users.map((u) => (
                  <option key={u.id} value={u.username}>
                    @{u.username} ({u.full_name}) {u.username.toLowerCase() === 'malaca' ? '⭐ Admin' : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center pt-5">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={newNotePinned}
                  onChange={(e) => setNewNotePinned(e.target.checked)}
                  className="w-4 h-4 rounded text-brand-600 focus:ring-0 bg-[#0d0d0d] border-[#1c1c1c]"
                />
                <span className="text-xs text-gray-300 font-medium flex items-center gap-1.5">
                  <Pin className="w-3.5 h-3.5 text-amber-400" /> Fixar esta nota no topo
                </span>
              </label>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-300">Conteúdo Inicial</label>
            <textarea
              rows={6}
              value={newNoteContent}
              onChange={(e) => setNewNoteContent(e.target.value)}
              placeholder="Digite o texto inicial da nota..."
              className="w-full px-3 py-2.5 rounded-xl bg-[#0d0d0d] border border-[#1c1c1c] text-xs font-mono text-gray-100 outline-none focus:border-brand-500 leading-relaxed"
            />
          </div>

          {/* Compartilhamento Opcional */}
          <div className="p-3.5 rounded-xl bg-[#0a0a0a] border border-[#1c1c1c] space-y-3">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={newNoteEnableShare}
                onChange={(e) => setNewNoteEnableShare(e.target.checked)}
                className="w-4 h-4 rounded text-brand-600 focus:ring-0 bg-[#0d0d0d] border-[#1c1c1c]"
              />
              <span className="text-xs font-bold text-gray-200 flex items-center gap-1.5">
                <Share2 className="w-3.5 h-3.5 text-cyan-400" /> Ativar Link de Compartilhamento Público
              </span>
            </label>

            {newNoteEnableShare && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-gray-400">Link Personalizado (/slug)</label>
                  <div className="flex items-center px-2.5 py-1.5 rounded-lg bg-[#0d0d0d] border border-[#1c1c1c] text-xs font-mono text-gray-300">
                    <span className="text-gray-500 text-[11px]">/notpad/</span>
                    <input
                      type="text"
                      value={newNoteShareSlug}
                      onChange={(e) => setNewNoteShareSlug(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '-'))}
                      placeholder="meu-link"
                      className="w-full bg-transparent outline-none text-cyan-300"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-gray-400">Senha de Proteção (Opcional)</label>
                  <input
                    type="text"
                    value={newNoteSharePassword}
                    onChange={(e) => setNewNoteSharePassword(e.target.value)}
                    placeholder="Deixe em branco para público"
                    className="w-full px-3 py-1.5 rounded-lg bg-[#0d0d0d] border border-[#1c1c1c] text-xs font-mono text-gray-100 outline-none focus:border-brand-500"
                  />
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 pt-2">
            <button
              type="button"
              onClick={() => setIsCreateNoteOpen(false)}
              className="flex-1 py-2.5 rounded-xl border border-[#1c1c1c] text-xs text-gray-400 hover:text-white transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmittingNote}
              className="flex-1 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-xs font-bold transition-colors shadow-lg shadow-brand-500/20"
            >
              {isSubmittingNote ? 'Criando Bloco...' : 'Criar Bloco de Nota'}
            </button>
          </div>
        </form>
      </Modal>

      {/* 5. Modal Visualizar/Editar Nota */}
      <Modal
        isOpen={Boolean(editingNote)}
        onClose={() => setEditingNote(null)}
        maxWidth="2xl"
        title={
          <div className="flex items-center justify-between w-full pr-6">
            <span>Editar Bloco de Notas</span>
            {editingNote && (
              <button
                type="button"
                onClick={() => handleOpenNoteInEditor(editingNote.id)}
                className="text-[11px] font-medium text-cyan-400 hover:text-cyan-300 flex items-center gap-1 bg-cyan-500/10 px-2 py-1 rounded-lg border border-cyan-500/20 transition-colors"
              >
                <ExternalLink className="w-3 h-3" /> Abrir no Editor NotPad
              </button>
            )}
          </div>
        }
      >
        <form onSubmit={handleSaveNoteEdit} className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-300">Título da Nota</label>
            <input
              type="text"
              required
              value={editNoteTitle}
              onChange={(e) => setEditNoteTitle(e.target.value)}
              placeholder="Título"
              className="w-full px-3 py-2 rounded-xl bg-[#0d0d0d] border border-[#1c1c1c] text-xs font-bold text-gray-100 outline-none focus:border-brand-500"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-300">Proprietário / Autor</label>
              <select
                value={editNoteOwner}
                onChange={(e) => setEditNoteOwner(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-[#0d0d0d] border border-[#1c1c1c] text-xs text-gray-100 outline-none focus:border-brand-500"
              >
                {users.map((u) => (
                  <option key={u.id} value={u.username}>
                    @{u.username} ({u.full_name})
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center pt-5">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={editNotePinned}
                  onChange={(e) => setEditNotePinned(e.target.checked)}
                  className="w-4 h-4 rounded text-brand-600 focus:ring-0 bg-[#0d0d0d] border-[#1c1c1c]"
                />
                <span className="text-xs text-gray-300 font-medium flex items-center gap-1.5">
                  <Pin className="w-3.5 h-3.5 text-amber-400" /> Fixada no topo
                </span>
              </label>
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-gray-300">Conteúdo (HTML / Texto)</label>
              <span className="text-[10px] text-gray-500 font-mono">
                {editNoteContent.length} caracteres
              </span>
            </div>
            <textarea
              rows={8}
              value={editNoteContent}
              onChange={(e) => setEditNoteContent(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl bg-[#0d0d0d] border border-[#1c1c1c] text-xs font-mono text-gray-100 outline-none focus:border-brand-500 leading-relaxed"
            />
          </div>

          {/* Configurações de Compartilhamento */}
          <div className="p-3.5 rounded-xl bg-[#0a0a0a] border border-[#1c1c1c] space-y-3">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={editNoteEnableShare}
                onChange={(e) => setEditNoteEnableShare(e.target.checked)}
                className="w-4 h-4 rounded text-brand-600 focus:ring-0 bg-[#0d0d0d] border-[#1c1c1c]"
              />
              <span className="text-xs font-bold text-gray-200 flex items-center gap-1.5">
                <Share2 className="w-3.5 h-3.5 text-cyan-400" /> Link de Compartilhamento Ativo
              </span>
            </label>

            {editNoteEnableShare && (
              <div className="space-y-3 pt-1">
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-gray-400">Link Personalizado (/slug)</label>
                  <div className="flex items-center px-2.5 py-1.5 rounded-lg bg-[#0d0d0d] border border-[#1c1c1c] text-xs font-mono text-gray-300">
                    <span className="text-gray-500 text-[11px]">/notpad/</span>
                    <input
                      type="text"
                      value={editNoteShareSlug}
                      onChange={(e) => setEditNoteShareSlug(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '-'))}
                      placeholder="slug-do-link"
                      className="w-full bg-transparent outline-none text-cyan-300"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-gray-400">
                    {editingNote?.share?.is_password_protected ? 'Alterar Senha de Acesso' : 'Definir Senha de Acesso (Opcional)'}
                  </label>
                  <input
                    type="text"
                    value={editNoteSharePassword}
                    onChange={(e) => setEditNoteSharePassword(e.target.value)}
                    placeholder={editingNote?.share?.is_password_protected ? 'Deixe em branco para manter a senha atual' : 'Sem senha (público)'}
                    className="w-full px-3 py-1.5 rounded-lg bg-[#0d0d0d] border border-[#1c1c1c] text-xs font-mono text-gray-100 outline-none focus:border-brand-500"
                  />
                </div>

                {editingNote?.share?.is_password_protected && (
                  <label className="flex items-center gap-2 cursor-pointer select-none pt-1">
                    <input
                      type="checkbox"
                      checked={editNoteRemovePassword}
                      onChange={(e) => setEditNoteRemovePassword(e.target.checked)}
                      className="w-3.5 h-3.5 rounded text-rose-600 focus:ring-0 bg-[#0d0d0d] border-[#1c1c1c]"
                    />
                    <span className="text-[11px] text-rose-300 font-medium">
                      Remover proteção de senha (tornar totalmente público)
                    </span>
                  </label>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 pt-2">
            <button
              type="button"
              onClick={() => setEditingNote(null)}
              className="flex-1 py-2.5 rounded-xl border border-[#1c1c1c] text-xs text-gray-400 hover:text-white transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSavingNote}
              className="flex-1 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-xs font-bold transition-colors shadow-lg shadow-brand-500/20"
            >
              {isSavingNote ? 'Salvando...' : 'Salvar Alterações'}
            </button>
          </div>
        </form>
      </Modal>

      {/* 5. Modal Senha de Link Compartilhado */}
      <Modal isOpen={Boolean(shareForPassword)} onClose={() => setShareForPassword(null)} maxWidth="sm" title="Proteger Link com Senha">
        <form onSubmit={handleSaveSharePassword} className="space-y-4">
          <p className="text-xs text-gray-400">
            Defina uma senha para proteger o link <strong className="text-cyan-400">/notpad/{shareForPassword}</strong>. (Mínimo de 3 dígitos).
          </p>

          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-300">Senha do Bloco</label>
            <input
              type="text"
              required
              value={newSharePassword}
              onChange={(e) => setNewSharePassword(e.target.value)}
              placeholder="Ex: 123"
              className="w-full px-3 py-2 rounded-xl bg-[#0d0d0d] border border-[#1c1c1c] text-xs text-gray-100 outline-none focus:border-brand-500 font-mono"
            />
          </div>

          <div className="flex items-center gap-2 pt-2">
            <button
              type="button"
              onClick={() => setShareForPassword(null)}
              className="flex-1 py-2 rounded-xl border border-[#1c1c1c] text-xs text-gray-400 hover:text-white"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSettingSharePassword}
              className="flex-1 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold"
            >
              {isSettingSharePassword ? 'Definindo...' : 'Definir Senha'}
            </button>
          </div>
        </form>
      </Modal>

      {/* 6. Diálogos de Confirmação de Exclusão */}
      <ConfirmDialog
        isOpen={Boolean(userToDelete)}
        title="Excluir Usuário?"
        message={`Tem certeza que deseja excluir o usuário @${userToDelete?.username}? Esta ação não pode ser desfeita.`}
        confirmText="Excluir Usuário"
        cancelText="Cancelar"
        isDestructive={true}
        onConfirm={handleDeleteUser}
        onCancel={() => setUserToDelete(null)}
      />

      <ConfirmDialog
        isOpen={Boolean(noteToDelete)}
        title="Excluir Bloco de Notas?"
        message={`Tem certeza que deseja excluir permanentemente o bloco "${noteToDelete?.title || 'Sem título'}"?`}
        confirmText="Excluir Nota"
        cancelText="Cancelar"
        isDestructive={true}
        onConfirm={handleDeleteNote}
        onCancel={() => setNoteToDelete(null)}
      />

      <ConfirmDialog
        isOpen={Boolean(shareToDelete)}
        title="Revogar Link Compartilhado?"
        message={`Deseja revogar o link /notpad/${shareToDelete}? Ele deixará de ser acessível imediatamente.`}
        confirmText="Revogar Link"
        cancelText="Cancelar"
        isDestructive={true}
        onConfirm={handleDeleteShare}
        onCancel={() => setShareToDelete(null)}
      />
    </Modal>
  );
};

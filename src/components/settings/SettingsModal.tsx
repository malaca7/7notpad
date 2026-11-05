import React, { useState, useRef, useEffect } from 'react';
import { Modal } from '../common/Modal';
import { useEditorSettings } from '../../hooks/useEditorSettings';
import { getOrCreateOwnerToken } from '../../lib/crypto';
import { exportNotesToJson, importNotesFromJson } from '../../lib/exportImport';
import { StorageService } from '../../lib/storage';
import { AuthService } from '../../lib/authService';
import { SECURITY_QUESTIONS } from '../../types/auth';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../common/Toast';
import { 
  Settings, 
  Type, 
  Cloud, 
  Shield, 
  Download, 
  Upload, 
  Key, 
  Check, 
  RotateCcw,
  RefreshCw,
  Database,
  CheckCircle2,
  User,
  AtSign,
  Lock,
  LogOut,
  ShieldCheck,
  Eye,
  EyeOff,
  Sparkles,
  HelpCircle,
  Calendar,
  Camera,
  Trash2
} from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNotesImported?: () => void;
  initialTab?: 'account' | 'editor' | 'cloud' | 'security' | 'backup';
  onOpenAuthModal?: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  onNotesImported,
  initialTab = 'account',
  onOpenAuthModal,
}) => {
  const { settings, updateSettings, defaultSettings } = useEditorSettings();
  const { success, error } = useToast();
  const { user, isAuthenticated, logout } = useAuth();

  const [activeTab, setActiveTab] = useState<'account' | 'editor' | 'cloud' | 'security' | 'backup'>(initialTab);
  const [copiedToken, setCopiedToken] = useState(false);
  const [isMigrating, setIsMigrating] = useState(false);
  const [isSyncingNotesToUser, setIsSyncingNotesToUser] = useState(false);

  // Profile Edit states
  const [fullNameInput, setFullNameInput] = useState('');
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  // Password Change states
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [showCurrentPass, setShowCurrentPass] = useState(false);
  const [showNewPass, setShowNewPass] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  // Security Questions & Birth Date states
  const [birthDateInput, setBirthDateInput] = useState(user?.birth_date || '');
  const [securityQuestionInput, setSecurityQuestionInput] = useState<string>(user?.security_question || SECURITY_QUESTIONS[0]);
  const [securityAnswerInput, setSecurityAnswerInput] = useState('');
  const [isUpdatingSecurity, setIsUpdatingSecurity] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const ownerToken = getOrCreateOwnerToken();

  useEffect(() => {
    if (user) {
      setFullNameInput(user.full_name);
      if (user.birth_date) setBirthDateInput(user.birth_date);
      if (user.security_question) setSecurityQuestionInput(user.security_question);
    }
  }, [user]);

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab, isOpen]);

  const handleCopyOwnerToken = async () => {
    try {
      await navigator.clipboard.writeText(ownerToken);
      setCopiedToken(true);
      success('Token copiado!', 'Sua credencial anônima de proprietário foi copiada.');
      setTimeout(() => setCopiedToken(false), 2000);
    } catch {
      error('Erro ao copiar token');
    }
  };

  const handleMigrateToFirebase = async () => {
    setIsMigrating(true);
    try {
      const res = await StorageService.migrateAllToFirebase();
      success(
        'Sincronização Concluída!',
        `${res.migratedNotes} notas e ${res.migratedShares} compartilhamentos sincronizados com a nuvem.`
      );
    } catch (err: any) {
      error('Erro na sincronização', err?.message || 'Falha ao sincronizar com a nuvem.');
    } finally {
      setIsMigrating(false);
    }
  };

  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const result = await importNotesFromJson(file);
    if (result.success) {
      success('Backup restaurado!', `${result.count} nota(s) importada(s) com sucesso.`);
      StorageService.migrateAllToFirebase().catch(() => {});
      if (onNotesImported) onNotesImported();
      onClose();
    } else {
      error('Falha na importação', result.error);
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // ----------------------------------------------------
  // Update Profile (Nome Completo - Username é fixo!)
  // ----------------------------------------------------
  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setIsUpdatingProfile(true);
    try {
      const res = await AuthService.updateProfile({
        userId: user.id,
        fullName: fullNameInput
      });

      if (res.success) {
        success('Perfil Atualizado!', 'Seu nome completo foi atualizado com sucesso.');
      } else {
        error('Erro ao atualizar', res.error || 'Não foi possível alterar seu perfil.');
      }
    } finally {
      setIsUpdatingProfile(false);
    }
  };

  // ----------------------------------------------------
  // Update / Remove Avatar Photo
  // ----------------------------------------------------
  const handleAvatarFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    if (!file.type.startsWith('image/')) {
      error('Arquivo inválido', 'Por favor, selecione uma imagem válida (PNG, JPG, WEBP).');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      error('Arquivo muito grande', 'A foto deve ter no máximo 5MB.');
      return;
    }

    setIsUploadingAvatar(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => {
          const img = new Image();
          img.onload = () => {
            const canvas = document.createElement('canvas');
            const MAX_DIM = 360;
            let w = img.width;
            let h = img.height;
            if (w > h) {
              if (w > MAX_DIM) {
                h = Math.round((h * MAX_DIM) / w);
                w = MAX_DIM;
              }
            } else {
              if (h > MAX_DIM) {
                w = Math.round((w * MAX_DIM) / h);
                h = MAX_DIM;
              }
            }
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            ctx?.drawImage(img, 0, 0, w, h);
            resolve(canvas.toDataURL('image/jpeg', 0.85));
          };
          img.onerror = reject;
          img.src = event.target?.result as string;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const res = await AuthService.updateAvatar(user.id, dataUrl);
      if (res.success) {
        success('Foto Atualizada!', 'Sua nova foto de perfil foi salva com sucesso.');
      } else {
        error('Erro ao salvar foto', res.error);
      }
    } catch (err: any) {
      error('Erro ao processar imagem', err?.message);
    } finally {
      setIsUploadingAvatar(false);
      if (avatarInputRef.current) avatarInputRef.current.value = '';
    }
  };

  const handleRemoveAvatar = async () => {
    if (!user) return;
    setIsUploadingAvatar(true);
    try {
      const res = await AuthService.updateAvatar(user.id, null);
      if (res.success) {
        success('Foto Removida!', 'Sua foto de perfil foi removida.');
      } else {
        error('Erro ao remover foto', res.error);
      }
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  // ----------------------------------------------------
  // ETAPA 4: Update Security Questions & Birth Date
  // ----------------------------------------------------
  const handleUpdateSecurityInfo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (!birthDateInput) {
      error('Data de nascimento necessária', 'Por favor, informe sua data de nascimento.');
      return;
    }

    if (!securityAnswerInput.trim()) {
      error('Resposta secreta necessária', 'Digite uma resposta para a pergunta de segurança.');
      return;
    }

    setIsUpdatingSecurity(true);
    try {
      const res = await AuthService.updateSecurityInfo({
        userId: user.id,
        birthDate: birthDateInput,
        securityQuestion: securityQuestionInput,
        securityAnswer: securityAnswerInput,
      });

      if (res.success) {
        success('Dados de Segurança Salvos!', 'Sua data de nascimento e pergunta secreta foram atualizadas.');
        setSecurityAnswerInput('');
      } else {
        error('Erro ao salvar', res.error || 'Não foi possível atualizar seus dados.');
      }
    } finally {
      setIsUpdatingSecurity(false);
    }
  };

  // ----------------------------------------------------
  // ETAPA 4: Change Password (current password validation)
  // ----------------------------------------------------
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (!currentPassword) {
      error('Senha atual obrigatória', 'Informe sua senha atual para continuar.');
      return;
    }
    if (newPassword.length < 6) {
      error('Senha muito curta', 'A nova senha deve ter no mínimo 6 dígitos.');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      error('Senhas não coincidem', 'A confirmação não é igual à nova senha informada.');
      return;
    }

    setIsChangingPassword(true);
    try {
      const res = await AuthService.changePassword({
        userId: user.id,
        currentPassword,
        newPassword,
        confirmPassword: confirmNewPassword
      });

      if (res.success) {
        success('Senha alterada!', 'Sua nova senha foi gravada com sucesso.');
        setCurrentPassword('');
        setNewPassword('');
        setConfirmNewPassword('');
      } else {
        error('Falha na alteração', res.error || 'A senha atual está incorreta.');
      }
    } finally {
      setIsChangingPassword(false);
    }
  };

  // Sync / link anonymous notes to logged in account
  const handleMigrateNotesToUser = async () => {
    if (!user) return;
    setIsSyncingNotesToUser(true);
    try {
      const count = await StorageService.migrateLocalNotesToUser(user.id);
      success('Notas vinculadas!', `${count} nota(s) vinculada(s) à sua conta.`);
      if (onNotesImported) onNotesImported();
    } catch {
      error('Erro ao vincular notas');
    } finally {
      setIsSyncingNotesToUser(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-brand-500/10 text-brand-400">
            <Settings className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-gray-900 dark:text-gray-100">Configurações</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 font-normal">
              Conta, aparência do editor, sincronização e segurança
            </p>
          </div>
        </div>
      }
      maxWidth="2xl"
    >
      <div className="space-y-5">
        {/* Navigation Tabs */}
        <div className="flex border-b border-gray-200 dark:border-[#232838] gap-1 overflow-x-auto pb-1">
          <button
            onClick={() => setActiveTab('account')}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'account'
                ? 'border-brand-500 text-brand-500'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            <User className="w-3.5 h-3.5" />
            Minha Conta
            {isAuthenticated && (
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse ml-0.5" />
            )}
          </button>
          <button
            onClick={() => setActiveTab('editor')}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'editor'
                ? 'border-brand-500 text-brand-500'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            <Type className="w-3.5 h-3.5" />
            Editor &amp; Tipografia
          </button>
          <button
            onClick={() => setActiveTab('cloud')}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'cloud'
                ? 'border-brand-500 text-brand-500'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            <Cloud className="w-3.5 h-3.5" />
            Sincronização em Nuvem
          </button>
          <button
            onClick={() => setActiveTab('security')}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'security'
                ? 'border-brand-500 text-brand-500'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            <Shield className="w-3.5 h-3.5" />
            Identidade Anônima
          </button>
          <button
            onClick={() => setActiveTab('backup')}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'backup'
                ? 'border-brand-500 text-brand-500'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            <Download className="w-3.5 h-3.5" />
            Backup &amp; Exportação
          </button>
        </div>

        {/* ==================================================== */}
        {/* TAB: MINHA CONTA (ETAPA 4)                          */}
        {/* ==================================================== */}
        {activeTab === 'account' && (
          <div className="space-y-6">
            {!isAuthenticated || !user ? (
              // Anonymous User State
              <div className="p-6 rounded-2xl bg-gradient-to-br from-brand-500/10 via-purple-500/5 to-transparent border border-brand-500/30 text-center space-y-4">
                <div className="w-14 h-14 rounded-2xl bg-brand-500/20 text-brand-400 flex items-center justify-center mx-auto shadow-inner">
                  <User className="w-7 h-7" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-gray-900 dark:text-gray-100">
                    Você está navegando em modo anônimo
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 max-w-sm mx-auto mt-1 leading-relaxed">
                    Você pode usar o 7NotPad livremente sem cadastro. Crie uma conta para salvar suas notas em qualquer aparelho com seu usuário e gerenciar suas credenciais.
                  </p>
                </div>
                <div className="pt-2 flex justify-center">
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenAuthModal?.();
                    }}
                    className="px-5 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-500 text-white font-semibold text-xs shadow-lg shadow-brand-600/30 transition-all flex items-center gap-2"
                  >
                    <Sparkles className="w-4 h-4" />
                    Entrar ou Criar Conta
                  </button>
                </div>
              </div>
            ) : (
              // Authenticated User Management
              <div className="space-y-6">
                {/* User Info Card */}
                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-[#14161f] border border-gray-200 dark:border-[#232838] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl overflow-hidden bg-gradient-to-tr from-brand-600 to-indigo-500 flex items-center justify-center text-white font-bold text-lg shadow-md shadow-brand-600/20 shrink-0">
                      {user.avatar_url ? (
                        <img src={user.avatar_url} alt={user.full_name} className="w-full h-full object-cover" />
                      ) : (
                        user.full_name ? user.full_name[0].toUpperCase() : 'U'
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-gray-900 dark:text-gray-100">
                          {user.full_name}
                        </span>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          <ShieldCheck className="w-3 h-3" />
                          Confirmado
                        </span>
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 font-mono">
                        @{user.username}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    <button
                      type="button"
                      onClick={handleMigrateNotesToUser}
                      disabled={isSyncingNotesToUser}
                      className="flex-1 sm:flex-none px-3 py-2 rounded-xl border border-brand-500/30 bg-brand-500/10 hover:bg-brand-500/20 text-brand-400 text-xs font-semibold transition-colors flex items-center justify-center gap-1.5"
                      title="Vincular notas salvas neste navegador à sua conta de usuário"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isSyncingNotesToUser ? 'animate-spin' : ''}`} />
                      <span>Vincular Notas</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        logout();
                        success('Sessão encerrada', 'Você saiu da sua conta.');
                      }}
                      className="flex-1 sm:flex-none px-3 py-2 rounded-xl border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs font-semibold transition-colors flex items-center justify-center gap-1.5"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>Sair</span>
                    </button>
                  </div>
                </div>

                {/* Section 1: Alterar Dados Cadastrais & Foto de Perfil */}
                <form onSubmit={handleUpdateProfile} className="p-4 rounded-2xl bg-white dark:bg-[#0f1118] border border-gray-200 dark:border-[#232838] space-y-4">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gray-900 dark:text-gray-100">
                    <User className="w-4 h-4 text-brand-400" />
                    Alterar Dados Cadastrais &amp; Foto de Perfil
                  </div>

                  {/* Foto de Perfil Uploader */}
                  <div className="p-3.5 rounded-xl bg-gray-50 dark:bg-[#14161f] border border-gray-200 dark:border-[#232838] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="relative group shrink-0">
                        {user.avatar_url ? (
                          <img
                            src={user.avatar_url}
                            alt={user.full_name}
                            className="w-14 h-14 rounded-2xl object-cover border-2 border-brand-500/40 shadow-md"
                          />
                        ) : (
                          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-brand-600 to-indigo-500 flex items-center justify-center text-white font-bold text-xl shadow-md">
                            {user.full_name ? user.full_name[0].toUpperCase() : 'U'}
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => avatarInputRef.current?.click()}
                          className="absolute inset-0 bg-black/60 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white"
                          title="Alterar Foto"
                        >
                          <Camera className="w-4 h-4" />
                        </button>
                      </div>

                      <div>
                        <div className="text-xs font-bold text-gray-900 dark:text-gray-100">
                          Foto de Perfil
                        </div>
                        <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                          Adicione uma foto (PNG, JPG, WEBP) para personalizar sua conta.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 w-full sm:w-auto">
                      <input
                        type="file"
                        ref={avatarInputRef}
                        accept="image/*"
                        onChange={handleAvatarFileSelect}
                        className="hidden"
                      />
                      <button
                        type="button"
                        onClick={() => avatarInputRef.current?.click()}
                        disabled={isUploadingAvatar}
                        className="flex-1 sm:flex-none px-3.5 py-1.5 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold flex items-center justify-center gap-1.5 shadow-sm transition-all"
                      >
                        <Camera className="w-3.5 h-3.5" />
                        <span>{isUploadingAvatar ? 'Processando...' : user.avatar_url ? 'Alterar Foto' : 'Adicionar Foto'}</span>
                      </button>

                      {user.avatar_url && (
                        <button
                          type="button"
                          onClick={handleRemoveAvatar}
                          disabled={isUploadingAvatar}
                          className="px-3 py-1.5 rounded-xl border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs font-semibold flex items-center gap-1 transition-colors"
                          title="Remover foto atual"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Remover</span>
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-gray-700 dark:text-gray-300">
                        Nome Completo
                      </label>
                      <input
                        type="text"
                        required
                        value={fullNameInput}
                        onChange={e => setFullNameInput(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-gray-50 dark:bg-[#14161f] border border-gray-200 dark:border-[#232838] text-xs text-gray-900 dark:text-gray-100 outline-none focus:border-brand-500"
                      />
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-medium text-gray-700 dark:text-gray-300">
                          Nome de Usuário (@username)
                        </label>
                        <span className="text-[10px] text-gray-400 font-mono flex items-center gap-1">
                          <Lock className="w-2.5 h-2.5" /> Fixo
                        </span>
                      </div>
                      <div className="relative">
                        <AtSign className="w-3.5 h-3.5 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          disabled
                          readOnly
                          value={user.username}
                          className="w-full pl-8 pr-8 py-2 rounded-xl bg-gray-100 dark:bg-[#0c0d12] border border-gray-200 dark:border-[#222] text-xs font-mono text-gray-400 cursor-not-allowed select-none opacity-80"
                        />
                        <Lock className="w-3 h-3 text-gray-500 absolute right-3 top-1/2 -translate-y-1/2" />
                      </div>
                      <p className="text-[10px] text-gray-500">O nome de usuário não pode ser alterado após o cadastro.</p>
                    </div>
                  </div>

                  <div className="flex justify-end pt-1">
                    <button
                      type="submit"
                      disabled={isUpdatingProfile}
                      className="px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold shadow-sm transition-all disabled:opacity-50"
                    >
                      {isUpdatingProfile ? 'Salvando...' : 'Salvar Alterações'}
                    </button>
                  </div>
                </form>

                {/* Section 2: Pergunta de Segurança & Data de Nascimento (Recuperação de Senha) */}
                <form onSubmit={handleUpdateSecurityInfo} className="p-4 rounded-2xl bg-[#080808] border border-[#1c1c1c] space-y-3.5">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gray-100">
                    <HelpCircle className="w-4 h-4 text-purple-400" />
                    Pergunta de Segurança &amp; Data de Nascimento
                  </div>
                  <p className="text-xs text-gray-400 leading-relaxed">
                    Essas informações são usadas para alterar ou recuperar sua senha de forma simples e segura, sem depender de envio de e-mails.
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-gray-300 flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-brand-400" />
                        Data de Nascimento
                      </label>
                      <input
                        type="date"
                        required
                        value={birthDateInput}
                        onChange={e => setBirthDateInput(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-[#0a0a0a] border border-[#1c1c1c] text-xs text-gray-100 outline-none focus:border-brand-500"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-medium text-gray-300">
                        Pergunta Secreta
                      </label>
                      <select
                        value={securityQuestionInput}
                        onChange={e => setSecurityQuestionInput(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-[#0a0a0a] border border-[#1c1c1c] text-xs text-gray-100 outline-none focus:border-brand-500"
                      >
                        {SECURITY_QUESTIONS.map((q, idx) => (
                          <option key={idx} value={q} className="bg-[#0f0f0f] text-gray-100">
                            {q}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-medium text-gray-300">
                      Resposta Secreta (nova ou confirmação)
                    </label>
                    <input
                      type="text"
                      required
                      value={securityAnswerInput}
                      onChange={e => setSecurityAnswerInput(e.target.value)}
                      placeholder="Digite sua resposta secreta..."
                      className="w-full px-3 py-2 rounded-xl bg-[#0a0a0a] border border-[#1c1c1c] text-xs text-gray-100 outline-none focus:border-brand-500"
                    />
                  </div>

                  <div className="flex justify-end pt-1">
                    <button
                      type="submit"
                      disabled={isUpdatingSecurity || !birthDateInput || !securityAnswerInput.trim()}
                      className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold shadow-sm transition-all disabled:opacity-50"
                    >
                      {isUpdatingSecurity ? 'Salvando...' : 'Salvar Dados de Segurança'}
                    </button>
                  </div>
                </form>

                {/* Section 3: Alterar Senha mediante Senha Atual */}
                <form onSubmit={handleChangePassword} className="p-4 rounded-2xl bg-white dark:bg-[#0f1118] border border-gray-200 dark:border-[#232838] space-y-3.5">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gray-900 dark:text-gray-100">
                    <Lock className="w-4 h-4 text-amber-400" />
                    Alterar Senha
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-medium text-gray-700 dark:text-gray-300">
                      Senha Atual
                    </label>
                    <div className="relative">
                      <input
                        type={showCurrentPass ? 'text' : 'password'}
                        required
                        value={currentPassword}
                        onChange={e => setCurrentPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full px-3 py-2 pr-9 rounded-xl bg-gray-50 dark:bg-[#14161f] border border-gray-200 dark:border-[#232838] text-xs text-gray-900 dark:text-gray-100 outline-none focus:border-brand-500"
                      />
                      <button
                        type="button"
                        onClick={() => setShowCurrentPass(!showCurrentPass)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-200"
                      >
                        {showCurrentPass ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-gray-700 dark:text-gray-300">
                        Nova Senha (mín. 6 dígitos)
                      </label>
                      <div className="relative">
                        <input
                          type={showNewPass ? 'text' : 'password'}
                          required
                          value={newPassword}
                          onChange={e => setNewPassword(e.target.value)}
                          placeholder="••••••••"
                          className="w-full px-3 py-2 pr-9 rounded-xl bg-gray-50 dark:bg-[#14161f] border border-gray-200 dark:border-[#232838] text-xs text-gray-900 dark:text-gray-100 outline-none focus:border-brand-500"
                        />
                        <button
                          type="button"
                          onClick={() => setShowNewPass(!showNewPass)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-200"
                        >
                          {showNewPass ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-medium text-gray-700 dark:text-gray-300">
                        Confirmar Nova Senha
                      </label>
                      <input
                        type={showNewPass ? 'text' : 'password'}
                        required
                        value={confirmNewPassword}
                        onChange={e => setConfirmNewPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full px-3 py-2 rounded-xl bg-gray-50 dark:bg-[#14161f] border border-gray-200 dark:border-[#232838] text-xs text-gray-900 dark:text-gray-100 outline-none focus:border-brand-500"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end pt-1">
                    <button
                      type="submit"
                      disabled={isChangingPassword}
                      className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold shadow-sm transition-all disabled:opacity-50"
                    >
                      {isChangingPassword ? 'Atualizando...' : 'Atualizar Senha'}
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>
        )}

        {/* ==================================================== */}
        {/* TAB: SERVIÇO DE E-MAIL (ENVIO REAL DE CONFIRMAÇÃO)   */}
        {/* Tab 2: Editor Appearance */}
        {activeTab === 'editor' && (
          <div className="space-y-4">
            {/* Font Family */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-2">
                Família Tipográfica
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'sans', label: 'Inter (Sans-serif)', desc: 'Moderno & Limpo' },
                  { id: 'serif', label: 'Merriweather (Serif)', desc: 'Editorial & Leitura' },
                  { id: 'mono', label: 'JetBrains (Mono)', desc: 'Código & Técnico' },
                ].map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => updateSettings({ fontFamily: f.id as any })}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      settings.fontFamily === f.id
                        ? 'bg-brand-500/10 border-brand-500 text-brand-400 ring-1 ring-brand-500/50'
                        : 'border-gray-200 dark:border-[#232838] bg-gray-50 dark:bg-[#14161f] text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-[#1a1d28]'
                    }`}
                  >
                    <div className="text-xs font-semibold">{f.label}</div>
                    <div className="text-[10px] text-gray-500 mt-0.5">{f.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Font Size */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-2">
                Tamanho da Fonte
              </label>
              <div className="grid grid-cols-4 gap-2">
                {[
                  { id: 'sm', label: 'Pequeno (14px)' },
                  { id: 'base', label: 'Médio (16px)' },
                  { id: 'lg', label: 'Grande (18px)' },
                  { id: 'xl', label: 'Extra (20px)' },
                ].map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => updateSettings({ fontSize: s.id as any })}
                    className={`p-2.5 rounded-xl border text-center text-xs font-medium transition-all ${
                      settings.fontSize === s.id
                        ? 'bg-brand-500/10 border-brand-500 text-brand-400 ring-1 ring-brand-500/50'
                        : 'border-gray-200 dark:border-[#232838] bg-gray-50 dark:bg-[#14161f] text-gray-700 dark:text-gray-300'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Line Width */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-2">
                Largura da Área de Escrita
              </label>
              <div className="grid grid-cols-4 gap-2">
                {[
                  { id: 'narrow', label: 'Estreita' },
                  { id: 'normal', label: 'Normal' },
                  { id: 'wide', label: 'Larga' },
                  { id: 'full', label: 'Total' },
                ].map((w) => (
                  <button
                    key={w.id}
                    type="button"
                    onClick={() => updateSettings({ editorWidth: w.id as any })}
                    className={`p-2.5 rounded-xl border text-center text-xs font-medium transition-all ${
                      settings.editorWidth === w.id
                        ? 'bg-brand-500/10 border-brand-500 text-brand-400 ring-1 ring-brand-500/50'
                        : 'border-gray-200 dark:border-[#232838] bg-gray-50 dark:bg-[#14161f] text-gray-700 dark:text-gray-300'
                    }`}
                  >
                    {w.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => updateSettings(defaultSettings)}
                className="text-xs text-gray-500 hover:text-brand-400 flex items-center gap-1 transition-colors"
              >
                <RotateCcw className="w-3 h-3" />
                Restaurar padrões
              </button>
            </div>
          </div>
        )}

        {/* Tab 3: Cloud Sync */}
        {activeTab === 'cloud' && (
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-200 space-y-2">
              <div className="flex items-center gap-2 font-bold text-emerald-400 text-sm">
                <CheckCircle2 className="w-5 h-5" />
                Sincronização em Nuvem Ativa
              </div>
              <p className="leading-relaxed opacity-95">
                O 7NotPad conta com sincronização global em tempo real ativa. Qualquer link compartilhado criado em seu navegador funcionará instantaneamente em qualquer outro computador, celular ou navegador com alta disponibilidade e segurança.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-gray-50 dark:bg-[#14161f] border border-gray-200 dark:border-[#232838] space-y-2.5 text-xs text-gray-600 dark:text-gray-300">
              <div className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-1.5">
                <Database className="w-4 h-4 text-brand-400" />
                Detalhes da Conexão em Nuvem:
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
                <div>Região: <span className="text-brand-400">Global (Alta Disponibilidade)</span></div>
                <div>Criptografia: <span className="text-brand-400">AES-GCM / SSL Ativo</span></div>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-brand-500/5 border border-brand-500/20 flex items-center justify-between">
              <div>
                <div className="text-xs font-bold text-gray-900 dark:text-gray-100">
                  Sincronizar Todas as Notas Locais Agora
                </div>
                <div className="text-[11px] text-gray-500 dark:text-gray-400">
                  Envia todas as notas salvas no seu navegador para o servidor em nuvem
                </div>
              </div>

              <button
                type="button"
                onClick={handleMigrateToFirebase}
                disabled={isMigrating}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold shadow-sm transition-all disabled:opacity-50 shrink-0"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isMigrating ? 'animate-spin' : ''}`} />
                <span>{isMigrating ? 'Sincronizando...' : 'Sincronizar Tudo'}</span>
              </button>
            </div>
          </div>
        )}

        {/* Tab 4: Security & Anonymous Identity */}
        {activeTab === 'security' && (
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-gray-50 dark:bg-[#14161f] border border-gray-200 dark:border-[#232838] space-y-3">
              <div className="flex items-center gap-2 text-brand-400 font-semibold text-xs uppercase tracking-wider">
                <Key className="w-4 h-4" />
                Seu Token de Proprietário (Owner Token)
              </div>
              <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                Este token aleatório e criptográfico identifica seu navegador com segurança. É ele que autoriza você a editar e excluir suas notas sem precisar de cadastro ou e-mail.
              </p>

              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={ownerToken}
                  className="flex-1 px-3 py-2 rounded-xl bg-white dark:bg-[#0d0e14] border border-gray-200 dark:border-[#232838] text-xs font-mono text-gray-700 dark:text-gray-300 outline-none"
                />
                <button
                  type="button"
                  onClick={handleCopyOwnerToken}
                  className="px-3 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-xs font-medium flex items-center gap-1.5 transition-colors"
                >
                  {copiedToken ? <Check className="w-3.5 h-3.5" /> : <Key className="w-3.5 h-3.5" />}
                  {copiedToken ? 'Copiado!' : 'Copiar'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Tab 5: Backup & Export */}
        {activeTab === 'backup' && (
          <div className="space-y-4">
            <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
              Garanta a segurança de suas anotações exportando um arquivo de backup completo em formato JSON ou transferindo suas notas para outro computador/navegador.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={exportNotesToJson}
                className="p-4 rounded-xl border border-gray-200 dark:border-[#232838] bg-gray-50 dark:bg-[#14161f] hover:bg-gray-100 dark:hover:bg-[#1a1d28] text-left transition-colors group"
              >
                <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center mb-2">
                  <Download className="w-4 h-4" />
                </div>
                <div className="text-xs font-bold text-gray-900 dark:text-gray-100">
                  Exportar Backup (.json)
                </div>
                <div className="text-[11px] text-gray-500 mt-0.5">
                  Baixe todas as suas notas e anexos em um único arquivo
                </div>
              </button>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="p-4 rounded-xl border border-gray-200 dark:border-[#232838] bg-gray-50 dark:bg-[#14161f] hover:bg-gray-100 dark:hover:bg-[#1a1d28] text-left transition-colors group"
              >
                <div className="w-9 h-9 rounded-xl bg-brand-500/10 text-brand-400 flex items-center justify-center mb-2">
                  <Upload className="w-4 h-4" />
                </div>
                <div className="text-xs font-bold text-gray-900 dark:text-gray-100">
                  Importar Backup (.json)
                </div>
                <div className="text-[11px] text-gray-500 mt-0.5">
                  Restaure notas previamente exportadas
                </div>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                onChange={handleFileImport}
                className="hidden"
              />
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex justify-end pt-2 border-t border-gray-100 dark:border-[#232838]">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-xs font-medium shadow-md shadow-brand-600/20 transition-all"
          >
            Concluir
          </button>
        </div>
      </div>
    </Modal>
  );
};

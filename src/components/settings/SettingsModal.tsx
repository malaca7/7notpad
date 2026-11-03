import React, { useState, useRef, useEffect } from 'react';
import { Modal } from '../common/Modal';
import { useEditorSettings } from '../../hooks/useEditorSettings';
import { firebaseConfig } from '../../lib/firebase';
import { getOrCreateOwnerToken } from '../../lib/crypto';
import { exportNotesToJson, importNotesFromJson } from '../../lib/exportImport';
import { StorageService } from '../../lib/storage';
import { AuthService } from '../../lib/authService';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../common/Toast';
import { CodeInput } from '../auth/CodeInput';
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
  Mail,
  Lock,
  LogOut,
  ShieldCheck,
  Eye,
  EyeOff,
  Sparkles
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
  const [usernameInput, setUsernameInput] = useState('');
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);

  // Email Change states
  const [newEmailInput, setNewEmailInput] = useState('');
  const [emailChangeStep, setEmailChangeStep] = useState<'request' | 'verify'>('request');
  const [emailChangeCode, setEmailChangeCode] = useState('');
  const [isSendingEmailCode, setIsSendingEmailCode] = useState(false);
  const [isConfirmingEmailCode, setIsConfirmingEmailCode] = useState(false);

  // Password Change states
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [showCurrentPass, setShowCurrentPass] = useState(false);
  const [showNewPass, setShowNewPass] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const ownerToken = getOrCreateOwnerToken();

  useEffect(() => {
    if (user) {
      setFullNameInput(user.full_name);
      setUsernameInput(user.username);
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
        'Migração Concluída!',
        `${res.migratedNotes} notas e ${res.migratedShares} compartilhamentos sincronizados com o Firebase.`
      );
    } catch (err: any) {
      error('Erro na migração', err?.message || 'Falha ao migrar para o Firebase.');
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
  // ETAPA 4: Update Profile (Nome Completo & Username)
  // ----------------------------------------------------
  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setIsUpdatingProfile(true);
    try {
      const res = await AuthService.updateProfile({
        userId: user.id,
        fullName: fullNameInput,
        username: usernameInput
      });

      if (res.success) {
        success('Perfil Atualizado!', 'Suas informações cadastrais foram salvas com sucesso.');
      } else {
        error('Erro ao atualizar', res.error || 'Não foi possível alterar seu perfil.');
      }
    } finally {
      setIsUpdatingProfile(false);
    }
  };

  // ----------------------------------------------------
  // ETAPA 4: Request Email Change (6-digit code to new email)
  // ----------------------------------------------------
  const handleRequestEmailChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setIsSendingEmailCode(true);
    try {
      const res = await AuthService.requestEmailChange({
        userId: user.id,
        newEmail: newEmailInput
      });

      if (res.success) {
        setEmailChangeStep('verify');
        setEmailChangeCode('');
        success('Código Enviado!', `Enviamos o código de 6 dígitos para o novo e-mail ${newEmailInput}.`);
      } else {
        error('Erro ao solicitar troca', res.error || 'Não foi possível solicitar a troca de e-mail.');
      }
    } finally {
      setIsSendingEmailCode(false);
    }
  };

  // ETAPA 4: Confirm Email Change
  const handleConfirmEmailChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (emailChangeCode.length !== 6) {
      error('Código incompleto', 'Digite os 6 dígitos do código de confirmação.');
      return;
    }

    setIsConfirmingEmailCode(true);
    try {
      const res = await AuthService.confirmEmailChange({
        currentEmail: user.email,
        code: emailChangeCode
      });

      if (res.success) {
        success('E-mail alterado!', `Seu e-mail principal foi atualizado para ${res.newEmail}.`);
        setEmailChangeStep('request');
        setNewEmailInput('');
        setEmailChangeCode('');
      } else {
        error('Código inválido', res.error || 'Não foi possível validar o código.');
      }
    } finally {
      setIsConfirmingEmailCode(false);
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
    if (newPassword.length < 8) {
      error('Senha muito curta', 'A nova senha deve ter no mínimo 8 caracteres.');
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
              Conta, aparência do editor, nuvem Firebase e segurança
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
            Nuvem Firebase
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
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-brand-600 to-indigo-500 flex items-center justify-center text-white font-bold text-lg shadow-md shadow-brand-600/20">
                      {user.full_name ? user.full_name[0].toUpperCase() : 'U'}
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
                        @{user.username} &bull; {user.email}
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

                {/* Section 1: Alterar Dados Cadastrais */}
                <form onSubmit={handleUpdateProfile} className="p-4 rounded-2xl bg-white dark:bg-[#0f1118] border border-gray-200 dark:border-[#232838] space-y-3.5">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gray-900 dark:text-gray-100">
                    <User className="w-4 h-4 text-brand-400" />
                    Alterar Dados Cadastrais
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
                      <label className="text-xs font-medium text-gray-700 dark:text-gray-300">
                        Nome de Usuário (@username)
                      </label>
                      <div className="relative">
                        <AtSign className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          required
                          value={usernameInput}
                          onChange={e => setUsernameInput(e.target.value.toLowerCase().replace(/\s+/g, ''))}
                          className="w-full pl-8 pr-3 py-2 rounded-xl bg-gray-50 dark:bg-[#14161f] border border-gray-200 dark:border-[#232838] text-xs text-gray-900 dark:text-gray-100 outline-none focus:border-brand-500"
                        />
                      </div>
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

                {/* Section 2: Alterar E-mail com Confirmação por Código */}
                <div className="p-4 rounded-2xl bg-white dark:bg-[#0f1118] border border-gray-200 dark:border-[#232838] space-y-3.5">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gray-900 dark:text-gray-100">
                    <Mail className="w-4 h-4 text-purple-400" />
                    Alterar E-mail (Exige Código de 6 Dígitos)
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                    O e-mail principal só é alterado após você digitar o código de verificação enviado para o novo endereço.
                  </p>

                  {emailChangeStep === 'request' ? (
                    <form onSubmit={handleRequestEmailChange} className="space-y-3">
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-gray-700 dark:text-gray-300">
                          Novo Endereço de E-mail
                        </label>
                        <input
                          type="email"
                          required
                          value={newEmailInput}
                          onChange={e => setNewEmailInput(e.target.value)}
                          placeholder="novo.email@exemplo.com"
                          className="w-full px-3 py-2 rounded-xl bg-gray-50 dark:bg-[#14161f] border border-gray-200 dark:border-[#232838] text-xs text-gray-900 dark:text-gray-100 outline-none focus:border-brand-500"
                        />
                      </div>
                      <div className="flex justify-end">
                        <button
                          type="submit"
                          disabled={isSendingEmailCode || !newEmailInput}
                          className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold shadow-sm transition-all disabled:opacity-50"
                        >
                          {isSendingEmailCode ? 'Enviando Código...' : 'Enviar Código para o Novo E-mail'}
                        </button>
                      </div>
                    </form>
                  ) : (
                    <form onSubmit={handleConfirmEmailChange} className="space-y-3 text-center">
                      <p className="text-xs text-gray-400">
                        Código enviado para <strong className="text-white">{newEmailInput}</strong>. Digite os 6 dígitos:
                      </p>
                      <div className="py-2">
                        <CodeInput
                          value={emailChangeCode}
                          onChange={setEmailChangeCode}
                          disabled={isConfirmingEmailCode}
                        />
                      </div>
                      <div className="flex items-center justify-between pt-1">
                        <button
                          type="button"
                          onClick={() => setEmailChangeStep('request')}
                          className="text-xs text-gray-400 hover:text-gray-200"
                        >
                          Cancelar troca
                        </button>
                        <button
                          type="submit"
                          disabled={isConfirmingEmailCode || emailChangeCode.length !== 6}
                          className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-sm transition-all disabled:opacity-50"
                        >
                          {isConfirmingEmailCode ? 'Validando...' : 'Confirmar e Atualizar E-mail'}
                        </button>
                      </div>
                    </form>
                  )}
                </div>

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
                        Nova Senha (min. 8 caracteres)
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

        {/* Tab 3: Firebase Cloud */}
        {activeTab === 'cloud' && (
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-200 space-y-2">
              <div className="flex items-center gap-2 font-bold text-emerald-400 text-sm">
                <CheckCircle2 className="w-5 h-5" />
                Nuvem Firebase Conectada com Sucesso
              </div>
              <p className="leading-relaxed opacity-95">
                O 7NotPad está integrado ao projeto <strong>{firebaseConfig.projectId}</strong> no Firebase Firestore. Qualquer link compartilhado criado em seu navegador funcionará instantaneamente em qualquer outro computador, celular ou navegador!
              </p>
            </div>

            <div className="p-4 rounded-xl bg-gray-50 dark:bg-[#14161f] border border-gray-200 dark:border-[#232838] space-y-2.5 text-xs text-gray-600 dark:text-gray-300">
              <div className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-1.5">
                <Database className="w-4 h-4 text-brand-400" />
                Detalhes do Banco de Dados:
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
                <div>Project ID: <span className="text-brand-400">{firebaseConfig.projectId}</span></div>
                <div>Auth Domain: <span className="text-brand-400">{firebaseConfig.authDomain}</span></div>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-brand-500/5 border border-brand-500/20 flex items-center justify-between">
              <div>
                <div className="text-xs font-bold text-gray-900 dark:text-gray-100">
                  Sincronizar Todas as Notas Locais Agora
                </div>
                <div className="text-[11px] text-gray-500 dark:text-gray-400">
                  Envia todas as notas salvas no seu navegador para o banco Firebase
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

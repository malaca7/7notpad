import React, { useState, useRef, useEffect } from 'react';
import { Modal } from '../common/Modal';
import { useEditorSettings } from '../../hooks/useEditorSettings';
import { firebaseConfig } from '../../lib/firebase';
import { getOrCreateOwnerToken } from '../../lib/crypto';
import { exportNotesToJson, importNotesFromJson } from '../../lib/exportImport';
import { StorageService } from '../../lib/storage';
import { AuthService } from '../../lib/authService';
import { EmailService, getEmailConfig, saveEmailConfig, DEFAULT_APPS_SCRIPT_DEPLOYMENT_ID, DEFAULT_APPS_SCRIPT_URL } from '../../lib/emailService';
import type { EmailProviderConfig } from '../../types/auth';
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
  Sparkles,
  Send,
  HelpCircle,
  ExternalLink
} from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNotesImported?: () => void;
  initialTab?: 'account' | 'email' | 'editor' | 'cloud' | 'security' | 'backup';
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

  const [activeTab, setActiveTab] = useState<'account' | 'email' | 'editor' | 'cloud' | 'security' | 'backup'>(initialTab);
  const [copiedToken, setCopiedToken] = useState(false);
  const [isMigrating, setIsMigrating] = useState(false);
  const [isSyncingNotesToUser, setIsSyncingNotesToUser] = useState(false);

  // Email Config states
  const [emailConfig, setEmailConfig] = useState<EmailProviderConfig>(() => getEmailConfig());
  const [testEmailAddress, setTestEmailAddress] = useState(user?.email || 'malaca7x@gmail.com');
  const [isSendingTestEmail, setIsSendingTestEmail] = useState(false);
  const [showAppsScriptGuide, setShowAppsScriptGuide] = useState(true);

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

  // ----------------------------------------------------
  // EMAIL SETTINGS HANDLERS
  // ----------------------------------------------------
  const handleSaveEmailConfig = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    saveEmailConfig(emailConfig);
    success('Configuração Salva!', `Provedor de envio definido como ${emailConfig.provider.toUpperCase()}.`);
  };

  const handleSendTestEmail = async () => {
    if (!testEmailAddress || !testEmailAddress.includes('@')) {
      error('E-mail inválido', 'Informe um endereço de e-mail válido para receber o teste.');
      return;
    }

    setIsSendingTestEmail(true);
    try {
      saveEmailConfig(emailConfig);
      const res = await EmailService.sendTestEmail({
        to: testEmailAddress,
        fullName: user?.full_name || 'Usuário 7NotPad'
      });

      if (res.success) {
        success(
          'E-mail de Teste Disparado!',
          `Código emitido: ${res.testCode}. Verifique sua Caixa de Entrada / Spam ou o aviso na tela.`
        );
      } else {
        error(
          'Falha no envio do teste',
          res.error || 'Não foi possível entregar o e-mail via provedor externo. Verifique sua chave API ou Webhook.'
        );
      }
    } catch (err: any) {
      error('Erro ao enviar teste', err?.message || 'Falha inesperada.');
    } finally {
      setIsSendingTestEmail(false);
    }
  };

  const appsScriptCode = `// 1. Clique em "Executar" (▷) com esta função selecionada para autorizar o Gmail:
function autorizarETestarEmail() {
  var email = Session.getActiveUser().getEmail() || "malacarogeriojr@gmail.com";
  MailApp.sendEmail({
    to: email,
    subject: "7NotPad — Permissao do Gmail Autorizada!",
    body: "Seu Google Apps Script do 7NotPad esta autorizado e pronto para enviar codigos de 6 digitos."
  });
}

function doGet(e) {
  return processarEnvio(e);
}

function doPost(e) {
  return processarEnvio(e);
}

function processarEnvio(e) {
  try {
    var data = {};
    if (e && e.postData && e.postData.contents) {
      data = JSON.parse(e.postData.contents);
    } else if (e && e.parameter) {
      data = e.parameter;
    }

    var to = data.to;
    if (!to) {
      return ContentService
        .createTextOutput(JSON.stringify({ success: false, error: "Destinatario (to) ausente" }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    var subject = data.subject || "7NotPad — Codigo de Confirmacao";
    var body = data.text || (data.code ? "Seu codigo de verificacao de 6 digitos do 7NotPad e: " + data.code : "Notificacao 7NotPad");
    var htmlBody = data.html || "";

    var options = { to: to, subject: subject, body: body };
    if (htmlBody) options.htmlBody = htmlBody;

    MailApp.sendEmail(options);

    return ContentService
      .createTextOutput(JSON.stringify({ success: true, message: "E-mail enviado pelo Gmail para " + to }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}`;

  const handleCopyAppsScript = () => {
    navigator.clipboard.writeText(appsScriptCode);
    success('Script copiado!', 'Cole o código no seu projeto do Google Apps Script.');
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
            onClick={() => setActiveTab('email')}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'email'
                ? 'border-brand-500 text-brand-500'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            <Mail className="w-3.5 h-3.5" />
            Serviço de E-mail
            {emailConfig.provider !== 'simulated' && (
              <span className="w-2 h-2 rounded-full bg-emerald-500 ml-0.5" />
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
        {/* ==================================================== */}
        {activeTab === 'email' && (
          <div className="space-y-6">
            {/* Header info */}
            <div className="p-4 rounded-2xl bg-brand-500/10 border border-brand-500/20 space-y-2">
              <div className="flex items-center gap-2 text-brand-400 font-bold text-xs uppercase tracking-wider">
                <Mail className="w-4 h-4" />
                Entrega de E-mails Transacionais
              </div>
              <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed">
                Como o 7NotPad é hospedado como aplicação estática (GitHub Pages), o navegador não pode abrir conexões diretas via portas SMTP convencionais. Para receber os códigos de 6 dígitos e links de recuperação diretamente na sua caixa de entrada do Gmail, selecione e configure um provedor abaixo:
              </p>
            </div>

            {/* Provider Selector Cards */}
            <div className="space-y-2.5">
              <label className="text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300">
                Selecione o Provedor de Envio
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* 1. Google Apps Script */}
                <button
                  type="button"
                  onClick={() => setEmailConfig(prev => ({ ...prev, provider: 'webhook' }))}
                  className={`p-3.5 rounded-xl border text-left transition-all relative ${
                    emailConfig.provider === 'webhook'
                      ? 'border-brand-500 bg-brand-500/10 shadow-sm shadow-brand-500/20 ring-1 ring-brand-500/50'
                      : 'border-gray-200 dark:border-[#232838] bg-white dark:bg-[#12141c] hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-gray-900 dark:text-gray-100 flex items-center gap-1.5">
                      <span>Google Apps Script</span>
                      <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-500/20 text-emerald-400 font-bold">100% Grátis</span>
                    </span>
                    {emailConfig.provider === 'webhook' && <Check className="w-4 h-4 text-brand-400" />}
                  </div>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-normal">
                    Envia diretamente pelo seu Gmail sem cartão, sem limites diários restritivos e sem cair no spam.
                  </p>
                </button>

                {/* 2. Brevo */}
                <button
                  type="button"
                  onClick={() => setEmailConfig(prev => ({ ...prev, provider: 'brevo' }))}
                  className={`p-3.5 rounded-xl border text-left transition-all ${
                    emailConfig.provider === 'brevo'
                      ? 'border-brand-500 bg-brand-500/10 shadow-sm shadow-brand-500/20 ring-1 ring-brand-500/50'
                      : 'border-gray-200 dark:border-[#232838] bg-white dark:bg-[#12141c] hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-gray-900 dark:text-gray-100 flex items-center gap-1.5">
                      <span>Brevo (Sendinblue)</span>
                      <span className="px-1.5 py-0.5 rounded text-[10px] bg-blue-500/20 text-blue-400 font-bold">300/dia Grátis</span>
                    </span>
                    {emailConfig.provider === 'brevo' && <Check className="w-4 h-4 text-brand-400" />}
                  </div>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-normal">
                    API REST com suporte nativo a chamadas via CORS direto pelo navegador.
                  </p>
                </button>

                {/* 3. Resend */}
                <button
                  type="button"
                  onClick={() => setEmailConfig(prev => ({ ...prev, provider: 'resend' }))}
                  className={`p-3.5 rounded-xl border text-left transition-all ${
                    emailConfig.provider === 'resend'
                      ? 'border-brand-500 bg-brand-500/10 shadow-sm shadow-brand-500/20 ring-1 ring-brand-500/50'
                      : 'border-gray-200 dark:border-[#232838] bg-white dark:bg-[#12141c] hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-gray-900 dark:text-gray-100 flex items-center gap-1.5">
                      <span>Resend API</span>
                      <span className="px-1.5 py-0.5 rounded text-[10px] bg-purple-500/20 text-purple-400 font-bold">3.000/mês</span>
                    </span>
                    {emailConfig.provider === 'resend' && <Check className="w-4 h-4 text-brand-400" />}
                  </div>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-normal">
                    Serviço moderno para desenvolvedores (requer chave API re_...).
                  </p>
                </button>

                {/* 4. Modo Simulado / Em Tela */}
                <button
                  type="button"
                  onClick={() => setEmailConfig(prev => ({ ...prev, provider: 'simulated' }))}
                  className={`p-3.5 rounded-xl border text-left transition-all ${
                    emailConfig.provider === 'simulated'
                      ? 'border-brand-500 bg-brand-500/10 shadow-sm shadow-brand-500/20 ring-1 ring-brand-500/50'
                      : 'border-gray-200 dark:border-[#232838] bg-white dark:bg-[#12141c] hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-gray-900 dark:text-gray-100 flex items-center gap-1.5">
                      <span>Modo Simulado / Tela</span>
                      <span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-500/20 text-amber-400 font-bold">Instantâneo</span>
                    </span>
                    {emailConfig.provider === 'simulated' && <Check className="w-4 h-4 text-brand-400" />}
                  </div>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-normal">
                    Exibe o código de 6 dígitos diretamente na notificação da tela para testes rápidos sem depender de e-mail.
                  </p>
                </button>
              </div>
            </div>

            {/* Config Fields depending on Provider */}
            <form onSubmit={handleSaveEmailConfig} className="p-4 rounded-2xl bg-white dark:bg-[#0f1118] border border-gray-200 dark:border-[#232838] space-y-4">
              {emailConfig.provider === 'webhook' && (
                <div className="space-y-3">
                  <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex flex-col gap-1 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-emerald-400 flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4" />
                        Google Apps Script Configurado e Ativo
                      </span>
                      <button
                        type="button"
                        onClick={() => setEmailConfig({ provider: 'webhook', webhookUrl: DEFAULT_APPS_SCRIPT_URL })}
                        className="text-[10px] text-emerald-400 hover:underline font-medium"
                      >
                        Restaurar URL Padrão
                      </button>
                    </div>
                    <div className="text-[11px] text-gray-500 dark:text-gray-400 font-mono break-all">
                      ID da Implantação: {DEFAULT_APPS_SCRIPT_DEPLOYMENT_ID}
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                      URL do App da Web (Google Apps Script)
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowAppsScriptGuide(!showAppsScriptGuide)}
                      className="text-[11px] text-brand-400 hover:underline flex items-center gap-1 font-medium"
                    >
                      <HelpCircle className="w-3.5 h-3.5" />
                      {showAppsScriptGuide ? 'Ocultar Tutorial' : 'Ver Código / Tutorial'}
                    </button>
                  </div>

                  <input
                    type="url"
                    value={emailConfig.webhookUrl || DEFAULT_APPS_SCRIPT_URL}
                    onChange={e => setEmailConfig(prev => ({ ...prev, webhookUrl: e.target.value }))}
                    placeholder="https://script.google.com/macros/s/AKfycbx.../exec"
                    className="w-full px-3 py-2.5 rounded-xl bg-gray-50 dark:bg-[#14161f] border border-gray-200 dark:border-[#232838] text-xs font-mono text-gray-900 dark:text-gray-100 outline-none focus:border-brand-500"
                  />

                  {showAppsScriptGuide && (
                    <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-700/80 text-slate-200 text-xs space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-white flex items-center gap-1.5">
                          <Sparkles className="w-4 h-4 text-brand-400" />
                          Passo a Passo (Google Apps Script Grátis):
                        </span>
                        <a
                          href="https://script.google.com/home"
                          target="_blank"
                          rel="noreferrer"
                          className="text-[11px] text-brand-400 hover:underline flex items-center gap-1"
                        >
                          Abrir Apps Script <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                      <ol className="list-decimal list-inside space-y-1.5 text-[11px] text-slate-300">
                        <li>Acesse <strong>script.google.com</strong> e clique em <strong>+ Novo Projeto</strong>.</li>
                        <li>Apague todo o código que estiver lá e cole o código abaixo:</li>
                      </ol>

                      <div className="relative">
                        <pre className="p-3 rounded-lg bg-black/60 border border-slate-800 text-[10px] font-mono text-emerald-400 overflow-x-auto max-h-40">
                          {appsScriptCode}
                        </pre>
                        <button
                          type="button"
                          onClick={handleCopyAppsScript}
                          className="absolute right-2 top-2 px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-white text-[10px] font-semibold border border-slate-700"
                        >
                          Copiar Código
                        </button>
                      </div>

                      <ol start={3} className="list-decimal list-inside space-y-1.5 text-[11px] text-slate-300">
                        <li>No topo do Apps Script, clique em <strong>▷ Executar</strong> (com <code>autorizarETestarEmail</code> selecionado) e aceite as permissões da sua conta Gmail (<em>Revisar permissões &rarr; Avançado &rarr; Acessar projeto</em>).</li>
                        <li>Clique em <strong>Implantar</strong> &rarr; <strong>Gerenciar implantações</strong> &rarr; ícone de <strong>Lápis (Editar)</strong>.</li>
                        <li>Em <em>Versão</em>, escolha <strong>Nova versão</strong> (muito importante!).</li>
                        <li>Em <em>Quem pode acessar</em>, selecione <strong>Qualquer pessoa (Anyone)</strong> e clique em <strong>Implantar</strong>.</li>
                      </ol>
                    </div>
                  )}
                </div>
              )}

              {emailConfig.provider === 'brevo' && (
                <div className="space-y-3">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                        Chave API do Brevo (API Key)
                      </label>
                      <a
                        href="https://app.brevo.com/settings/keys/api"
                        target="_blank"
                        rel="noreferrer"
                        className="text-[11px] text-brand-400 hover:underline flex items-center gap-1"
                      >
                        Obter chave no Brevo <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                    <input
                      type="password"
                      value={emailConfig.brevoApiKey || ''}
                      onChange={e => setEmailConfig(prev => ({ ...prev, brevoApiKey: e.target.value }))}
                      placeholder="xkeysib-..."
                      className="w-full px-3 py-2.5 rounded-xl bg-gray-50 dark:bg-[#14161f] border border-gray-200 dark:border-[#232838] text-xs font-mono text-gray-900 dark:text-gray-100 outline-none focus:border-brand-500"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-gray-700 dark:text-gray-300">
                        E-mail de Remetente (cadastrado no Brevo)
                      </label>
                      <input
                        type="email"
                        value={emailConfig.brevoSenderEmail || ''}
                        onChange={e => setEmailConfig(prev => ({ ...prev, brevoSenderEmail: e.target.value }))}
                        placeholder="seu-email@dominio.com"
                        className="w-full px-3 py-2 rounded-xl bg-gray-50 dark:bg-[#14161f] border border-gray-200 dark:border-[#232838] text-xs text-gray-900 dark:text-gray-100 outline-none"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-gray-700 dark:text-gray-300">
                        Nome do Remetente
                      </label>
                      <input
                        type="text"
                        value={emailConfig.brevoSenderName || '7NotPad'}
                        onChange={e => setEmailConfig(prev => ({ ...prev, brevoSenderName: e.target.value }))}
                        placeholder="7NotPad"
                        className="w-full px-3 py-2 rounded-xl bg-gray-50 dark:bg-[#14161f] border border-gray-200 dark:border-[#232838] text-xs text-gray-900 dark:text-gray-100 outline-none"
                      />
                    </div>
                  </div>
                </div>
              )}

              {emailConfig.provider === 'resend' && (
                <div className="space-y-3">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                        Chave API do Resend (API Key)
                      </label>
                      <a
                        href="https://resend.com/api-keys"
                        target="_blank"
                        rel="noreferrer"
                        className="text-[11px] text-brand-400 hover:underline flex items-center gap-1"
                      >
                        Obter chave no Resend <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                    <input
                      type="password"
                      value={emailConfig.resendApiKey || ''}
                      onChange={e => setEmailConfig(prev => ({ ...prev, resendApiKey: e.target.value }))}
                      placeholder="re_..."
                      className="w-full px-3 py-2.5 rounded-xl bg-gray-50 dark:bg-[#14161f] border border-gray-200 dark:border-[#232838] text-xs font-mono text-gray-900 dark:text-gray-100 outline-none focus:border-brand-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-medium text-gray-700 dark:text-gray-300">
                      Remetente (From)
                    </label>
                    <input
                      type="text"
                      value={emailConfig.resendFromEmail || '7NotPad <onboarding@resend.dev>'}
                      onChange={e => setEmailConfig(prev => ({ ...prev, resendFromEmail: e.target.value }))}
                      placeholder="7NotPad <onboarding@resend.dev>"
                      className="w-full px-3 py-2 rounded-xl bg-gray-50 dark:bg-[#14161f] border border-gray-200 dark:border-[#232838] text-xs text-gray-900 dark:text-gray-100 outline-none"
                    />
                  </div>
                </div>
              )}

              {emailConfig.provider === 'simulated' && (
                <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 leading-relaxed">
                  <strong>Modo Simulado Ativo:</strong> Nenhum serviço externo é chamado. Toda vez que um código de 6 dígitos é emitido (cadastro ou redefinição de senha), ele é exibido automaticamente no canto da tela com botão de copiar para facilitar testes imediatos.
                </div>
              )}

              <div className="flex justify-end pt-1">
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold shadow-md shadow-brand-600/20 transition-all flex items-center gap-1.5"
                >
                  <Check className="w-3.5 h-3.5" />
                  Salvar Configuração de E-mail
                </button>
              </div>
            </form>

            {/* Test Email Section */}
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-[#14161f] border border-gray-200 dark:border-[#232838] space-y-3">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gray-900 dark:text-gray-100">
                <Send className="w-4 h-4 text-brand-400" />
                Testar Envio Imediato
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Dispare um e-mail de teste com código de 6 dígitos para verificar se a entrega está funcionando diretamente para a sua caixa de entrada.
              </p>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <input
                  type="email"
                  value={testEmailAddress}
                  onChange={e => setTestEmailAddress(e.target.value)}
                  placeholder="malaca7x@gmail.com"
                  className="flex-1 px-3 py-2.5 rounded-xl bg-white dark:bg-[#0f1118] border border-gray-200 dark:border-[#232838] text-xs text-gray-900 dark:text-gray-100 outline-none focus:border-brand-500"
                />
                <button
                  type="button"
                  onClick={handleSendTestEmail}
                  disabled={isSendingTestEmail}
                  className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-md shadow-emerald-600/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <Send className={`w-3.5 h-3.5 ${isSendingTestEmail ? 'animate-bounce' : ''}`} />
                  <span>{isSendingTestEmail ? 'Enviando...' : 'Enviar E-mail de Teste'}</span>
                </button>
              </div>
            </div>
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

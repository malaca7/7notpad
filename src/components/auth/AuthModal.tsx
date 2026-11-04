import React, { useState, useEffect } from 'react';
import { 
  User, 
  Lock, 
  Mail, 
  ArrowRight, 
  CheckCircle2, 
  AlertCircle, 
  RotateCcw, 
  KeyRound, 
  Link as LinkIcon, 
  Eye, 
  EyeOff, 
  AtSign,
  ShieldCheck,
  Sparkles,
  Check
} from 'lucide-react';
import { Modal } from '../common/Modal';
import { CodeInput } from './CodeInput';
import { AuthService, isValidEmail, isValidUsername } from '../../lib/authService';
import { getLastDispatchedEmail } from '../../lib/emailService';

export type AuthModalView = 
  | 'login' 
  | 'signup' 
  | 'confirm-email' 
  | 'forgot-method' 
  | 'reset-code' 
  | 'reset-link';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialView?: AuthModalView;
  initialEmail?: string;
  resetToken?: string;
  onSuccess?: () => void;
  onOpenSettings?: (tab?: 'account' | 'email' | 'editor' | 'cloud' | 'security' | 'backup') => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  initialView = 'login',
  initialEmail = '',
  resetToken = '',
  onSuccess,
  onOpenSettings
}) => {
  const [view, setView] = useState<AuthModalView>(initialView);

  // Form states
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [sixDigitCode, setSixDigitCode] = useState('');
  const [resetIdentifier, setResetIdentifier] = useState('');
  const [recoveryMethod, setRecoveryMethod] = useState<'code' | 'link'>('code');

  const lastDispatched = getLastDispatchedEmail(email) || getLastDispatchedEmail();
  const availableCode = lastDispatched?.code;

  // Password visibility toggles
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Status and feedback states
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);

  // 10-Minute countdown timer for verification code
  const [secondsRemaining, setSecondsRemaining] = useState(600);
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    setView(initialView);
    if (initialEmail) setEmail(initialEmail);
    setErrorMsg(null);
    setSuccessMsg(null);
  }, [initialView, initialEmail, isOpen]);

  // Timer tick for 10-minute code expiry
  useEffect(() => {
    if (view !== 'confirm-email' && view !== 'reset-code') return;
    if (secondsRemaining <= 0) return;

    const interval = setInterval(() => {
      setSecondsRemaining(prev => Math.max(0, prev - 1));
    }, 1000);

    return () => clearInterval(interval);
  }, [view, secondsRemaining]);

  // Resend cooldown tick
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const interval = setInterval(() => {
      setResendCooldown(prev => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [resendCooldown]);

  const resetForm = () => {
    setFullName('');
    setUsername('');
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setSixDigitCode('');
    setErrorMsg(null);
    setSuccessMsg(null);
    setUnverifiedEmail(null);
  };

  const formatCountdown = (totalSecs: number) => {
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // ----------------------------------------------------
  // SUBMIT: LOGIN
  // ----------------------------------------------------
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    setUnverifiedEmail(null);

    // Strict validation: Reject email format in login
    if (username.includes('@')) {
      setErrorMsg('O login deve ser realizado com o seu Nome de Usuário, e não com e-mail.');
      return;
    }

    if (!username.trim() || !password) {
      setErrorMsg('Por favor, informe seu nome de usuário e senha.');
      return;
    }

    if (password.length < 6) {
      setErrorMsg('A senha deve ter no mínimo 6 dígitos.');
      return;
    }

    setLoading(true);
    try {
      const res = await AuthService.login({ username, password });
      if (!res.success) {
        if (res.unverifiedEmail) {
          setUnverifiedEmail(res.unverifiedEmail);
          setErrorMsg(res.error || 'E-mail não verificado.');
        } else {
          setErrorMsg(res.error || 'Nome de usuário ou senha incorretos.');
        }
      } else {
        setSuccessMsg('Login realizado com sucesso!');
        setTimeout(() => {
          onSuccess?.();
          onClose();
        }, 600);
      }
    } finally {
      setLoading(false);
    }
  };

  // ----------------------------------------------------
  // SUBMIT: CADASTRO
  // ----------------------------------------------------
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    // Front validations
    if (!fullName.trim() || !username.trim() || !email.trim() || !password || !confirmPassword) {
      setErrorMsg('Todos os campos são obrigatórios.');
      return;
    }

    const checkU = isValidUsername(username);
    if (!checkU.valid) {
      setErrorMsg(checkU.error || 'Nome de usuário inválido.');
      return;
    }

    if (!isValidEmail(email)) {
      setErrorMsg('Por favor, informe um endereço de e-mail válido.');
      return;
    }

    if (password.length < 6) {
      setErrorMsg('A senha deve ter no mínimo 6 dígitos.');
      return;
    }

    if (password !== confirmPassword) {
      setErrorMsg('A confirmação de senha não confere com a senha informada.');
      return;
    }

    setLoading(true);
    try {
      const res = await AuthService.register({
        fullName,
        username,
        email,
        password,
        confirmPassword
      });

      if (!res.success) {
        setErrorMsg(res.error || 'Erro ao realizar cadastro.');
      } else {
        // Direct transition to Email Confirmation screen
        setView('confirm-email');
        setSecondsRemaining(600); // 10 minutes
        setResendCooldown(30);
        const dispatched = getLastDispatchedEmail(email);
        if (dispatched?.deliveredExternally) {
          setSuccessMsg('Cadastro realizado! Enviamos o código de 6 dígitos para sua caixa de entrada.');
        } else {
          setSuccessMsg('Cadastro realizado! Utilize o código de 6 dígitos gerado abaixo para confirmar sua conta.');
        }
      }
    } finally {
      setLoading(false);
    }
  };

  // ----------------------------------------------------
  // SUBMIT: CONFIRMAR CÓDIGO DE 6 DÍGITOS
  // ----------------------------------------------------
  const handleConfirmCode = async (e?: React.FormEvent, explicitCode?: string) => {
    if (e) e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    const codeToVerify = (explicitCode ?? sixDigitCode).trim();

    if (codeToVerify.length !== 6) {
      setErrorMsg('Digite os 6 dígitos do código de confirmação.');
      return;
    }

    setLoading(true);
    try {
      const res = await AuthService.verifyEmailCode({
        email,
        code: codeToVerify,
        purpose: 'signup_verification'
      });

      if (!res.success) {
        setErrorMsg(res.error || 'Código inválido.');
      } else {
        setSuccessMsg('E-mail confirmado com sucesso! Sua conta está liberada.');
        setTimeout(() => {
          onSuccess?.();
          onClose();
        }, 800);
      }
    } finally {
      setLoading(false);
    }
  };

  // Reenviar código
  const handleResendCode = async () => {
    if (resendCooldown > 0) return;
    setErrorMsg(null);
    setSuccessMsg(null);
    setLoading(true);

    try {
      const res = await AuthService.resendCode(
        email, 
        view === 'reset-code' ? 'password_reset' : 'signup_verification'
      );
      if (res.success) {
        setSuccessMsg('Novo código de 6 dígitos enviado com sucesso!');
        setSecondsRemaining(600);
        setResendCooldown(45);
        setSixDigitCode('');
      } else {
        setErrorMsg(res.error || 'Erro ao reenviar código.');
      }
    } finally {
      setLoading(false);
    }
  };

  // ----------------------------------------------------
  // SUBMIT: ESQUECI MINHA SENHA (SOLICITAR RECUPERAÇÃO)
  // ----------------------------------------------------
  const handleRequestPasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!resetIdentifier.trim()) {
      setErrorMsg('Por favor, informe seu nome de usuário ou e-mail cadastrado.');
      return;
    }

    setLoading(true);
    try {
      const res = await AuthService.requestPasswordReset({
        identifier: resetIdentifier,
        method: recoveryMethod
      });

      if (!res.success) {
        setErrorMsg(res.error || 'Erro ao processar solicitação.');
      } else {
        if (recoveryMethod === 'code') {
          setEmail(res.email || resetIdentifier);
          setView('reset-code');
          setSecondsRemaining(600);
          setResendCooldown(30);
          setSuccessMsg('Código de recuperação enviado para seu e-mail!');
        } else {
          setSuccessMsg('Link de redefinição enviado com sucesso! Verifique seu e-mail cadastrado (validade de 1 hora).');
        }
      }
    } finally {
      setLoading(false);
    }
  };

  // ----------------------------------------------------
  // SUBMIT: REDEFINIR SENHA COM CÓDIGO
  // ----------------------------------------------------
  const handleResetPasswordWithCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (sixDigitCode.length !== 6) {
      setErrorMsg('Por favor, digite o código de 6 dígitos.');
      return;
    }
    if (password.length < 6) {
      setErrorMsg('A nova senha deve ter no mínimo 6 dígitos.');
      return;
    }
    if (password !== confirmPassword) {
      setErrorMsg('A confirmação não coincide com a nova senha.');
      return;
    }

    setLoading(true);
    try {
      const res = await AuthService.resetPasswordWithCode({
        email,
        code: sixDigitCode,
        newPassword: password,
        confirmPassword
      });

      if (!res.success) {
        setErrorMsg(res.error || 'Erro ao redefinir senha.');
      } else {
        setSuccessMsg('Senha alterada com sucesso! Você já pode entrar.');
        setTimeout(() => {
          resetForm();
          setView('login');
        }, 1200);
      }
    } finally {
      setLoading(false);
    }
  };

  // ----------------------------------------------------
  // SUBMIT: REDEFINIR SENHA COM LINK SEGURO
  // ----------------------------------------------------
  const handleResetPasswordWithToken = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (password.length < 6) {
      setErrorMsg('A nova senha deve ter no mínimo 6 dígitos.');
      return;
    }
    if (password !== confirmPassword) {
      setErrorMsg('A confirmação não coincide com a nova senha.');
      return;
    }

    setLoading(true);
    try {
      const res = await AuthService.resetPasswordWithToken({
        token: resetToken,
        email,
        newPassword: password,
        confirmPassword
      });

      if (!res.success) {
        setErrorMsg(res.error || 'Erro ao redefinir senha.');
      } else {
        setSuccessMsg('Senha redefinida com sucesso! Redirecionando para o login...');
        setTimeout(() => {
          resetForm();
          // Remove query params from url cleanly
          window.history.replaceState({}, document.title, window.location.pathname);
          setView('login');
        }, 1200);
      }
    } finally {
      setLoading(false);
    }
  };

  const getTitle = () => {
    switch (view) {
      case 'login': return 'Entrar na sua Conta';
      case 'signup': return 'Criar Conta no 7NotPad';
      case 'confirm-email': return 'Confirme seu E-mail';
      case 'forgot-method': return 'Recuperação de Senha';
      case 'reset-code': return 'Redefinir Senha por Código';
      case 'reset-link': return 'Definir Nova Senha';
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={getTitle()}
      maxWidth="md"
    >
      <div className="py-2">
        {/* Feedback alerts */}
        {errorMsg && (
          <div className="mb-4 p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs sm:text-sm flex items-start gap-2.5 animate-in fade-in duration-200">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <div className="flex-1">
              <span>{errorMsg}</span>
              {unverifiedEmail && (
                <div className="mt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setEmail(unverifiedEmail);
                      setView('confirm-email');
                      setErrorMsg(null);
                      setSecondsRemaining(600);
                    }}
                    className="underline font-semibold hover:text-red-300 transition-colors inline-flex items-center gap-1"
                  >
                    Clique aqui para confirmar seu e-mail agora <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {successMsg && (
          <div className="mb-4 p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs sm:text-sm flex items-start gap-2.5 animate-in fade-in duration-200">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* ==================================================== */}
        {/* VIEW: LOGIN                                         */}
        {/* ==================================================== */}
        {view === 'login' && (
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                <span>Nome de Usuário</span>
                <span className="text-[11px] text-slate-500 font-normal">Apenas o username (sem e-mail)</span>
              </label>
              <div className="relative">
                <AtSign className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  required
                  autoFocus
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  placeholder="Ex: joaosilva"
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-900/60 dark:bg-slate-950/60 border border-slate-700/80 dark:border-slate-800 text-slate-100 placeholder:text-slate-500 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30 outline-none transition-all"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-300">Senha <span className="text-[11px] font-normal text-slate-500">(mín. 6 dígitos)</span></label>
                <button
                  type="button"
                  onClick={() => {
                    setErrorMsg(null);
                    setSuccessMsg(null);
                    setView('forgot-method');
                  }}
                  className="text-xs text-brand-400 hover:text-brand-300 transition-colors"
                >
                  Esqueci minha senha
                </button>
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-slate-900/60 dark:bg-slate-950/60 border border-slate-700/80 dark:border-slate-800 text-slate-100 placeholder:text-slate-500 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30 outline-none transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl bg-brand-600 hover:bg-brand-500 active:scale-[0.99] text-white font-semibold text-sm shadow-lg shadow-brand-600/30 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loading ? 'Entrando...' : 'Entrar'}
              {!loading && <ArrowRight className="w-4 h-4" />}
            </button>

            <div className="pt-2 text-center text-xs text-slate-400">
              Não tem uma conta?{' '}
              <button
                type="button"
                onClick={() => {
                  resetForm();
                  setView('signup');
                }}
                className="text-brand-400 font-semibold hover:underline"
              >
                Cadastre-se gratuitamente
              </button>
            </div>
          </form>
        )}

        {/* ==================================================== */}
        {/* VIEW: CADASTRO                                      */}
        {/* ==================================================== */}
        {view === 'signup' && (
          <form onSubmit={handleRegister} className="space-y-3.5">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-300">Nome Completo</label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  required
                  autoFocus
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  placeholder="Seu nome e sobrenome"
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-900/60 dark:bg-slate-950/60 border border-slate-700/80 dark:border-slate-800 text-slate-100 placeholder:text-slate-500 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30 outline-none transition-all"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-300 flex justify-between">
                <span>Nome de Usuário</span>
                <span className="text-[11px] text-slate-500">Único, min. 3 caracteres</span>
              </label>
              <div className="relative">
                <AtSign className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  required
                  value={username}
                  onChange={e => setUsername(e.target.value.toLowerCase().replace(/\s+/g, ''))}
                  placeholder="ex: joaosilva"
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-900/60 dark:bg-slate-950/60 border border-slate-700/80 dark:border-slate-800 text-slate-100 placeholder:text-slate-500 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30 outline-none transition-all"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-300">E-mail</label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="seu.email@exemplo.com"
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-900/60 dark:bg-slate-950/60 border border-slate-700/80 dark:border-slate-800 text-slate-100 placeholder:text-slate-500 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30 outline-none transition-all"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-300 flex justify-between">
                <span>Senha</span>
                <span className="text-[11px] text-slate-500">Mínimo 6 dígitos</span>
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-slate-900/60 dark:bg-slate-950/60 border border-slate-700/80 dark:border-slate-800 text-slate-100 placeholder:text-slate-500 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30 outline-none transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-300">Confirmar Senha</label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  required
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-slate-900/60 dark:bg-slate-950/60 border border-slate-700/80 dark:border-slate-800 text-slate-100 placeholder:text-slate-500 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30 outline-none transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition-colors"
                >
                  {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 mt-1 rounded-xl bg-brand-600 hover:bg-brand-500 active:scale-[0.99] text-white font-semibold text-sm shadow-lg shadow-brand-600/30 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loading ? 'Cadastrando...' : 'Criar Conta e Enviar Código'}
              {!loading && <ArrowRight className="w-4 h-4" />}
            </button>

            <div className="pt-2 text-center text-xs text-slate-400">
              Já tem uma conta?{' '}
              <button
                type="button"
                onClick={() => {
                  resetForm();
                  setView('login');
                }}
                className="text-brand-400 font-semibold hover:underline"
              >
                Fazer Login
              </button>
            </div>
          </form>
        )}

        {/* ==================================================== */}
        {/* VIEW: CONFIRMAÇÃO DE E-MAIL POR CÓDIGO (ETAPA 2)     */}
        {/* ==================================================== */}
        {view === 'confirm-email' && (
          <div className="space-y-5 text-center">
            <div className="w-12 h-12 rounded-2xl bg-brand-500/10 border border-brand-500/30 text-brand-400 flex items-center justify-center mx-auto shadow-inner">
              <ShieldCheck className="w-6 h-6" />
            </div>

            <div>
              <h3 className="text-lg font-bold text-slate-100">Confirme seu e-mail</h3>
              <p className="text-xs text-slate-400 mt-1">
                Enviamos um código de confirmação de 6 dígitos para o endereço:
              </p>
              <p className="text-sm font-semibold text-brand-400 mt-0.5 select-all">
                {email}
              </p>
            </div>

            {/* 6 Individual Inputs Component */}
            <div className="py-2">
              <CodeInput
                value={sixDigitCode}
                onChange={val => {
                  setSixDigitCode(val);
                  if (val.length === 6) {
                    setErrorMsg(null);
                  }
                }}
                disabled={loading}
                error={Boolean(errorMsg)}
              />
            </div>

            {/* Quick auto-fill & instant confirm button */}
            {availableCode && sixDigitCode !== availableCode && (
              <div className="p-3 bg-brand-500/10 border border-brand-500/30 rounded-xl flex items-center justify-between text-xs shadow-inner">
                <div className="text-left">
                  <span className="text-[10px] text-slate-400 block uppercase font-bold">Código de Confirmação Gerado:</span>
                  <span className="font-mono text-base font-black text-brand-400 tracking-widest">{availableCode}</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSixDigitCode(availableCode);
                    handleConfirmCode(undefined, availableCode);
                  }}
                  className="px-3 py-1.5 bg-brand-600 hover:bg-brand-500 text-white font-semibold rounded-lg text-xs transition-all flex items-center gap-1.5 shadow-md shadow-brand-600/20"
                >
                  <Check className="w-3.5 h-3.5" />
                  Preencher e Confirmar
                </button>
              </div>
            )}

            {/* Countdown timer */}
            <div className="flex items-center justify-center gap-2 text-xs font-mono">
              <span className="text-slate-400">Código expira em:</span>
              <span className={`font-bold ${secondsRemaining < 60 ? 'text-red-400 animate-pulse' : 'text-amber-400'}`}>
                {formatCountdown(secondsRemaining)}
              </span>
            </div>

            {/* Guidance Box about Email Delivery */}
            <div className="p-3.5 rounded-xl bg-slate-800/80 border border-slate-700/80 text-left text-xs space-y-2">
              <div className="flex items-center justify-between font-semibold text-brand-400">
                <div className="flex items-center gap-1.5">
                  <Mail className="w-4 h-4 shrink-0" />
                  <span>Entrega de E-mail</span>
                </div>
                {onOpenSettings && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenSettings('email');
                    }}
                    className="text-[11px] text-brand-400 hover:underline font-normal"
                  >
                    Configurar API Fácil &rarr;
                  </button>
                )}
              </div>
              <p className="text-slate-300 leading-relaxed text-[11px]">
                {lastDispatched?.deliveredExternally ? (
                  <>
                    Enviamos o código de 6 dígitos para <strong>{email}</strong> com sucesso! Se não encontrar na Caixa de Entrada em instantes, confira a pasta de <strong>Spam / Lixo Eletrônico</strong>.
                  </>
                ) : (
                  <>
                    Seu código de 6 dígitos já foi emitido acima para confirmação imediata (clique em <strong>Preencher e Confirmar</strong>). Para também enviar e-mails externos para qualquer Gmail, conecte a API fácil do <strong>EmailJS</strong> ou <strong>Brevo</strong> em <em>Configurar API Fácil</em>.
                  </>
                )}
              </p>
            </div>

            <div className="space-y-3 pt-2">
              <button
                type="button"
                onClick={() => handleConfirmCode()}
                disabled={loading || sixDigitCode.length !== 6}
                className="w-full py-3 rounded-xl bg-brand-600 hover:bg-brand-500 active:scale-[0.99] text-white font-semibold text-sm shadow-lg shadow-brand-600/30 transition-all flex items-center justify-center gap-2 disabled:opacity-40"
              >
                {loading ? 'Confirmando...' : 'Confirmar Código'}
                {!loading && <CheckCircle2 className="w-4 h-4" />}
              </button>

              <div className="flex items-center justify-between text-xs text-slate-400 pt-1">
                <button
                  type="button"
                  onClick={handleResendCode}
                  disabled={loading || resendCooldown > 0}
                  className="hover:text-brand-400 transition-colors flex items-center gap-1.5 disabled:opacity-40 font-medium"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  {resendCooldown > 0 ? `Reenviar código (${resendCooldown}s)` : 'Reenviar código'}
                </button>

                <button
                  type="button"
                  onClick={() => setView('login')}
                  className="hover:text-slate-200 transition-colors"
                >
                  Voltar ao Login
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ==================================================== */}
        {/* VIEW: ESQUECI MINHA SENHA - ESCOLHA DO MÉTODO        */}
        {/* ==================================================== */}
        {view === 'forgot-method' && (
          <form onSubmit={handleRequestPasswordReset} className="space-y-4">
            <p className="text-xs text-slate-400 leading-relaxed">
              Escolha como deseja redefinir sua senha e informe seu nome de usuário ou e-mail cadastrado.
            </p>

            {/* Method selection */}
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setRecoveryMethod('code')}
                className={`p-3 rounded-xl border text-left transition-all flex flex-col gap-1.5 ${
                  recoveryMethod === 'code'
                    ? 'border-brand-500 bg-brand-500/10 ring-1 ring-brand-500/30 text-white'
                    : 'border-slate-700/80 bg-slate-900/40 text-slate-400 hover:border-slate-600'
                }`}
              >
                <div className="flex items-center gap-2 text-xs font-semibold text-brand-400">
                  <KeyRound className="w-4 h-4" />
                  <span>Código de 6 Dígitos</span>
                </div>
                <span className="text-[11px] text-slate-400 leading-tight">
                  Receba um código numérico de 10 minutos
                </span>
              </button>

              <button
                type="button"
                onClick={() => setRecoveryMethod('link')}
                className={`p-3 rounded-xl border text-left transition-all flex flex-col gap-1.5 ${
                  recoveryMethod === 'link'
                    ? 'border-brand-500 bg-brand-500/10 ring-1 ring-brand-500/30 text-white'
                    : 'border-slate-700/80 bg-slate-900/40 text-slate-400 hover:border-slate-600'
                }`}
              >
                <div className="flex items-center gap-2 text-xs font-semibold text-purple-400">
                  <LinkIcon className="w-4 h-4" />
                  <span>Link Seguro</span>
                </div>
                <span className="text-[11px] text-slate-400 leading-tight">
                  Receba link com token seguro de 1 hora
                </span>
              </button>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">
                Nome de Usuário ou E-mail
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  required
                  autoFocus
                  value={resetIdentifier}
                  onChange={e => setResetIdentifier(e.target.value)}
                  placeholder="ex: joaosilva ou seu@email.com"
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-900/60 dark:bg-slate-950/60 border border-slate-700/80 dark:border-slate-800 text-slate-100 placeholder:text-slate-500 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30 outline-none transition-all"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl bg-brand-600 hover:bg-brand-500 active:scale-[0.99] text-white font-semibold text-sm shadow-lg shadow-brand-600/30 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loading
                ? 'Processando...'
                : recoveryMethod === 'code'
                ? 'Enviar Código de 6 Dígitos'
                : 'Enviar Link Seguro de Redefinição'}
              {!loading && <ArrowRight className="w-4 h-4" />}
            </button>

            <div className="pt-2 text-center text-xs">
              <button
                type="button"
                onClick={() => setView('login')}
                className="text-slate-400 hover:text-slate-200 transition-colors"
              >
                Lembrou da senha? Voltar ao Login
              </button>
            </div>
          </form>
        )}

        {/* ==================================================== */}
        {/* VIEW: REDEFINIR SENHA COM CÓDIGO DE 6 DÍGITOS        */}
        {/* ==================================================== */}
        {view === 'reset-code' && (
          <form onSubmit={handleResetPasswordWithCode} className="space-y-4">
            <div className="text-center mb-2">
              <p className="text-xs text-slate-400">
                Insira o código de 6 dígitos enviado para <span className="text-slate-200 font-semibold">{email}</span> e defina sua nova senha.
              </p>
            </div>

            <div className="py-2">
              <CodeInput
                value={sixDigitCode}
                onChange={setSixDigitCode}
                disabled={loading}
                error={Boolean(errorMsg)}
              />
            </div>

            <div className="flex items-center justify-between text-xs font-mono text-slate-400">
              <span>Validade: <strong className="text-amber-400">{formatCountdown(secondsRemaining)}</strong></span>
              <button
                type="button"
                onClick={handleResendCode}
                disabled={resendCooldown > 0}
                className="text-brand-400 hover:underline disabled:opacity-40"
              >
                {resendCooldown > 0 ? `Reenviar (${resendCooldown}s)` : 'Reenviar código'}
              </button>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">Nova Senha (mínimo 6 dígitos)</label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-slate-900/60 dark:bg-slate-950/60 border border-slate-700/80 dark:border-slate-800 text-slate-100 placeholder:text-slate-500 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30 outline-none transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">Confirmar Nova Senha</label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  required
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-slate-900/60 dark:bg-slate-950/60 border border-slate-700/80 dark:border-slate-800 text-slate-100 placeholder:text-slate-500 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30 outline-none transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                >
                  {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || sixDigitCode.length !== 6}
              className="w-full py-3 rounded-xl bg-brand-600 hover:bg-brand-500 active:scale-[0.99] text-white font-semibold text-sm shadow-lg shadow-brand-600/30 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loading ? 'Redefinindo...' : 'Salvar Nova Senha'}
              {!loading && <CheckCircle2 className="w-4 h-4" />}
            </button>
          </form>
        )}

        {/* ==================================================== */}
        {/* VIEW: REDEFINIR SENHA COM LINK SEGURO (TOKEN)       */}
        {/* ==================================================== */}
        {view === 'reset-link' && (
          <form onSubmit={handleResetPasswordWithToken} className="space-y-4">
            <div className="text-center mb-2">
              <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/30 text-purple-400 flex items-center justify-center mx-auto mb-2">
                <Sparkles className="w-5 h-5" />
              </div>
              <p className="text-xs text-slate-400">
                Link de segurança validado com sucesso. Defina sua nova senha para <span className="text-slate-200 font-semibold">{email || 'sua conta'}</span>.
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">Nova Senha (mínimo 6 dígitos)</label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-slate-900/60 dark:bg-slate-950/60 border border-slate-700/80 dark:border-slate-800 text-slate-100 placeholder:text-slate-500 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30 outline-none transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">Confirmar Nova Senha</label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  required
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-slate-900/60 dark:bg-slate-950/60 border border-slate-700/80 dark:border-slate-800 text-slate-100 placeholder:text-slate-500 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30 outline-none transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                >
                  {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl bg-brand-600 hover:bg-brand-500 active:scale-[0.99] text-white font-semibold text-sm shadow-lg shadow-brand-600/30 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loading ? 'Atualizando...' : 'Definir Nova Senha'}
              {!loading && <CheckCircle2 className="w-4 h-4" />}
            </button>
          </form>
        )}
      </div>
    </Modal>
  );
};

import React, { useState, useEffect } from 'react';
import { 
  User, 
  Lock, 
  ArrowRight, 
  CheckCircle2, 
  AlertCircle, 
  KeyRound, 
  Eye, 
  EyeOff, 
  AtSign, 
  Calendar,
  HelpCircle,
  Sparkles,
  ArrowLeft
} from 'lucide-react';
import { Modal } from '../common/Modal';
import { AuthService, isValidUsername } from '../../lib/authService';
import { SECURITY_QUESTIONS } from '../../types/auth';

export type AuthModalView = 
  | 'login' 
  | 'signup' 
  | 'forgot-password'
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
  onOpenSettings?: (tab?: 'account' | 'editor' | 'cloud' | 'security' | 'backup') => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  initialView = 'login',
  initialEmail = '',
  onSuccess,
}) => {
  // Map old views to modern views
  const normalizeView = (v: AuthModalView): 'login' | 'signup' | 'forgot-password' => {
    if (v === 'signup') return 'signup';
    if (v === 'forgot-password' || v === 'forgot-method' || v === 'reset-code' || v === 'reset-link') return 'forgot-password';
    return 'login';
  };

  const [view, setView] = useState<'login' | 'signup' | 'forgot-password'>(() => normalizeView(initialView));

  // Form states - Registration & Login
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [securityQuestion, setSecurityQuestion] = useState<string>(SECURITY_QUESTIONS[0]);
  const [securityAnswer, setSecurityAnswer] = useState('');

  // Password reset states
  const [forgotStep, setForgotStep] = useState<'identify' | 'answer'>('identify');
  const [resetIdentifier, setResetIdentifier] = useState('');
  const [matchedQuestion, setMatchedQuestion] = useState('');
  const [resetBirthDate, setResetBirthDate] = useState('');
  const [resetSecurityAnswer, setResetSecurityAnswer] = useState('');
  const [resetNewPassword, setResetNewPassword] = useState('');
  const [resetConfirmPassword, setResetConfirmPassword] = useState('');

  // Password visibility toggles
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Status and feedback states
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    setView(normalizeView(initialView));
    if (initialEmail) setEmail(initialEmail);
    setErrorMsg(null);
    setSuccessMsg(null);
    setForgotStep('identify');
  }, [initialView, initialEmail, isOpen]);

  const resetForm = () => {
    setFullName('');
    setUsername('');
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setBirthDate('');
    setSecurityQuestion(SECURITY_QUESTIONS[0]);
    setSecurityAnswer('');
    setResetIdentifier('');
    setMatchedQuestion('');
    setResetBirthDate('');
    setResetSecurityAnswer('');
    setResetNewPassword('');
    setResetConfirmPassword('');
    setForgotStep('identify');
    setErrorMsg(null);
    setSuccessMsg(null);
  };

  // ----------------------------------------------------
  // SUBMIT: LOGIN
  // ----------------------------------------------------
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    const cleanUsername = username.replace(/^@/, '').trim();
    if (!cleanUsername || !password) {
      setErrorMsg('Por favor, informe seu nome de usuário e senha.');
      return;
    }

    if (password.length < 6) {
      setErrorMsg('A senha deve ter no mínimo 6 dígitos.');
      return;
    }

    setLoading(true);
    try {
      const res = await AuthService.login({ username: cleanUsername, password });
      if (!res.success) {
        setErrorMsg(res.error || 'Nome de usuário ou senha incorretos.');
      } else {
        setSuccessMsg('Login realizado com sucesso!');
        setTimeout(() => {
          onSuccess?.();
          onClose();
        }, 500);
      }
    } finally {
      setLoading(false);
    }
  };

  // ----------------------------------------------------
  // SUBMIT: CADASTRO (Sem confirmação de e-mail / Direto)
  // ----------------------------------------------------
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    const cleanUsername = username.replace(/^@/, '').trim();
    if (!fullName.trim() || !cleanUsername || !password || !confirmPassword) {
      setErrorMsg('Por favor, preencha todos os campos obrigatórios.');
      return;
    }

    if (!birthDate) {
      setErrorMsg('Por favor, informe sua Data de Nascimento.');
      return;
    }

    if (!securityQuestion || !securityAnswer.trim()) {
      setErrorMsg('Selecione uma Pergunta de Segurança e preencha a Resposta.');
      return;
    }

    const checkU = isValidUsername(cleanUsername);
    if (!checkU.valid) {
      setErrorMsg(checkU.error || 'Nome de usuário inválido.');
      return;
    }

    if (password.length < 6) {
      setErrorMsg('A senha deve ter no mínimo 6 dígitos.');
      return;
    }

    if (password !== confirmPassword) {
      setErrorMsg('A confirmação de senha não coincide com a senha informada.');
      return;
    }

    setLoading(true);
    try {
      const res = await AuthService.register({
        fullName,
        username: cleanUsername,
        email: email.trim(),
        birthDate,
        securityQuestion,
        securityAnswer,
        password,
        confirmPassword
      });

      if (!res.success) {
        setErrorMsg(res.error || 'Erro ao realizar cadastro.');
      } else {
        setSuccessMsg('Cadastro realizado com sucesso! Bem-vindo ao 7NotPad.');
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
  // ESQUECI A SENHA - ETAPA 1: Identificar Usuário
  // ----------------------------------------------------
  const handleFindUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    const ident = resetIdentifier.replace(/^@/, '').trim();
    if (!ident) {
      setErrorMsg('Digite seu nome de usuário (@usuario) ou e-mail cadastrado.');
      return;
    }

    setLoading(true);
    try {
      const res = await AuthService.getSecurityQuestion(ident);
      if (!res.success) {
        setErrorMsg(res.error || 'Usuário não encontrado. Verifique o usuário digitado.');
      } else {
        setMatchedQuestion(res.question || SECURITY_QUESTIONS[0]);
        setForgotStep('answer');
        setErrorMsg(null);
      }
    } finally {
      setLoading(false);
    }
  };

  // ----------------------------------------------------
  // ESQUECI A SENHA - ETAPA 2: Validar Pergunta + Data e Alterar Senha
  // ----------------------------------------------------
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!resetBirthDate) {
      setErrorMsg('Informe sua Data de Nascimento.');
      return;
    }

    if (!resetSecurityAnswer.trim()) {
      setErrorMsg('Informe a resposta da pergunta de segurança.');
      return;
    }

    if (resetNewPassword.length < 6) {
      setErrorMsg('A nova senha deve ter no mínimo 6 dígitos.');
      return;
    }

    if (resetNewPassword !== resetConfirmPassword) {
      setErrorMsg('A confirmação não coincide com a nova senha digitada.');
      return;
    }

    setLoading(true);
    try {
      const res = await AuthService.resetPasswordWithSecurityAnswers({
        identifier: resetIdentifier,
        birthDate: resetBirthDate,
        securityAnswer: resetSecurityAnswer,
        newPassword: resetNewPassword,
        confirmPassword: resetConfirmPassword,
      });

      if (!res.success) {
        setErrorMsg(res.error || 'Falha ao redefinir senha. Verifique as informações.');
      } else {
        setSuccessMsg('Senha alterada com sucesso! Você já está conectado.');
        setTimeout(() => {
          onSuccess?.();
          onClose();
        }, 700);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-brand-500/10 text-brand-400 border border-brand-500/20 flex items-center justify-center font-bold text-xs">
            7
          </div>
          <div>
            <h2 className="text-base font-bold text-gray-100">
              {view === 'login' && 'Entrar no 7NotPad'}
              {view === 'signup' && 'Criar Nova Conta'}
              {view === 'forgot-password' && 'Recuperar / Alterar Senha'}
            </h2>
            <p className="text-[11px] text-gray-400 font-normal">
              {view === 'login' && 'Acesse suas notas em qualquer aparelho com seu usuário'}
              {view === 'signup' && 'Cadastro rápido e seguro com pergunta secreta'}
              {view === 'forgot-password' && 'Validação por Data de Nascimento e Pergunta de Segurança'}
            </p>
          </div>
        </div>
      }
      maxWidth="md"
    >
      <div className="space-y-4">
        {/* Alerts / Feedback */}
        {errorMsg && (
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-start gap-2 animate-in fade-in">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <div className="leading-relaxed">{errorMsg}</div>
          </div>
        )}

        {successMsg && (
          <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs flex items-start gap-2 animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            <div className="leading-relaxed">{successMsg}</div>
          </div>
        )}

        {/* ==================================================== */}
        {/* VIEW: LOGIN                                         */}
        {/* ==================================================== */}
        {view === 'login' && (
          <form onSubmit={handleLogin} className="space-y-3.5">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-300">
                Nome de Usuário (@usuario)
              </label>
              <div className="relative">
                <AtSign className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  required
                  autoFocus
                  value={username}
                  onChange={e => setUsername(e.target.value.toLowerCase().replace(/\s+/g, ''))}
                  placeholder="ex: malaca ou @malaca"
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[#0a0a0a] border border-[#1c1c1c] text-gray-100 placeholder:text-gray-500 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500/30 outline-none transition-all font-mono"
                />
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-gray-300">
                  Senha <span className="text-[11px] font-normal text-gray-500">(mín. 6 dígitos)</span>
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setErrorMsg(null);
                    setSuccessMsg(null);
                    setResetIdentifier(username);
                    setView('forgot-password');
                    setForgotStep('identify');
                  }}
                  className="text-xs text-brand-400 hover:text-brand-300 transition-colors"
                >
                  Esqueci minha senha
                </button>
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-[#0a0a0a] border border-[#1c1c1c] text-gray-100 placeholder:text-gray-500 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500/30 outline-none transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-200 transition-colors"
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

            <div className="pt-2 text-center text-xs text-gray-400">
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-300">Nome Completo</label>
                <div className="relative">
                  <User className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    autoFocus
                    value={fullName}
                    onChange={e => setFullName(e.target.value)}
                    placeholder="Seu nome"
                    className="w-full pl-10 pr-3 py-2.5 rounded-xl bg-[#0a0a0a] border border-[#1c1c1c] text-gray-100 placeholder:text-gray-500 text-xs focus:border-brand-500 outline-none transition-all"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-300">
                  Nome de Usuário (@usuario)
                </label>
                <div className="relative">
                  <AtSign className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    value={username}
                    onChange={e => setUsername(e.target.value.toLowerCase().replace(/\s+/g, ''))}
                    placeholder="ex: malacarj"
                    className="w-full pl-10 pr-3 py-2.5 rounded-xl bg-[#0a0a0a] border border-[#1c1c1c] text-gray-100 placeholder:text-gray-500 text-xs focus:border-brand-500 outline-none transition-all font-mono"
                  />
                </div>
              </div>
            </div>

            {/* Data de Nascimento */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-300 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-brand-400" />
                  Data de Nascimento
                </span>
                <span className="text-[10px] text-gray-500 font-normal">Usada para recuperar sua senha</span>
              </label>
              <input
                type="date"
                required
                value={birthDate}
                onChange={e => setBirthDate(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#0a0a0a] border border-[#1c1c1c] text-gray-100 text-xs focus:border-brand-500 outline-none transition-all"
              />
            </div>

            {/* Pergunta de Segurança */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-300 flex items-center gap-1.5">
                <HelpCircle className="w-3.5 h-3.5 text-purple-400" />
                Pergunta de Segurança
              </label>
              <select
                value={securityQuestion}
                onChange={e => setSecurityQuestion(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-[#0a0a0a] border border-[#1c1c1c] text-gray-100 text-xs focus:border-brand-500 outline-none transition-all"
              >
                {SECURITY_QUESTIONS.map((q, idx) => (
                  <option key={idx} value={q} className="bg-[#0f0f0f] text-gray-100">
                    {q}
                  </option>
                ))}
              </select>
            </div>

            {/* Resposta Secreta */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-300">
                Resposta da Pergunta Secreta
              </label>
              <input
                type="text"
                required
                value={securityAnswer}
                onChange={e => setSecurityAnswer(e.target.value)}
                placeholder="Digite a resposta que você vai lembrar..."
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#0a0a0a] border border-[#1c1c1c] text-gray-100 placeholder:text-gray-500 text-xs focus:border-brand-500 outline-none transition-all"
              />
            </div>

            {/* Senhas */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-300 flex justify-between">
                  <span>Senha</span>
                  <span className="text-[10px] text-gray-500">mín. 6</span>
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-10 pr-9 py-2.5 rounded-xl bg-[#0a0a0a] border border-[#1c1c1c] text-gray-100 placeholder:text-gray-500 text-xs focus:border-brand-500 outline-none transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-200"
                  >
                    {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-300">Confirmar Senha</label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    required
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-10 pr-9 py-2.5 rounded-xl bg-[#0a0a0a] border border-[#1c1c1c] text-gray-100 placeholder:text-gray-500 text-xs focus:border-brand-500 outline-none transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-200"
                  >
                    {showConfirmPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 mt-1 rounded-xl bg-brand-600 hover:bg-brand-500 active:scale-[0.99] text-white font-semibold text-sm shadow-lg shadow-brand-600/30 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Sparkles className="w-4 h-4" />
              {loading ? 'Criando Conta...' : 'Criar Conta e Entrar'}
            </button>

            <div className="pt-2 text-center text-xs text-gray-400">
              Já possui conta?{' '}
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
        {/* VIEW: ESQUECI MINHA SENHA (PERGUNTA + DATA NASC)    */}
        {/* ==================================================== */}
        {view === 'forgot-password' && (
          <div className="space-y-4">
            {forgotStep === 'identify' ? (
              <form onSubmit={handleFindUser} className="space-y-3.5">
                <div className="p-3 rounded-2xl bg-[#0a0a0a] border border-[#1c1c1c] text-xs text-gray-400 leading-relaxed">
                  Para alterar sua senha sem precisar de e-mail, digite seu <strong className="text-gray-200">@usuario</strong>. O sistema exibirá sua pergunta de segurança e solicitará sua data de nascimento.
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-gray-300">
                    Seu Nome de Usuário (@usuario)
                  </label>
                  <div className="relative">
                    <AtSign className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      required
                      autoFocus
                      value={resetIdentifier}
                      onChange={e => setResetIdentifier(e.target.value.toLowerCase().replace(/\s+/g, ''))}
                      placeholder="ex: malacarj ou @malacarj"
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[#0a0a0a] border border-[#1c1c1c] text-gray-100 placeholder:text-gray-500 text-sm focus:border-brand-500 outline-none transition-all font-mono"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading || !resetIdentifier.trim()}
                  className="w-full py-3 rounded-xl bg-brand-600 hover:bg-brand-500 text-white font-semibold text-sm shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {loading ? 'Localizando...' : 'Continuar'}
                  {!loading && <ArrowRight className="w-4 h-4" />}
                </button>

                <div className="pt-2 text-center">
                  <button
                    type="button"
                    onClick={() => {
                      resetForm();
                      setView('login');
                    }}
                    className="text-xs text-gray-400 hover:text-gray-200 flex items-center justify-center gap-1 mx-auto"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Voltar para o Login</span>
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleResetPassword} className="space-y-3.5">
                {/* Pergunta de segurança destacada */}
                <div className="p-3.5 rounded-2xl bg-purple-500/10 border border-purple-500/30 text-xs space-y-1">
                  <div className="font-semibold text-purple-400 flex items-center gap-1.5">
                    <HelpCircle className="w-3.5 h-3.5 shrink-0" />
                    Pergunta Secreta da Conta (@{resetIdentifier.replace(/^@/, '')})
                  </div>
                  <div className="text-gray-100 font-medium text-sm">
                    {matchedQuestion}
                  </div>
                </div>

                {/* Data de Nascimento */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-gray-300 flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-brand-400" />
                    Data de Nascimento Cadastrada
                  </label>
                  <input
                    type="date"
                    required
                    value={resetBirthDate}
                    onChange={e => setResetBirthDate(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#0a0a0a] border border-[#1c1c1c] text-gray-100 text-xs focus:border-brand-500 outline-none transition-all"
                  />
                </div>

                {/* Resposta da Pergunta */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-gray-300">
                    Sua Resposta Secreta
                  </label>
                  <input
                    type="text"
                    required
                    value={resetSecurityAnswer}
                    onChange={e => setResetSecurityAnswer(e.target.value)}
                    placeholder="Digite a resposta correta..."
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#0a0a0a] border border-[#1c1c1c] text-gray-100 placeholder:text-gray-500 text-xs focus:border-brand-500 outline-none transition-all"
                  />
                </div>

                {/* Nova Senha */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 border-t border-[#1c1c1c]">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-gray-300">
                      Nova Senha <span className="text-[10px] text-gray-500">(mín. 6)</span>
                    </label>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        required
                        value={resetNewPassword}
                        onChange={e => setResetNewPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full pl-10 pr-8 py-2.5 rounded-xl bg-[#0a0a0a] border border-[#1c1c1c] text-gray-100 placeholder:text-gray-500 text-xs focus:border-brand-500 outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-200"
                      >
                        {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-gray-300">
                      Confirmar Nova Senha
                    </label>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type={showConfirmPassword ? 'text' : 'password'}
                        required
                        value={resetConfirmPassword}
                        onChange={e => setResetConfirmPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full pl-10 pr-8 py-2.5 rounded-xl bg-[#0a0a0a] border border-[#1c1c1c] text-gray-100 placeholder:text-gray-500 text-xs focus:border-brand-500 outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-200"
                      >
                        {showConfirmPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setForgotStep('identify')}
                    className="py-2.5 px-3 rounded-xl border border-[#1c1c1c] bg-[#0a0a0a] hover:bg-[#141414] text-gray-400 text-xs"
                  >
                    Voltar
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex-1 py-3 rounded-xl bg-brand-600 hover:bg-brand-500 text-white font-semibold text-xs shadow-lg shadow-brand-600/30 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                  >
                    <KeyRound className="w-4 h-4" />
                    <span>{loading ? 'Salvando...' : 'Salvar Nova Senha e Conectar'}</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
};

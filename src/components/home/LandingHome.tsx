import React from 'react';
import { 
  Sparkles, 
  ArrowRight, 
  Plus, 
  Lock, 
  Share2, 
  Zap, 
  Smartphone, 
  FolderOpen, 
  ShieldCheck, 
  User,
  Radio
} from 'lucide-react';
import type { AuthModalView } from '../auth/AuthModal';

interface LandingHomeProps {
  onStartWriting: () => void;
  onOpenAuth: (view: AuthModalView) => void;
  localNotesCount: number;
}

export const LandingHome: React.FC<LandingHomeProps> = ({
  onStartWriting,
  onOpenAuth,
  localNotesCount,
}) => {
  return (
    <div className="min-h-[100dvh] bg-black text-gray-100 flex flex-col justify-between selection:bg-brand-500/30 selection:text-brand-300">
      {/* Subtle Ambient Radial Glow */}
      <div className="fixed inset-0 pointer-events-none bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(99,102,241,0.15),transparent)] z-0" />

      {/* Top Clean Navbar */}
      <header className="relative z-10 w-full max-w-6xl mx-auto px-4 sm:px-8 h-16 flex items-center justify-between border-b border-[#141414]">
        {/* Brand */}
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-brand-600 to-cyan-500 flex items-center justify-center text-white font-black text-sm shadow-md shadow-brand-500/20">
            7
          </div>
          <span className="font-bold text-base tracking-tight text-gray-100 flex items-center gap-1.5">
            7NotPad
            <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-brand-500/10 text-brand-400 border border-brand-500/20">
              v1.0
            </span>
          </span>
        </div>

        {/* Auth CTA Actions */}
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={() => onOpenAuth('login')}
            className="px-3 sm:px-4 py-2 rounded-xl text-xs font-semibold text-gray-300 hover:text-white hover:bg-[#121212] transition-colors"
          >
            Entrar
          </button>
          <button
            type="button"
            onClick={() => onOpenAuth('signup')}
            className="px-3.5 sm:px-4 py-2 rounded-xl text-xs font-semibold bg-brand-600 hover:bg-brand-500 text-white shadow-md shadow-brand-600/25 transition-all active:scale-[0.98] flex items-center gap-1.5"
          >
            <User className="w-3.5 h-3.5" />
            <span>Cadastre-se</span>
          </button>
        </div>
      </header>

      {/* Hero Section */}
      <main className="relative z-10 w-full max-w-5xl mx-auto px-4 sm:px-8 py-12 sm:py-20 flex flex-col items-center text-center">
        {/* Release / Feature Pill */}
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#0d0d0d] border border-[#1f1f1f] text-xs text-gray-300 mb-6 shadow-sm">
          <span className="flex h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-gray-400">Nova versão pura OLED</span>
          <span className="text-gray-600">•</span>
          <span className="text-brand-400 font-medium flex items-center gap-1">
            <Sparkles className="w-3 h-3" />
            Rápido &amp; Colaborativo
          </span>
        </div>

        {/* Hero Title */}
        <h1 className="text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight text-gray-100 max-w-4xl leading-[1.1] mb-6">
          Seu bloco de notas <br className="hidden sm:inline" />
          <span className="bg-gradient-to-r from-brand-400 via-indigo-300 to-cyan-400 bg-clip-text text-transparent">
            rápido, seguro e em tempo real.
          </span>
        </h1>

        {/* Hero Subtitle */}
        <p className="text-base sm:text-lg text-gray-400 max-w-2xl leading-relaxed mb-8 sm:mb-10">
          Crie anotações com formatação rica, compartilhe links únicos com senha e edite simultaneamente com outros membros através de <code className="text-brand-400 font-mono bg-[#111111] px-1.5 py-0.5 rounded text-sm">@usuarios</code>.
        </p>

        {/* CTA Buttons */}
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto mb-8">
          <button
            type="button"
            onClick={onStartWriting}
            className="w-full sm:w-auto px-7 py-3.5 rounded-2xl bg-brand-600 hover:bg-brand-500 active:scale-[0.98] text-white font-bold text-sm shadow-xl shadow-brand-600/30 transition-all flex items-center justify-center gap-2 group"
          >
            <Plus className="w-4 h-4 transition-transform group-hover:rotate-90" />
            <span>Começar a Escrever</span>
            <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
          </button>

          <button
            type="button"
            onClick={() => onOpenAuth('login')}
            className="w-full sm:w-auto px-6 py-3.5 rounded-2xl bg-[#0a0a0a] hover:bg-[#121212] active:scale-[0.98] border border-[#1f1f1f] text-gray-200 font-semibold text-sm transition-all flex items-center justify-center gap-2"
          >
            <User className="w-4 h-4 text-brand-400" />
            <span>Acessar com @usuario</span>
          </button>
        </div>

        {/* Existing notes indicator if visitor already has local notes */}
        {localNotesCount > 0 && (
          <button
            type="button"
            onClick={onStartWriting}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#080808] border border-[#1c1c1c] hover:border-brand-500/40 text-xs text-gray-300 hover:text-white transition-all mb-12 shadow-sm group"
          >
            <FolderOpen className="w-3.5 h-3.5 text-brand-400" />
            <span>Você possui <strong>{localNotesCount}</strong> nota(s) salvas neste dispositivo</span>
            <ArrowRight className="w-3 h-3 text-gray-500 group-hover:translate-x-1 transition-transform" />
          </button>
        )}

        {/* Interactive / Visual App Preview Card */}
        <div className="w-full max-w-3xl rounded-3xl border border-[#1c1c1c] bg-[#050505] p-3 sm:p-5 shadow-2xl text-left my-4">
          <div className="flex items-center justify-between pb-3 mb-3 border-b border-[#141414] text-xs">
            <div className="flex items-center gap-2 font-mono text-gray-400 text-[11px]">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500/80" />
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500/80" />
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80" />
              <span className="ml-2 text-brand-400">7notpad.malaca.com.br/notpad/ideias</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 font-medium border border-emerald-500/20">
                <Radio className="w-2.5 h-2.5 animate-pulse" />
                <span>Ao vivo</span>
              </span>
            </div>
          </div>

          <div className="space-y-3 px-2 sm:px-4 py-2">
            <h3 className="text-xl sm:text-2xl font-bold text-gray-100 flex items-center justify-between">
              <span>Projeto NotPad 2026 💡</span>
              <span className="text-xs font-normal text-gray-500 font-mono">Salvo agora</span>
            </h3>
            <p className="text-xs sm:text-sm text-gray-400 leading-relaxed">
              Bloco de notas com sincronização instantânea em nuvem, suporte a imagens, anexos e controle de permissões por @usuario sem solicitar senha para administradores.
            </p>
            <div className="pt-2 flex flex-wrap gap-2 text-[11px]">
              <span className="px-2.5 py-1 rounded-lg bg-[#0e0e0e] border border-[#1c1c1c] text-gray-300 flex items-center gap-1.5">
                <Lock className="w-3 h-3 text-amber-400" /> Protegido por Senha
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-[#0e0e0e] border border-[#1c1c1c] text-gray-300 flex items-center gap-1.5">
                <ShieldCheck className="w-3 h-3 text-emerald-400" /> Acesso Liberado para @malaca
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-[#0e0e0e] border border-[#1c1c1c] text-gray-300 flex items-center gap-1.5">
                <Share2 className="w-3 h-3 text-cyan-400" /> Link Único
              </span>
            </div>
          </div>
        </div>

        {/* Feature Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 w-full mt-12 sm:mt-16 text-left">
          {/* Feature 1 */}
          <div className="p-5 rounded-2xl bg-[#050505] border border-[#1c1c1c] hover:border-brand-500/30 transition-all">
            <div className="w-9 h-9 rounded-xl bg-brand-500/10 text-brand-400 flex items-center justify-center mb-3">
              <Zap className="w-4 h-4" />
            </div>
            <h4 className="text-sm font-bold text-gray-100 mb-1">Zero Fricção</h4>
            <p className="text-xs text-gray-400 leading-relaxed">
              Comece a escrever na hora sem telas de espera ou confirmações chatas de e-mail.
            </p>
          </div>

          {/* Feature 2 */}
          <div className="p-5 rounded-2xl bg-[#050505] border border-[#1c1c1c] hover:border-brand-500/30 transition-all">
            <div className="w-9 h-9 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center mb-3">
              <Share2 className="w-4 h-4" />
            </div>
            <h4 className="text-sm font-bold text-gray-100 mb-1">Links Únicos</h4>
            <p className="text-xs text-gray-400 leading-relaxed">
              Compartilhe facilmente via link direto <code className="font-mono text-purple-300">/notpad/:id</code> com quem você quiser.
            </p>
          </div>

          {/* Feature 3 */}
          <div className="p-5 rounded-2xl bg-[#050505] border border-[#1c1c1c] hover:border-brand-500/30 transition-all">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center mb-3">
              <Lock className="w-4 h-4" />
            </div>
            <h4 className="text-sm font-bold text-gray-100 mb-1">Privacidade Real</h4>
            <p className="text-xs text-gray-400 leading-relaxed">
              Proteja notas com senha e recupere o acesso com segurança por data e perguntas pessoais.
            </p>
          </div>

          {/* Feature 4 */}
          <div className="p-5 rounded-2xl bg-[#050505] border border-[#1c1c1c] hover:border-brand-500/30 transition-all">
            <div className="w-9 h-9 rounded-xl bg-cyan-500/10 text-cyan-400 flex items-center justify-center mb-3">
              <Smartphone className="w-4 h-4" />
            </div>
            <h4 className="text-sm font-bold text-gray-100 mb-1">Otimizado para Mobile</h4>
            <p className="text-xs text-gray-400 leading-relaxed">
              Barra inferior inteligente, tema preto OLED e formatação rápida feita para celulares.
            </p>
          </div>
        </div>
      </main>

      {/* Clean Footer */}
      <footer className="relative z-10 w-full border-t border-[#141414] py-6 px-4 sm:px-8 text-center text-xs text-gray-500">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-gray-400">7NotPad</span>
            <span>•</span>
            <span>Bloco de notas rápido, seguro e colaborativo.</span>
          </div>
          <div className="flex items-center gap-4 text-gray-400">
            <button
              type="button"
              onClick={() => onOpenAuth('login')}
              className="hover:text-white transition-colors"
            >
              Entrar
            </button>
            <button
              type="button"
              onClick={() => onOpenAuth('signup')}
              className="hover:text-white transition-colors"
            >
              Criar Conta
            </button>
            <button
              type="button"
              onClick={onStartWriting}
              className="hover:text-brand-400 transition-colors"
            >
              Abrir Bloco de Notas
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
};

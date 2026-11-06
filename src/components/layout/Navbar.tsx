import React, { useState, useRef, useEffect } from 'react';
import { useTheme } from '../../hooks/useTheme';
import { useAuth } from '../../hooks/useAuth';
import { 
  Menu, 
  Sun, 
  Moon, 
  Settings as SettingsIcon, 
  Download,
  User,
  LogOut,
  ChevronDown,
  Sparkles,
  Home,
  ShieldCheck
} from 'lucide-react';
import { exportNotesToJson } from '../../lib/exportImport';

interface NavbarProps {
  onToggleMobileSidebar: () => void;
  onOpenSettings: (tab?: 'account' | 'editor' | 'cloud' | 'security' | 'backup') => void;
  onOpenAuthModal: () => void;
  totalNotes: number;
  onGoToDashboard?: () => void;
  isDashboard?: boolean;
  onOpenAdmin?: () => void;
  isAdmin?: boolean;
  isGuest?: boolean;
  onOpenSignUp?: () => void;
  onExitGuest?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  onToggleMobileSidebar,
  onOpenSettings,
  onOpenAuthModal,
  totalNotes: _totalNotes,
  onGoToDashboard,
  isDashboard = false,
  onOpenAdmin,
  isAdmin = false,
  isGuest = false,
  onOpenSignUp,
  onExitGuest,
}) => {
  const { theme, toggleTheme } = useTheme();
  const { user, isAuthenticated, logout } = useAuth();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <header className="h-14 border-b border-[#1c1c1c] bg-black/95 backdrop-blur-md px-3 sm:px-4 flex items-center justify-between shrink-0 z-20">
      {/* Mobile Toggle & Brand */}
      <div className="flex items-center gap-2.5 sm:gap-3">
        <button
          type="button"
          onClick={onToggleMobileSidebar}
          className="p-2 rounded-xl border border-[#1c1c1c] bg-[#080808] text-gray-300 hover:bg-[#121212] md:hidden transition-colors"
          title="Abrir lista de notas"
        >
          <Menu className="w-4 h-4" />
        </button>

        <div 
          onClick={onGoToDashboard}
          className={`flex items-center gap-2 ${onGoToDashboard ? 'cursor-pointer active:opacity-75' : ''}`}
          title="Ir para o Painel de Início"
        >
          <div className="w-6 h-6 rounded-lg bg-gradient-to-tr from-brand-600 to-cyan-500 flex items-center justify-center text-white font-black text-xs shadow-sm shadow-brand-500/20">
            7
          </div>
          <span className="font-bold text-sm text-gray-100">7NotPad</span>
        </div>

        {onGoToDashboard && (
          <button
            type="button"
            onClick={onGoToDashboard}
            className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl border text-xs font-medium transition-colors ${
              isDashboard 
                ? 'border-brand-500/40 bg-brand-500/15 text-brand-300' 
                : 'border-[#1c1c1c] bg-[#080808] hover:bg-[#141414] text-gray-300 hover:text-white'
            }`}
            title="Ir para o Painel de Início (/notpad)"
          >
            <Home className="w-3.5 h-3.5 text-brand-400" />
            <span className="hidden sm:inline">Início</span>
          </button>
        )}
      </div>

      {/* Sync Status Badge & Action Controls */}
      <div className="flex items-center gap-1.5 sm:gap-2.5">
        {/* Quick Export Backup */}
        <button
          type="button"
          onClick={exportNotesToJson}
          className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#1c1c1c] bg-[#080808] text-xs font-medium text-gray-300 hover:bg-[#121212] transition-colors"
          title="Exportar backup JSON das notas"
        >
          <Download className="w-3.5 h-3.5 text-gray-400" />
          <span>Backup</span>
        </button>

        {/* Theme indicator (Pure Black OLED) */}
        <button
          type="button"
          onClick={toggleTheme}
          className="hidden sm:flex p-2 rounded-xl border border-[#1c1c1c] bg-[#080808] text-gray-300 hover:bg-[#121212] transition-colors"
          title="Tema Preto Ativo"
        >
          {theme === 'dark' ? (
            <Moon className="w-4 h-4 text-brand-400" />
          ) : (
            <Sun className="w-4 h-4 text-amber-400" />
          )}
        </button>

        {/* Admin Panel Button */}
        {isAdmin && onOpenAdmin && (
          <button
            type="button"
            onClick={onOpenAdmin}
            className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl border border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 text-xs font-bold transition-all shadow-sm shadow-amber-500/10"
            title="Abrir Painel Admin"
          >
            <ShieldCheck className="w-4 h-4" />
            <span className="hidden sm:inline">Admin</span>
          </button>
        )}

        {/* Settings Button */}
        <button
          type="button"
          onClick={() => onOpenSettings('editor')}
          className="p-2 rounded-xl border border-[#1c1c1c] bg-[#080808] text-gray-300 hover:bg-[#121212] transition-colors"
          title="Configurações do Editor e Sistema"
        >
          <SettingsIcon className="w-4 h-4" />
        </button>

        {/* User Auth Section */}
        {isAuthenticated && user ? (
          <div className="relative" ref={dropdownRef}>
            <button
              type="button"
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="flex items-center gap-1.5 pl-2 pr-2.5 py-1 rounded-xl border border-brand-500/30 bg-brand-500/10 hover:bg-brand-500/20 text-brand-400 text-xs font-semibold transition-all shadow-sm shadow-brand-500/10"
              title={`Conta: @${user.username}`}
            >
              <div className="w-5 h-5 rounded-lg bg-brand-500 text-white flex items-center justify-center text-[11px] font-bold shrink-0 overflow-hidden">
                {user.avatar_url ? (
                  <img src={user.avatar_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  user.full_name ? user.full_name[0].toUpperCase() : 'U'
                )}
              </div>
              <span className="max-w-[90px] sm:max-w-[120px] truncate font-mono">
                @{user.username}
              </span>
              <ChevronDown className="w-3 h-3 opacity-70 shrink-0" />
            </button>

            {dropdownOpen && (
              <div className="absolute right-0 top-full mt-2 w-56 rounded-2xl bg-[#050505] border border-[#1c1c1c] shadow-2xl p-2 z-50 animate-in fade-in zoom-in-95 duration-150">
                <div className="px-3 py-2 border-b border-[#1c1c1c] flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-brand-500 text-white flex items-center justify-center text-xs font-bold shrink-0 overflow-hidden shadow-sm">
                    {user.avatar_url ? (
                      <img src={user.avatar_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      user.full_name ? user.full_name[0].toUpperCase() : 'U'
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-gray-100 truncate">
                      {user.full_name}
                    </p>
                    <p className="text-[11px] text-gray-400 font-mono truncate">
                      @{user.username}
                    </p>
                  </div>
                </div>

                <div className="py-1">
                  {isAdmin && onOpenAdmin && (
                    <button
                      type="button"
                      onClick={() => {
                        setDropdownOpen(false);
                        onOpenAdmin();
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs text-amber-400 hover:bg-amber-500/10 rounded-xl transition-colors text-left font-semibold"
                    >
                      <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
                      <span>Painel Admin</span>
                    </button>
                  )}
                  {onGoToDashboard && (
                    <button
                      type="button"
                      onClick={() => {
                        setDropdownOpen(false);
                        onGoToDashboard();
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-300 hover:bg-[#121212] rounded-xl transition-colors text-left"
                    >
                      <Home className="w-3.5 h-3.5 text-brand-400" />
                      <span>Painel de Início</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setDropdownOpen(false);
                      onOpenSettings('account');
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-300 hover:bg-[#121212] rounded-xl transition-colors text-left"
                  >
                    <User className="w-3.5 h-3.5 text-brand-400" />
                    <span>Minha Conta</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDropdownOpen(false);
                      logout();
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-500 hover:bg-red-500/10 rounded-xl transition-colors text-left"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Sair da Conta</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2">
            {isGuest && (
              <span className="hidden lg:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-amber-500/10 border border-amber-500/30 text-[11px] font-medium text-amber-300">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                <span>Modo Visitante (400 carac.)</span>
              </span>
            )}

            {onExitGuest && isGuest && (
              <button
                type="button"
                onClick={onExitGuest}
                className="px-2.5 py-1.5 rounded-xl text-xs font-semibold text-gray-400 hover:text-white hover:bg-[#121212] transition-colors"
                title="Voltar para a página de início"
              >
                Início
              </button>
            )}

            <button
              type="button"
              onClick={onOpenSignUp || onOpenAuthModal}
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold shadow-md shadow-brand-600/25 transition-all active:scale-[0.98]"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Cadastrar</span>
            </button>

            <button
              type="button"
              onClick={onOpenAuthModal}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#222] bg-[#0c0c0c] hover:bg-[#151515] text-gray-200 text-xs font-semibold transition-all active:scale-[0.98]"
            >
              <span>Entrar</span>
            </button>
          </div>
        )}
      </div>
    </header>
  );
};

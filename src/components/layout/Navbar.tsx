import React, { useState, useRef, useEffect } from 'react';
import { useTheme } from '../../hooks/useTheme';
import { useAuth } from '../../hooks/useAuth';
import { 
  Menu, 
  Sun, 
  Moon, 
  Settings as SettingsIcon, 
  Cloud, 
  Download,
  User,
  LogOut,
  ChevronDown,
  Sparkles,
  Mail
} from 'lucide-react';
import { exportNotesToJson } from '../../lib/exportImport';

interface NavbarProps {
  onToggleMobileSidebar: () => void;
  onOpenSettings: (tab?: 'account' | 'email' | 'editor' | 'cloud' | 'security' | 'backup') => void;
  onOpenAuthModal: () => void;
  totalNotes: number;
}

export const Navbar: React.FC<NavbarProps> = ({
  onToggleMobileSidebar,
  onOpenSettings,
  onOpenAuthModal,
  totalNotes,
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

        <div className="flex items-center gap-2 md:hidden">
          <div className="w-6 h-6 rounded-lg bg-gradient-to-tr from-brand-600 to-cyan-500 flex items-center justify-center text-white font-black text-xs">
            7
          </div>
          <span className="font-bold text-sm text-gray-100">7NotPad</span>
        </div>
      </div>

      {/* Sync Status Badge & Action Controls */}
      <div className="flex items-center gap-1.5 sm:gap-2.5">
        {/* Firebase Cloud Sync Status */}
        <button
          type="button"
          onClick={() => onOpenSettings('cloud')}
          className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-xs font-medium text-emerald-400 hover:bg-emerald-500/20 transition-colors"
          title={`Firebase Conectado (${totalNotes} notas)`}
        >
          <Cloud className="w-3.5 h-3.5 text-emerald-400" />
          <span>Firebase Conectado</span>
        </button>

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
              <div className="w-5 h-5 rounded-lg bg-brand-500 text-white flex items-center justify-center text-[11px] font-bold shrink-0">
                {user.full_name ? user.full_name[0].toUpperCase() : 'U'}
              </div>
              <span className="max-w-[90px] sm:max-w-[120px] truncate font-mono">
                @{user.username}
              </span>
              <ChevronDown className="w-3 h-3 opacity-70 shrink-0" />
            </button>

            {dropdownOpen && (
              <div className="absolute right-0 top-full mt-2 w-56 rounded-2xl bg-[#050505] border border-[#1c1c1c] shadow-2xl p-2 z-50 animate-in fade-in zoom-in-95 duration-150">
                <div className="px-3 py-2 border-b border-[#1c1c1c]">
                  <p className="text-xs font-bold text-gray-100 truncate">
                    {user.full_name}
                  </p>
                  <p className="text-[11px] text-gray-400 font-mono truncate">
                    @{user.username}
                  </p>
                </div>

                <div className="py-1">
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
                      onOpenSettings('email');
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-300 hover:bg-[#121212] rounded-xl transition-colors text-left"
                  >
                    <Mail className="w-3.5 h-3.5 text-blue-400" />
                    <span>Serviço de E-mail</span>
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
          <button
            type="button"
            onClick={onOpenAuthModal}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold shadow-md shadow-brand-600/25 transition-all active:scale-[0.98]"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Entrar</span>
          </button>
        )}
      </div>
    </header>
  );
};

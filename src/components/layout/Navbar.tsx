import React from 'react';
import { useTheme } from '../../hooks/useTheme';
import { 
  Menu, 
  Sun, 
  Moon, 
  Settings as SettingsIcon, 
  Cloud, 
  Download
} from 'lucide-react';
import { exportNotesToJson } from '../../lib/exportImport';

interface NavbarProps {
  onToggleMobileSidebar: () => void;
  onOpenSettings: () => void;
  totalNotes: number;
}

export const Navbar: React.FC<NavbarProps> = ({
  onToggleMobileSidebar,
  onOpenSettings,
  totalNotes,
}) => {
  const { theme, toggleTheme } = useTheme();

  return (
    <header className="h-14 border-b border-gray-200 dark:border-[#232838] bg-white/80 dark:bg-dark-surface/80 backdrop-blur-md px-4 flex items-center justify-between shrink-0 z-20">
      {/* Mobile Toggle & Brand */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onToggleMobileSidebar}
          className="p-2 rounded-xl border border-gray-200 dark:border-[#232838] text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-[#181b24] md:hidden transition-colors"
          title="Abrir lista de notas"
        >
          <Menu className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-2 md:hidden">
          <div className="w-6 h-6 rounded-lg bg-gradient-to-tr from-brand-600 to-cyan-500 flex items-center justify-center text-white font-black text-xs">
            7
          </div>
          <span className="font-bold text-sm text-gray-900 dark:text-gray-100">7NotPad</span>
        </div>
      </div>

      {/* Sync Status Badge & Action Controls */}
      <div className="flex items-center gap-2.5">
        {/* Firebase Cloud Sync Status */}
        <button
          type="button"
          onClick={onOpenSettings}
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
          className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-gray-200 dark:border-[#232838] bg-gray-50 dark:bg-[#14161f] text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-[#181b24] transition-colors"
          title="Exportar backup JSON das notas"
        >
          <Download className="w-3.5 h-3.5 text-gray-400" />
          <span>Backup</span>
        </button>

        {/* Theme Toggle (Dark Mode default) */}
        <button
          type="button"
          onClick={toggleTheme}
          className="p-2 rounded-xl border border-gray-200 dark:border-[#232838] text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-[#181b24] transition-colors"
          title={theme === 'dark' ? 'Mudar para Modo Claro' : 'Mudar para Modo Escuro'}
        >
          {theme === 'dark' ? (
            <Sun className="w-4 h-4 text-amber-400" />
          ) : (
            <Moon className="w-4 h-4 text-brand-600" />
          )}
        </button>

        {/* Settings Button */}
        <button
          type="button"
          onClick={onOpenSettings}
          className="p-2 rounded-xl border border-gray-200 dark:border-[#232838] text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-[#181b24] transition-colors"
          title="Configurações do Editor e Sistema"
        >
          <SettingsIcon className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};

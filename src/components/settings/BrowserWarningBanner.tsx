import React, { useState, useEffect } from 'react';
import { AlertCircle, X, Download } from 'lucide-react';
import { exportNotesToJson } from '../../lib/exportImport';

const BANNER_DISMISSED_KEY = '7notpad_warning_banner_dismissed';

export const BrowserWarningBanner: React.FC = () => {
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    const isDismissed = localStorage.getItem(BANNER_DISMISSED_KEY);
    if (!isDismissed) {
      setDismissed(false);
    }
  }, []);

  const handleDismiss = () => {
    localStorage.setItem(BANNER_DISMISSED_KEY, 'true');
    setDismissed(true);
  };

  if (dismissed) return null;

  return (
    <div className="bg-gradient-to-r from-amber-500/15 via-brand-500/10 to-amber-500/15 border-b border-amber-500/20 px-4 py-2 text-xs flex items-center justify-between gap-3 text-amber-200 shrink-0">
      <div className="flex items-center gap-2 truncate">
        <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
        <span className="truncate">
          <strong>Aviso:</strong> O 7NotPad não exige cadastro. Suas notas estão vinculadas a este navegador. Limpar dados/cookies pode apagar suas notas.
        </span>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={exportNotesToJson}
          className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 font-medium transition-colors text-[11px]"
        >
          <Download className="w-3 h-3" />
          <span>Baixar Backup</span>
        </button>
        <button
          onClick={handleDismiss}
          className="p-1 text-amber-400 hover:text-white transition-colors"
          title="Dispensar aviso"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};

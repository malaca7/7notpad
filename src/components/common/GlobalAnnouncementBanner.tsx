import React, { useState, useEffect } from 'react';
import { 
  Megaphone, 
  AlertTriangle, 
  AlertOctagon, 
  CheckCircle2, 
  ExternalLink, 
  X 
} from 'lucide-react';
import type { PlatformLimits, AnnouncementType } from '../../lib/platformSettings';
import { CloudShareService } from '../../lib/cloudShare';
import type { UserProfile } from '../../types/auth';

interface GlobalAnnouncementBannerProps {
  limits: PlatformLimits;
  isAuthenticated: boolean;
  currentUser?: UserProfile | null;
}

const DISMISSED_KEY = '7notpad_dismissed_announcement_text';

export const GlobalAnnouncementBanner: React.FC<GlobalAnnouncementBannerProps> = ({
  limits,
  isAuthenticated,
  currentUser,
}) => {
  const [dismissedText, setDismissedText] = useState<string | null>(() => {
    try {
      return sessionStorage.getItem(DISMISSED_KEY);
    } catch {
      return null;
    }
  });

  // Listen for admin reset dismissal events in real time
  useEffect(() => {
    const unsub = CloudShareService.subscribeToGlobalRealtimeEvents((event) => {
      if (event?.type === 'announcement_reset_dismissals') {
        setDismissedText(null);
        try {
          sessionStorage.removeItem(DISMISSED_KEY);
        } catch {}
      }
    });
    return unsub;
  }, []);

  // Reset dismissal if announcement text changed
  useEffect(() => {
    if (dismissedText && dismissedText !== limits.announcementBanner) {
      setDismissedText(null);
      try {
        sessionStorage.removeItem(DISMISSED_KEY);
      } catch {}
    }
  }, [limits.announcementBanner, dismissedText]);

  if (!limits.announcementActive || !limits.announcementBanner?.trim()) {
    return null;
  }

  // Audience filtering
  if (limits.announcementAudience === 'authenticated' && !isAuthenticated) {
    return null;
  }
  if (limits.announcementAudience === 'anonymous' && isAuthenticated) {
    return null;
  }

  // Dismissible check
  if (limits.announcementDismissible !== false && dismissedText === limits.announcementBanner) {
    return null;
  }

  const handleDismiss = () => {
    try {
      sessionStorage.setItem(DISMISSED_KEY, limits.announcementBanner);
    } catch {}
    setDismissedText(limits.announcementBanner);

    // Record read/closed receipt in cloud so admin panel sees who closed it
    CloudShareService.recordAnnouncementRead({
      user_id: currentUser?.id,
      username: currentUser?.username || 'Visitante',
      full_name: currentUser?.full_name || currentUser?.username || 'Visitante Anônimo',
      is_anonymous: !currentUser,
      announcement_banner: limits.announcementBanner,
    }).catch(() => {});
  };

  const type: AnnouncementType = limits.announcementType || 'info';

  const styleConfig = {
    info: {
      barClass: 'border-b border-cyan-500/30 bg-gradient-to-r from-cyan-950/95 via-[#0c1629] to-cyan-950/95 text-cyan-100 shadow-md shadow-cyan-950/30',
      badgeClass: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
      badgeText: 'Aviso',
      icon: <Megaphone className="w-3.5 h-3.5 text-cyan-400 shrink-0" />,
      linkClass: 'bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border-cyan-500/40',
    },
    warning: {
      barClass: 'border-b border-amber-500/30 bg-gradient-to-r from-amber-950/95 via-[#1b1406] to-amber-950/95 text-amber-100 shadow-md shadow-amber-950/30',
      badgeClass: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
      badgeText: 'Atenção',
      icon: <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />,
      linkClass: 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border-amber-500/40',
    },
    critical: {
      barClass: 'border-b border-rose-500/40 bg-gradient-to-r from-rose-950/95 via-[#220910] to-rose-950/95 text-rose-100 shadow-md shadow-rose-950/30',
      badgeClass: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
      badgeText: 'Urgente',
      icon: <AlertOctagon className="w-3.5 h-3.5 text-rose-400 shrink-0 animate-pulse" />,
      linkClass: 'bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border-rose-500/40',
    },
    success: {
      barClass: 'border-b border-emerald-500/30 bg-gradient-to-r from-emerald-950/95 via-[#081a12] to-emerald-950/95 text-emerald-100 shadow-md shadow-emerald-950/30',
      badgeClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
      badgeText: 'Novidade',
      icon: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />,
      linkClass: 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border-emerald-500/40',
    },
  }[type];

  return (
    <aside
      aria-label="Transmissão de Aviso Global"
      className={`w-full py-2 px-3 sm:px-6 flex items-center justify-between gap-3 text-xs shrink-0 z-30 transition-all select-none ${styleConfig.barClass}`}
    >
      <div className="flex items-center gap-2.5 min-w-0 flex-1">
        <span className="flex items-center gap-1.5 shrink-0">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-current opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-current" />
          </span>
          {styleConfig.icon}
        </span>

        <span className={`text-[10px] font-bold uppercase font-mono px-1.5 py-0.5 rounded border shrink-0 hidden sm:inline-block ${styleConfig.badgeClass}`}>
          {styleConfig.badgeText}
        </span>

        <p className="text-xs font-medium leading-tight truncate">
          {limits.announcementBanner}
        </p>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {limits.announcementLink && limits.announcementLink.trim() && (
          <a
            href={limits.announcementLink}
            target="_blank"
            rel="noopener noreferrer"
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-all hover:scale-105 active:scale-95 ${styleConfig.linkClass}`}
          >
            <span>{limits.announcementLinkLabel || 'Ver Mais'}</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        )}

        {limits.announcementDismissible !== false && (
          <button
            type="button"
            onClick={handleDismiss}
            className="p-1 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
            title="Dispensar este aviso nesta sessão"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </aside>
  );
};

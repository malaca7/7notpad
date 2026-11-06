import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Megaphone, 
  AlertTriangle, 
  AlertOctagon, 
  CheckCircle2, 
  ExternalLink, 
  X,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import type { PlatformLimits, AnnouncementItem, AnnouncementType } from '../../lib/platformSettings';
import { CloudShareService } from '../../lib/cloudShare';
import type { UserProfile } from '../../types/auth';

interface GlobalAnnouncementBannerProps {
  limits: PlatformLimits;
  isAuthenticated: boolean;
  currentUser?: UserProfile | null;
}

const DISMISSED_STORAGE_KEY = '7notpad_dismissed_announcements_v2';

export const GlobalAnnouncementBanner: React.FC<GlobalAnnouncementBannerProps> = ({
  limits,
  isAuthenticated,
  currentUser,
}) => {
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(() => {
    try {
      const raw = sessionStorage.getItem(DISMISSED_STORAGE_KEY);
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) return new Set(arr);
      }
    } catch {}
    return new Set<string>();
  });

  const [currentIndex, setCurrentIndex] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const timerRef = useRef<any>(null);

  // Listen for admin reset dismissal events in real time
  useEffect(() => {
    const unsub = CloudShareService.subscribeToGlobalRealtimeEvents((event) => {
      if (event?.type === 'announcement_reset_dismissals') {
        setDismissedIds(new Set());
        try {
          sessionStorage.removeItem(DISMISSED_STORAGE_KEY);
        } catch {}
      }
    });
    return unsub;
  }, []);

  // Compute all eligible active announcements for the current user/visitor
  const activeAnnouncements: AnnouncementItem[] = useMemo(() => {
    let list: AnnouncementItem[] = [];

    if (Array.isArray(limits.announcements) && limits.announcements.length > 0) {
      list = limits.announcements;
    } else if (limits.announcementActive && limits.announcementBanner?.trim()) {
      list = [
        {
          id: 'ann_legacy_item',
          message: limits.announcementBanner.trim(),
          type: limits.announcementType || 'info',
          audience: limits.announcementAudience || 'all',
          is_active: true,
          link_url: limits.announcementLink || '',
          link_text: limits.announcementLinkLabel || 'Saiba mais',
          dismissible: limits.announcementDismissible !== false,
          created_at: '',
          updated_at: '',
        },
      ];
    }

    return list.filter((a) => {
      if (!a.is_active || !a.message?.trim()) return false;
      if (a.audience === 'authenticated' && !isAuthenticated) return false;
      if (a.audience === 'anonymous' && isAuthenticated) return false;
      if (a.dismissible !== false && (dismissedIds.has(a.id) || dismissedIds.has(a.message.trim()))) return false;
      return true;
    });
  }, [limits.announcements, limits.announcementActive, limits.announcementBanner, limits.announcementType, limits.announcementAudience, limits.announcementLink, limits.announcementLinkLabel, limits.announcementDismissible, isAuthenticated, dismissedIds]);

  // Clamp current index when active list changes
  useEffect(() => {
    if (currentIndex >= activeAnnouncements.length) {
      setCurrentIndex(Math.max(0, activeAnnouncements.length - 1));
    }
  }, [activeAnnouncements.length, currentIndex]);

  // Auto-cycle announcements when multiple are present
  useEffect(() => {
    if (activeAnnouncements.length <= 1 || isHovered) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    timerRef.current = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % activeAnnouncements.length);
    }, 6000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [activeAnnouncements.length, isHovered]);

  if (activeAnnouncements.length === 0) {
    return null;
  }

  const current = activeAnnouncements[currentIndex] || activeAnnouncements[0];
  if (!current) return null;

  const handleDismiss = () => {
    const updated = new Set(dismissedIds);
    updated.add(current.id);
    if (current.message) updated.add(current.message.trim());
    setDismissedIds(updated);

    try {
      sessionStorage.setItem(DISMISSED_STORAGE_KEY, JSON.stringify(Array.from(updated)));
    } catch {}

    // Record read/closed receipt in cloud so admin panel sees who closed which announcement
    CloudShareService.recordAnnouncementRead({
      user_id: currentUser?.id,
      username: currentUser?.username || 'Visitante',
      full_name: currentUser?.full_name || currentUser?.username || 'Visitante Anônimo',
      is_anonymous: !currentUser,
      announcement_banner: current.message,
      announcement_id: current.id,
    }).catch(() => {});
  };

  const handlePrev = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentIndex((prev) => (prev - 1 + activeAnnouncements.length) % activeAnnouncements.length);
  };

  const handleNext = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentIndex((prev) => (prev + 1) % activeAnnouncements.length);
  };

  const type: AnnouncementType = current.type || 'info';

  const styleConfig = {
    info: {
      barClass: 'border-b border-cyan-500/30 bg-gradient-to-r from-cyan-950/95 via-[#06121f] to-cyan-950/95 text-cyan-100 shadow-md shadow-cyan-950/30',
      badgeClass: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
      badgeText: 'Aviso',
      icon: <Megaphone className="w-3.5 h-3.5 text-cyan-400 shrink-0" />,
      linkClass: 'bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border-cyan-500/40',
      dotClass: 'bg-cyan-400',
    },
    warning: {
      barClass: 'border-b border-amber-500/30 bg-gradient-to-r from-amber-950/95 via-[#1b1406] to-amber-950/95 text-amber-100 shadow-md shadow-amber-950/30',
      badgeClass: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
      badgeText: 'Atenção',
      icon: <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />,
      linkClass: 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border-amber-500/40',
      dotClass: 'bg-amber-400',
    },
    critical: {
      barClass: 'border-b border-rose-500/40 bg-gradient-to-r from-rose-950/95 via-[#220910] to-rose-950/95 text-rose-100 shadow-md shadow-rose-950/30',
      badgeClass: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
      badgeText: 'Urgente',
      icon: <AlertOctagon className="w-3.5 h-3.5 text-rose-400 shrink-0 animate-pulse" />,
      linkClass: 'bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border-rose-500/40',
      dotClass: 'bg-rose-400',
    },
    success: {
      barClass: 'border-b border-emerald-500/30 bg-gradient-to-r from-emerald-950/95 via-[#081a12] to-emerald-950/95 text-emerald-100 shadow-md shadow-emerald-950/30',
      badgeClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
      badgeText: 'Novidade',
      icon: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />,
      linkClass: 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border-emerald-500/40',
      dotClass: 'bg-emerald-400',
    },
  }[type];

  return (
    <aside
      aria-label="Transmissão de Aviso Global"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`w-full py-2 px-3 sm:px-6 flex items-center justify-between gap-3 text-xs shrink-0 z-30 transition-all select-none ${styleConfig.barClass}`}
    >
      <div className="flex items-center gap-2.5 min-w-0 flex-1">
        <span className="flex items-center gap-1.5 shrink-0">
          <span className="relative flex h-2 w-2">
            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${styleConfig.dotClass}`} />
            <span className={`relative inline-flex rounded-full h-2 w-2 ${styleConfig.dotClass}`} />
          </span>
          {styleConfig.icon}
        </span>

        <span className={`text-[10px] font-bold uppercase font-mono px-1.5 py-0.5 rounded border shrink-0 hidden sm:inline-block ${styleConfig.badgeClass}`}>
          {styleConfig.badgeText}
        </span>

        <p className="text-xs font-medium leading-tight truncate">
          {current.message}
        </p>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {/* Carousel controls if more than 1 announcement */}
        {activeAnnouncements.length > 1 && (
          <div className="flex items-center gap-1 bg-black/40 px-1.5 py-0.5 rounded-lg border border-white/10 text-[11px] font-mono text-gray-300">
            <button
              type="button"
              onClick={handlePrev}
              className="p-0.5 rounded hover:bg-white/10 hover:text-white transition-colors"
              title="Aviso anterior"
            >
              <ChevronLeft className="w-3 h-3" />
            </button>
            <span className="px-1 text-[10px] font-semibold text-gray-300">
              {currentIndex + 1}/{activeAnnouncements.length}
            </span>
            <button
              type="button"
              onClick={handleNext}
              className="p-0.5 rounded hover:bg-white/10 hover:text-white transition-colors"
              title="Próximo aviso"
            >
              <ChevronRight className="w-3 h-3" />
            </button>
          </div>
        )}

        {/* Action Link Button */}
        {current.link_url && current.link_url.trim() && (
          <a
            href={current.link_url}
            target="_blank"
            rel="noopener noreferrer"
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-all hover:scale-105 active:scale-95 ${styleConfig.linkClass}`}
          >
            <span>{current.link_text || 'Ver Mais'}</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        )}

        {/* Dismiss Button */}
        {current.dismissible !== false && (
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

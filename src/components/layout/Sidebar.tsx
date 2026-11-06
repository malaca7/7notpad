import React, { useState, useMemo } from 'react';
import type { Note } from '../../types/note';
import { 
  Plus, 
  Search, 
  Pin, 
  Share2, 
  Trash2, 
  Paperclip, 
  Calendar,
  FileText,
  X,
  Sparkles,
  Home,
  ShieldCheck
} from 'lucide-react';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { hasDirectNoteAccess } from '../../lib/storage';

interface SidebarProps {
  notes: Note[];
  activeNoteId: string | null;
  onSelectNote: (id: string) => void;
  onCreateNote: (template?: { title?: string; content?: string }) => void;
  onDeleteNote: (id: string) => void;
  onCloseMobile?: () => void;
  isMobileOpen?: boolean;
  onGoToDashboard?: () => void;
  isDashboard?: boolean;
  onOpenAdmin?: () => void;
  isAdmin?: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({
  notes,
  activeNoteId,
  onSelectNote,
  onCreateNote,
  onDeleteNote,
  onCloseMobile,
  isMobileOpen = false,
  onGoToDashboard,
  isDashboard = false,
  onOpenAdmin,
  isAdmin = false,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'pinned' | 'shared'>('all');
  const [noteToDelete, setNoteToDelete] = useState<string | null>(null);

  // Helper to extract plain text snippet from TipTap HTML
  const getExcerpt = (html: string) => {
    if (!html) return 'Nota vazia';
    const temp = document.createElement('div');
    temp.innerHTML = html;
    const text = temp.textContent || temp.innerText || '';
    return text.trim().slice(0, 80) || 'Sem conteúdo adicional';
  };

  // Filter notes by search query and category
  const filteredNotes = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return notes
      .filter((note) => {
        // Search in title and content
        if (q) {
          const matchTitle = note.title.toLowerCase().includes(q);
          const temp = document.createElement('div');
          temp.innerHTML = note.content;
          const matchContent = (temp.textContent || '').toLowerCase().includes(q);
          if (!matchTitle && !matchContent) return false;
        }

        // Category filter
        if (filter === 'pinned' && !note.is_pinned) return false;
        if (filter === 'shared' && (!note.share || !note.share.is_active)) return false;

        return true;
      })
      .sort((a, b) => {
        // Pinned notes come first
        if (a.is_pinned && !b.is_pinned) return -1;
        if (!a.is_pinned && b.is_pinned) return 1;
        // Then by updated_at descending
        return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
      });
  }, [notes, searchQuery, filter]);

  const formatDate = (isoDate: string) => {
    try {
      const date = new Date(isoDate);
      const now = new Date();
      const isToday = date.toDateString() === now.toDateString();

      if (isToday) {
        return `Hoje às ${date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
      }
      return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
    } catch {
      return '';
    }
  };

  return (
    <>
      <aside
        className={`w-[86vw] max-w-[320px] md:w-80 lg:w-84 shrink-0 flex flex-col h-full bg-[#050505] border-r border-[#1c1c1c] transition-all z-40 ${
          isMobileOpen
            ? 'fixed inset-y-0 left-0 shadow-2xl flex'
            : 'hidden md:flex'
        }`}
      >
        {/* Sidebar Header / Brand */}
        <div className="p-4 border-b border-[#1c1c1c] flex items-center justify-between">
          <div 
            onClick={() => {
              if (onGoToDashboard) onGoToDashboard();
              if (onCloseMobile) onCloseMobile();
            }}
            className={`flex items-center gap-2.5 ${onGoToDashboard ? 'cursor-pointer select-none active:opacity-75' : ''}`}
            title="Ir para o Painel de Início"
          >
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-brand-600 to-cyan-500 flex items-center justify-center text-white font-black text-sm shadow-md shadow-brand-500/20">
              7
            </div>
            <div>
              <h1 className="font-bold text-base tracking-tight text-gray-100 flex items-center gap-1.5">
                7NotPad
                <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-brand-500/10 text-brand-400 border border-brand-500/20">
                  v1.0
                </span>
              </h1>
              <p className="text-[11px] text-gray-400">Bloco de Notas Online</p>
            </div>
          </div>

          {isMobileOpen && (
            <button
              onClick={onCloseMobile}
              className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-[#121212] md:hidden"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Dashboard / Home Navigation */}
        {onGoToDashboard && (
          <div className="px-3 pt-3">
            <button
              type="button"
              onClick={() => {
                onGoToDashboard();
                if (onCloseMobile) onCloseMobile();
              }}
              className={`w-full flex items-center gap-2.5 py-2 px-3 rounded-xl border text-xs font-semibold transition-all ${
                isDashboard
                  ? 'border-brand-500/40 bg-brand-500/15 text-brand-300 shadow-sm shadow-brand-500/10'
                  : 'border-[#1c1c1c] bg-[#080808] hover:bg-[#121212] text-gray-300 hover:text-white'
              }`}
            >
              <Home className="w-4 h-4 text-brand-400" />
              <span>Painel de Início</span>
              {isDashboard && (
                <span className="ml-auto w-2 h-2 rounded-full bg-brand-400 animate-pulse"></span>
              )}
            </button>
          </div>
        )}

        {/* Admin Navigation */}
        {isAdmin && onOpenAdmin && (
          <div className="px-3 pt-1.5">
            <button
              type="button"
              onClick={() => {
                onOpenAdmin();
                if (onCloseMobile) onCloseMobile();
              }}
              className="w-full flex items-center gap-2.5 py-2 px-3 rounded-xl border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 text-xs font-bold transition-all shadow-sm shadow-amber-500/10"
            >
              <ShieldCheck className="w-4 h-4 text-amber-400" />
              <span>Painel Admin</span>
              <span className="ml-auto text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300">
                ADMIN
              </span>
            </button>
          </div>
        )}

        {/* New Note Button */}
        <div className="p-3">
          <button
            type="button"
            onClick={() => {
              onCreateNote();
              if (onCloseMobile) onCloseMobile();
            }}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-brand-600 hover:bg-brand-500 text-white font-semibold text-sm shadow-md shadow-brand-600/25 transition-all group active:scale-[0.98]"
          >
            <Plus className="w-4 h-4 transition-transform group-hover:rotate-90" />
            <span>Nova Nota</span>
            <span className="hidden sm:inline-block text-[11px] opacity-70 ml-auto font-mono bg-white/10 px-1.5 py-0.5 rounded">
              Ctrl+N
            </span>
          </button>
        </div>

        {/* Search Input */}
        <div className="px-3 pb-2">
          <div className="flex items-center px-3 py-2 rounded-xl bg-[#0a0a0a] border border-[#1c1c1c] focus-within:ring-2 focus-within:ring-brand-500/40 transition-all">
            <Search className="w-4 h-4 text-gray-400 mr-2 shrink-0" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Pesquisar por título ou texto..."
              className="w-full bg-transparent text-xs text-gray-100 placeholder:text-gray-500 outline-none"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="text-gray-400 hover:text-gray-200 p-0.5"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 px-3 pb-3 border-b border-[#1c1c1c] overflow-x-auto no-scrollbar text-xs">
          <button
            onClick={() => setFilter('all')}
            className={`px-2.5 py-1 rounded-lg font-medium transition-colors shrink-0 ${
              filter === 'all'
                ? 'bg-brand-500/15 text-brand-400 border border-brand-500/30'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            Todas ({notes.length})
          </button>
          <button
            onClick={() => setFilter('pinned')}
            className={`px-2.5 py-1 rounded-lg font-medium transition-colors flex items-center gap-1 shrink-0 ${
              filter === 'pinned'
                ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            <Pin className="w-3 h-3" />
            Fixadas
          </button>
          <button
            onClick={() => setFilter('shared')}
            className={`px-2.5 py-1 rounded-lg font-medium transition-colors flex items-center gap-1 shrink-0 ${
              filter === 'shared'
                ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            <Share2 className="w-3 h-3" />
            Compartilhadas
          </button>
        </div>

        {/* Notes List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
          {filteredNotes.length === 0 ? (
            <div className="p-6 text-center text-gray-500 space-y-2">
              <FileText className="w-8 h-8 mx-auto opacity-40" />
              <p className="text-xs font-medium">Nenhuma nota encontrada</p>
              <p className="text-[11px] opacity-70">
                {searchQuery
                  ? 'Tente pesquisar com outras palavras-chave.'
                  : 'Clique em "Nova Nota" para começar.'}
              </p>
            </div>
          ) : (
            filteredNotes.map((note) => {
              const isActive = note.id === activeNoteId;
              const excerpt = getExcerpt(note.content);
              const isShared = Boolean(note.share && note.share.is_active);
              const noteAccess = hasDirectNoteAccess(note, note.share);

              return (
                <div
                  key={note.id}
                  onClick={() => {
                    onSelectNote(note.id);
                    if (onCloseMobile) onCloseMobile();
                  }}
                  className={`group relative p-3 rounded-2xl cursor-pointer transition-all border ${
                    isActive
                      ? 'bg-[#0f0f0f] border-brand-500/40 shadow-sm'
                      : 'bg-transparent hover:bg-[#0a0a0a] border-transparent hover:border-[#1c1c1c]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <h3
                      className={`text-sm font-semibold truncate ${
                        isActive
                          ? 'text-brand-400'
                          : 'text-gray-200'
                      }`}
                    >
                      {note.title.trim() || 'Nota sem título'}
                    </h3>

                    {/* Delete button (visible on mobile touch + on hover on desktop, only if allowed to delete) */}
                    {noteAccess.canDelete && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setNoteToDelete(note.id);
                        }}
                        className="opacity-100 md:opacity-0 md:group-hover:opacity-100 p-1 rounded-lg text-gray-500 hover:text-rose-500 hover:bg-rose-500/10 transition-all shrink-0"
                        title="Excluir nota"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  <p className="text-xs text-gray-400 line-clamp-2 leading-relaxed mb-2">
                    {excerpt}
                  </p>

                  <div className="flex items-center justify-between text-[11px] text-gray-500">
                    <div className="flex items-center gap-1">
                      <Calendar className="w-3 h-3 opacity-60" />
                      <span>{formatDate(note.updated_at)}</span>
                    </div>

                    <div className="flex items-center gap-2">
                      {note.is_pinned && (
                        <span title="Nota fixada" className="text-amber-400">
                          <Pin className="w-3 h-3 fill-amber-400" />
                        </span>
                      )}
                      {isShared && (
                        <span title="Compartilhada" className="text-cyan-400">
                          <Share2 className="w-3 h-3" />
                        </span>
                      )}
                      {note.attachments && note.attachments.length > 0 && (
                        <span title={`${note.attachments.length} anexo(s)`} className="flex items-center gap-0.5 text-brand-400">
                          <Paperclip className="w-3 h-3" />
                          <span className="text-[10px]">{note.attachments.length}</span>
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Sidebar Footer: Note Count & Notice */}
        <div className="p-3 border-t border-[#1c1c1c] text-[11px] text-gray-500 flex items-center justify-between">
          <span>{notes.length} notas no navegador</span>
          <span className="flex items-center gap-1 text-brand-400">
            <Sparkles className="w-3 h-3" />
            7NotPad
          </span>
        </div>
      </aside>

      {/* Confirmation Dialog for Deleting Note */}
      <ConfirmDialog
        isOpen={Boolean(noteToDelete)}
        title="Excluir Nota?"
        message="Tem certeza de que deseja excluir permanentemente esta nota? Esta ação não pode ser revertida."
        confirmText="Excluir"
        cancelText="Cancelar"
        isDestructive={true}
        onConfirm={() => {
          if (noteToDelete) {
            onDeleteNote(noteToDelete);
            setNoteToDelete(null);
          }
        }}
        onCancel={() => setNoteToDelete(null)}
      />
    </>
  );
};

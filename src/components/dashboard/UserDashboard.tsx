import React, { useState, useMemo } from 'react';
import type { Note } from '../../types/note';
import type { UserProfile } from '../../types/auth';
import { 
  Plus, 
  Search, 
  Pin, 
  Share2, 
  Trash2, 
  Paperclip, 
  Calendar, 
  FileText, 
  CheckSquare, 
  Users, 
  Lightbulb, 
  Sparkles,
  ArrowRight,
  ShieldCheck,
  X
} from 'lucide-react';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { hasDirectNoteAccess } from '../../lib/storage';

interface UserDashboardProps {
  user: UserProfile | null;
  notes: Note[];
  onCreateNote: (template?: { title?: string; content?: string }) => void;
  onSelectNote: (id: string) => void;
  onDeleteNote: (id: string) => void;
  onTogglePin?: (id: string) => void;
}

export const UserDashboard: React.FC<UserDashboardProps> = ({
  user,
  notes,
  onCreateNote,
  onSelectNote,
  onDeleteNote,
  onTogglePin,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'pinned' | 'shared'>('all');
  const [noteToDelete, setNoteToDelete] = useState<string | null>(null);

  // Excerpt helper
  const getExcerpt = (html: string) => {
    if (!html) return 'Nota vazia';
    const temp = document.createElement('div');
    temp.innerHTML = html;
    const text = temp.textContent || temp.innerText || '';
    return text.trim().slice(0, 100) || 'Sem conteúdo adicional';
  };

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

  // Filtered and sorted notes
  const filteredNotes = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    const myUsername = user ? user.username.trim().toLowerCase().replace(/^@+/, '') : '';

    return notes
      .filter((note) => {
        if (q) {
          const matchTitle = note.title.toLowerCase().includes(q);
          const temp = document.createElement('div');
          temp.innerHTML = note.content;
          const matchContent = (temp.textContent || '').toLowerCase().includes(q);
          if (!matchTitle && !matchContent) return false;
        }

        if (filter === 'pinned' && !note.is_pinned) return false;
        if (filter === 'shared') {
          const isNoteShared = Boolean(note.share && note.share.is_active);
          const isSharedWithMe = Boolean(
            note.share?.allowed_users?.some(
              (u) => u.username.trim().toLowerCase().replace(/^@+/, '') === myUsername
            )
          );
          if (!isNoteShared && !isSharedWithMe) return false;
        }

        return true;
      })
      .sort((a, b) => {
        if (a.is_pinned && !b.is_pinned) return -1;
        if (!a.is_pinned && b.is_pinned) return 1;
        return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
      });
  }, [notes, searchQuery, filter, user]);

  const pinnedCount = useMemo(() => notes.filter(n => n.is_pinned).length, [notes]);
  const sharedCount = useMemo(() => {
    const myUser = user ? user.username.trim().toLowerCase().replace(/^@+/, '') : '';
    return notes.filter(
      (n) =>
        (n.share && n.share.is_active) ||
        Boolean(
          n.share?.allowed_users?.some(
            (u) => u.username.trim().toLowerCase().replace(/^@+/, '') === myUser
          )
        )
    ).length;
  }, [notes, user]);

  // Quick templates
  const templates = [
    {
      title: 'Nota em Branco',
      icon: Plus,
      desc: 'Comece do zero com página limpa',
      data: { title: '', content: '' }
    },
    {
      title: 'Checklist de Tarefas',
      icon: CheckSquare,
      desc: 'Organize suas metas com caixas de seleção',
      data: {
        title: 'Tarefas de Hoje ✅',
        content: `
          <h2>Metas Prioritárias</h2>
          <ul data-type="taskList">
            <li data-type="taskItem" data-checked="false"><label><input type="checkbox"></label><div>Primeira tarefa importante</div></li>
            <li data-type="taskItem" data-checked="false"><label><input type="checkbox"></label><div>Revisar documentos e notas</div></li>
            <li data-type="taskItem" data-checked="true"><label><input type="checkbox" checked></label><div>Abrir o 7NotPad</div></li>
          </ul>
        `
      }
    },
    {
      title: 'Pauta de Reunião',
      icon: Users,
      desc: 'Anotações, participantes e decisões',
      data: {
        title: 'Reunião de Alinhamento 📋',
        content: `
          <h2>Pauta de Reunião</h2>
          <p><strong>Data:</strong> ${new Date().toLocaleDateString('pt-BR')}</p>
          <p><strong>Participantes:</strong> Todos os envolvidos</p>
          <hr/>
          <h3>Pontos Discutidos</h3>
          <ul>
            <li>Progresso das entregas semanais</li>
            <li>Próximos passos e prazos</li>
          </ul>
          <h3>Ações Definidas</h3>
          <ul data-type="taskList">
            <li data-type="taskItem" data-checked="false"><label><input type="checkbox"></label><div>Enviar resumo por e-mail</div></li>
          </ul>
        `
      }
    },
    {
      title: 'Ideia de Projeto',
      icon: Lightbulb,
      desc: 'Brainstorming e especificações',
      data: {
        title: 'Novo Projeto 💡',
        content: `
          <h2>Visão Geral do Projeto</h2>
          <p>Descreva o objetivo principal deste projeto e o problema que ele resolve.</p>
          <blockquote><p>Foco na simplicidade, velocidade e valor para os usuários.</p></blockquote>
          <h3>Funcionalidades Chave</h3>
          <ol>
            <li>Interface minimalista e intuitiva</li>
            <li>Segurança sem fricção</li>
          </ol>
        `
      }
    }
  ];

  return (
    <div className="flex-1 overflow-y-auto bg-black text-gray-100 p-4 sm:p-8 lg:p-10 select-none">
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Welcome Banner Card */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0c0d12] via-[#050505] to-black border border-[#1c1c1c] p-6 sm:p-8 shadow-2xl">
          <div className="absolute top-0 right-0 w-80 h-80 bg-brand-600/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />

          <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-500/10 border border-brand-500/20 text-brand-400 text-xs font-semibold">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Página Inicial do Usuário</span>
              </div>

              <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-100 tracking-tight flex items-center gap-3 flex-wrap">
                {user?.avatar_url && (
                  <img
                    src={user.avatar_url}
                    alt={user.full_name}
                    className="w-10 h-10 rounded-2xl object-cover border border-[#262626] shadow-md shrink-0"
                  />
                )}
                <span>Olá, {user?.full_name || 'Usuário'}</span>
                {user?.username && (
                  <span className="text-xs font-mono font-medium px-2 py-0.5 rounded-lg bg-[#141414] border border-[#222] text-gray-400">
                    @{user.username}
                  </span>
                )}
              </h1>

              <p className="text-xs sm:text-sm text-gray-400 max-w-xl leading-relaxed">
                Bem-vindo ao seu painel 7NotPad. Crie um novo bloco de notas, acerte suas ideias ou continue editando seus registros em tempo real.
              </p>

              {/* Stats badges */}
              <div className="flex flex-wrap items-center gap-2 pt-2">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-[#0a0a0a] border border-[#1c1c1c] text-xs text-gray-300">
                  <FileText className="w-3.5 h-3.5 text-brand-400" />
                  <span><strong>{notes.length}</strong> blocos de notas</span>
                </span>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-[#0a0a0a] border border-[#1c1c1c] text-xs text-gray-300">
                  <Pin className="w-3.5 h-3.5 text-amber-400" />
                  <span><strong>{pinnedCount}</strong> fixados</span>
                </span>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-[#0a0a0a] border border-[#1c1c1c] text-xs text-gray-300">
                  <Share2 className="w-3.5 h-3.5 text-cyan-400" />
                  <span><strong>{sharedCount}</strong> compartilhados</span>
                </span>
              </div>
            </div>

            {/* Big Prominent Action: Create Note */}
            <button
              type="button"
              onClick={() => onCreateNote()}
              className="w-full md:w-auto px-6 py-4 rounded-2xl bg-brand-600 hover:bg-brand-500 active:scale-[0.98] text-white font-bold text-sm shadow-xl shadow-brand-600/30 transition-all flex items-center justify-center gap-2.5 shrink-0 group"
            >
              <div className="w-6 h-6 rounded-lg bg-white/20 flex items-center justify-center group-hover:rotate-90 transition-transform">
                <Plus className="w-4 h-4" />
              </div>
              <span>Criar Novo Bloco de Nota</span>
              <ArrowRight className="w-4 h-4 ml-1 opacity-70 group-hover:translate-x-1 transition-transform" />
            </button>
          </div>
        </div>

        {/* Quick Templates Section */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider text-gray-400 flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5 text-brand-400" />
              <span>Modelos Rápidos</span>
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {templates.map((tpl, i) => {
              const Icon = tpl.icon;
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => onCreateNote(tpl.data)}
                  className="p-4 rounded-2xl border border-[#1c1c1c] bg-[#050505] hover:border-brand-500/40 hover:bg-[#0c0c0c] transition-all group text-left shadow-sm flex flex-col justify-between"
                >
                  <div className="w-8 h-8 rounded-xl bg-brand-500/10 text-brand-400 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                    <Icon className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-gray-100 group-hover:text-brand-400 transition-colors">
                      {tpl.title}
                    </h3>
                    <p className="text-[11px] text-gray-500 mt-0.5 line-clamp-1">
                      {tpl.desc}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Notes Search & Directory Section */}
        <div className="space-y-4 pt-2">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <h2 className="text-xs font-bold uppercase tracking-wider text-gray-400 flex items-center gap-2">
              <FileText className="w-3.5 h-3.5 text-cyan-400" />
              <span>Seus Blocos de Notas ({filteredNotes.length})</span>
            </h2>

            {/* Filter Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto text-xs">
              <button
                type="button"
                onClick={() => setFilter('all')}
                className={`px-3 py-1.5 rounded-xl font-medium transition-colors shrink-0 ${
                  filter === 'all'
                    ? 'bg-brand-500/15 text-brand-400 border border-brand-500/30'
                    : 'text-gray-400 hover:text-white bg-[#0a0a0a] border border-[#1c1c1c]'
                }`}
              >
                Todas ({notes.length})
              </button>
              <button
                type="button"
                onClick={() => setFilter('pinned')}
                className={`px-3 py-1.5 rounded-xl font-medium transition-colors flex items-center gap-1 shrink-0 ${
                  filter === 'pinned'
                    ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                    : 'text-gray-400 hover:text-white bg-[#0a0a0a] border border-[#1c1c1c]'
                }`}
              >
                <Pin className="w-3 h-3" />
                Fixadas ({pinnedCount})
              </button>
              <button
                type="button"
                onClick={() => setFilter('shared')}
                className={`px-3 py-1.5 rounded-xl font-medium transition-colors flex items-center gap-1 shrink-0 ${
                  filter === 'shared'
                    ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30'
                    : 'text-gray-400 hover:text-white bg-[#0a0a0a] border border-[#1c1c1c]'
                }`}
              >
                <Share2 className="w-3 h-3" />
                Compartilhadas ({sharedCount})
              </button>
            </div>
          </div>

          {/* Search Bar */}
          <div className="flex items-center px-4 py-2.5 rounded-2xl bg-[#070707] border border-[#1c1c1c] focus-within:ring-2 focus-within:ring-brand-500/30 focus-within:border-brand-500/50 transition-all">
            <Search className="w-4 h-4 text-gray-400 mr-2.5 shrink-0" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Pesquisar bloco de notas por título ou conteúdo..."
              className="w-full bg-transparent text-xs sm:text-sm text-gray-100 placeholder:text-gray-500 outline-none"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="text-gray-400 hover:text-white p-1"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Notes Grid */}
          {filteredNotes.length === 0 ? (
            <div className="p-12 text-center rounded-3xl bg-[#050505] border border-[#1c1c1c] space-y-3">
              <FileText className="w-10 h-10 mx-auto text-gray-600" />
              <h3 className="text-sm font-bold text-gray-300">
                {searchQuery ? 'Nenhum bloco de notas corresponde à pesquisa' : 'Você ainda não possui nenhum bloco de notas'}
              </h3>
              <p className="text-xs text-gray-500 max-w-sm mx-auto">
                {searchQuery
                  ? 'Tente pesquisar com outros termos ou limpe o filtro.'
                  : 'Clique no botão abaixo para criar seu primeiro bloco de notas.'}
              </p>
              {!searchQuery && (
                <button
                  type="button"
                  onClick={() => onCreateNote()}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold transition-colors mt-2"
                >
                  <Plus className="w-4 h-4" />
                  <span>Criar Primeiro Bloco</span>
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {filteredNotes.map((note) => {
                const excerpt = getExcerpt(note.content);
                const isShared = Boolean(note.share && note.share.is_active);
                const noteAccess = hasDirectNoteAccess(note, note.share);
                const myUser = user ? user.username.trim().toLowerCase().replace(/^@+/, '') : '';
                const mySharedAccess = note.share?.allowed_users?.find(
                  (u) => u.username.trim().toLowerCase().replace(/^@+/, '') === myUser
                );

                return (
                  <div
                    key={note.id}
                    onClick={() => onSelectNote(note.id)}
                    className="p-5 rounded-2xl bg-[#050505] border border-[#1c1c1c] hover:border-brand-500/50 hover:bg-[#080808] transition-all cursor-pointer group flex flex-col justify-between shadow-sm relative"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <h3 className="text-sm font-bold text-gray-100 group-hover:text-brand-400 transition-colors truncate">
                          {note.title.trim() || 'Nota sem título'}
                        </h3>

                        <div className="flex items-center gap-1 shrink-0">
                          {onTogglePin && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onTogglePin(note.id);
                              }}
                              className={`p-1 rounded-lg text-gray-500 hover:text-amber-400 transition-colors ${
                                note.is_pinned ? 'text-amber-400' : 'opacity-0 group-hover:opacity-100'
                              }`}
                              title={note.is_pinned ? 'Desafixar nota' : 'Fixar nota'}
                            >
                              <Pin className={`w-3.5 h-3.5 ${note.is_pinned ? 'fill-amber-400' : ''}`} />
                            </button>
                          )}

                          {noteAccess.canDelete && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setNoteToDelete(note.id);
                              }}
                              className="p-1 rounded-lg text-gray-500 hover:text-rose-500 hover:bg-rose-500/10 transition-colors opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                              title="Excluir nota"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      <p className="text-xs text-gray-400 line-clamp-3 leading-relaxed mb-4">
                        {excerpt}
                      </p>
                    </div>

                    <div className="flex items-center justify-between pt-3 border-t border-[#141414] text-[11px] text-gray-500">
                      <div className="flex items-center gap-1">
                        <Calendar className="w-3 h-3 opacity-60" />
                        <span>{formatDate(note.updated_at)}</span>
                      </div>

                      <div className="flex items-center gap-2">
                        {mySharedAccess ? (
                          <span
                            title={`Compartilhada com você como ${mySharedAccess.role === 'admin' ? 'Admin / Editor' : 'Leitor'}`}
                            className="text-purple-400 flex items-center gap-1 font-medium"
                          >
                            <ShieldCheck className="w-3 h-3" />
                            <span className="text-[10px]">
                              {mySharedAccess.role === 'admin' ? 'Admin / Editor' : 'Leitor'}
                            </span>
                          </span>
                        ) : isShared ? (
                          <span title="Compartilhada publicamente" className="text-cyan-400 flex items-center gap-1">
                            <Share2 className="w-3 h-3" />
                            <span className="text-[10px]">Pública</span>
                          </span>
                        ) : null}
                        {note.attachments && note.attachments.length > 0 && (
                          <span title={`${note.attachments.length} anexo(s)`} className="text-brand-400 flex items-center gap-0.5">
                            <Paperclip className="w-3 h-3" />
                            <span className="text-[10px]">{note.attachments.length}</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Confirmation Dialog for Deleting Note */}
      <ConfirmDialog
        isOpen={Boolean(noteToDelete)}
        title="Excluir Bloco de Notas?"
        message="Tem certeza de que deseja excluir permanentemente este bloco de notas? Esta ação não pode ser revertida."
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
    </div>
  );
};

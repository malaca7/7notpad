import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';

import type { Note, SaveStatus, Attachment } from '../../types/note';
import { EditorToolbar } from './EditorToolbar';
import { ImageUploadModal } from './ImageUploadModal';
import { AttachmentManager } from './AttachmentManager';
import { useEditorSettings } from '../../hooks/useEditorSettings';
import { hasDirectNoteAccess } from '../../lib/storage';
import { 
  CheckCircle2, 
  Loader2, 
  AlertCircle, 
  Share2, 
  Pin, 
  Clock,
  Copy,
  Check,
  Eye,
  Lock,
  ShieldAlert,
  Sparkles,
  ArrowRight
} from 'lucide-react';

interface NoteEditorProps {
  note: Note;
  onUpdateNote: (updates: Partial<Note>) => void;
  saveStatus: SaveStatus;
  onOpenShareModal: () => void;
  onTogglePin?: () => void;
  isGuest?: boolean;
  guestMaxCharacters?: number;
  onOpenSignUp?: () => void;
}

export const NoteEditor: React.FC<NoteEditorProps> = ({
  note,
  onUpdateNote,
  saveStatus,
  onOpenShareModal,
  onTogglePin,
  isGuest = false,
  guestMaxCharacters = 400,
  onOpenSignUp,
}) => {
  const { settings } = useEditorSettings();
  const [isImageModalOpen, setIsImageModalOpen] = useState(false);
  const [title, setTitle] = useState(note.title);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const onUpdateNoteRef = useRef(onUpdateNote);
  onUpdateNoteRef.current = onUpdateNote;
  const lastLocalHtmlRef = useRef<string>(note.content || '');

  // Apenas o criador/admin da nota ou quem foi adicionado como Admin do Bloco pode editar e mudar configurações
  const access = useMemo(() => hasDirectNoteAccess(note, note.share), [note, note.share]);
  const canEdit = access.canEdit;
  const canManageShare = access.canManageShare;

  const getNoteUrl = () => {
    const baseUrl = (import.meta as any).env?.BASE_URL || '/';
    const cleanBase = baseUrl === '/' ? '' : baseUrl.replace(/\/+$/, '');
    const slug = note.share?.custom_slug || note.id;
    return `${window.location.origin}${cleanBase}/notpad/${slug}`;
  };

  const handleCopyNoteUrl = async () => {
    try {
      await navigator.clipboard.writeText(getNoteUrl());
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
    } catch {}
  };

  // Sync internal title when note.id or note.title changes
  useEffect(() => {
    setTitle(note.title);
  }, [note.id, note.title]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
      }),
      Underline,
      Image.configure({
        inline: true,
        allowBase64: true,
      }),
      Placeholder.configure({
        placeholder: 'Comece a escrever suas anotações, ideias ou listas aqui...',
      }),
      TaskList,
      TaskItem.configure({
        nested: true,
      }),
    ],
    content: note.content || '',
    editable: canEdit,
    editorProps: {
      attributes: {
        class: 'focus:outline-none min-h-[350px] leading-relaxed',
      },
      handleTextInput(view, from, to, text) {
        if (isGuest) {
          const currentLength = view.state.doc.textContent.length;
          const rangeLength = to - from;
          if (currentLength - rangeLength + text.length > guestMaxCharacters) {
            return true; // Block typing beyond guest limit
          }
        }
        return false;
      },
      handlePaste(view, event) {
        if (isGuest) {
          const pasteText = event.clipboardData?.getData('text/plain') || '';
          const currentLength = view.state.doc.textContent.length;
          const { from, to } = view.state.selection;
          const rangeLength = to - from;
          const available = Math.max(0, guestMaxCharacters - (currentLength - rangeLength));
          if (available <= 0) return true; // block paste completely if already at limit
          if (pasteText.length > available) {
            const sliced = pasteText.slice(0, available);
            view.dispatch(view.state.tr.replaceSelectionWith(view.state.schema.text(sliced)));
            return true;
          }
        }
        return false;
      },
    },
    onUpdate: ({ editor }) => {
      if (!canEdit) return;
      if (isGuest) {
        const text = editor.getText();
        if (text.length > guestMaxCharacters) {
          const truncated = text.slice(0, guestMaxCharacters);
          editor.commands.setContent(`<p>${truncated.replace(/\n/g, '<br>')}</p>`, { emitUpdate: false });
        }
      }
      const html = editor.getHTML();
      lastLocalHtmlRef.current = html;
      onUpdateNoteRef.current({ content: html });
    },
  }, [note.id, isGuest, guestMaxCharacters]);

  // Keep editor editable state in sync with permissions
  useEffect(() => {
    if (editor) {
      editor.setEditable(canEdit);
    }
  }, [editor, canEdit]);

  // Keep editor content in sync when active note changes or when remote/cross-tab sync updates note.content
  useEffect(() => {
    if (!editor) return;
    const incomingContent = note.content || '';
    if (incomingContent !== lastLocalHtmlRef.current && editor.getHTML() !== incomingContent) {
      lastLocalHtmlRef.current = incomingContent;
      editor.commands.setContent(incomingContent, { emitUpdate: false });
    }
  }, [note.id, note.content, editor]);

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!canEdit) return;
    const newTitle = e.target.value;
    setTitle(newTitle);
    onUpdateNote({ title: newTitle });
  };

  const handleInsertImage = (url: string) => {
    if (!canEdit) return;
    if (editor) {
      editor.chain().focus().setImage({ src: url }).run();
    }
  };

  const handleAttachmentsChange = (attachments: Attachment[]) => {
    if (!canEdit) return;
    onUpdateNote({ attachments });
  };

  // Word & character stats
  const stats = useMemo(() => {
    const text = editor ? editor.getText() : '';
    const clean = text.trim();
    const words = clean ? clean.split(/\s+/).length : 0;
    const chars = clean.length;
    return { words, chars };
  }, [editor, note.content]);

  // Font style mappings from settings
  const fontClass = {
    sans: 'font-sans',
    serif: 'font-serif',
    mono: 'font-mono',
  }[settings.fontFamily];

  const fontSizeClass = {
    sm: 'text-sm',
    base: 'text-base',
    lg: 'text-lg',
    xl: 'text-xl',
  }[settings.fontSize];

  const maxWidthClass = {
    narrow: 'max-w-2xl',
    normal: 'max-w-3xl',
    wide: 'max-w-5xl',
    full: 'max-w-full',
  }[settings.editorWidth];

  const lineSpacingClass = {
    compact: 'leading-normal',
    normal: 'leading-relaxed',
    relaxed: 'leading-loose',
  }[settings.lineSpacing];

  const isShared = Boolean(note.share && note.share.is_active);

  return (
    <div className="flex-1 flex flex-col h-full bg-black overflow-hidden">
      {/* Editor Header Bar */}
      <div className="flex items-center justify-between px-3 sm:px-6 py-2.5 sm:py-3 border-b border-[#1c1c1c] bg-[#050505] gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {/* Save Status Indicator */}
          <div className="flex items-center gap-1.5 text-xs shrink-0">
            {saveStatus === 'saving' && (
              <span className="flex items-center gap-1.5 text-brand-400 font-medium animate-pulse">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Salvando...</span>
              </span>
            )}
            {saveStatus === 'saved' && (
              <span className="flex items-center gap-1.5 text-emerald-500 font-medium">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Salvo automaticamente</span>
                <span className="sm:hidden">Salvo</span>
              </span>
            )}
            {saveStatus === 'error' && (
              <span className="flex items-center gap-1.5 text-rose-500 font-medium">
                <AlertCircle className="w-3.5 h-3.5" />
                <span>Erro ao salvar</span>
              </span>
            )}
            {saveStatus === 'unsaved' && (
              <span className="flex items-center gap-1.5 text-amber-500 font-medium">
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
                <span>Pendente</span>
              </span>
            )}
          </div>
        </div>

        {/* Header Right Actions */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Quick Copy Unique Note URL Pill - ONLY SHOWN WHEN NOTE IS ACTIVELY SHARED */}
          {isShared && (
            <button
              type="button"
              onClick={handleCopyNoteUrl}
              title={`Copiar Link Compartilhado: ${getNoteUrl()}`}
              className="flex items-center gap-1.5 px-2 sm:px-2.5 py-1.5 rounded-xl border border-cyan-500/30 bg-cyan-500/10 hover:bg-cyan-500/20 text-[11px] font-mono text-cyan-300 transition-colors shadow-sm"
            >
              <span className="hidden md:inline truncate max-w-[200px]">/notpad/{note.share?.custom_slug || note.id}</span>
              <span className="md:hidden">Link</span>
              {copiedUrl ? (
                <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              ) : (
                <Copy className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
              )}
            </button>
          )}

          {/* Pin Button */}
          {onTogglePin && (
            <button
              type="button"
              onClick={onTogglePin}
              title={note.is_pinned ? 'Desafixar nota' : 'Fixar nota no topo'}
              className={`p-2 rounded-xl border text-xs transition-colors ${
                note.is_pinned
                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                  : 'border-[#1c1c1c] bg-[#0a0a0a] text-gray-400 hover:text-white'
              }`}
            >
              <Pin className={`w-4 h-4 ${note.is_pinned ? 'rotate-45 fill-amber-400' : ''}`} />
            </button>
          )}

          {/* Share Button */}
          <button
            type="button"
            onClick={onOpenShareModal}
            title={canManageShare ? 'Configurar compartilhamento' : 'Visualizar configurações de compartilhamento (Somente Leitura)'}
            className={`flex items-center gap-1.5 px-3 sm:px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all shadow-sm ${
              isShared
                ? 'bg-brand-600 hover:bg-brand-500 text-white shadow-brand-600/30 ring-2 ring-brand-400/50'
                : 'border border-[#1c1c1c] bg-[#0d0d0d] hover:bg-[#171717] text-gray-200'
            }`}
          >
            {canManageShare ? <Share2 className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5 text-amber-400" />}
            <span>Compartilhar</span>
            {isShared && (
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse ml-0.5" />
            )}
          </button>
        </div>
      </div>

      {/* Guest Mode Notice Banner */}
      {isGuest && (
        <div className="px-4 py-2 border-b border-amber-500/25 bg-amber-500/10 flex flex-wrap items-center justify-between gap-2 text-xs text-amber-300">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              <strong>Modo Visitante (Sem Cadastro):</strong> Limite de {guestMaxCharacters} caracteres por bloco • Salvo apenas no seu navegador atual.
            </span>
          </div>
          {onOpenSignUp && (
            <button
              type="button"
              onClick={onOpenSignUp}
              className="px-2.5 py-1 rounded-lg bg-brand-600 hover:bg-brand-500 text-white font-bold text-[11px] transition-colors flex items-center gap-1 shrink-0 shadow-sm"
            >
              <span>Criar Conta Gratuita (Sem Limites)</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          )}
        </div>
      )}

      {/* Formatting Toolbar or Read-Only Banner */}
      {!canEdit ? (
        <div className="px-4 py-2 border-b border-[#1c1c1c] bg-[#080808] flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 text-amber-400">
            <ShieldAlert className="w-4 h-4 shrink-0" />
            <span className="font-medium">
              Modo Visualizador: Apenas o criador ou administradores do bloco podem editar o conteúdo.
            </span>
          </div>
          {access.role && (
            <span className="text-[11px] px-2 py-0.5 rounded-md bg-[#121212] border border-[#222] font-mono text-gray-400">
              Permissão: {access.role === 'admin' ? 'Admin' : 'Leitor'}
            </span>
          )}
        </div>
      ) : (
        <EditorToolbar
          editor={editor}
          onOpenImageModal={() => setIsImageModalOpen(true)}
          noteTitle={title}
        />
      )}

      {/* Editor Content Area */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-5 sm:py-6">
        <div className={`mx-auto ${maxWidthClass} space-y-5 sm:space-y-6`}>
          {/* Note Title Input with ReadOnly Badge */}
          <div className="flex items-center gap-3">
            <input
              type="text"
              value={title}
              onChange={handleTitleChange}
              readOnly={!canEdit}
              disabled={!canEdit}
              placeholder="Título da nota..."
              className={`w-full bg-transparent text-xl sm:text-3xl font-bold tracking-tight text-gray-100 placeholder:text-gray-600 outline-none border-b border-transparent ${
                canEdit ? 'focus:border-brand-500/30' : 'cursor-default opacity-90'
              } pb-2 transition-colors`}
            />
            {!canEdit && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-medium shrink-0">
                <Eye className="w-3.5 h-3.5" />
                <span>Somente Leitura</span>
              </div>
            )}
          </div>

          {/* TipTap Document Body */}
          <div className={`${fontClass} ${fontSizeClass} ${lineSpacingClass} text-gray-200 min-h-[260px] sm:min-h-[300px]`}>
            <EditorContent editor={editor} />
          </div>

          {/* Guest Character Limit Alert */}
          {isGuest && stats.chars >= guestMaxCharacters && (
            <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-lg">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>
                  Você atingiu o limite de <strong>{guestMaxCharacters} caracteres</strong> do Modo Visitante. Crie uma conta gratuita para escrever sem limites e salvar na nuvem!
                </span>
              </div>
              {onOpenSignUp && (
                <button
                  type="button"
                  onClick={onOpenSignUp}
                  className="px-3.5 py-1.5 rounded-xl bg-brand-600 hover:bg-brand-500 text-white font-bold text-xs shrink-0 transition-all shadow-md shadow-brand-600/20"
                >
                  Cadastrar Grátis
                </button>
              )}
            </div>
          )}

          {/* Attachments Section */}
          <AttachmentManager
            noteId={note.id}
            attachments={note.attachments || []}
            onAttachmentsChange={handleAttachmentsChange}
            readOnly={!canEdit}
            isGuest={isGuest}
            onOpenSignUp={onOpenSignUp}
          />
        </div>
      </div>

      {/* Editor Status Bar / Footer */}
      <div className="px-4 sm:px-6 py-2 border-t border-[#1c1c1c] bg-[#050505] text-[11px] text-gray-400 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {isGuest ? (
            <div className="flex items-center gap-2.5">
              <span className={stats.chars >= guestMaxCharacters ? 'text-rose-400 font-bold' : stats.chars >= guestMaxCharacters * 0.85 ? 'text-amber-400 font-medium' : 'text-gray-400'}>
                {stats.chars} / {guestMaxCharacters} caracteres (Visitante)
              </span>
              <div className="w-20 sm:w-28 h-1.5 bg-[#171717] rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-200 ${
                    stats.chars >= guestMaxCharacters
                      ? 'bg-rose-500'
                      : stats.chars >= guestMaxCharacters * 0.85
                      ? 'bg-amber-500'
                      : 'bg-brand-500'
                  }`}
                  style={{ width: `${Math.min(100, (stats.chars / guestMaxCharacters) * 100)}%` }}
                />
              </div>
            </div>
          ) : (
            <>
              <span>{stats.words} palavras</span>
              <span>•</span>
              <span>{stats.chars} caracteres</span>
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Clock className="w-3 h-3 text-gray-400" />
          <span>
            Atualizado {new Date(note.updated_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
      </div>

      {/* Image Upload Modal */}
      <ImageUploadModal
        isOpen={isImageModalOpen}
        onClose={() => setIsImageModalOpen(false)}
        onInsertImage={handleInsertImage}
      />
    </div>
  );
};

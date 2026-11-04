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
import { isNoteUnlockedInCurrentTab, markNoteUnlockedInCurrentTab } from '../../lib/storage';
import { verifyPassword } from '../../lib/crypto';
import { 
  CheckCircle2, 
  Loader2, 
  AlertCircle, 
  Share2, 
  Pin, 
  Clock,
  Copy,
  Check,
  Lock,
  KeyRound
} from 'lucide-react';

interface NoteEditorProps {
  note: Note;
  onUpdateNote: (updates: Partial<Note>) => void;
  saveStatus: SaveStatus;
  onOpenShareModal: () => void;
  onTogglePin?: () => void;
}

export const NoteEditor: React.FC<NoteEditorProps> = ({
  note,
  onUpdateNote,
  saveStatus,
  onOpenShareModal,
  onTogglePin,
}) => {
  const { settings } = useEditorSettings();
  const [isImageModalOpen, setIsImageModalOpen] = useState(false);
  const [title, setTitle] = useState(note.title);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [editorPasswordInput, setEditorPasswordInput] = useState('');
  const [editorPasswordError, setEditorPasswordError] = useState('');
  const [isVerifyingPassword, setIsVerifyingPassword] = useState(false);
  const [, setUnlockRevision] = useState(0);
  const onUpdateNoteRef = useRef(onUpdateNote);
  onUpdateNoteRef.current = onUpdateNote;
  const lastLocalHtmlRef = useRef<string>(note.content || '');

  const isPasswordLocked = Boolean(
    note.share?.is_active &&
    note.share?.is_password_protected &&
    note.share?.password_hash &&
    !isNoteUnlockedInCurrentTab(note.id, note.share.password_hash)
  );

  // Clear password input & error whenever password hash changes
  useEffect(() => {
    setEditorPasswordInput('');
    setEditorPasswordError('');
  }, [note.id, note.share?.password_hash, note.share?.is_password_protected]);

  const handleUnlockEditor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editorPasswordInput.trim()) {
      setEditorPasswordError('Por favor, informe a senha.');
      return;
    }
    if (!note.share?.password_hash || !note.share?.password_salt) return;

    setIsVerifyingPassword(true);
    setEditorPasswordError('');
    try {
      const valid = await verifyPassword(
        editorPasswordInput,
        note.share.password_salt,
        note.share.password_hash
      );
      if (valid) {
        markNoteUnlockedInCurrentTab(note.id, note.share.password_hash);
        setEditorPasswordInput('');
        setUnlockRevision((r) => r + 1);
      } else {
        setEditorPasswordError('Senha incorreta. Tente novamente.');
      }
    } catch {
      setEditorPasswordError('Erro ao validar a senha.');
    } finally {
      setIsVerifyingPassword(false);
    }
  };

  const getNoteUrl = () => {
    const baseUrl = (import.meta as any).env?.BASE_URL || '/';
    const cleanBase = baseUrl === '/' ? '' : baseUrl.replace(/\/+$/, '');
    return `${window.location.origin}${cleanBase}/notpad/${note.id}`;
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
    editorProps: {
      attributes: {
        class: 'focus:outline-none min-h-[350px] leading-relaxed',
      },
    },
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      lastLocalHtmlRef.current = html;
      onUpdateNoteRef.current({ content: html });
    },
  }, [note.id]);

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
    const newTitle = e.target.value;
    setTitle(newTitle);
    onUpdateNote({ title: newTitle });
  };

  const handleInsertImage = (url: string) => {
    if (editor) {
      editor.chain().focus().setImage({ src: url }).run();
    }
  };

  const handleAttachmentsChange = (attachments: Attachment[]) => {
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
    <div className="flex-1 flex flex-col h-full bg-white dark:bg-dark-surface overflow-hidden">
      {/* Editor Header Bar */}
      <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-gray-200 dark:border-[#232838] bg-white dark:bg-[#11131a] gap-2">
        <div className="flex items-center gap-2">
          {/* Save Status Indicator */}
          <div className="flex items-center gap-1.5 text-xs">
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
                <span>Alterações pendentes</span>
              </span>
            )}
          </div>
        </div>

        {/* Header Right Actions */}
        <div className="flex items-center gap-2">
          {/* Quick Copy Unique Note URL Pill */}
          <button
            type="button"
            onClick={handleCopyNoteUrl}
            title={`Copiar URL única: ${getNoteUrl()}`}
            className="hidden md:flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-gray-200 dark:border-[#232838] bg-gray-50 dark:bg-[#141720] hover:bg-gray-100 dark:hover:bg-[#1c202c] text-[11px] font-mono text-gray-500 dark:text-gray-400 transition-colors"
          >
            <span className="truncate max-w-[200px]">/notpad/{note.id}</span>
            {copiedUrl ? (
              <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            ) : (
              <Copy className="w-3.5 h-3.5 text-brand-400 shrink-0" />
            )}
          </button>

          {/* Pin Button */}
          {onTogglePin && (
            <button
              type="button"
              onClick={onTogglePin}
              title={note.is_pinned ? 'Desafixar nota' : 'Fixar nota no topo'}
              className={`p-2 rounded-xl border text-xs transition-colors ${
                note.is_pinned
                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                  : 'border-gray-200 dark:border-[#232838] text-gray-500 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              <Pin className={`w-4 h-4 ${note.is_pinned ? 'rotate-45 fill-amber-400' : ''}`} />
            </button>
          )}

          {/* Share Button */}
          <button
            type="button"
            onClick={onOpenShareModal}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all shadow-sm ${
              isShared
                ? 'bg-brand-600 hover:bg-brand-500 text-white shadow-brand-600/30 ring-2 ring-brand-400/50'
                : 'border border-gray-200 dark:border-[#232838] bg-gray-50 dark:bg-[#181b24] hover:bg-gray-100 dark:hover:bg-[#202430] text-gray-700 dark:text-gray-200'
            }`}
          >
            <Share2 className="w-3.5 h-3.5" />
            <span>Compartilhar</span>
            {isShared && (
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse ml-0.5" />
            )}
          </button>
        </div>
      </div>

      {/* Formatting Toolbar */}
      {!isPasswordLocked && (
        <EditorToolbar
          editor={editor}
          onOpenImageModal={() => setIsImageModalOpen(true)}
          noteTitle={title}
        />
      )}

      {/* Editor Content Area or Password Lock Screen */}
      {isPasswordLocked ? (
        <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-6 flex items-center justify-center">
          <div className="max-w-md w-full p-8 rounded-3xl bg-gray-50 dark:bg-[#11131a] border border-gray-200 dark:border-[#232838] shadow-2xl">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-brand-500/10 text-brand-400 border border-brand-500/20 flex items-center justify-center mb-5">
              <Lock className="w-7 h-7" />
            </div>
            <h2 className="text-xl font-bold text-center text-gray-900 dark:text-gray-100 mb-2">
              Bloco de Notas Protegido por Senha
            </h2>
            <p className="text-xs text-center text-gray-500 dark:text-gray-400 mb-6">
              A proteção por senha deste bloco de notas está ativa. Insira a senha atual para visualizar e editar.
            </p>
            <form onSubmit={handleUnlockEditor} className="space-y-4">
              <div className="relative">
                <input
                  type="password"
                  value={editorPasswordInput}
                  onChange={(e) => {
                    setEditorPasswordInput(e.target.value);
                    setEditorPasswordError('');
                  }}
                  placeholder="Digite a senha do bloco de notas..."
                  autoFocus
                  className="w-full bg-white dark:bg-[#181b24] border border-gray-200 dark:border-[#232838] rounded-xl px-4 py-3 pl-10 text-sm text-gray-900 dark:text-gray-100 outline-none focus:ring-2 focus:ring-brand-500/50"
                />
                <KeyRound className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              </div>
              {editorPasswordError && (
                <p className="text-xs text-rose-500 text-center font-medium">
                  {editorPasswordError}
                </p>
              )}
              <button
                type="submit"
                disabled={isVerifyingPassword}
                className="w-full py-3 px-4 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-sm font-semibold transition-all shadow-lg shadow-brand-600/25 disabled:opacity-50"
              >
                {isVerifyingPassword ? 'Verificando...' : 'Desbloquear Bloco de Notas'}
              </button>
            </form>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-6">
          <div className={`mx-auto ${maxWidthClass} space-y-6`}>
            {/* Note Title Input */}
            <input
              type="text"
              value={title}
              onChange={handleTitleChange}
              placeholder="Título da nota..."
              className="w-full bg-transparent text-2xl sm:text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-600 outline-none border-b border-transparent focus:border-brand-500/30 pb-2 transition-colors"
            />

            {/* TipTap Document Body */}
            <div className={`${fontClass} ${fontSizeClass} ${lineSpacingClass} text-gray-800 dark:text-gray-200 min-h-[300px]`}>
              <EditorContent editor={editor} />
            </div>

            {/* Attachments Section */}
            <AttachmentManager
              noteId={note.id}
              attachments={note.attachments || []}
              onAttachmentsChange={handleAttachmentsChange}
            />
          </div>
        </div>
      )}

      {/* Editor Status Bar / Footer */}
      <div className="px-4 sm:px-6 py-2 border-t border-gray-200 dark:border-[#232838] bg-gray-50/70 dark:bg-[#11131a]/70 text-[11px] text-gray-500 dark:text-gray-400 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span>{stats.words} palavras</span>
          <span>•</span>
          <span>{stats.chars} caracteres</span>
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

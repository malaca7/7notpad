import React from 'react';
import { Editor } from '@tiptap/react';
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  CheckSquare,
  Quote,
  Code2,
  Minus,
  Image as ImageIcon,
  Copy,
  RemoveFormatting,
  Undo2,
  Redo2,
} from 'lucide-react';
import { useToast } from '../common/Toast';

interface EditorToolbarProps {
  editor: Editor | null;
  onOpenImageModal: () => void;
  noteTitle: string;
}

export const EditorToolbar: React.FC<EditorToolbarProps> = ({
  editor,
  onOpenImageModal,
  noteTitle,
}) => {
  const { success, error } = useToast();

  if (!editor) return null;

  const handleCopyNoteContent = async (format: 'plain' | 'html') => {
    try {
      if (format === 'plain') {
        const text = editor.getText();
        await navigator.clipboard.writeText(`${noteTitle}\n\n${text}`);
        success('Copiado como texto!', 'Conteúdo copiado sem formatação.');
      } else {
        const html = editor.getHTML();
        await navigator.clipboard.writeText(`<h1>${noteTitle}</h1>\n${html}`);
        success('Copiado com formatação!', 'Conteúdo HTML copiado para a área de transferência.');
      }
    } catch {
      error('Erro ao copiar conteúdo');
    }
  };

  const handleClearFormatting = () => {
    editor.chain().focus().unsetAllMarks().clearNodes().run();
    success('Formatação limpa!');
  };

  const btnClass = (isActive: boolean) =>
    `p-2 rounded-lg text-xs font-medium transition-colors flex items-center justify-center shrink-0 ${
      isActive
        ? 'bg-brand-500/20 text-brand-400 font-bold border border-brand-500/30'
        : 'text-gray-400 hover:text-gray-100 hover:bg-[#121212] active:bg-[#1a1a1a]'
    }`;

  const divider = <div className="w-[1px] h-5 bg-[#1c1c1c] mx-1 shrink-0" />;

  return (
    <div className="flex flex-nowrap sm:flex-wrap items-center gap-1 px-2 py-1.5 sm:p-2 bg-[#050505] border-b border-[#1c1c1c] sticky top-0 z-20 overflow-x-auto no-scrollbar">
      {/* Undo / Redo */}
      <div className="flex items-center gap-0.5 shrink-0">
        <button
          type="button"
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
          className="p-2 rounded-lg text-gray-400 hover:text-white disabled:opacity-30 disabled:pointer-events-none shrink-0"
          title="Desfazer (Ctrl+Z)"
        >
          <Undo2 className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
          className="p-2 rounded-lg text-gray-400 hover:text-white disabled:opacity-30 disabled:pointer-events-none shrink-0"
          title="Refazer (Ctrl+Y)"
        >
          <Redo2 className="w-4 h-4" />
        </button>
      </div>

      {divider}

      {/* Headings */}
      <div className="flex items-center gap-0.5 shrink-0">
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          className={btnClass(editor.isActive('heading', { level: 1 }))}
          title="Título 1"
        >
          <Heading1 className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          className={btnClass(editor.isActive('heading', { level: 2 }))}
          title="Título 2"
        >
          <Heading2 className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          className={btnClass(editor.isActive('heading', { level: 3 }))}
          title="Título 3"
        >
          <Heading3 className="w-4 h-4" />
        </button>
      </div>

      {divider}

      {/* Basic Marks: Bold, Italic, Underline, Strike */}
      <div className="flex items-center gap-0.5 shrink-0">
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={btnClass(editor.isActive('bold'))}
          title="Negrito (Ctrl+B)"
        >
          <Bold className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className={btnClass(editor.isActive('italic'))}
          title="Itálico (Ctrl+I)"
        >
          <Italic className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          className={btnClass(editor.isActive('underline'))}
          title="Sublinhado (Ctrl+U)"
        >
          <UnderlineIcon className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleStrike().run()}
          className={btnClass(editor.isActive('strike'))}
          title="Tachado"
        >
          <Strikethrough className="w-4 h-4" />
        </button>
      </div>

      {divider}

      {/* Lists */}
      <div className="flex items-center gap-0.5 shrink-0">
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={btnClass(editor.isActive('bulletList'))}
          title="Lista com Marcadores"
        >
          <List className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          className={btnClass(editor.isActive('orderedList'))}
          title="Lista Numerada"
        >
          <ListOrdered className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleTaskList().run()}
          className={btnClass(editor.isActive('taskList'))}
          title="Lista de Tarefas"
        >
          <CheckSquare className="w-4 h-4" />
        </button>
      </div>

      {divider}

      {/* Blocks: Quote, Code, HR */}
      <div className="flex items-center gap-0.5 shrink-0">
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          className={btnClass(editor.isActive('blockquote'))}
          title="Citação"
        >
          <Quote className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          className={btnClass(editor.isActive('codeBlock'))}
          title="Bloco de Código"
        >
          <Code2 className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
          className={btnClass(false)}
          title="Linha Divisória"
        >
          <Minus className="w-4 h-4" />
        </button>
      </div>

      {divider}

      {/* Media & Tools */}
      <div className="flex items-center gap-0.5 shrink-0">
        <button
          type="button"
          onClick={onOpenImageModal}
          className={btnClass(false)}
          title="Inserir Imagem"
        >
          <ImageIcon className="w-4 h-4 text-brand-400" />
        </button>

        <button
          type="button"
          onClick={() => handleCopyNoteContent('plain')}
          className={btnClass(false)}
          title="Copiar texto da nota"
        >
          <Copy className="w-4 h-4 text-emerald-400" />
        </button>

        <button
          type="button"
          onClick={handleClearFormatting}
          className={btnClass(false)}
          title="Limpar Formatação"
        >
          <RemoveFormatting className="w-4 h-4 text-amber-400" />
        </button>
      </div>
    </div>
  );
};


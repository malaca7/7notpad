import React, { useRef } from 'react';
import type { Attachment } from '../../types/note';
import { useToast } from '../common/Toast';
import { Paperclip, FileText, Download, Trash2, Upload, Lock } from 'lucide-react';

interface AttachmentManagerProps {
  attachments: Attachment[];
  onAttachmentsChange: (attachments: Attachment[]) => void;
  noteId: string;
  readOnly?: boolean;
  isGuest?: boolean;
  onOpenSignUp?: () => void;
}

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB limit
const BLOCKED_EXTENSIONS = ['exe', 'bat', 'cmd', 'sh', 'msi', 'com', 'scr', 'vbs'];

export const AttachmentManager: React.FC<AttachmentManagerProps> = ({
  attachments,
  onAttachmentsChange,
  noteId,
  readOnly = false,
  isGuest = false,
  onOpenSignUp,
}) => {
  const { success, error } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (readOnly) return;
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const newAttachments: Attachment[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];

      // Check extension security
      const ext = file.name.split('.').pop()?.toLowerCase() || '';
      if (BLOCKED_EXTENSIONS.includes(ext)) {
        error('Arquivo bloqueado', `Extensão .${ext} não permitida por motivos de segurança.`);
        continue;
      }

      // Check size (10MB limit)
      if (file.size > MAX_FILE_SIZE_BYTES) {
        error(
          'Arquivo excede o limite',
          `"${file.name}" tem ${(file.size / (1024 * 1024)).toFixed(1)}MB. O limite máximo é de 10MB.`
        );
        continue;
      }

      const reader = new FileReader();
      reader.onload = (event) => {
        const dataUrl = event.target?.result as string;
        const att: Attachment = {
          id: crypto.randomUUID(),
          note_id: noteId,
          file_name: file.name,
          file_type: file.type || 'application/octet-stream',
          file_size: file.size,
          storage_path: `local/${file.name}`,
          data_url: dataUrl,
          created_at: new Date().toISOString()
        };

        newAttachments.push(att);
        if (newAttachments.length === files.length) {
          onAttachmentsChange([...attachments, ...newAttachments]);
          success('Anexo adicionado!', `${files.length} arquivo(s) anexado(s) com sucesso.`);
        }
      };
      reader.readAsDataURL(file);
    }

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleRemoveAttachment = (id: string) => {
    onAttachmentsChange(attachments.filter(a => a.id !== id));
  };

  return (
    <div className="space-y-3 pt-4 border-t border-gray-100 dark:border-[#232838]">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Paperclip className="w-4 h-4 text-brand-400" />
          <span className="text-xs font-semibold uppercase tracking-wider text-gray-700 dark:text-gray-300">
            Arquivos Anexados ({attachments.length})
          </span>
        </div>

        {isGuest ? (
          <button
            type="button"
            onClick={onOpenSignUp}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-xs font-medium text-amber-300 transition-colors"
            title="Anexos bloqueados para visitantes sem cadastro"
          >
            <Lock className="w-3.5 h-3.5 text-amber-400" />
            <span>Cadastre-se para Anexar</span>
          </button>
        ) : !readOnly ? (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gray-100 dark:bg-[#181b24] hover:bg-gray-200 dark:hover:bg-[#202430] border border-gray-200 dark:border-[#232838] text-xs font-medium text-gray-700 dark:text-gray-300 transition-colors"
          >
            <Upload className="w-3.5 h-3.5 text-brand-400" />
            <span>Anexar Arquivo</span>
          </button>
        ) : null}
        {!readOnly && !isGuest && (
          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={handleFileUpload}
            className="hidden"
          />
        )}
      </div>

      {attachments.length === 0 ? (
        <p className="text-xs text-gray-400 dark:text-gray-500 italic">
          Nenhum anexo nesta nota. Adicione PDFs, documentos, imagens ou zip (até 10MB).
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
          {attachments.map((att) => (
            <div
              key={att.id}
              className="flex items-center justify-between p-2.5 rounded-xl bg-gray-50 dark:bg-[#14161f] border border-gray-200 dark:border-[#232838] group"
            >
              <div className="flex items-center gap-2 truncate">
                <FileText className="w-4 h-4 text-brand-400 shrink-0" />
                <div className="truncate">
                  <div className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate max-w-[130px] sm:max-w-[160px]">
                    {att.file_name}
                  </div>
                  <div className="text-[10px] text-gray-400">
                    {(att.file_size / 1024).toFixed(1)} KB
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1">
                {att.data_url && (
                  <a
                    href={att.data_url}
                    download={att.file_name}
                    className="p-1 rounded-lg text-gray-400 hover:text-brand-400 hover:bg-gray-200 dark:hover:bg-[#1f2330] transition-colors"
                    title="Baixar anexo"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </a>
                )}
                {!readOnly && (
                  <button
                    type="button"
                    onClick={() => handleRemoveAttachment(att.id)}
                    className="p-1 rounded-lg text-gray-400 hover:text-rose-500 hover:bg-rose-500/10 transition-colors"
                    title="Remover anexo"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

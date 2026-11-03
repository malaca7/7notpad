import React, { useState } from 'react';
import { Modal } from '../common/Modal';
import { Image as ImageIcon, Upload, Link as LinkIcon } from 'lucide-react';
import { useToast } from '../common/Toast';

interface ImageUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInsertImage: (url: string) => void;
}

export const ImageUploadModal: React.FC<ImageUploadModalProps> = ({
  isOpen,
  onClose,
  onInsertImage,
}) => {
  const { error } = useToast();
  const [activeTab, setActiveTab] = useState<'upload' | 'url'>('upload');
  const [imageUrl, setImageUrl] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      error('Arquivo inválido', 'Selecione uma imagem válida (PNG, JPG, WEBP, GIF, SVG).');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      error('Imagem muito grande', 'O tamanho máximo para imagem é de 5MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      setPreviewUrl(event.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const finalUrl = activeTab === 'upload' ? previewUrl : imageUrl.trim();

    if (!finalUrl) {
      error('Informe uma imagem', 'Selecione um arquivo ou insira uma URL de imagem válida.');
      return;
    }

    onInsertImage(finalUrl);
    setImageUrl('');
    setPreviewUrl(null);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-brand-500/10 text-brand-400">
            <ImageIcon className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-gray-900 dark:text-gray-100">Inserir Imagem</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 font-normal">
              Envie do seu dispositivo ou use um link externo
            </p>
          </div>
        </div>
      }
      maxWidth="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Tabs */}
        <div className="flex border-b border-gray-200 dark:border-[#232838] pb-1">
          <button
            type="button"
            onClick={() => setActiveTab('upload')}
            className={`flex-1 py-2 text-xs font-semibold border-b-2 transition-colors flex items-center justify-center gap-1.5 ${
              activeTab === 'upload'
                ? 'border-brand-500 text-brand-500'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            <Upload className="w-3.5 h-3.5" />
            Upload do Dispositivo
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('url')}
            className={`flex-1 py-2 text-xs font-semibold border-b-2 transition-colors flex items-center justify-center gap-1.5 ${
              activeTab === 'url'
                ? 'border-brand-500 text-brand-500'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            <LinkIcon className="w-3.5 h-3.5" />
            Link da Imagem (URL)
          </button>
        </div>

        {activeTab === 'upload' ? (
          <div>
            <label className="flex flex-col items-center justify-center border-2 border-dashed border-gray-200 dark:border-[#232838] hover:border-brand-500/50 rounded-2xl p-6 cursor-pointer bg-gray-50 dark:bg-[#181b24] transition-colors">
              {previewUrl ? (
                <div className="space-y-2 text-center">
                  <img
                    src={previewUrl}
                    alt="Preview"
                    className="max-h-48 rounded-xl mx-auto object-contain border border-gray-200 dark:border-[#232838]"
                  />
                  <p className="text-xs text-brand-400 font-medium">Clique para trocar a imagem</p>
                </div>
              ) : (
                <div className="space-y-2 text-center">
                  <div className="w-10 h-10 rounded-xl bg-brand-500/10 text-brand-400 mx-auto flex items-center justify-center">
                    <Upload className="w-5 h-5" />
                  </div>
                  <div className="text-xs text-gray-700 dark:text-gray-300 font-medium">
                    Clique para selecionar uma imagem
                  </div>
                  <div className="text-[11px] text-gray-400">
                    PNG, JPG, WEBP, GIF (máx. 5MB)
                  </div>
                </div>
              )}
              <input
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
              />
            </label>
          </div>
        ) : (
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              URL da imagem
            </label>
            <input
              type="url"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://exemplo.com/imagem.png"
              className="w-full px-3 py-2.5 rounded-xl bg-gray-50 dark:bg-[#181b24] border border-gray-200 dark:border-[#232838] text-sm text-gray-900 dark:text-gray-100 outline-none focus:ring-2 focus:ring-brand-500/50"
            />
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100 dark:border-[#232838]">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-gray-200 dark:border-[#232838] text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-[#181b24] transition-colors"
          >
            Cancelar
          </button>
          <button
            type="submit"
            className="px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-xs font-medium shadow-md shadow-brand-600/20 transition-all"
          >
            Inserir na Nota
          </button>
        </div>
      </form>
    </Modal>
  );
};


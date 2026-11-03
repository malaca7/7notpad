import React, { useState, useEffect } from 'react';
import { Modal } from '../common/Modal';
import type { Note, NoteShare } from '../../types/note';
import { StorageService } from '../../lib/storage';
import { generateSalt, hashPassword, generateRandomSlug, slugify } from '../../lib/crypto';
import { generatePortablePayload } from '../../lib/portableShare';
import { useToast } from '../common/Toast';
import confetti from 'canvas-confetti';
import { 
  Share2, 
  Lock, 
  Copy, 
  Check, 
  ExternalLink, 
  Trash2, 
  Sparkles, 
  Eye, 
  EyeOff, 
  AlertCircle,
  Link as LinkIcon,
  Cloud,
  Globe2
} from 'lucide-react';

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  note: Note;
  onShareUpdated: (share: NoteShare | null) => void;
}

export const ShareModal: React.FC<ShareModalProps> = ({
  isOpen,
  onClose,
  note,
  onShareUpdated,
}) => {
  const { success, error } = useToast();

  // Always default to true when sharing a note so the user doesn't copy an inactive link!
  const [isActive, setIsActive] = useState<boolean>(note.share ? note.share.is_active : true);
  const [slug, setSlug] = useState<string>(note.share?.custom_slug || '');
  const [isPasswordProtected, setIsPasswordProtected] = useState<boolean>(
    note.share?.is_password_protected ?? false
  );
  const [password, setPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [isSlugConflict, setIsSlugConflict] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [linkType, setLinkType] = useState<'short' | 'universal'>('short');
  const [portableHash, setPortableHash] = useState<string>('');

  // Sync state when modal opens or note changes
  useEffect(() => {
    if (isOpen) {
      if (note.share) {
        setIsActive(note.share.is_active);
        setSlug(note.share.custom_slug);
        setIsPasswordProtected(note.share.is_password_protected);
        setPassword('');
      } else {
        // Default to active!
        setIsActive(true);
        const initialSlug = note.title.trim() ? slugify(note.title) : generateRandomSlug('nota');
        setSlug(initialSlug || generateRandomSlug('nota'));
        setIsPasswordProtected(false);
        setPassword('');
      }
      setIsSlugConflict(false);
      setCopied(false);
    }
  }, [isOpen, note]);

  // Generate portable hash whenever note, slug, or password changes
  useEffect(() => {
    if (!isOpen) return;
    const cleanSlug = slugify(slug) || 'nota';
    const mockShare: NoteShare = {
      id: note.share?.id || 'temp',
      note_id: note.id,
      custom_slug: cleanSlug,
      is_password_protected: isPasswordProtected,
      password_salt: note.share?.password_salt,
      password_hash: note.share?.password_hash,
      is_active: true,
      created_at: note.created_at,
      updated_at: new Date().toISOString()
    };

    generatePortablePayload(note, mockShare, password.trim() || undefined)
      .then(p => setPortableHash(p))
      .catch(() => setPortableHash(''));
  }, [isOpen, note, slug, isPasswordProtected, password]);

  // Check slug availability when slug changes
  useEffect(() => {
    const cleanSlug = slugify(slug);
    if (!cleanSlug) {
      setIsSlugConflict(false);
      return;
    }

    const checkAvailability = async () => {
      const taken = await StorageService.isSlugTaken(cleanSlug, note.id);
      setIsSlugConflict(taken);
    };

    const timer = setTimeout(checkAvailability, 300);
    return () => clearTimeout(timer);
  }, [slug, note.id]);

  const handleSlugChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    setSlug(raw);
  };

  const handleGenerateRandomSlug = () => {
    const newSlug = generateRandomSlug(note.title ? slugify(note.title).slice(0, 15) : 'nota');
    setSlug(newSlug);
  };

  const getCleanBaseUrl = () => {
    const baseUrl = (import.meta as any).env?.BASE_URL || '/';
    const origin = window.location.origin;
    const cleanBase = baseUrl === '/' ? '' : baseUrl.replace(/\/+$/, '');
    const cleanSlug = slugify(slug) || 'slug';
    return `${origin}${cleanBase}/notpad/${cleanSlug}`;
  };

  const getShareUrl = (type = linkType) => {
    const shortUrl = getCleanBaseUrl();
    if (type === 'universal' && portableHash) {
      return `${shortUrl}#data=${portableHash}`;
    }
    return shortUrl;
  };

  // Helper to save share state to storage/Firebase
  const executeSave = async (forceActive = false): Promise<{ success: boolean; error?: string; cloudSynced?: boolean }> => {
    const cleanSlug = slugify(slug);
    if (!cleanSlug || cleanSlug.length < 3) {
      return { success: false, error: 'O identificador precisa conter pelo menos 3 caracteres.' };
    }

    if (isSlugConflict) {
      return { success: false, error: 'Este link já está em uso por outra nota. Escolha outro.' };
    }

    if (isPasswordProtected && !note.share?.password_hash && !password.trim()) {
      return { success: false, error: 'Você ativou a proteção por senha, informe uma senha válida.' };
    }

    let salt = note.share?.password_salt;
    let hash = note.share?.password_hash;

    if (isPasswordProtected) {
      if (password.trim()) {
        salt = generateSalt();
        hash = await hashPassword(password.trim(), salt);
      }
    } else {
      salt = undefined;
      hash = undefined;
    }

    const activeState = forceActive ? true : isActive;

    const shareData: NoteShare = {
      id: note.share?.id || crypto.randomUUID(),
      note_id: note.id,
      custom_slug: cleanSlug,
      is_password_protected: isPasswordProtected,
      password_salt: salt,
      password_hash: hash,
      is_active: activeState,
      created_at: note.share?.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
      view_count: note.share?.view_count || 0
    };

    setIsActive(activeState);

    const result = await StorageService.saveShare(shareData);
    if (result.success) {
      onShareUpdated(shareData);
      return { success: true, cloudSynced: true };
    } else {
      // Still saved locally!
      onShareUpdated(shareData);
      return { success: true, cloudSynced: false, error: result.error };
    }
  };

  const handleCopyLink = async () => {
    setIsSaving(true);
    try {
      // 1. Automatically activate and save the share!
      const saveRes = await executeSave(true);
      
      // Determine best URL: if Cloud returned error, use universal link with #data
      let urlToCopy = getShareUrl();
      if (!saveRes.cloudSynced && portableHash) {
        urlToCopy = getShareUrl('universal');
      }

      await navigator.clipboard.writeText(urlToCopy);
      setCopied(true);
      confetti({
        particleCount: 40,
        spread: 60,
        origin: { y: 0.8 }
      });

      if (!saveRes.cloudSynced) {
        success('Link copiado!', 'Link universal com dados copiado (funciona em qualquer navegador mesmo sem Firebase ativo).');
      } else {
        success('Link copiado!', 'Link /notpad/' + slugify(slug) + ' copiado para a área de transferência.');
      }

      setTimeout(() => setCopied(false), 2500);
    } catch {
      error('Erro ao copiar link', 'Não foi possível copiar automaticamente.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveShare = async () => {
    setIsSaving(true);
    try {
      const res = await executeSave(false);
      if (!res.success) {
        error('Falha ao compartilhar', res.error || 'Erro desconhecido.');
        return;
      }

      const cleanSlug = slugify(slug);
      if (!res.cloudSynced) {
        success(
          isActive ? 'Compartilhamento ativado localmente!' : 'Compartilhamento desativado',
          `Para sincronizar links curtos globalmente, ative o Firestore no Console do Firebase.`
        );
      } else {
        success(
          isActive ? 'Compartilhamento ativado!' : 'Compartilhamento desativado',
          `Acesse pelo identificador /notpad/${cleanSlug}`
        );
      }
    } catch (err: any) {
      error('Erro ao salvar', err?.message || 'Erro ao salvar compartilhamento.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleRevokeShare = async () => {
    if (!note.share) return;
    try {
      await StorageService.revokeShare(note.share.id, note.share.custom_slug);
      onShareUpdated(null);
      setIsActive(false);
      success('Compartilhamento revogado', 'O link anterior não funcionará mais.');
      onClose();
    } catch {
      error('Erro', 'Não foi possível revogar o compartilhamento.');
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-brand-500/10 text-brand-400">
            <Share2 className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-gray-900 dark:text-gray-100">Compartilhar Nota</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 font-normal">
              Gere um link público exclusivo com ou sem senha
            </p>
          </div>
        </div>
      }
      maxWidth="lg"
    >
      <div className="space-y-6">
        {/* Active Toggle Switch */}
        <div className="flex items-center justify-between p-4 rounded-xl bg-gray-50 dark:bg-[#181b24] border border-gray-200 dark:border-[#232838]">
          <div>
            <div className="text-sm font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <span>Permitir acesso público por link</span>
              {isActive && (
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  Ativo
                </span>
              )}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              Qualquer pessoa com o link poderá ler a nota (modo somente leitura)
            </div>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-300 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-600"></div>
          </label>
        </div>

        {/* Custom Slug Config */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-2">
            Identificador do Link (/notpad/:id)
          </label>
          <div className="flex items-center gap-2">
            <div className="flex-1 flex items-center bg-gray-50 dark:bg-[#181b24] border border-gray-200 dark:border-[#232838] rounded-xl px-3 py-2.5 focus-within:ring-2 focus-within:ring-brand-500/50">
              <span className="text-xs text-gray-400 select-none pr-1 truncate max-w-[170px] sm:max-w-none font-mono">
                {window.location.host}{((import.meta as any).env?.BASE_URL || '/').replace(/\/+$/, '')}/notpad/
              </span>
              <input
                type="text"
                value={slug}
                onChange={handleSlugChange}
                placeholder="minha-reuniao"
                className="flex-1 bg-transparent text-sm text-gray-900 dark:text-gray-100 outline-none font-mono"
              />
            </div>
            <button
              type="button"
              onClick={handleGenerateRandomSlug}
              title="Gerar identificador aleatório"
              className="p-2.5 rounded-xl border border-gray-200 dark:border-[#232838] bg-gray-50 dark:bg-[#181b24] hover:bg-gray-100 dark:hover:bg-[#202430] text-gray-600 dark:text-gray-300 transition-colors"
            >
              <Sparkles className="w-4 h-4 text-brand-400" />
            </button>
          </div>

          {isSlugConflict && (
            <div className="flex items-center gap-1.5 mt-2 text-xs text-rose-500">
              <AlertCircle className="w-3.5 h-3.5" />
              <span>Este identificador já está em uso. Por favor, escolha outro.</span>
            </div>
          )}
        </div>

        {/* Password Protection */}
        <div className="p-4 rounded-xl bg-gray-50 dark:bg-[#181b24] border border-gray-200 dark:border-[#232838] space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4 text-brand-400" />
              <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                Proteger com Senha
              </span>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={isPasswordProtected}
                onChange={(e) => setIsPasswordProtected(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-300 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-600"></div>
            </label>
          </div>

          {isPasswordProtected && (
            <div className="pt-2">
              <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                {note.share?.password_hash ? 'Nova senha (deixe vazio para manter a atual):' : 'Digite uma senha para leitura:'}
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Defina uma senha segura..."
                  className="w-full bg-white dark:bg-[#11131a] border border-gray-200 dark:border-[#232838] rounded-xl px-3 py-2 text-sm text-gray-900 dark:text-gray-100 outline-none focus:ring-2 focus:ring-brand-500/50 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-200"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-[11px] text-gray-500 mt-1.5">
                🔒 A senha é protegida com criptografia segura SHA-256 e hash com salt.
              </p>
            </div>
          )}
        </div>

        {/* Copy Link Preview Section */}
        {isActive && (
          <div className="p-4 rounded-2xl bg-brand-500/5 border border-brand-500/25 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-gray-800 dark:text-gray-200 flex items-center gap-1.5">
                <LinkIcon className="w-4 h-4 text-brand-400" />
                Opções de Link para Envio:
              </span>
              <span className="text-[11px] text-emerald-400 font-semibold flex items-center gap-1">
                <Cloud className="w-3.5 h-3.5" />
                Nuvem Ativa
              </span>
            </div>

            {/* Link Format Switcher */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={() => setLinkType('short')}
                className={`px-3 py-2 rounded-xl text-xs font-semibold border text-left transition-all ${
                  linkType === 'short'
                    ? 'border-brand-500 bg-brand-500/10 text-brand-400 ring-1 ring-brand-500/30'
                    : 'border-gray-200 dark:border-[#232838] text-gray-500 hover:text-gray-300'
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <Cloud className="w-3.5 h-3.5" />
                  <span>Link Curto Direto</span>
                </div>
                <div className="text-[10px] opacity-75 font-normal mt-0.5 font-mono">
                  /notpad/{slugify(slug) || 'id'}
                </div>
              </button>

              <button
                type="button"
                onClick={() => setLinkType('universal')}
                className={`px-3 py-2 rounded-xl text-xs font-semibold border text-left transition-all ${
                  linkType === 'universal'
                    ? 'border-brand-500 bg-brand-500/10 text-brand-400 ring-1 ring-brand-500/30'
                    : 'border-gray-200 dark:border-[#232838] text-gray-500 hover:text-gray-300'
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <Globe2 className="w-3.5 h-3.5 text-purple-400" />
                  <span>Link Portátil Universal</span>
                </div>
                <div className="text-[10px] opacity-75 font-normal mt-0.5">
                  Abre garantido em qualquer aparelho
                </div>
              </button>
            </div>

            {/* URL Box */}
            <div className="flex items-center gap-2 pt-1">
              <input
                readOnly
                value={getShareUrl()}
                className="flex-1 bg-white dark:bg-[#11131a] border border-gray-200 dark:border-[#232838] rounded-xl px-3 py-2 text-xs text-gray-700 dark:text-gray-300 font-mono outline-none truncate"
              />
              <button
                type="button"
                onClick={handleCopyLink}
                disabled={isSaving}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded-xl text-xs font-semibold transition-colors shadow-sm shrink-0"
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Copiado!' : 'Copiar Link'}
              </button>
              <a
                href={getShareUrl()}
                target="_blank"
                rel="noreferrer"
                className="p-2 border border-gray-200 dark:border-[#232838] bg-white dark:bg-[#11131a] hover:bg-gray-100 dark:hover:bg-[#181b24] text-gray-600 dark:text-gray-300 rounded-xl transition-colors shrink-0"
                title="Abrir página pública"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>
          </div>
        )}

        {/* Actions Footer */}
        <div className="flex items-center justify-between pt-2 border-t border-gray-100 dark:border-[#232838]">
          {note.share ? (
            <button
              type="button"
              onClick={handleRevokeShare}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-rose-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-xl transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              Revogar link
            </button>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-gray-200 dark:border-[#232838] text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-[#181b24] transition-colors"
            >
              Fechar
            </button>
            <button
              type="button"
              onClick={handleSaveShare}
              disabled={isSaving || isSlugConflict}
              className="px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold shadow-md shadow-brand-600/20 transition-all flex items-center gap-2"
            >
              {isSaving ? 'Salvando...' : 'Salvar Alterações'}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
};

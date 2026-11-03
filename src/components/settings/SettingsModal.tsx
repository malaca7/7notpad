import React, { useState, useRef } from 'react';
import { Modal } from '../common/Modal';
import { useEditorSettings } from '../../hooks/useEditorSettings';
import { firebaseConfig } from '../../lib/firebase';
import { getOrCreateOwnerToken } from '../../lib/crypto';
import { exportNotesToJson, importNotesFromJson } from '../../lib/exportImport';
import { StorageService } from '../../lib/storage';
import { useToast } from '../common/Toast';
import { 
  Settings, 
  Type, 
  Cloud, 
  Shield, 
  Download, 
  Upload, 
  Key, 
  Check, 
  RotateCcw,
  RefreshCw,
  Database,
  CheckCircle2
} from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNotesImported?: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  onNotesImported,
}) => {
  const { settings, updateSettings, defaultSettings } = useEditorSettings();
  const { success, error } = useToast();

  const [activeTab, setActiveTab] = useState<'editor' | 'cloud' | 'security' | 'backup'>('editor');
  const [copiedToken, setCopiedToken] = useState(false);
  const [isMigrating, setIsMigrating] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const ownerToken = getOrCreateOwnerToken();

  const handleCopyOwnerToken = async () => {
    try {
      await navigator.clipboard.writeText(ownerToken);
      setCopiedToken(true);
      success('Token copiado!', 'Sua credencial anônima de proprietário foi copiada.');
      setTimeout(() => setCopiedToken(false), 2000);
    } catch {
      error('Erro ao copiar token');
    }
  };

  const handleMigrateToFirebase = async () => {
    setIsMigrating(true);
    try {
      const res = await StorageService.migrateAllToFirebase();
      success(
        'Migração Concluída!',
        `${res.migratedNotes} notas e ${res.migratedShares} compartilhamentos sincronizados com o Firebase.`
      );
    } catch (err: any) {
      error('Erro na migração', err?.message || 'Falha ao migrar para o Firebase.');
    } finally {
      setIsMigrating(false);
    }
  };

  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const result = await importNotesFromJson(file);
    if (result.success) {
      success('Backup restaurado!', `${result.count} nota(s) importada(s) com sucesso.`);
      // Also migrate newly imported notes to Firebase
      StorageService.migrateAllToFirebase().catch(() => {});
      if (onNotesImported) onNotesImported();
      onClose();
    } else {
      error('Falha na importação', result.error);
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-brand-500/10 text-brand-400">
            <Settings className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-gray-900 dark:text-gray-100">Configurações</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 font-normal">
              Aparência do editor, nuvem Firebase e segurança anônima
            </p>
          </div>
        </div>
      }
      maxWidth="lg"
    >
      <div className="space-y-6">
        {/* Navigation Tabs */}
        <div className="flex border-b border-gray-200 dark:border-[#232838] gap-1 overflow-x-auto">
          <button
            onClick={() => setActiveTab('editor')}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'editor'
                ? 'border-brand-500 text-brand-500'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            <Type className="w-3.5 h-3.5" />
            Editor &amp; Tipografia
          </button>
          <button
            onClick={() => setActiveTab('cloud')}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'cloud'
                ? 'border-brand-500 text-brand-500'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            <Cloud className="w-3.5 h-3.5" />
            Nuvem Firebase
          </button>
          <button
            onClick={() => setActiveTab('security')}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'security'
                ? 'border-brand-500 text-brand-500'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            <Shield className="w-3.5 h-3.5" />
            Identidade Anônima
          </button>
          <button
            onClick={() => setActiveTab('backup')}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'backup'
                ? 'border-brand-500 text-brand-500'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            <Download className="w-3.5 h-3.5" />
            Backup &amp; Exportação
          </button>
        </div>

        {/* Tab 1: Editor Appearance */}
        {activeTab === 'editor' && (
          <div className="space-y-4">
            {/* Font Family */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-2">
                Família Tipográfica
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'sans', label: 'Inter (Sans-serif)', desc: 'Moderno & Limpo' },
                  { id: 'serif', label: 'Merriweather (Serif)', desc: 'Editorial & Leitura' },
                  { id: 'mono', label: 'JetBrains (Mono)', desc: 'Código & Técnico' },
                ].map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => updateSettings({ fontFamily: f.id as any })}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      settings.fontFamily === f.id
                        ? 'bg-brand-500/10 border-brand-500 text-brand-400 ring-1 ring-brand-500/50'
                        : 'border-gray-200 dark:border-[#232838] bg-gray-50 dark:bg-[#14161f] text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-[#1a1d28]'
                    }`}
                  >
                    <div className="text-xs font-semibold">{f.label}</div>
                    <div className="text-[10px] text-gray-500 mt-0.5">{f.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Font Size */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-2">
                Tamanho da Fonte
              </label>
              <div className="grid grid-cols-4 gap-2">
                {[
                  { id: 'sm', label: 'Pequeno (14px)' },
                  { id: 'base', label: 'Médio (16px)' },
                  { id: 'lg', label: 'Grande (18px)' },
                  { id: 'xl', label: 'Extra (20px)' },
                ].map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => updateSettings({ fontSize: s.id as any })}
                    className={`p-2.5 rounded-xl border text-center text-xs font-medium transition-all ${
                      settings.fontSize === s.id
                        ? 'bg-brand-500/10 border-brand-500 text-brand-400 ring-1 ring-brand-500/50'
                        : 'border-gray-200 dark:border-[#232838] bg-gray-50 dark:bg-[#14161f] text-gray-700 dark:text-gray-300'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Line Width */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-2">
                Largura da Área de Escrita
              </label>
              <div className="grid grid-cols-4 gap-2">
                {[
                  { id: 'narrow', label: 'Estreita' },
                  { id: 'normal', label: 'Normal' },
                  { id: 'wide', label: 'Larga' },
                  { id: 'full', label: 'Total' },
                ].map((w) => (
                  <button
                    key={w.id}
                    type="button"
                    onClick={() => updateSettings({ editorWidth: w.id as any })}
                    className={`p-2.5 rounded-xl border text-center text-xs font-medium transition-all ${
                      settings.editorWidth === w.id
                        ? 'bg-brand-500/10 border-brand-500 text-brand-400 ring-1 ring-brand-500/50'
                        : 'border-gray-200 dark:border-[#232838] bg-gray-50 dark:bg-[#14161f] text-gray-700 dark:text-gray-300'
                    }`}
                  >
                    {w.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => updateSettings(defaultSettings)}
                className="text-xs text-gray-500 hover:text-brand-400 flex items-center gap-1 transition-colors"
              >
                <RotateCcw className="w-3 h-3" />
                Restaurar padrões
              </button>
            </div>
          </div>
        )}

        {/* Tab 2: Firebase Cloud */}
        {activeTab === 'cloud' && (
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-200 space-y-2">
              <div className="flex items-center gap-2 font-bold text-emerald-400 text-sm">
                <CheckCircle2 className="w-5 h-5" />
                Nuvem Firebase Conectada com Sucesso
              </div>
              <p className="leading-relaxed opacity-95">
                O 7NotPad está integrado ao projeto <strong>{firebaseConfig.projectId}</strong> no Firebase Firestore. Qualquer link compartilhado criado em seu navegador funcionará instantaneamente em qualquer outro computador, celular ou navegador!
              </p>
            </div>

            <div className="p-4 rounded-xl bg-gray-50 dark:bg-[#14161f] border border-gray-200 dark:border-[#232838] space-y-2.5 text-xs text-gray-600 dark:text-gray-300">
              <div className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-1.5">
                <Database className="w-4 h-4 text-brand-400" />
                Detalhes do Banco de Dados:
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
                <div>Project ID: <span className="text-brand-400">{firebaseConfig.projectId}</span></div>
                <div>Auth Domain: <span className="text-brand-400">{firebaseConfig.authDomain}</span></div>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-brand-500/5 border border-brand-500/20 flex items-center justify-between">
              <div>
                <div className="text-xs font-bold text-gray-900 dark:text-gray-100">
                  Sincronizar Todas as Notas Locais Agora
                </div>
                <div className="text-[11px] text-gray-500 dark:text-gray-400">
                  Envia todas as notas salvas no seu navegador para o banco Firebase
                </div>
              </div>

              <button
                type="button"
                onClick={handleMigrateToFirebase}
                disabled={isMigrating}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold shadow-sm transition-all disabled:opacity-50 shrink-0"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isMigrating ? 'animate-spin' : ''}`} />
                <span>{isMigrating ? 'Sincronizando...' : 'Sincronizar Tudo'}</span>
              </button>
            </div>
          </div>
        )}

        {/* Tab 3: Security & Anonymous Identity */}
        {activeTab === 'security' && (
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-gray-50 dark:bg-[#14161f] border border-gray-200 dark:border-[#232838] space-y-3">
              <div className="flex items-center gap-2 text-brand-400 font-semibold text-xs uppercase tracking-wider">
                <Key className="w-4 h-4" />
                Seu Token de Proprietário (Owner Token)
              </div>
              <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                Este token aleatório e criptográfico identifica seu navegador com segurança. É ele que autoriza você a editar e excluir suas notas sem precisar de cadastro ou e-mail.
              </p>

              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={ownerToken}
                  className="flex-1 px-3 py-2 rounded-xl bg-white dark:bg-[#0d0e14] border border-gray-200 dark:border-[#232838] text-xs font-mono text-gray-700 dark:text-gray-300 outline-none"
                />
                <button
                  type="button"
                  onClick={handleCopyOwnerToken}
                  className="px-3 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-xs font-medium flex items-center gap-1.5 transition-colors"
                >
                  {copiedToken ? <Check className="w-3.5 h-3.5" /> : <Key className="w-3.5 h-3.5" />}
                  {copiedToken ? 'Copiado!' : 'Copiar'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Tab 4: Backup & Export */}
        {activeTab === 'backup' && (
          <div className="space-y-4">
            <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
              Garanta a segurança de suas anotações exportando um arquivo de backup completo em formato JSON ou transferindo suas notas para outro computador/navegador.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Export Button */}
              <button
                type="button"
                onClick={exportNotesToJson}
                className="p-4 rounded-xl border border-gray-200 dark:border-[#232838] bg-gray-50 dark:bg-[#14161f] hover:bg-gray-100 dark:hover:bg-[#1a1d28] text-left transition-colors group"
              >
                <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center mb-2">
                  <Download className="w-4 h-4" />
                </div>
                <div className="text-xs font-bold text-gray-900 dark:text-gray-100">
                  Exportar Backup (.json)
                </div>
                <div className="text-[11px] text-gray-500 mt-0.5">
                  Baixe todas as suas notas e anexos em um único arquivo
                </div>
              </button>

              {/* Import Button */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="p-4 rounded-xl border border-gray-200 dark:border-[#232838] bg-gray-50 dark:bg-[#14161f] hover:bg-gray-100 dark:hover:bg-[#1a1d28] text-left transition-colors group"
              >
                <div className="w-9 h-9 rounded-xl bg-brand-500/10 text-brand-400 flex items-center justify-center mb-2">
                  <Upload className="w-4 h-4" />
                </div>
                <div className="text-xs font-bold text-gray-900 dark:text-gray-100">
                  Importar Backup (.json)
                </div>
                <div className="text-[11px] text-gray-500 mt-0.5">
                  Restaure notas previamente exportadas
                </div>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                onChange={handleFileImport}
                className="hidden"
              />
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex justify-end pt-2 border-t border-gray-100 dark:border-[#232838]">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-xs font-medium shadow-md shadow-brand-600/20 transition-all"
          >
            Concluir
          </button>
        </div>
      </div>
    </Modal>
  );
};

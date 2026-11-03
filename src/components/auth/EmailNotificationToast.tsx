import React, { useState, useEffect } from 'react';
import { subscribeToDispatchedEmails } from '../../lib/emailService';
import type { DispatchedEmail } from '../../types/auth';
import { Mail, Copy, Check, ExternalLink, X, ShieldAlert } from 'lucide-react';

export const EmailNotificationToast: React.FC = () => {
  const [emails, setEmails] = useState<DispatchedEmail[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    const unsub = subscribeToDispatchedEmails(newEmail => {
      setEmails(prev => [newEmail, ...prev.slice(0, 2)]); // Keep up to 3 recent
    });
    return unsub;
  }, []);

  const dismissEmail = (id: string) => {
    setEmails(prev => prev.filter(e => e.id !== id));
  };

  const copyCode = (id: string, code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2500);
  };

  if (emails.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-3 max-w-md w-full px-3 pointer-events-none">
      {emails.map(email => {
        const isCopied = copiedId === email.id;

        return (
          <div
            key={email.id}
            className="pointer-events-auto bg-slate-900/95 dark:bg-slate-950/95 border border-brand-500/40 text-slate-100 rounded-2xl p-4 shadow-2xl backdrop-blur-xl animate-in slide-in-from-bottom-5 duration-300 ring-1 ring-brand-500/20"
          >
            <div className="flex items-start justify-between gap-3 mb-2">
              <div className="flex items-center gap-2 text-brand-400 font-semibold text-xs uppercase tracking-wider">
                <span className="p-1 rounded-md bg-brand-500/20">
                  <Mail className="w-3.5 h-3.5" />
                </span>
                <span>E-mail Transacional Enviado</span>
              </div>
              <button
                onClick={() => dismissEmail(email.id)}
                className="text-slate-400 hover:text-white transition-colors p-1"
                aria-label="Fechar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-300 font-medium truncate mb-1">
              Para: <span className="text-white font-semibold">{email.to}</span>
            </p>
            <p className="text-xs text-slate-400 mb-3 font-mono truncate">
              Assunto: {email.subject}
            </p>

            {email.code && (
              <div className="bg-slate-800/80 rounded-xl p-3 border border-slate-700/60 flex items-center justify-between gap-3">
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">
                    Código de 6 dígitos
                  </span>
                  <span className="text-2xl font-mono font-black text-brand-400 tracking-widest">
                    {email.code}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => copyCode(email.id, email.code!)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all shadow-sm ${
                    isCopied
                      ? 'bg-emerald-600 text-white'
                      : 'bg-brand-600 hover:bg-brand-500 text-white shadow-brand-600/30'
                  }`}
                >
                  {isCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {isCopied ? 'Copiado!' : 'Copiar Código'}
                </button>
              </div>
            )}

            {email.resetLink && (
              <div className="bg-slate-800/80 rounded-xl p-3 border border-slate-700/60 flex flex-col gap-2">
                <div className="flex items-center gap-1.5 text-xs text-amber-400 font-medium">
                  <ShieldAlert className="w-3.5 h-3.5" />
                  Link Seguro de Recuperação
                </div>
                <a
                  href={email.resetLink}
                  onClick={() => dismissEmail(email.id)}
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-brand-600 hover:bg-brand-500 text-white transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Abrir Tela de Redefinição de Senha
                </a>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};


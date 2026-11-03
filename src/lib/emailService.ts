import { collection, doc, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import type { DispatchedEmail, VerificationPurpose, EmailProviderConfig } from '../types/auth';

const EMAIL_CONFIG_KEY = '7notpad_email_config';
const DISPATCHED_EMAILS_KEY = '7notpad_dispatched_emails';

type EmailListener = (email: DispatchedEmail & { deliveredExternally?: boolean; externalError?: string }) => void;
const emailListeners = new Set<EmailListener>();

export function subscribeToDispatchedEmails(listener: EmailListener): () => void {
  emailListeners.add(listener);
  return () => {
    emailListeners.delete(listener);
  };
}

export function notifyDispatchedEmail(email: DispatchedEmail & { deliveredExternally?: boolean; externalError?: string }) {
  // Store locally for UI retrieval
  saveLocalDispatchedEmail(email);

  emailListeners.forEach(listener => {
    try {
      listener(email);
    } catch (err) {
      console.error('Error in email listener:', err);
    }
  });
}

function saveLocalDispatchedEmail(email: DispatchedEmail) {
  try {
    const raw = localStorage.getItem(DISPATCHED_EMAILS_KEY);
    const list: DispatchedEmail[] = raw ? JSON.parse(raw) : [];
    const updated = [email, ...list.filter(e => e.id !== email.id)].slice(0, 15);
    localStorage.setItem(DISPATCHED_EMAILS_KEY, JSON.stringify(updated));
  } catch {}
}

export function getLastDispatchedEmail(targetEmail?: string): DispatchedEmail | null {
  try {
    const raw = localStorage.getItem(DISPATCHED_EMAILS_KEY);
    if (!raw) return null;
    const list: DispatchedEmail[] = JSON.parse(raw);
    if (targetEmail) {
      const match = list.find(e => e.to.toLowerCase() === targetEmail.toLowerCase().trim());
      return match || null;
    }
    return list[0] || null;
  } catch {
    return null;
  }
}

export function getEmailConfig(): EmailProviderConfig {
  try {
    const raw = localStorage.getItem(EMAIL_CONFIG_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {
    provider: 'simulated'
  };
}

export function saveEmailConfig(config: EmailProviderConfig) {
  try {
    localStorage.setItem(EMAIL_CONFIG_KEY, JSON.stringify(config));
  } catch (err) {
    console.error('Error saving email config:', err);
  }
}

// Generate styled HTML template for emails
export function buildHtmlEmail(params: {
  subject: string;
  code?: string;
  resetLink?: string;
  fullName?: string;
}): string {
  const { subject, code, resetLink, fullName } = params;
  const greeting = fullName ? `Olá, <strong>${fullName}</strong>!` : 'Olá!';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${subject}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0b0c10; color: #f1f5f9; margin: 0; padding: 24px; }
    .card { max-width: 480px; margin: 0 auto; background-color: #12141c; border: 1px solid #232838; border-radius: 20px; padding: 32px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
    .brand { font-size: 20px; font-weight: 900; color: #3b82f6; display: flex; align-items: center; gap: 8px; margin-bottom: 24px; }
    .title { font-size: 22px; font-weight: bold; color: #ffffff; margin-top: 0; margin-bottom: 12px; }
    .text { font-size: 14px; line-height: 1.6; color: #94a3b8; margin-bottom: 24px; }
    .code-box { background-color: #0f1118; border: 2px dashed #3b82f6; border-radius: 14px; padding: 20px; text-align: center; margin-bottom: 24px; }
    .code-label { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #64748b; font-weight: 700; margin-bottom: 6px; }
    .code-val { font-size: 34px; font-family: monospace; font-weight: 900; letter-spacing: 6px; color: #60a5fa; margin: 0; }
    .btn { display: inline-block; background-color: #2563eb; color: #ffffff !important; text-decoration: none; font-size: 14px; font-weight: 600; padding: 12px 28px; border-radius: 12px; text-align: center; margin-bottom: 20px; }
    .footer { font-size: 12px; color: #64748b; border-top: 1px solid #1e2230; padding-top: 20px; margin-top: 10px; line-height: 1.5; }
  </style>
</head>
<body>
  <div class="card">
    <div class="brand">
      <span style="background: linear-gradient(135deg, #2563eb, #06b6d4); color: white; border-radius: 8px; padding: 2px 8px; margin-right: 6px;">7</span>
      7NotPad
    </div>
    <h1 class="title">${subject}</h1>
    <p class="text">${greeting} Você solicitou esta ação no 7NotPad — Bloco de Notas Online.</p>
    
    ${code ? `
    <div class="code-box">
      <div class="code-label">Seu Código de Confirmação (6 dígitos)</div>
      <div class="code-val">${code}</div>
      <div style="font-size: 12px; color: #f59e0b; margin-top: 8px; font-weight: 600;">⏱️ Válido por 10 minutos</div>
    </div>
    ` : ''}

    ${resetLink ? `
    <div style="text-align: center; margin-bottom: 24px;">
      <a href="${resetLink}" class="btn">Redefinir Minha Senha</a>
      <div style="font-size: 11px; color: #64748b; margin-top: 8px; word-break: break-all;">Ou acesse: ${resetLink}</div>
    </div>
    ` : ''}

    <div class="footer">
      Se você não solicitou este e-mail, nenhuma ação é necessária. Sua conta permanece segura.<br/>
      <strong>7NotPad</strong> &bull; Bloco de notas online moderno e seguro.
    </div>
  </div>
</body>
</html>
  `;
}

export const EmailService = {
  // Send real email via configured provider
  async dispatchExternal(params: {
    to: string;
    subject: string;
    code?: string;
    resetLink?: string;
    fullName?: string;
  }): Promise<{ success: boolean; error?: string }> {
    const config = getEmailConfig();
    const { to, subject, code, resetLink, fullName } = params;
    const html = buildHtmlEmail(params);
    const plainText = code 
      ? `Seu código de confirmação no 7NotPad é: ${code}. Validade de 10 minutos.`
      : `Link de redefinição de senha: ${resetLink}`;

    // 1. Resend API
    if (config.provider === 'resend' && config.resendApiKey) {
      try {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${config.resendApiKey.trim()}`
          },
          body: JSON.stringify({
            from: config.resendFromEmail?.trim() || '7NotPad <onboarding@resend.dev>',
            to: [to.trim()],
            subject,
            html,
            text: plainText
          })
        });

        if (res.ok) {
          return { success: true };
        } else {
          const errData = await res.json().catch(() => ({}));
          return { success: false, error: errData?.message || `Erro Resend HTTP ${res.status}` };
        }
      } catch (err: any) {
        return { success: false, error: err?.message || 'Falha de conexão com Resend.' };
      }
    }

    // 2. Brevo API
    if (config.provider === 'brevo' && config.brevoApiKey) {
      try {
        const senderEmail = config.brevoSenderEmail?.trim() || 'no-reply@7notpad.com';
        const senderName = config.brevoSenderName?.trim() || '7NotPad';

        const res = await fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'api-key': config.brevoApiKey.trim()
          },
          body: JSON.stringify({
            sender: { name: senderName, email: senderEmail },
            to: [{ email: to.trim() }],
            subject,
            htmlContent: html,
            textContent: plainText
          })
        });

        if (res.ok) {
          return { success: true };
        } else {
          const errData = await res.json().catch(() => ({}));
          return { success: false, error: errData?.message || `Erro Brevo HTTP ${res.status}` };
        }
      } catch (err: any) {
        return { success: false, error: err?.message || 'Falha de conexão com Brevo.' };
      }
    }

    // 3. Custom Webhook / Google Apps Script (100% Free via Gmail)
    if (config.provider === 'webhook' && config.webhookUrl) {
      try {
        const url = config.webhookUrl.trim();
        const isGoogleScript = url.includes('script.google.com');

        if (isGoogleScript) {
          // Google Apps Script redirect works cleanly without preflight CORS blockers
          await fetch(url, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({
              to: to.trim(),
              subject,
              code,
              resetLink,
              fullName,
              html,
              text: plainText
            })
          });
          return { success: true };
        } else {
          const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              to: to.trim(),
              subject,
              code,
              resetLink,
              fullName,
              html,
              text: plainText
            })
          });

          if (res.ok) {
            return { success: true };
          } else {
            return { success: false, error: `Webhook retornou status ${res.status}` };
          }
        }
      } catch (err: any) {
        return { success: false, error: err?.message || 'Falha de conexão com o Webhook.' };
      }
    }

    return { success: false, error: 'Nenhum provedor externo configurado (usando modo em tela).' };
  },

  // Direct test email trigger
  async sendTestEmail(params: {
    to: string;
    fullName?: string;
  }): Promise<{ success: boolean; error?: string; testCode?: string }> {
    const { to, fullName } = params;
    const testCode = Math.floor(100000 + Math.random() * 900000).toString();
    const config = getEmailConfig();

    const externalRes = await this.dispatchExternal({
      to,
      subject: '7NotPad — Teste de Envio de E-mail',
      code: testCode,
      fullName: fullName || 'Usuário 7NotPad'
    });

    const emailId = `test_${Date.now()}`;
    const dispatched: DispatchedEmail = {
      id: emailId,
      to,
      subject: '7NotPad — Teste de Envio de E-mail',
      code: testCode,
      purpose: 'signup_verification',
      sent_at: new Date().toISOString()
    };

    notifyDispatchedEmail({
      ...dispatched,
      deliveredExternally: externalRes.success,
      externalError: externalRes.error
    });

    return {
      success: config.provider === 'simulated' ? true : externalRes.success,
      error: externalRes.error,
      testCode
    };
  },

  // Send 6-digit confirmation or verification code
  async sendVerificationCode(params: {
    to: string;
    code: string;
    purpose: VerificationPurpose;
    fullName?: string;
  }): Promise<{ success: boolean; emailId?: string; deliveredExternally?: boolean; externalError?: string }> {
    const { to, code, purpose, fullName } = params;
    const emailId = `mail_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    
    let subject = '7NotPad — Código de Confirmação';
    if (purpose === 'signup_verification') {
      subject = '7NotPad — Confirme seu cadastro';
    } else if (purpose === 'email_change') {
      subject = '7NotPad — Confirmação de alteração de e-mail';
    } else if (purpose === 'password_reset') {
      subject = '7NotPad — Código para recuperação de senha';
    }

    // Attempt real email delivery
    let deliveredExternally = false;
    let externalError = undefined;

    const externalRes = await this.dispatchExternal({
      to,
      subject,
      code,
      fullName
    });

    if (externalRes.success) {
      deliveredExternally = true;
    } else if (externalRes.error && !externalRes.error.includes('Nenhum provedor')) {
      externalError = externalRes.error;
    }

    const dispatched: DispatchedEmail = {
      id: emailId,
      to,
      subject,
      code,
      purpose,
      sent_at: new Date().toISOString()
    };

    // 1. Broadcast in-app with delivery status
    notifyDispatchedEmail({
      ...dispatched,
      deliveredExternally,
      externalError
    });

    // 2. Fire-and-forget sync to Firestore in background
    Promise.race([
      setDoc(doc(collection(db, 'dispatched_emails'), emailId), {
        ...dispatched,
        recipient_name: fullName || null,
        delivered_externally: deliveredExternally
      }),
      new Promise((_, reject) => setTimeout(() => reject('timeout'), 1500))
    ]).catch(() => {});

    return { success: true, emailId, deliveredExternally, externalError };
  },

  // Send password reset link
  async sendPasswordResetLink(params: {
    to: string;
    resetLink: string;
    fullName?: string;
  }): Promise<{ success: boolean; emailId?: string; deliveredExternally?: boolean }> {
    const { to, resetLink, fullName } = params;
    const emailId = `mail_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const subject = '7NotPad — Redefinição de Senha por Link';

    const externalRes = await this.dispatchExternal({
      to,
      subject,
      resetLink,
      fullName
    });

    const deliveredExternally = externalRes.success;

    const dispatched: DispatchedEmail = {
      id: emailId,
      to,
      subject,
      resetLink,
      purpose: 'password_reset_link',
      sent_at: new Date().toISOString()
    };

    notifyDispatchedEmail({
      ...dispatched,
      deliveredExternally
    });

    Promise.race([
      setDoc(doc(collection(db, 'dispatched_emails'), emailId), {
        ...dispatched,
        recipient_name: fullName || null,
        delivered_externally: deliveredExternally
      }),
      new Promise((_, reject) => setTimeout(() => reject('timeout'), 1500))
    ]).catch(() => {});

    return { success: true, emailId, deliveredExternally };
  }
};

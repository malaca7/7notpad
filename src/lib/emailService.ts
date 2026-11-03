import { collection, doc, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import type { DispatchedEmail, VerificationPurpose } from '../types/auth';

type EmailListener = (email: DispatchedEmail) => void;
const emailListeners = new Set<EmailListener>();

export function subscribeToDispatchedEmails(listener: EmailListener): () => void {
  emailListeners.add(listener);
  return () => {
    emailListeners.delete(listener);
  };
}

export function notifyDispatchedEmail(email: DispatchedEmail) {
  emailListeners.forEach(listener => {
    try {
      listener(email);
    } catch (err) {
      console.error('Error in email listener:', err);
    }
  });
}

export const EmailService = {
  // Send 6-digit confirmation or verification code
  async sendVerificationCode(params: {
    to: string;
    code: string;
    purpose: VerificationPurpose;
    fullName?: string;
  }): Promise<{ success: boolean; emailId?: string }> {
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

    const dispatched: DispatchedEmail = {
      id: emailId,
      to,
      subject,
      code,
      purpose,
      sent_at: new Date().toISOString()
    };

    // Store in Firestore collection 'dispatched_emails' for auditing & reliability
    try {
      await setDoc(doc(collection(db, 'dispatched_emails'), emailId), {
        ...dispatched,
        recipient_name: fullName || null
      });
    } catch (err) {
      console.warn('Could not persist dispatched email to Firestore:', err);
    }

    // Broadcast in-app so user can immediately copy/test the code seamlessly
    notifyDispatchedEmail(dispatched);

    return { success: true, emailId };
  },

  // Send password reset link
  async sendPasswordResetLink(params: {
    to: string;
    resetLink: string;
    fullName?: string;
  }): Promise<{ success: boolean; emailId?: string }> {
    const { to, resetLink, fullName } = params;
    const emailId = `mail_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const subject = '7NotPad — Redefinição de Senha por Link';

    const dispatched: DispatchedEmail = {
      id: emailId,
      to,
      subject,
      resetLink,
      purpose: 'password_reset_link',
      sent_at: new Date().toISOString()
    };

    try {
      await setDoc(doc(collection(db, 'dispatched_emails'), emailId), {
        ...dispatched,
        recipient_name: fullName || null
      });
    } catch (err) {
      console.warn('Could not persist reset email to Firestore:', err);
    }

    notifyDispatchedEmail(dispatched);

    return { success: true, emailId };
  }
};

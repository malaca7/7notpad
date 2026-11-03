import { 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs, 
  query, 
  where, 
  updateDoc 
} from 'firebase/firestore';
import { db } from './firebase';
import { 
  generateSalt, 
  hashPassword, 
  verifyPassword, 
  generateSixDigitCode, 
  hashCode, 
  verifyCode, 
  generateSecureToken, 
  hashToken 
} from './crypto';
import { EmailService } from './emailService';
import type { 
  UserProfile, 
  AuthSession, 
  EmailVerificationCode, 
  PasswordResetToken, 
  VerificationPurpose 
} from '../types/auth';

const AUTH_SESSION_KEY = '7notpad_auth_session';

type AuthListener = (session: AuthSession | null) => void;
const authListeners = new Set<AuthListener>();

export function subscribeToAuth(listener: AuthListener): () => void {
  authListeners.add(listener);
  return () => {
    authListeners.delete(listener);
  };
}

function notifyAuthChange(session: AuthSession | null) {
  authListeners.forEach(fn => {
    try {
      fn(session);
    } catch (err) {
      console.error('Error in auth listener:', err);
    }
  });
}

function saveLocalSession(session: AuthSession) {
  try {
    localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(session));
  } catch (err) {
    console.warn('Could not save auth session in localStorage:', err);
  }
  notifyAuthChange(session);
}

function clearLocalSession() {
  try {
    localStorage.removeItem(AUTH_SESSION_KEY);
  } catch {}
  notifyAuthChange(null);
}

// Helper email format validation
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
  return emailRegex.test(email.trim());
}

// Helper username validation
export function isValidUsername(username: string): { valid: boolean; error?: string } {
  const clean = username.trim().toLowerCase();
  if (clean.length < 3) {
    return { valid: false, error: 'O nome de usuário deve ter pelo menos 3 caracteres.' };
  }
  if (clean.length > 30) {
    return { valid: false, error: 'O nome de usuário deve ter no máximo 30 caracteres.' };
  }
  if (!/^[a-z0-9_.-]+$/.test(clean)) {
    return { valid: false, error: 'O nome de usuário só pode conter letras, números, pontos, hífens e underscores.' };
  }
  return { valid: true };
}

export const AuthService = {
  // Get currently active session from localStorage
  getCurrentSession(): AuthSession | null {
    try {
      const data = localStorage.getItem(AUTH_SESSION_KEY);
      if (!data) return null;
      return JSON.parse(data) as AuthSession;
    } catch {
      return null;
    }
  },

  getCurrentUser(): UserProfile | null {
    const session = this.getCurrentSession();
    return session ? session.user : null;
  },

  // ----------------------------------------------------
  // ETAPA 1 — Cadastro de Usuários
  // ----------------------------------------------------
  async register(params: {
    fullName: string;
    username: string;
    email: string;
    password: string;
    confirmPassword: string;
  }): Promise<{ success: boolean; userId?: string; email?: string; error?: string }> {
    const fullName = params.fullName.trim();
    const username = params.username.trim().toLowerCase();
    const email = params.email.trim().toLowerCase();
    const password = params.password;
    const confirmPassword = params.confirmPassword;

    // Validate inputs
    if (!fullName || !username || !email || !password || !confirmPassword) {
      return { success: false, error: 'Todos os campos são obrigatórios.' };
    }

    const usernameCheck = isValidUsername(username);
    if (!usernameCheck.valid) {
      return { success: false, error: usernameCheck.error };
    }

    if (!isValidEmail(email)) {
      return { success: false, error: 'Por favor, insira um endereço de e-mail válido.' };
    }

    if (password.length < 8) {
      return { success: false, error: 'A senha deve conter no mínimo 8 caracteres.' };
    }

    if (password !== confirmPassword) {
      return { success: false, error: 'A confirmação de senha não coincide com a senha digitada.' };
    }

    try {
      // 1. Check if username is already taken
      const usersRef = collection(db, 'users');
      const usernameQuery = query(usersRef, where('username', '==', username));
      const usernameSnap = await getDocs(usernameQuery);
      if (!usernameSnap.empty) {
        return { success: false, error: 'Este nome de usuário já está em uso. Escolha outro.' };
      }

      // 2. Check if email is already taken
      const emailQuery = query(usersRef, where('email', '==', email));
      const emailSnap = await getDocs(emailQuery);
      if (!emailSnap.empty) {
        return { success: false, error: 'Este e-mail já está cadastrado. Faça login ou recupere sua senha.' };
      }

      // 3. Create user in Firestore
      const userId = `usr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const salt = generateSalt();
      const passwordHash = await hashPassword(password, salt);
      const now = new Date().toISOString();

      await setDoc(doc(db, 'users', userId), {
        id: userId,
        full_name: fullName,
        username,
        email,
        password_salt: salt,
        password_hash: passwordHash,
        email_verified: false,
        created_at: now,
        updated_at: now
      });

      // 4. Generate and send 6-digit confirmation code
      await this.generateAndSendCode({
        userId,
        email,
        purpose: 'signup_verification',
        fullName
      });

      return { success: true, userId, email };
    } catch (err: any) {
      console.error('Register error:', err);
      return { success: false, error: err?.message || 'Erro ao realizar cadastro.' };
    }
  },

  // Generate 6-digit code with 10-minute validity and send email
  async generateAndSendCode(params: {
    userId: string;
    email: string;
    purpose: VerificationPurpose;
    fullName?: string;
    newEmail?: string;
  }): Promise<{ success: boolean; codeId?: string; error?: string }> {
    const { userId, email, purpose, fullName, newEmail } = params;
    const cleanEmail = email.trim().toLowerCase();

    try {
      // Invalidate any existing pending codes for this email and purpose
      const codesRef = collection(db, 'email_verification_codes');
      const q = query(
        codesRef, 
        where('email', '==', cleanEmail),
        where('purpose', '==', purpose)
      );
      const snap = await getDocs(q);
      const nowIso = new Date().toISOString();
      const invalidations = snap.docs.map(d => {
        const data = d.data();
        if (!data.used_at) {
          return updateDoc(d.ref, { used_at: nowIso, invalidated: true });
        }
        return Promise.resolve();
      });
      await Promise.all(invalidations);

      // Generate new 6-digit code
      const code = generateSixDigitCode();
      const codeSalt = generateSalt();
      const codeHash = await hashCode(code, codeSalt);
      const codeId = `code_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      // Exactly 10 minutes validity
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

      const codeDoc: EmailVerificationCode = {
        id: codeId,
        user_id: userId,
        email: cleanEmail,
        code_hash: codeHash,
        code_salt: codeSalt,
        purpose,
        expires_at: expiresAt,
        attempts: 0,
        created_at: nowIso,
        ...(newEmail ? { new_email: newEmail.trim().toLowerCase() } : {})
      };

      await setDoc(doc(db, 'email_verification_codes', codeId), codeDoc);

      // Send email (for email_change, recipient is newEmail)
      const targetEmail = newEmail || cleanEmail;
      await EmailService.sendVerificationCode({
        to: targetEmail,
        code,
        purpose,
        fullName
      });

      return { success: true, codeId };
    } catch (err: any) {
      console.error('Error generating verification code:', err);
      return { success: false, error: err?.message || 'Erro ao enviar código de verificação.' };
    }
  },

  // ----------------------------------------------------
  // ETAPA 2 — Confirmação de E-mail por Código
  // ----------------------------------------------------
  async verifyEmailCode(params: {
    email: string;
    code: string;
    purpose: VerificationPurpose;
  }): Promise<{ 
    success: boolean; 
    session?: AuthSession; 
    newEmail?: string; 
    error?: string; 
    attemptsLeft?: number;
  }> {
    const email = params.email.trim().toLowerCase();
    const code = params.code.trim();
    const purpose = params.purpose;

    if (!code || code.length !== 6 || !/^\d{6}$/.test(code)) {
      return { success: false, error: 'O código deve conter exatamente 6 dígitos numéricos.' };
    }

    try {
      const codesRef = collection(db, 'email_verification_codes');
      const q = query(
        codesRef, 
        where('email', '==', email), 
        where('purpose', '==', purpose)
      );
      const snap = await getDocs(q);

      if (snap.empty) {
        return { success: false, error: 'Nenhum código de verificação pendente encontrado para este e-mail.' };
      }

      // Pick the latest uninvalidated code
      const docs = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as EmailVerificationCode & { invalidated?: boolean }))
        .filter(d => !d.used_at && !d.invalidated)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      if (docs.length === 0) {
        return { success: false, error: 'O código informado já foi utilizado ou foi substituído por um novo. Solicite um novo código.' };
      }

      const activeCode = docs[0];
      const now = new Date();

      // Check expiration (10 minutes)
      if (now > new Date(activeCode.expires_at)) {
        await updateDoc(doc(db, 'email_verification_codes', activeCode.id), { used_at: now.toISOString(), expired: true });
        return { success: false, error: 'Este código expirou (validade de 10 minutos). Por favor, solicite um novo código.' };
      }

      // Check max attempts (limit to 5 attempts)
      const currentAttempts = (activeCode.attempts || 0) + 1;
      if (currentAttempts > 5) {
        await updateDoc(doc(db, 'email_verification_codes', activeCode.id), { used_at: now.toISOString(), blocked: true });
        return { success: false, error: 'Número máximo de tentativas excedido (5 tentativas). O código foi invalidado. Solicite um novo código.' };
      }

      // Update attempt counter in Firestore
      await updateDoc(doc(db, 'email_verification_codes', activeCode.id), { attempts: currentAttempts });

      // Verify code
      const isMatch = await verifyCode(code, activeCode.code_salt, activeCode.code_hash);
      if (!isMatch) {
        const remaining = 5 - currentAttempts;
        return { 
          success: false, 
          error: `Código incorreto. Você tem mais ${remaining} tentativa${remaining === 1 ? '' : 's'}.`,
          attemptsLeft: remaining
        };
      }

      // Code is valid! Mark as used
      await updateDoc(doc(db, 'email_verification_codes', activeCode.id), { used_at: now.toISOString() });

      // Action based on purpose
      if (purpose === 'signup_verification') {
        // Activate user
        const userRef = doc(db, 'users', activeCode.user_id);
        const userSnap = await getDoc(userRef);
        if (!userSnap.exists()) {
          return { success: false, error: 'Usuário não encontrado.' };
        }

        await updateDoc(userRef, {
          email_verified: true,
          updated_at: now.toISOString()
        });

        const userData = userSnap.data();
        const profile: UserProfile = {
          id: userData.id,
          full_name: userData.full_name,
          username: userData.username,
          email: userData.email,
          email_verified: true,
          created_at: userData.created_at,
          updated_at: now.toISOString()
        };

        const session: AuthSession = {
          user: profile,
          token: generateSecureToken(24),
          login_at: now.toISOString()
        };

        saveLocalSession(session);
        return { success: true, session };
      }

      if (purpose === 'email_change') {
        const newEmail = activeCode.new_email;
        if (!newEmail) {
          return { success: false, error: 'Novo e-mail não identificado.' };
        }

        const userRef = doc(db, 'users', activeCode.user_id);
        await updateDoc(userRef, {
          email: newEmail,
          updated_at: now.toISOString()
        });

        // Update local session
        const currentSession = this.getCurrentSession();
        if (currentSession && currentSession.user.id === activeCode.user_id) {
          currentSession.user.email = newEmail;
          currentSession.user.updated_at = now.toISOString();
          saveLocalSession(currentSession);
        }

        return { success: true, newEmail };
      }

      if (purpose === 'password_reset') {
        return { success: true };
      }

      return { success: true };
    } catch (err: any) {
      console.error('verifyEmailCode error:', err);
      return { success: false, error: err?.message || 'Erro ao validar código.' };
    }
  },

  // Reenviar código
  async resendCode(email: string, purpose: VerificationPurpose): Promise<{ success: boolean; error?: string }> {
    const cleanEmail = email.trim().toLowerCase();
    try {
      const usersRef = collection(db, 'users');
      let snap = await getDocs(query(usersRef, where('email', '==', cleanEmail)));
      
      let userId = '';
      let fullName = '';
      let newEmailTarget = undefined;

      if (!snap.empty) {
        const u = snap.docs[0].data();
        userId = u.id;
        fullName = u.full_name;
      } else {
        // For email_change, query by active code
        const codesRef = collection(db, 'email_verification_codes');
        const codeSnap = await getDocs(query(codesRef, where('email', '==', cleanEmail), where('purpose', '==', purpose)));
        if (!codeSnap.empty) {
          const c = codeSnap.docs[0].data();
          userId = c.user_id;
          newEmailTarget = c.new_email;
        } else {
          return { success: false, error: 'Usuário não encontrado para reenvio.' };
        }
      }

      return await this.generateAndSendCode({
        userId,
        email: cleanEmail,
        purpose,
        fullName,
        newEmail: newEmailTarget
      });
    } catch (err: any) {
      return { success: false, error: err?.message || 'Erro ao reenviar código.' };
    }
  },

  // ----------------------------------------------------
  // ETAPA 3 — Login e Recuperação de Senha
  // ----------------------------------------------------
  async login(params: {
    username: string;
    password: string;
  }): Promise<{ 
    success: boolean; 
    session?: AuthSession; 
    error?: string; 
    unverifiedEmail?: string; 
  }> {
    const rawUsername = params.username.trim();
    const password = params.password;

    // Strict rule: reject email format!
    if (rawUsername.includes('@')) {
      return { 
        success: false, 
        error: 'O login deve ser realizado com o seu Nome de Usuário, e não com e-mail.' 
      };
    }

    if (!rawUsername || !password) {
      return { success: false, error: 'Por favor, preencha o nome de usuário e a senha.' };
    }

    const username = rawUsername.toLowerCase();

    try {
      // Find user by username
      const usersRef = collection(db, 'users');
      const q = query(usersRef, where('username', '==', username));
      const snap = await getDocs(q);

      // Anti-enumeration: Generic message
      if (snap.empty) {
        return { success: false, error: 'Nome de usuário ou senha incorretos.' };
      }

      const userData = snap.docs[0].data();

      // Check password
      const isMatch = await verifyPassword(password, userData.password_salt, userData.password_hash);
      if (!isMatch) {
        return { success: false, error: 'Nome de usuário ou senha incorretos.' };
      }

      // Check email confirmation
      if (!userData.email_verified) {
        return {
          success: false,
          unverifiedEmail: userData.email,
          error: 'E-mail ainda não confirmado. Por favor, confirme seu e-mail para acessar sua conta.'
        };
      }

      const profile: UserProfile = {
        id: userData.id,
        full_name: userData.full_name,
        username: userData.username,
        email: userData.email,
        email_verified: Boolean(userData.email_verified),
        created_at: userData.created_at,
        updated_at: userData.updated_at
      };

      const session: AuthSession = {
        user: profile,
        token: generateSecureToken(24),
        login_at: new Date().toISOString()
      };

      saveLocalSession(session);
      return { success: true, session };
    } catch (err: any) {
      console.error('Login error:', err);
      return { success: false, error: err?.message || 'Erro ao realizar login.' };
    }
  },

  logout() {
    clearLocalSession();
  },

  // Request password reset (either by 6-digit code or secure link)
  async requestPasswordReset(params: {
    identifier: string; // username or email
    method: 'code' | 'link';
  }): Promise<{ 
    success: boolean; 
    email?: string; 
    error?: string; 
  }> {
    const ident = params.identifier.trim().toLowerCase();
    if (!ident) {
      return { success: false, error: 'Informe seu nome de usuário ou e-mail.' };
    }

    try {
      const usersRef = collection(db, 'users');
      let snap = await getDocs(query(usersRef, where('username', '==', ident)));
      if (snap.empty) {
        snap = await getDocs(query(usersRef, where('email', '==', ident)));
      }

      // Anti-enumeration: if user not found, don't expose error, still say instructions dispatched
      if (snap.empty) {
        return { success: true, email: ident };
      }

      const userData = snap.docs[0].data();
      const targetEmail = userData.email;
      const fullName = userData.full_name;
      const userId = userData.id;

      if (params.method === 'code') {
        // 6-digit code method
        await this.generateAndSendCode({
          userId,
          email: targetEmail,
          purpose: 'password_reset',
          fullName
        });
        return { success: true, email: targetEmail };
      } else {
        // Secure token link method
        const token = generateSecureToken(32);
        const tokenSalt = generateSalt();
        const tokenHash = await hashToken(token, tokenSalt);
        const tokenId = `rst_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        // Valid for 1 hour
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

        const tokenDoc: PasswordResetToken = {
          id: tokenId,
          user_id: userId,
          email: targetEmail,
          token_hash: tokenHash,
          token_salt: tokenSalt,
          expires_at: expiresAt,
          created_at: new Date().toISOString()
        };

        await setDoc(doc(db, 'password_reset_tokens', tokenId), tokenDoc);

        // Build reset link using current origin
        const resetLink = `${window.location.origin}${window.location.pathname}?reset_token=${token}&email=${encodeURIComponent(targetEmail)}`;

        await EmailService.sendPasswordResetLink({
          to: targetEmail,
          resetLink,
          fullName
        });

        return { success: true, email: targetEmail };
      }
    } catch (err: any) {
      console.error('Password reset request error:', err);
      return { success: false, error: err?.message || 'Erro ao solicitar redefinição de senha.' };
    }
  },

  // Reset password using 6-digit code
  async resetPasswordWithCode(params: {
    email: string;
    code: string;
    newPassword: string;
    confirmPassword: string;
  }): Promise<{ success: boolean; error?: string }> {
    const { email, code, newPassword, confirmPassword } = params;

    if (newPassword.length < 8) {
      return { success: false, error: 'A nova senha deve ter pelo menos 8 caracteres.' };
    }
    if (newPassword !== confirmPassword) {
      return { success: false, error: 'A confirmação de senha não coincide com a nova senha.' };
    }

    // Verify code first
    const verification = await this.verifyEmailCode({
      email,
      code,
      purpose: 'password_reset'
    });

    if (!verification.success) {
      return { success: false, error: verification.error };
    }

    try {
      // Find user
      const usersRef = collection(db, 'users');
      const snap = await getDocs(query(usersRef, where('email', '==', email.trim().toLowerCase())));
      if (snap.empty) {
        return { success: false, error: 'Usuário não encontrado.' };
      }

      const userDocRef = snap.docs[0].ref;
      const newSalt = generateSalt();
      const newHash = await hashPassword(newPassword, newSalt);

      await updateDoc(userDocRef, {
        password_salt: newSalt,
        password_hash: newHash,
        updated_at: new Date().toISOString()
      });

      return { success: true };
    } catch (err: any) {
      console.error('resetPasswordWithCode error:', err);
      return { success: false, error: err?.message || 'Erro ao redefinir senha.' };
    }
  },

  // Reset password using secure link token
  async resetPasswordWithToken(params: {
    token: string;
    email: string;
    newPassword: string;
    confirmPassword: string;
  }): Promise<{ success: boolean; error?: string }> {
    const { token, email, newPassword, confirmPassword } = params;

    if (!token) {
      return { success: false, error: 'Token de redefinição inválido ou ausente.' };
    }
    if (newPassword.length < 8) {
      return { success: false, error: 'A nova senha deve ter pelo menos 8 caracteres.' };
    }
    if (newPassword !== confirmPassword) {
      return { success: false, error: 'A confirmação de senha não coincide com a nova senha.' };
    }

    try {
      const tokensRef = collection(db, 'password_reset_tokens');
      const q = query(tokensRef, where('email', '==', email.trim().toLowerCase()));
      const snap = await getDocs(q);

      if (snap.empty) {
        return { success: false, error: 'Link de redefinição não encontrado ou já utilizado.' };
      }

      // Find token that matches hash and is not expired or used
      let matchedTokenDoc: (PasswordResetToken & { docRef: any }) | null = null;
      const now = new Date();

      for (const d of snap.docs) {
        const data = d.data() as PasswordResetToken;
        if (data.used_at) continue;
        if (now > new Date(data.expires_at)) continue;

        const isMatch = (await hashToken(token, data.token_salt)) === data.token_hash;
        if (isMatch) {
          matchedTokenDoc = { ...data, docRef: d.ref };
          break;
        }
      }

      if (!matchedTokenDoc) {
        return { success: false, error: 'Link de redefinição inválido ou expirado (validade de 1 hora). Solicite um novo link.' };
      }

      // Mark token as used
      await updateDoc(matchedTokenDoc.docRef, { used_at: now.toISOString() });

      // Update user password
      const userRef = doc(db, 'users', matchedTokenDoc.user_id);
      const newSalt = generateSalt();
      const newHash = await hashPassword(newPassword, newSalt);

      await updateDoc(userRef, {
        password_salt: newSalt,
        password_hash: newHash,
        updated_at: now.toISOString()
      });

      return { success: true };
    } catch (err: any) {
      console.error('resetPasswordWithToken error:', err);
      return { success: false, error: err?.message || 'Erro ao redefinir senha com link.' };
    }
  },

  // ----------------------------------------------------
  // ETAPA 4 — Configurações e Gerenciamento da Conta
  // ----------------------------------------------------
  async updateProfile(params: {
    userId: string;
    fullName: string;
    username: string;
  }): Promise<{ success: boolean; user?: UserProfile; error?: string }> {
    const { userId } = params;
    const fullName = params.fullName.trim();
    const username = params.username.trim().toLowerCase();

    if (!fullName) {
      return { success: false, error: 'O nome completo não pode ficar em branco.' };
    }

    const check = isValidUsername(username);
    if (!check.valid) {
      return { success: false, error: check.error };
    }

    try {
      const userRef = doc(db, 'users', userId);
      const userSnap = await getDoc(userRef);
      if (!userSnap.exists()) {
        return { success: false, error: 'Usuário não encontrado.' };
      }

      const currentData = userSnap.data();

      // If username changed, verify uniqueness
      if (currentData.username !== username) {
        const usersRef = collection(db, 'users');
        const q = query(usersRef, where('username', '==', username));
        const snap = await getDocs(q);
        if (!snap.empty) {
          return { success: false, error: 'Este nome de usuário já está em uso por outra conta.' };
        }
      }

      const nowIso = new Date().toISOString();
      await updateDoc(userRef, {
        full_name: fullName,
        username,
        updated_at: nowIso
      });

      const updatedProfile: UserProfile = {
        id: userId,
        full_name: fullName,
        username,
        email: currentData.email,
        email_verified: Boolean(currentData.email_verified),
        created_at: currentData.created_at,
        updated_at: nowIso
      };

      const session = this.getCurrentSession();
      if (session && session.user.id === userId) {
        session.user = updatedProfile;
        saveLocalSession(session);
      }

      return { success: true, user: updatedProfile };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Erro ao atualizar perfil.' };
    }
  },

  // Request email change (sends 6-digit code to new email)
  async requestEmailChange(params: {
    userId: string;
    newEmail: string;
  }): Promise<{ success: boolean; error?: string }> {
    const { userId } = params;
    const newEmail = params.newEmail.trim().toLowerCase();

    if (!isValidEmail(newEmail)) {
      return { success: false, error: 'Insira um endereço de e-mail válido.' };
    }

    try {
      const userRef = doc(db, 'users', userId);
      const userSnap = await getDoc(userRef);
      if (!userSnap.exists()) {
        return { success: false, error: 'Usuário não encontrado.' };
      }

      const currentData = userSnap.data();
      if (currentData.email === newEmail) {
        return { success: false, error: 'O novo e-mail informado é idêntico ao e-mail atual.' };
      }

      // Check if new email is in use
      const usersRef = collection(db, 'users');
      const q = query(usersRef, where('email', '==', newEmail));
      const snap = await getDocs(q);
      if (!snap.empty) {
        return { success: false, error: 'Este endereço de e-mail já está cadastrado em outra conta.' };
      }

      // Send 6-digit code to current user's record with newEmail specified
      return await this.generateAndSendCode({
        userId,
        email: currentData.email,
        purpose: 'email_change',
        fullName: currentData.full_name,
        newEmail
      });
    } catch (err: any) {
      return { success: false, error: err?.message || 'Erro ao solicitar troca de e-mail.' };
    }
  },

  // Confirm email change with 6-digit code
  async confirmEmailChange(params: {
    currentEmail: string;
    code: string;
  }): Promise<{ success: boolean; newEmail?: string; error?: string }> {
    return await this.verifyEmailCode({
      email: params.currentEmail,
      code: params.code,
      purpose: 'email_change'
    });
  },

  // Change password with current password verification
  async changePassword(params: {
    userId: string;
    currentPassword: string;
    newPassword: string;
    confirmPassword: string;
  }): Promise<{ success: boolean; error?: string }> {
    const { userId, currentPassword, newPassword, confirmPassword } = params;

    if (!currentPassword) {
      return { success: false, error: 'Informe a senha atual.' };
    }
    if (newPassword.length < 8) {
      return { success: false, error: 'A nova senha deve ter pelo menos 8 caracteres.' };
    }
    if (newPassword !== confirmPassword) {
      return { success: false, error: 'A confirmação de senha não coincide com a nova senha.' };
    }

    try {
      const userRef = doc(db, 'users', userId);
      const snap = await getDoc(userRef);
      if (!snap.exists()) {
        return { success: false, error: 'Usuário não encontrado.' };
      }

      const userData = snap.data();
      const isMatch = await verifyPassword(currentPassword, userData.password_salt, userData.password_hash);
      if (!isMatch) {
        return { success: false, error: 'A senha atual informada está incorreta.' };
      }

      const newSalt = generateSalt();
      const newHash = await hashPassword(newPassword, newSalt);

      await updateDoc(userRef, {
        password_salt: newSalt,
        password_hash: newHash,
        updated_at: new Date().toISOString()
      });

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Erro ao alterar senha.' };
    }
  }
};

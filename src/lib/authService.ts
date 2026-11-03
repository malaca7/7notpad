import { 
  collection, 
  doc, 
  setDoc, 
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
const LOCAL_USERS_KEY = '7notpad_users_store';
const LOCAL_CODES_KEY = '7notpad_codes_store';
const LOCAL_TOKENS_KEY = '7notpad_tokens_store';

export interface StoredUser {
  id: string;
  full_name: string;
  username: string; // unique lowercase
  email: string; // unique lowercase
  password_salt: string;
  password_hash: string;
  email_verified: boolean;
  created_at: string;
  updated_at: string;
}

// Local Database Helpers (Local-First resilient storage)
function getLocalUsers(): StoredUser[] {
  try {
    const raw = localStorage.getItem(LOCAL_USERS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveLocalUsers(users: StoredUser[]) {
  try {
    localStorage.setItem(LOCAL_USERS_KEY, JSON.stringify(users));
  } catch {}
}

function getLocalCodes(): (EmailVerificationCode & { invalidated?: boolean })[] {
  try {
    const raw = localStorage.getItem(LOCAL_CODES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveLocalCodes(codes: (EmailVerificationCode & { invalidated?: boolean })[]) {
  try {
    localStorage.setItem(LOCAL_CODES_KEY, JSON.stringify(codes));
  } catch {}
}

function getLocalTokens(): PasswordResetToken[] {
  try {
    const raw = localStorage.getItem(LOCAL_TOKENS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveLocalTokens(tokens: PasswordResetToken[]) {
  try {
    localStorage.setItem(LOCAL_TOKENS_KEY, JSON.stringify(tokens));
  } catch {}
}

// Safe timeout wrapper for Firestore calls so offline/unprovisioned DB never hangs
async function withTimeout<T>(promise: Promise<T>, timeoutMs = 1500): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs))
  ]).catch(() => null);
}

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
  // ETAPA 1 — Cadastro de Usuários (Zero-Hang / Instantâneo)
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
      // 1. Check uniqueness in local storage first
      const localUsers = getLocalUsers();
      if (localUsers.some(u => u.username.toLowerCase() === username)) {
        return { success: false, error: 'Este nome de usuário já está em uso. Escolha outro.' };
      }
      if (localUsers.some(u => u.email.toLowerCase() === email)) {
        return { success: false, error: 'Este e-mail já está cadastrado. Faça login ou recupere sua senha.' };
      }

      // 2. Fast check in Firestore with timeout (if online and configured)
      try {
        const usersRef = collection(db, 'users');
        const usernameQuery = query(usersRef, where('username', '==', username));
        const usernameSnap = await withTimeout(getDocs(usernameQuery), 1200);
        if (usernameSnap && !usernameSnap.empty) {
          return { success: false, error: 'Este nome de usuário já está em uso. Escolha outro.' };
        }

        const emailQuery = query(usersRef, where('email', '==', email));
        const emailSnap = await withTimeout(getDocs(emailQuery), 1200);
        if (emailSnap && !emailSnap.empty) {
          return { success: false, error: 'Este e-mail já está cadastrado. Faça login ou recupere sua senha.' };
        }
      } catch (err) {
        // Safe to continue with local validation
      }

      // 3. Create user record
      const userId = `usr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const salt = generateSalt();
      const passwordHash = await hashPassword(password, salt);
      const now = new Date().toISOString();

      const newUser: StoredUser = {
        id: userId,
        full_name: fullName,
        username,
        email,
        password_salt: salt,
        password_hash: passwordHash,
        email_verified: false,
        created_at: now,
        updated_at: now
      };

      // Save to local storage database immediately!
      localUsers.push(newUser);
      saveLocalUsers(localUsers);

      // Replicate to Firestore in background without blocking execution
      withTimeout(setDoc(doc(db, 'users', userId), newUser), 1500).catch(() => {});

      // 4. Generate and send 6-digit confirmation code immediately!
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
      const nowIso = new Date().toISOString();
      const codes = getLocalCodes();

      // Invalidate any existing pending codes for this email and purpose
      codes.forEach(c => {
        if (c.email === cleanEmail && c.purpose === purpose && !c.used_at) {
          c.invalidated = true;
          c.used_at = nowIso;
        }
      });

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

      codes.push(codeDoc);
      saveLocalCodes(codes);

      // Sync code to Firestore in background
      withTimeout(setDoc(doc(db, 'email_verification_codes', codeId), codeDoc), 1500).catch(() => {});

      // Send email (shows immediate floating toast notification with code)
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
      const localCodes = getLocalCodes();
      const matchingCodes = localCodes
        .filter(c => c.email === email && c.purpose === purpose && !c.used_at && !c.invalidated)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      if (matchingCodes.length === 0) {
        return { success: false, error: 'Nenhum código de verificação pendente encontrado. Solicite um novo código.' };
      }

      const activeCode = matchingCodes[0];
      const now = new Date();

      // Check expiration (10 minutes)
      if (now > new Date(activeCode.expires_at)) {
        activeCode.used_at = now.toISOString();
        saveLocalCodes(localCodes);
        return { success: false, error: 'Este código expirou (validade de 10 minutos). Por favor, solicite um novo código.' };
      }

      // Check max attempts (limit to 5 attempts)
      const currentAttempts = (activeCode.attempts || 0) + 1;
      activeCode.attempts = currentAttempts;
      saveLocalCodes(localCodes);

      if (currentAttempts > 5) {
        activeCode.used_at = now.toISOString();
        activeCode.invalidated = true;
        saveLocalCodes(localCodes);
        return { success: false, error: 'Número máximo de tentativas excedido (5 tentativas). O código foi invalidado. Solicite um novo código.' };
      }

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
      activeCode.used_at = now.toISOString();
      saveLocalCodes(localCodes);

      // Sync code usage to Firestore in background
      withTimeout(updateDoc(doc(db, 'email_verification_codes', activeCode.id), { used_at: now.toISOString() }), 1000).catch(() => {});

      // Purpose 1: Signup Verification
      if (purpose === 'signup_verification') {
        const localUsers = getLocalUsers();
        const user = localUsers.find(u => u.id === activeCode.user_id || u.email === email);
        if (!user) {
          return { success: false, error: 'Usuário não encontrado.' };
        }

        user.email_verified = true;
        user.updated_at = now.toISOString();
        saveLocalUsers(localUsers);

        // Sync user verification to Firestore in background
        withTimeout(updateDoc(doc(db, 'users', user.id), { email_verified: true, updated_at: now.toISOString() }), 1000).catch(() => {});

        const profile: UserProfile = {
          id: user.id,
          full_name: user.full_name,
          username: user.username,
          email: user.email,
          email_verified: true,
          created_at: user.created_at,
          updated_at: user.updated_at
        };

        const session: AuthSession = {
          user: profile,
          token: generateSecureToken(24),
          login_at: now.toISOString()
        };

        saveLocalSession(session);
        return { success: true, session };
      }

      // Purpose 2: Email Change
      if (purpose === 'email_change') {
        const newEmail = activeCode.new_email;
        if (!newEmail) {
          return { success: false, error: 'Novo e-mail não identificado.' };
        }

        const localUsers = getLocalUsers();
        const user = localUsers.find(u => u.id === activeCode.user_id);
        if (user) {
          user.email = newEmail;
          user.updated_at = now.toISOString();
          saveLocalUsers(localUsers);
        }

        const currentSession = this.getCurrentSession();
        if (currentSession && currentSession.user.id === activeCode.user_id) {
          currentSession.user.email = newEmail;
          currentSession.user.updated_at = now.toISOString();
          saveLocalSession(currentSession);
        }

        withTimeout(updateDoc(doc(db, 'users', activeCode.user_id), { email: newEmail, updated_at: now.toISOString() }), 1000).catch(() => {});

        return { success: true, newEmail };
      }

      // Purpose 3: Password Reset
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
      const localUsers = getLocalUsers();
      const user = localUsers.find(u => u.email === cleanEmail);

      let userId = user ? user.id : '';
      let fullName = user ? user.full_name : '';
      let newEmailTarget = undefined;

      if (!user) {
        const codes = getLocalCodes();
        const existingCode = codes.find(c => c.email === cleanEmail && c.purpose === purpose);
        if (existingCode) {
          userId = existingCode.user_id;
          newEmailTarget = existingCode.new_email;
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
      // 1. Check local users database first
      const localUsers = getLocalUsers();
      let user = localUsers.find(u => u.username.toLowerCase() === username);

      // 2. If not local, fast check in Firestore
      if (!user) {
        try {
          const usersRef = collection(db, 'users');
          const q = query(usersRef, where('username', '==', username));
          const snap = await withTimeout(getDocs(q), 1500);
          if (snap && !snap.empty) {
            user = snap.docs[0].data() as StoredUser;
            localUsers.push(user);
            saveLocalUsers(localUsers);
          }
        } catch {}
      }

      // Anti-enumeration: Generic message
      if (!user) {
        return { success: false, error: 'Nome de usuário ou senha incorretos.' };
      }

      // Check password
      const isMatch = await verifyPassword(password, user.password_salt, user.password_hash);
      if (!isMatch) {
        return { success: false, error: 'Nome de usuário ou senha incorretos.' };
      }

      // Check email confirmation
      if (!user.email_verified) {
        return {
          success: false,
          unverifiedEmail: user.email,
          error: 'E-mail ainda não confirmado. Por favor, confirme seu e-mail para acessar sua conta.'
        };
      }

      const profile: UserProfile = {
        id: user.id,
        full_name: user.full_name,
        username: user.username,
        email: user.email,
        email_verified: Boolean(user.email_verified),
        created_at: user.created_at,
        updated_at: user.updated_at
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
      const localUsers = getLocalUsers();
      let user = localUsers.find(u => u.username.toLowerCase() === ident || u.email.toLowerCase() === ident);

      if (!user) {
        try {
          const usersRef = collection(db, 'users');
          let snap = await withTimeout(getDocs(query(usersRef, where('username', '==', ident))), 1200);
          if (!snap || snap.empty) {
            snap = await withTimeout(getDocs(query(usersRef, where('email', '==', ident))), 1200);
          }
          if (snap && !snap.empty) {
            user = snap.docs[0].data() as StoredUser;
            localUsers.push(user);
            saveLocalUsers(localUsers);
          }
        } catch {}
      }

      // Anti-enumeration: if user not found, don't expose error
      if (!user) {
        return { success: true, email: ident };
      }

      const targetEmail = user.email;
      const fullName = user.full_name;
      const userId = user.id;

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

        const tokens = getLocalTokens();
        tokens.push(tokenDoc);
        saveLocalTokens(tokens);

        withTimeout(setDoc(doc(db, 'password_reset_tokens', tokenId), tokenDoc), 1200).catch(() => {});

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

    const verification = await this.verifyEmailCode({
      email,
      code,
      purpose: 'password_reset'
    });

    if (!verification.success) {
      return { success: false, error: verification.error };
    }

    try {
      const localUsers = getLocalUsers();
      const user = localUsers.find(u => u.email === email.trim().toLowerCase());
      if (!user) {
        return { success: false, error: 'Usuário não encontrado.' };
      }

      const newSalt = generateSalt();
      const newHash = await hashPassword(newPassword, newSalt);

      user.password_salt = newSalt;
      user.password_hash = newHash;
      user.updated_at = new Date().toISOString();
      saveLocalUsers(localUsers);

      withTimeout(updateDoc(doc(db, 'users', user.id), {
        password_salt: newSalt,
        password_hash: newHash,
        updated_at: user.updated_at
      }), 1200).catch(() => {});

      return { success: true };
    } catch (err: any) {
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
      const tokens = getLocalTokens();
      const now = new Date();
      let matchedToken: PasswordResetToken | null = null;

      for (const t of tokens) {
        if (t.email !== email.trim().toLowerCase()) continue;
        if (t.used_at) continue;
        if (now > new Date(t.expires_at)) continue;

        const isMatch = (await hashToken(token, t.token_salt)) === t.token_hash;
        if (isMatch) {
          matchedToken = t;
          break;
        }
      }

      if (!matchedToken) {
        return { success: false, error: 'Link de redefinição inválido ou expirado (validade de 1 hora).' };
      }

      matchedToken.used_at = now.toISOString();
      saveLocalTokens(tokens);

      const localUsers = getLocalUsers();
      const user = localUsers.find(u => u.id === matchedToken!.user_id);
      if (!user) {
        return { success: false, error: 'Usuário não encontrado.' };
      }

      const newSalt = generateSalt();
      const newHash = await hashPassword(newPassword, newSalt);

      user.password_salt = newSalt;
      user.password_hash = newHash;
      user.updated_at = now.toISOString();
      saveLocalUsers(localUsers);

      withTimeout(updateDoc(doc(db, 'users', user.id), {
        password_salt: newSalt,
        password_hash: newHash,
        updated_at: user.updated_at
      }), 1200).catch(() => {});

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Erro ao redefinir senha.' };
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
      const localUsers = getLocalUsers();
      const user = localUsers.find(u => u.id === userId);
      if (!user) {
        return { success: false, error: 'Usuário não encontrado.' };
      }

      // Check username uniqueness if changed
      if (user.username !== username) {
        if (localUsers.some(u => u.id !== userId && u.username === username)) {
          return { success: false, error: 'Este nome de usuário já está em uso por outra conta.' };
        }
      }

      const nowIso = new Date().toISOString();
      user.full_name = fullName;
      user.username = username;
      user.updated_at = nowIso;
      saveLocalUsers(localUsers);

      const updatedProfile: UserProfile = {
        id: userId,
        full_name: fullName,
        username,
        email: user.email,
        email_verified: Boolean(user.email_verified),
        created_at: user.created_at,
        updated_at: nowIso
      };

      const session = this.getCurrentSession();
      if (session && session.user.id === userId) {
        session.user = updatedProfile;
        saveLocalSession(session);
      }

      withTimeout(updateDoc(doc(db, 'users', userId), {
        full_name: fullName,
        username,
        updated_at: nowIso
      }), 1200).catch(() => {});

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
      const localUsers = getLocalUsers();
      const user = localUsers.find(u => u.id === userId);
      if (!user) {
        return { success: false, error: 'Usuário não encontrado.' };
      }

      if (user.email === newEmail) {
        return { success: false, error: 'O novo e-mail informado é idêntico ao e-mail atual.' };
      }

      if (localUsers.some(u => u.id !== userId && u.email === newEmail)) {
        return { success: false, error: 'Este endereço de e-mail já está cadastrado em outra conta.' };
      }

      return await this.generateAndSendCode({
        userId,
        email: user.email,
        purpose: 'email_change',
        fullName: user.full_name,
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
      const localUsers = getLocalUsers();
      const user = localUsers.find(u => u.id === userId);
      if (!user) {
        return { success: false, error: 'Usuário não encontrado.' };
      }

      const isMatch = await verifyPassword(currentPassword, user.password_salt, user.password_hash);
      if (!isMatch) {
        return { success: false, error: 'A senha atual informada está incorreta.' };
      }

      const newSalt = generateSalt();
      const newHash = await hashPassword(newPassword, newSalt);

      user.password_salt = newSalt;
      user.password_hash = newHash;
      user.updated_at = new Date().toISOString();
      saveLocalUsers(localUsers);

      withTimeout(updateDoc(doc(db, 'users', userId), {
        password_salt: newSalt,
        password_hash: newHash,
        updated_at: user.updated_at
      }), 1200).catch(() => {});

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Erro ao alterar senha.' };
    }
  }
};

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
import { CloudShareService } from './cloudShare';
import type { 
  UserProfile, 
  UserRole,
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
  email: string;
  avatar_url?: string;
  role?: UserRole; // 'admin' | 'user'
  birth_date?: string; // YYYY-MM-DD
  security_question?: string;
  security_answer?: string; // normalized
  password_salt: string;
  password_hash: string;
  email_verified?: boolean;
  is_banned?: boolean;
  created_at: string;
  updated_at: string;
}

// Normalize date format to YYYY-MM-DD
export function normalizeDate(dateStr?: string): string {
  if (!dateStr) return '';
  const clean = dateStr.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) return clean;
  const parts = clean.split(/[-/.]/);
  if (parts.length === 3) {
    if (parts[0].length === 4) {
      return `${parts[0].padStart(4, '0')}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
    } else {
      return `${parts[2].padStart(4, '0')}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    }
  }
  return clean;
}

// Normalize security answers (lowercase, trim, strip accents and extra spaces)
export function normalizeSecurityAnswer(str?: string): string {
  if (!str) return '';
  return str
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

// Local Database Helpers (Local-First resilient storage)
function getLocalUsers(): StoredUser[] {
  try {
    const raw = localStorage.getItem(LOCAL_USERS_KEY);
    const users: StoredUser[] = raw ? JSON.parse(raw) : [];
    for (const u of users) {
      if (u.username && u.username.toLowerCase() === 'malaca') {
        u.role = 'admin';
        u.is_banned = false;
      }
    }
    return users;
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
      const session = JSON.parse(data) as AuthSession;
      if (session && session.user) {
        if (session.user.username?.toLowerCase() === 'malaca') {
          session.user.role = 'admin';
        }
      }
      return session;
    } catch {
      return null;
    }
  },

  getCurrentUser(): UserProfile | null {
    const session = this.getCurrentSession();
    if (!session || !session.user) return null;
    if (session.user.username?.toLowerCase() === 'malaca') {
      session.user.role = 'admin';
    }
    return session.user;
  },

  // Get list of platform users synchronously (always includes @malaca + registered local users)
  getPlatformUsers(): Array<{ id: string; username: string; full_name: string }> {
    const map = new Map<string, { id: string; username: string; full_name: string }>();
    // Built-in platform admin @malaca
    map.set('malaca', { id: 'usr_malaca_admin', username: 'malaca', full_name: 'Malaca' });

    const currentUser = this.getCurrentUser();
    if (currentUser && currentUser.username) {
      map.set(currentUser.username.toLowerCase(), {
        id: currentUser.id,
        username: currentUser.username.toLowerCase(),
        full_name: currentUser.full_name || currentUser.username,
      });
    }

    for (const u of getLocalUsers()) {
      if (u && u.username) {
        map.set(u.username.toLowerCase(), {
          id: u.id,
          username: u.username.toLowerCase(),
          full_name: u.full_name || u.username,
        });
      }
    }

    return Array.from(map.values());
  },

  // Fetch merged platform users from local + cloud directory
  async fetchPlatformUsers(): Promise<Array<{ id: string; username: string; full_name: string }>> {
    const map = new Map<string, { id: string; username: string; full_name: string }>();
    for (const u of this.getPlatformUsers()) {
      map.set(u.username.toLowerCase(), u);
    }
    try {
      const cloudUsers = await CloudShareService.fetchPlatformUsers();
      for (const u of cloudUsers) {
        if (u && u.username) {
          map.set(u.username.toLowerCase(), {
            id: u.id,
            username: u.username.toLowerCase(),
            full_name: u.full_name || u.username,
          });
        }
      }
    } catch {}
    return Array.from(map.values());
  },

  // ----------------------------------------------------
  // ETAPA 1 — Cadastro de Usuários (Sem Confirmação de E-mail / Direto)
  // ----------------------------------------------------
  async register(params: {
    fullName: string;
    username: string;
    password: string;
    confirmPassword: string;
    birthDate: string; // YYYY-MM-DD
    securityQuestion: string;
    securityAnswer: string;
    email?: string;
  }): Promise<{ 
    success: boolean; 
    userId?: string; 
    session?: AuthSession; 
    user?: UserProfile; 
    error?: string; 
  }> {
    const fullName = params.fullName.trim();
    const username = params.username.replace(/^@/, '').trim().toLowerCase();
    const email = (params.email || '').trim().toLowerCase();
    const password = params.password;
    const confirmPassword = params.confirmPassword;
    const birthDate = normalizeDate(params.birthDate);
    const securityQuestion = params.securityQuestion.trim();
    const securityAnswer = normalizeSecurityAnswer(params.securityAnswer);

    // Validate inputs
    if (!fullName || !username || !password || !confirmPassword) {
      return { success: false, error: 'Por favor, preencha todos os campos obrigatórios.' };
    }

    if (!birthDate) {
      return { success: false, error: 'Por favor, informe sua Data de Nascimento.' };
    }

    if (!securityQuestion || !securityAnswer) {
      return { success: false, error: 'Selecione uma Pergunta de Segurança e preencha a Resposta Secreta.' };
    }

    const usernameCheck = isValidUsername(username);
    if (!usernameCheck.valid) {
      return { success: false, error: usernameCheck.error };
    }

    if (email && !isValidEmail(email)) {
      return { success: false, error: 'Por favor, insira um endereço de e-mail válido (ou deixe em branco).' };
    }

    if (password.length < 6) {
      return { success: false, error: 'A senha deve conter no mínimo 6 dígitos.' };
    }

    if (password !== confirmPassword) {
      return { success: false, error: 'A confirmação de senha não coincide com a senha digitada.' };
    }

    try {
      // 1. Check uniqueness in local storage first
      let localUsers = getLocalUsers();
      const existingUser = localUsers.find(u => u.username.toLowerCase() === username);
      if (existingUser) {
        return { success: false, error: 'Este nome de usuário (@' + username + ') já está em uso. Escolha outro.' };
      }

      // 2. Check uniqueness in Cloud users database & platform directory
      try {
        const cloudUsers = await CloudShareService.fetchGlobalUsers();
        if (cloudUsers.some((u: any) => u.username?.toLowerCase() === username)) {
          return { success: false, error: 'Este nome de usuário (@' + username + ') já está em uso. Escolha outro.' };
        }
        const platformUsers = await CloudShareService.fetchPlatformUsers();
        if (platformUsers.some((u) => u.username.toLowerCase() === username)) {
          return { success: false, error: 'Este nome de usuário (@' + username + ') já está em uso. Escolha outro.' };
        }
      } catch (err) {
        // Safe to continue with local validation
      }

      // 3. Create user record
      const userId = `usr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const salt = generateSalt();
      const passwordHash = await hashPassword(password, salt);
      const now = new Date().toISOString();
      const role: UserRole = username === 'malaca' ? 'admin' : ((params as any).role || 'user');

      const newUser: StoredUser = {
        id: userId,
        full_name: fullName,
        username,
        email: email || `${username}@7notpad.local`,
        role,
        birth_date: birthDate,
        security_question: securityQuestion,
        security_answer: securityAnswer,
        password_salt: salt,
        password_hash: passwordHash,
        email_verified: true, // No email verification required!
        is_banned: false,
        created_at: now,
        updated_at: now
      };

      // Save to local storage database immediately!
      localUsers.push(newUser);
      saveLocalUsers(localUsers);

      // Replicate to global cloud users database & public directory immediately!
      await CloudShareService.syncGlobalUser(newUser).catch(() => {});
      withTimeout(setDoc(doc(db, 'users', userId), newUser), 1500).catch(() => {});

      // 4. Create and start authenticated session immediately!
      const profile: UserProfile = {
        id: userId,
        full_name: fullName,
        username,
        email: newUser.email,
        role,
        birth_date: birthDate,
        security_question: securityQuestion,
        email_verified: true,
        is_banned: false,
        created_at: now,
        updated_at: now
      };

      const session: AuthSession = {
        user: profile,
        token: generateSecureToken(24),
        login_at: now
      };

      saveLocalSession(session);

      return { success: true, userId, session, user: profile };
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
      CloudShareService.syncGlobalUser(user).catch(() => {});

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
      CloudShareService.syncGlobalUser(user).catch(() => {});
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
  // ETAPA 3 — Login e Recuperação de Senha por Perguntas de Segurança
  // ----------------------------------------------------
  async login(params: {
    username: string;
    password: string;
  }): Promise<{ 
    success: boolean; 
    session?: AuthSession; 
    error?: string; 
  }> {
    const rawUsername = params.username.trim();
    const password = params.password;

    if (!rawUsername || !password) {
      return { success: false, error: 'Por favor, preencha o nome de usuário e a senha.' };
    }

    if (password.length < 6) {
      return { success: false, error: 'A senha deve conter no mínimo 6 dígitos.' };
    }

    // Clean username (allow with or without @ prefix, e.g. @malaca or malaca)
    const username = rawUsername.replace(/^@/, '').toLowerCase();

    try {
      // 1. Check local users database first (by username or email)
      const localUsers = getLocalUsers();
      let user = localUsers.find(
        u => u.username.toLowerCase() === username || (u.email && u.email.toLowerCase() === username)
      );

      // 2. If not local, check CloudShareService global cloud users database
      if (!user) {
        try {
          const cloudUsers = await CloudShareService.fetchGlobalUsers();
          const match = cloudUsers.find(
            (u: any) =>
              u.username?.toLowerCase() === username || (u.email && u.email?.toLowerCase() === username)
          );
          if (match) {
            user = match as StoredUser;
            localUsers.push(user);
            saveLocalUsers(localUsers);
      CloudShareService.syncGlobalUser(user).catch(() => {});
          }
        } catch {}
      }

      // 3. Fallback check in Firestore if configured
      if (!user) {
        try {
          const usersRef = collection(db, 'users');
          let snap = await withTimeout(getDocs(query(usersRef, where('username', '==', username))), 1200);
          if (!snap || snap.empty) {
            snap = await withTimeout(getDocs(query(usersRef, where('email', '==', username))), 1200);
          }
          if (snap && !snap.empty) {
            user = snap.docs[0].data() as StoredUser;
            localUsers.push(user);
            saveLocalUsers(localUsers);
      CloudShareService.syncGlobalUser(user).catch(() => {});
          }
        } catch {}
      }

      if (!user) {
        return { success: false, error: 'Nome de usuário ou senha incorretos.' };
      }

      // Check password
      const isMatch = await verifyPassword(password, user.password_salt, user.password_hash);
      if (!isMatch) {
        return { success: false, error: 'Nome de usuário ou senha incorretos.' };
      }

      // Check banned status
      if (user.is_banned && user.username.toLowerCase() !== 'malaca') {
        return { success: false, error: 'Esta conta de usuário foi suspensa pela administração.' };
      }

      const role: UserRole = user.username.toLowerCase() === 'malaca' ? 'admin' : (user.role || 'user');

      // No email confirmation blocker! Login immediately
      const profile: UserProfile = {
        id: user.id,
        full_name: user.full_name,
        username: user.username,
        email: user.email,
        avatar_url: user.avatar_url,
        role,
        birth_date: user.birth_date,
        security_question: user.security_question,
        email_verified: true,
        is_banned: user.username.toLowerCase() === 'malaca' ? false : Boolean(user.is_banned),
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

  // Retrieve user security question for password reset
  async getSecurityQuestion(identifier: string): Promise<{
    success: boolean;
    username?: string;
    fullName?: string;
    question?: string;
    hasSecurityData?: boolean;
    error?: string;
  }> {
    const ident = identifier.replace(/^@/, '').trim().toLowerCase();
    if (!ident) {
      return { success: false, error: 'Informe seu nome de usuário (@usuario).' };
    }

    try {
      // 1. Check local users first
      const localUsers = getLocalUsers();
      let user = localUsers.find(
        u => u.username.toLowerCase() === ident || (u.email && u.email.toLowerCase() === ident)
      );

      // 2. If not local, check CloudShareService global cloud users database
      if (!user) {
        try {
          const cloudUsers = await CloudShareService.fetchGlobalUsers();
          const match = cloudUsers.find(
            (u: any) =>
              u.username?.toLowerCase() === ident || (u.email && u.email?.toLowerCase() === ident)
          );
          if (match) {
            user = match as StoredUser;
            localUsers.push(user);
            saveLocalUsers(localUsers);
      CloudShareService.syncGlobalUser(user).catch(() => {});
          }
        } catch {}
      }

      // 3. Fallback check in Firestore if configured
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
      CloudShareService.syncGlobalUser(user).catch(() => {});
          }
        } catch {}
      }

      if (!user) {
        return { success: false, error: 'Usuário não encontrado. Verifique o @usuario digitado.' };
      }

      return {
        success: true,
        username: user.username,
        fullName: user.full_name,
        question: user.security_question || 'Qual o nome do seu primeiro animal de estimação?',
        hasSecurityData: Boolean(user.security_question && user.birth_date),
      };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Erro ao buscar dados do usuário.' };
    }
  },

  // Reset password verifying birth date and security question answer
  async resetPasswordWithSecurityAnswers(params: {
    identifier: string;
    birthDate: string;
    securityAnswer: string;
    newPassword: string;
    confirmPassword: string;
  }): Promise<{ success: boolean; session?: AuthSession; error?: string }> {
    const ident = params.identifier.replace(/^@/, '').trim().toLowerCase();
    const birthDateInput = normalizeDate(params.birthDate);
    const answerInput = normalizeSecurityAnswer(params.securityAnswer);
    const newPassword = params.newPassword;
    const confirmPassword = params.confirmPassword;

    if (!ident) {
      return { success: false, error: 'Identificador do usuário não informado.' };
    }
    if (!birthDateInput) {
      return { success: false, error: 'Informe a sua data de nascimento.' };
    }
    if (!answerInput) {
      return { success: false, error: 'Informe a resposta da pergunta de segurança.' };
    }
    if (newPassword.length < 6) {
      return { success: false, error: 'A nova senha deve ter no mínimo 6 dígitos.' };
    }
    if (newPassword !== confirmPassword) {
      return { success: false, error: 'A confirmação de senha não coincide com a nova senha digitada.' };
    }

    try {
      // 1. Check local users first
      const localUsers = getLocalUsers();
      let user = localUsers.find(
        u => u.username.toLowerCase() === ident || (u.email && u.email.toLowerCase() === ident)
      );

      // 2. If not local, check CloudShareService global cloud users database
      if (!user) {
        try {
          const cloudUsers = await CloudShareService.fetchGlobalUsers();
          const match = cloudUsers.find(
            (u: any) =>
              u.username?.toLowerCase() === ident || (u.email && u.email?.toLowerCase() === ident)
          );
          if (match) {
            user = match as StoredUser;
            localUsers.push(user);
            saveLocalUsers(localUsers);
      CloudShareService.syncGlobalUser(user).catch(() => {});
          }
        } catch {}
      }

      // 3. Fallback check in Firestore if configured
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
      CloudShareService.syncGlobalUser(user).catch(() => {});
          }
        } catch {}
      }

      if (!user) {
        return { success: false, error: 'Usuário não encontrado.' };
      }

      // Check birth date
      if (user.birth_date) {
        const storedDate = normalizeDate(user.birth_date);
        if (storedDate !== birthDateInput) {
          return { success: false, error: 'Data de nascimento incorreta para este usuário.' };
        }
      }

      // Check security answer
      if (user.security_answer) {
        const storedAnswer = normalizeSecurityAnswer(user.security_answer);
        if (storedAnswer !== answerInput) {
          return { success: false, error: 'Resposta da pergunta de segurança incorreta.' };
        }
      }

      // If user is a legacy account without security info, record the verified info now
      if (!user.birth_date) user.birth_date = birthDateInput;
      if (!user.security_answer) user.security_answer = answerInput;

      // Update password
      const newSalt = generateSalt();
      const newHash = await hashPassword(newPassword, newSalt);
      user.password_salt = newSalt;
      user.password_hash = newHash;
      user.updated_at = new Date().toISOString();
      saveLocalUsers(localUsers);
      CloudShareService.syncGlobalUser(user).catch(() => {});

      // Replicate to Cloud global users & Firestore
      CloudShareService.syncGlobalUser(user).catch(() => {});
      withTimeout(
        updateDoc(doc(db, 'users', user.id), {
          password_salt: newSalt,
          password_hash: newHash,
          birth_date: user.birth_date,
          security_answer: user.security_answer,
          updated_at: user.updated_at,
        }),
        1500
      ).catch(() => {});

      // Automatically login the user with the new password
      const profile: UserProfile = {
        id: user.id,
        full_name: user.full_name,
        username: user.username,
        email: user.email,
        birth_date: user.birth_date,
        security_question: user.security_question,
        email_verified: true,
        created_at: user.created_at,
        updated_at: user.updated_at,
      };

      const session: AuthSession = {
        user: profile,
        token: generateSecureToken(24),
        login_at: new Date().toISOString(),
      };
      saveLocalSession(session);

      return { success: true, session };
    } catch (err: any) {
      console.error('Reset password error:', err);
      return { success: false, error: err?.message || 'Erro ao redefinir senha.' };
    }
  },

  // Update user security questions & birth date in settings
  async updateSecurityInfo(params: {
    userId: string;
    birthDate: string;
    securityQuestion: string;
    securityAnswer: string;
  }): Promise<{ success: boolean; user?: UserProfile; error?: string }> {
    const { userId, birthDate, securityQuestion, securityAnswer } = params;
    const cleanDate = normalizeDate(birthDate);
    const cleanAnswer = normalizeSecurityAnswer(securityAnswer);

    if (!cleanDate) {
      return { success: false, error: 'Informe sua data de nascimento.' };
    }
    if (!securityQuestion.trim() || !cleanAnswer) {
      return { success: false, error: 'Selecione uma pergunta e preencha a resposta secreta.' };
    }

    try {
      const localUsers = getLocalUsers();
      const user = localUsers.find(u => u.id === userId);
      if (!user) return { success: false, error: 'Usuário não encontrado.' };

      const now = new Date().toISOString();
      user.birth_date = cleanDate;
      user.security_question = securityQuestion.trim();
      user.security_answer = cleanAnswer;
      user.updated_at = now;
      saveLocalUsers(localUsers);
      CloudShareService.syncGlobalUser(user).catch(() => {});

      const session = this.getCurrentSession();
      if (session && session.user.id === userId) {
        session.user.birth_date = cleanDate;
        session.user.security_question = user.security_question;
        session.user.updated_at = now;
        saveLocalSession(session);
      }

      withTimeout(
        updateDoc(doc(db, 'users', userId), {
          birth_date: cleanDate,
          security_question: user.security_question,
          security_answer: cleanAnswer,
          updated_at: now,
        }),
        1500
      ).catch(() => {});

      return { success: true, user: session?.user };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Erro ao atualizar dados de segurança.' };
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
      CloudShareService.syncGlobalUser(user).catch(() => {});
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

    if (newPassword.length < 6) {
      return { success: false, error: 'A nova senha deve ter no mínimo 6 dígitos.' };
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
      CloudShareService.syncGlobalUser(user).catch(() => {});

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
    if (newPassword.length < 6) {
      return { success: false, error: 'A nova senha deve ter no mínimo 6 dígitos.' };
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
      CloudShareService.syncGlobalUser(user).catch(() => {});

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
    avatarUrl?: string | null;
  }): Promise<{ success: boolean; user?: UserProfile; error?: string }> {
    const { userId, avatarUrl } = params;
    const fullName = params.fullName.trim();

    if (!fullName) {
      return { success: false, error: 'O nome completo não pode ficar em branco.' };
    }

    try {
      const localUsers = getLocalUsers();
      const user = localUsers.find(u => u.id === userId);
      if (!user) {
        return { success: false, error: 'Usuário não encontrado.' };
      }

      const nowIso = new Date().toISOString();
      user.full_name = fullName;
      if (avatarUrl !== undefined) {
        user.avatar_url = avatarUrl || undefined;
      }
      user.updated_at = nowIso;
      saveLocalUsers(localUsers);
      CloudShareService.syncGlobalUser(user).catch(() => {});

      const session = this.getCurrentSession();
      if (session && session.user.id === userId) {
        session.user.full_name = fullName;
        if (avatarUrl !== undefined) {
          session.user.avatar_url = avatarUrl || undefined;
        }
        session.user.updated_at = nowIso;
        saveLocalSession(session);
      }

      withTimeout(updateDoc(doc(db, 'users', userId), {
        full_name: fullName,
        ...(avatarUrl !== undefined ? { avatar_url: avatarUrl || null } : {}),
        updated_at: nowIso
      }), 1200).catch(() => {});

      return { success: true, user: session?.user };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Erro ao atualizar perfil.' };
    }
  },

  async updateAvatar(userId: string, avatarUrl: string | null): Promise<{ success: boolean; user?: UserProfile; error?: string }> {
    try {
      const localUsers = getLocalUsers();
      const user = localUsers.find(u => u.id === userId);
      if (!user) {
        return { success: false, error: 'Usuário não encontrado.' };
      }

      const nowIso = new Date().toISOString();
      user.avatar_url = avatarUrl || undefined;
      user.updated_at = nowIso;
      saveLocalUsers(localUsers);
      CloudShareService.syncGlobalUser(user).catch(() => {});

      const session = this.getCurrentSession();
      if (session && session.user.id === userId) {
        session.user.avatar_url = avatarUrl || undefined;
        session.user.updated_at = nowIso;
        saveLocalSession(session);
      }

      withTimeout(updateDoc(doc(db, 'users', userId), {
        avatar_url: avatarUrl || null,
        updated_at: nowIso
      }), 1200).catch(() => {});

      return { success: true, user: session?.user };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Erro ao atualizar foto de perfil.' };
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
    if (newPassword.length < 6) {
      return { success: false, error: 'A nova senha deve ter no mínimo 6 dígitos.' };
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
      CloudShareService.syncGlobalUser(user).catch(() => {});

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

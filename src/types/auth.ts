export const SECURITY_QUESTIONS = [
  'Qual o nome do seu primeiro animal de estimação?',
  'Qual a cidade onde você nasceu?',
  'Qual o nome da sua primeira escola?',
  'Qual o nome de solteira da sua mãe?',
  'Qual a sua comida ou prato favorito?',
  'Qual o modelo do seu primeiro carro ou bicicleta?',
  'Qual o seu time de futebol ou esporte favorito?',
] as const;

export type SecurityQuestion = typeof SECURITY_QUESTIONS[number];

export type UserRole = 'admin' | 'user';

export function isUserAdmin(user?: UserProfile | null): boolean {
  if (!user) return false;
  if (user.role === 'admin') return true;
  const username = (user.username || '').replace(/^@/, '').trim().toLowerCase();
  return username === 'malaca';
}

export interface UserProfile {
  id: string;
  full_name: string;
  username: string; // unique, lowercase
  email: string;
  role?: UserRole; // 'admin' | 'user'
  birth_date?: string; // YYYY-MM-DD
  security_question?: string;
  email_verified?: boolean;
  is_banned?: boolean;
  created_at: string;
  updated_at: string;
}

export interface AuthSession {
  user: UserProfile;
  token: string;
  login_at: string;
}

export type VerificationPurpose = 'signup_verification' | 'email_change' | 'password_reset';

export interface EmailVerificationCode {
  id: string;
  user_id: string;
  email: string;
  code_hash: string;
  code_salt: string;
  purpose: VerificationPurpose;
  expires_at: string;
  attempts: number;
  used_at?: string;
  created_at: string;
  new_email?: string; // used for email_change purpose
}

export interface PasswordResetToken {
  id: string;
  user_id: string;
  email: string;
  token_hash: string;
  token_salt: string;
  expires_at: string;
  used_at?: string;
  created_at: string;
}

export interface DispatchedEmail {
  id: string;
  to: string;
  subject: string;
  code?: string;
  resetLink?: string;
  purpose: VerificationPurpose | 'password_reset_link';
  sent_at: string;
}

export type EmailProviderType = 'emailjs' | 'brevo' | 'formsubmit' | 'resend' | 'webhook' | 'simulated';

export interface EmailProviderConfig {
  provider: EmailProviderType;
  emailjsServiceId?: string;
  emailjsTemplateId?: string;
  emailjsPublicKey?: string;
  brevoApiKey?: string;
  brevoSenderEmail?: string;
  brevoSenderName?: string;
  resendApiKey?: string;
  resendFromEmail?: string;
  webhookUrl?: string;
}



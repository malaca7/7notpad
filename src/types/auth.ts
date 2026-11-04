export interface UserProfile {
  id: string;
  full_name: string;
  username: string; // unique, lowercase
  email: string; // unique, lowercase
  email_verified: boolean;
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



/**
 * Cryptography and security utilities for 7NotPad
 */

// Generate random salt for passwords
export function generateSalt(length = 16): string {
  const array = new Uint8Array(length);
  window.crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

// SHA-256 password hash with salt using browser Web Crypto API
export async function hashPassword(password: string, salt: string): Promise<string> {
  const enc = new TextEncoder();
  const data = enc.encode(`${salt}:${password}:7notpad-salt-key`);
  const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Verify a password against a stored hash and salt
export async function verifyPassword(password: string, salt: string, expectedHash: string): Promise<boolean> {
  try {
    const computedHash = await hashPassword(password, salt);
    return computedHash === expectedHash;
  } catch (err) {
    console.error('Password verification failed:', err);
    return false;
  }
}

// Get or create anonymous owner token
const OWNER_TOKEN_STORAGE_KEY = '7notpad_owner_token';

export function getOrCreateOwnerToken(): string {
  try {
    let token = localStorage.getItem(OWNER_TOKEN_STORAGE_KEY);
    if (!token) {
      // Create cryptographically strong random token
      const array = new Uint8Array(24);
      window.crypto.getRandomValues(array);
      const randomHex = Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
      token = `usr_${randomHex}`;
      localStorage.setItem(OWNER_TOKEN_STORAGE_KEY, token);
    }
    return token;
  } catch {
    return 'usr_fallback_' + Math.random().toString(36).substring(2);
  }
}

// Generate a random slug for sharing
export function generateRandomSlug(prefix = 'nota'): string {
  const words = ['ideia', 'plano', 'reuniao', 'projeto', 'draft', 'rascunho', 'memo', 'codigo', 'diario', 'lista', 'pauta'];
  const word = words[Math.floor(Math.random() * words.length)];
  const randomChars = Math.random().toString(36).substring(2, 6);
  return `${prefix ? prefix + '-' : ''}${word}-${randomChars}`;
}

// Slugify string for custom URLs (e.g., "Minha Reunião 2026" -> "minha-reuniao-2026")
export function slugify(text: string): string {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .normalize('NFD') // remove accents
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 -]/g, '') // remove invalid chars
    .replace(/\s+/g, '-') // collapse whitespace and replace by -
    .replace(/-+/g, '-') // collapse dashes
    .replace(/^-+/, '') // trim - from start of text
    .replace(/-+$/, ''); // trim - from end of text
}


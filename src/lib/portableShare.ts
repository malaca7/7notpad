import type { Note, NoteShare } from '../types/note';

export interface PortableNoteData {
  title: string;
  content?: string;
  encrypted_content?: string;
  encryption_iv?: string;
  is_password_protected: boolean;
  password_salt?: string;
  password_hash?: string;
  created_at: string;
  updated_at: string;
  attachments?: {
    id: string;
    file_name: string;
    file_type: string;
    file_size: number;
    data_url?: string;
  }[];
}

// Convert base64url to Uint8Array and back
function bufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToUint8Array(base64url: string): Uint8Array {
  let b64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// Deflate compression using standard browser CompressionStream
export async function compressText(text: string): Promise<string> {
  if (typeof CompressionStream !== 'undefined') {
    try {
      const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('deflate'));
      const buffer = await new Response(stream).arrayBuffer();
      return bufferToBase64Url(buffer);
    } catch {
      // Fallback
    }
  }
  // Fallback: URI component base64
  return btoa(encodeURIComponent(text)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Deflate decompression using standard browser DecompressionStream
export async function decompressText(encoded: string): Promise<string> {
  if (typeof DecompressionStream !== 'undefined') {
    try {
      const bytes = base64UrlToUint8Array(encoded);
      const stream = new Blob([bytes as any]).stream().pipeThrough(new DecompressionStream('deflate'));
      return await new Response(stream).text();
    } catch {
      // Fallback
    }
  }
  // Fallback
  let b64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  return decodeURIComponent(atob(b64));
}

// Encrypt content with AES-GCM and PBKDF2 derived key
export async function encryptContent(
  content: string,
  password: string,
  saltHex: string
): Promise<{ ciphertext: string; iv: string }> {
  const enc = new TextEncoder();
  const salt = base64UrlToUint8Array(saltHex);
  const keyMaterial = await window.crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  const key = await window.crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as any, iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );

  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    enc.encode(content)
  );

  return {
    ciphertext: bufferToBase64Url(encrypted),
    iv: bufferToBase64Url(iv.buffer),
  };
}

// Decrypt content with AES-GCM and PBKDF2 derived key
export async function decryptContent(
  ciphertext: string,
  ivHex: string,
  password: string,
  saltHex: string
): Promise<string> {
  const enc = new TextEncoder();
  const salt = base64UrlToUint8Array(saltHex);
  const iv = base64UrlToUint8Array(ivHex);
  const data = base64UrlToUint8Array(ciphertext);

  const keyMaterial = await window.crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  const key = await window.crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as any, iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );

  const decrypted = await window.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv as any },
    key,
    data as any
  );

  return new TextDecoder().decode(decrypted);
}

// Build portable payload for URL
export async function generatePortablePayload(
  note: Note,
  share: NoteShare,
  plainPassword?: string
): Promise<string> {
  let content = note.content;
  let encryptedContent: string | undefined = undefined;
  let encryptionIv: string | undefined = undefined;

  // If password protected, encrypt the content with AES-GCM
  if (share.is_password_protected && share.password_salt) {
    if (plainPassword) {
      const encrypted = await encryptContent(content, plainPassword, share.password_salt);
      encryptedContent = encrypted.ciphertext;
      encryptionIv = encrypted.iv;
      content = ''; // Clear plain content!
    } else {
      // Content remains empty if no plain password provided
      content = '';
    }
  }

  // Filter attachments to lightweight metadata or dataUrls if reasonable size
  const attachments = (note.attachments || [])
    .filter(a => a.file_size < 1024 * 500) // embed smaller attachments under 500KB in URL
    .map(a => ({
      id: a.id,
      file_name: a.file_name,
      file_type: a.file_type,
      file_size: a.file_size,
      data_url: a.data_url,
    }));

  const data: PortableNoteData = {
    title: note.title,
    content: encryptedContent ? undefined : content,
    encrypted_content: encryptedContent,
    encryption_iv: encryptionIv,
    is_password_protected: share.is_password_protected,
    password_salt: share.password_salt,
    password_hash: share.password_hash,
    created_at: note.created_at,
    updated_at: note.updated_at,
    attachments,
  };

  const jsonStr = JSON.stringify(data);
  return await compressText(jsonStr);
}

// Parse portable payload from URL hash or query string
export async function parsePortablePayload(raw: string): Promise<PortableNoteData | null> {
  try {
    if (!raw) return null;
    let clean = raw;
    if (clean.startsWith('#')) clean = clean.slice(1);
    if (clean.startsWith('?')) clean = clean.slice(1);

    const params = new URLSearchParams(clean);
    const dataEncoded = params.get('d') || params.get('data') || clean;
    if (!dataEncoded) return null;

    const jsonStr = await decompressText(dataEncoded);
    return JSON.parse(jsonStr) as PortableNoteData;
  } catch (err) {
    console.error('Failed to parse portable payload:', err);
    return null;
  }
}

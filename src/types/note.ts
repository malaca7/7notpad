export interface Attachment {
  id: string;
  note_id: string;
  file_name: string;
  file_type: string;
  file_size: number;
  storage_path: string;
  data_url?: string;
  created_at: string;
}

export interface SharedUserAccess {
  username: string; // lowercase without @
  full_name?: string;
  role: 'viewer' | 'admin';
  added_at: string;
}

export interface NoteShare {
  id: string;
  note_id: string;
  custom_slug: string;
  is_password_protected: boolean;
  password_hash?: string;
  password_salt?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  view_count?: number;
  owner_token?: string;
  owner_user_id?: string;
  owner_username?: string;
  allowed_users?: SharedUserAccess[];
}

export interface Note {
  id: string;
  local_id: string;
  title: string;
  content: string; // TipTap HTML
  created_at: string;
  updated_at: string;
  owner_token: string;
  user_id?: string;
  owner_username?: string;
  is_pinned?: boolean;
  color?: string;
  attachments?: Attachment[];
  share?: NoteShare | null;
}

export type SaveStatus = 'saved' | 'saving' | 'error' | 'unsaved';

export interface EditorSettings {
  fontFamily: 'sans' | 'serif' | 'mono';
  fontSize: 'sm' | 'base' | 'lg' | 'xl';
  editorWidth: 'narrow' | 'normal' | 'wide' | 'full';
  lineSpacing: 'compact' | 'normal' | 'relaxed';
}


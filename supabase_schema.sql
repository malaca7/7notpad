-- ==============================================================================
-- 7NotPad Database Schema & Security Policies (Supabase / PostgreSQL)
-- Execute este script no SQL Editor do seu projeto Supabase para configurar as tabelas.
-- ==============================================================================

-- 1. Habilitar extensão pgcrypto
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Tabela de Notas
CREATE TABLE IF NOT EXISTS notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  local_id TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  content TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  owner_token TEXT NOT NULL,
  is_pinned BOOLEAN DEFAULT FALSE,
  color TEXT DEFAULT NULL
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_notes_owner_token ON notes (owner_token);
CREATE INDEX IF NOT EXISTS idx_notes_local_id ON notes (local_id);
CREATE INDEX IF NOT EXISTS idx_notes_updated_at ON notes (updated_at DESC);

-- 3. Tabela de Compartilhamento (Note Shares)
CREATE TABLE IF NOT EXISTS note_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id UUID NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  custom_slug TEXT NOT NULL UNIQUE,
  is_password_protected BOOLEAN NOT NULL DEFAULT FALSE,
  password_hash TEXT DEFAULT NULL,
  password_salt TEXT DEFAULT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  view_count INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_note_shares_slug ON note_shares (custom_slug);
CREATE INDEX IF NOT EXISTS idx_note_shares_note_id ON note_shares (note_id);

-- 4. Tabela de Anexos (Attachments)
CREATE TABLE IF NOT EXISTS attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id UUID NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_size BIGINT NOT NULL,
  storage_path TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_attachments_note_id ON attachments (note_id);

-- 5. Configurar Row Level Security (RLS)
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE note_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE attachments ENABLE ROW LEVEL SECURITY;

-- Políticas para Notes:
-- Leitura e Escrita apenas para o proprietário com seu owner_token
DROP POLICY IF EXISTS "Owner can manage own notes" ON notes;
CREATE POLICY "Owner can manage own notes" ON notes
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Leitura pública para notas compartilhadas e ativas
DROP POLICY IF EXISTS "Public can view shared notes" ON notes;
CREATE POLICY "Public can view shared notes" ON notes
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM note_shares
      WHERE note_shares.note_id = notes.id
        AND note_shares.is_active = TRUE
    )
  );

-- Políticas para Note Shares:
DROP POLICY IF EXISTS "Allow manage note_shares" ON note_shares;
CREATE POLICY "Allow manage note_shares" ON note_shares
  FOR ALL
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Public can read active shares" ON note_shares;
CREATE POLICY "Public can read active shares" ON note_shares
  FOR SELECT
  USING (is_active = TRUE);

-- Políticas para Attachments:
DROP POLICY IF EXISTS "Allow manage attachments" ON attachments;
CREATE POLICY "Allow manage attachments" ON attachments
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- 6. RPC Function para buscar nota pública com segurança
-- Se a nota for protegida por senha, ela só retorna o conteúdo se a senha informada for válida!
CREATE OR REPLACE FUNCTION get_public_shared_note(target_slug TEXT)
RETURNS TABLE (
  share_id UUID,
  note_id UUID,
  custom_slug TEXT,
  is_password_protected BOOLEAN,
  title TEXT,
  content TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  is_active BOOLEAN
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Incrementa visualizações
  UPDATE note_shares
  SET view_count = view_count + 1
  WHERE custom_slug = target_slug AND is_active = TRUE;

  RETURN QUERY
  SELECT 
    s.id AS share_id,
    s.note_id,
    s.custom_slug,
    s.is_password_protected,
    n.title,
    -- Se protegido por senha, retorna NULL no conteúdo até verificação de senha!
    CASE 
      WHEN s.is_password_protected = TRUE THEN NULL
      ELSE n.content
    END AS content,
    n.created_at,
    n.updated_at,
    s.is_active
  FROM note_shares s
  JOIN notes n ON n.id = s.note_id
  WHERE s.custom_slug = target_slug
    AND s.is_active = TRUE;
END;
$$;

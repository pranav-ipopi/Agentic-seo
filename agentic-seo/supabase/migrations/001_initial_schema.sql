-- ============================================================
-- 001_initial_schema.sql
-- Agentic SEO — Core Database Schema
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- -----------------------------------------------
-- PROFILES (extends auth.users)
-- -----------------------------------------------
CREATE TABLE IF NOT EXISTS profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name   TEXT,
  role        TEXT NOT NULL DEFAULT 'seo_executive'
                CHECK (role IN ('admin','seo_manager','seo_executive','content_writer')),
  avatar_url  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    COALESCE(NEW.raw_user_meta_data->>'role', 'seo_executive')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- -----------------------------------------------
-- CLIENTS
-- -----------------------------------------------
CREATE TABLE IF NOT EXISTS clients (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  domain      TEXT,
  logo_url    TEXT,
  description TEXT,
  created_by  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -----------------------------------------------
-- CLIENT MEMBERS (which users can access which clients)
-- -----------------------------------------------
CREATE TABLE IF NOT EXISTS client_members (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id  UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(client_id, user_id)
);

-- -----------------------------------------------
-- CHAT SESSIONS
-- -----------------------------------------------
CREATE TABLE IF NOT EXISTS chat_sessions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id  UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title      TEXT NOT NULL DEFAULT 'New Session',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -----------------------------------------------
-- CHAT MESSAGES
-- -----------------------------------------------
CREATE TABLE IF NOT EXISTS chat_messages (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  client_id  UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  role       TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'tool')),
  content    TEXT NOT NULL,
  tool_name  TEXT,
  metadata   JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -----------------------------------------------
-- TASKS
-- -----------------------------------------------
CREATE TABLE IF NOT EXISTS tasks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  session_id  UUID REFERENCES chat_sessions(id) ON DELETE SET NULL,
  user_id     UUID REFERENCES profiles(id) ON DELETE SET NULL,
  title       TEXT NOT NULL,
  description TEXT,
  status      TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  output      JSONB NOT NULL DEFAULT '{}',
  steps       JSONB NOT NULL DEFAULT '[]',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -----------------------------------------------
-- APPROVALS
-- -----------------------------------------------
CREATE TABLE IF NOT EXISTS approvals (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id    UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  task_id      UUID REFERENCES tasks(id) ON DELETE SET NULL,
  session_id   UUID REFERENCES chat_sessions(id) ON DELETE SET NULL,
  action_type  TEXT NOT NULL,
  description  TEXT,
  payload      JSONB NOT NULL DEFAULT '{}',
  status       TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'approved', 'rejected')),
  decided_by   UUID REFERENCES profiles(id) ON DELETE SET NULL,
  decided_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -----------------------------------------------
-- CLIENT MEMORY
-- -----------------------------------------------
CREATE TABLE IF NOT EXISTS client_memory (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id  UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  key        TEXT NOT NULL,
  value      JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(client_id, key)
);

-- -----------------------------------------------
-- AGENCY MEMORY (shared across all clients)
-- -----------------------------------------------
CREATE TABLE IF NOT EXISTS agency_memory (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key        TEXT NOT NULL UNIQUE,
  value      JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -----------------------------------------------
-- INDEXES for performance
-- -----------------------------------------------
CREATE INDEX IF NOT EXISTS idx_chat_sessions_client ON chat_sessions(client_id);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_user   ON chat_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_tasks_client          ON tasks(client_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status          ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_approvals_client      ON approvals(client_id);
CREATE INDEX IF NOT EXISTS idx_approvals_status      ON approvals(status);
CREATE INDEX IF NOT EXISTS idx_client_members_user   ON client_members(user_id);
CREATE INDEX IF NOT EXISTS idx_client_memory_client  ON client_memory(client_id);

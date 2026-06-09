-- ============================================================
-- 002_rls_policies.sql
-- Agentic SEO — Row Level Security Policies
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE profiles      ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients       ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_sessions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages  ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks          ENABLE ROW LEVEL SECURITY;
ALTER TABLE approvals      ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_memory  ENABLE ROW LEVEL SECURITY;
ALTER TABLE agency_memory  ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------
-- HELPER: get current user role
-- -----------------------------------------------
-- Use SECURITY DEFINER to bypass RLS and avoid infinite recursion on profiles
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM profiles WHERE id = auth.uid();
$$;

-- -----------------------------------------------
-- PROFILES
-- -----------------------------------------------
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (id = auth.uid());

CREATE POLICY "Admins can view all profiles"
  ON profiles FOR SELECT
  USING (get_user_role() = 'admin');

-- -----------------------------------------------
-- CLIENTS
-- -----------------------------------------------
-- Users can see clients they created, they are members of, admins see all
CREATE POLICY "Members can view their clients"
  ON clients FOR SELECT
  USING (
    get_user_role() = 'admin'
    OR created_by = auth.uid()
    OR id IN (
      SELECT client_id FROM client_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Admins and managers can create clients"
  ON clients FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Admins and managers can update clients"
  ON clients FOR UPDATE
  USING (
    get_user_role() = 'admin'
    OR created_by = auth.uid()
    OR (
      get_user_role() = 'seo_manager'
      AND id IN (SELECT client_id FROM client_members WHERE user_id = auth.uid())
    )
  );

-- -----------------------------------------------
-- CLIENT MEMBERS
-- -----------------------------------------------
CREATE POLICY "Users can view memberships for their clients"
  ON client_members FOR SELECT
  USING (
    get_user_role() = 'admin'
    OR user_id = auth.uid()
  );

CREATE POLICY "Admins can manage client members"
  ON client_members FOR ALL
  USING (get_user_role() = 'admin');

CREATE POLICY "Managers can insert client members"
  ON client_members FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND user_id = auth.uid());

-- -----------------------------------------------
-- CHAT SESSIONS
-- -----------------------------------------------
CREATE POLICY "Users can view sessions for their clients"
  ON chat_sessions FOR SELECT
  USING (
    client_id IN (SELECT client_id FROM client_members WHERE user_id = auth.uid())
    OR get_user_role() = 'admin'
  );

CREATE POLICY "Users can create sessions for their clients"
  ON chat_sessions FOR INSERT
  WITH CHECK (
    client_id IN (SELECT client_id FROM client_members WHERE user_id = auth.uid())
    AND user_id = auth.uid()
  );

CREATE POLICY "Users can update their own sessions"
  ON chat_sessions FOR UPDATE
  USING (user_id = auth.uid() OR get_user_role() = 'admin');

CREATE POLICY "Users can delete their own sessions"
  ON chat_sessions FOR DELETE
  USING (user_id = auth.uid() OR get_user_role() = 'admin');


-- -----------------------------------------------
-- CHAT MESSAGES
-- -----------------------------------------------
CREATE POLICY "Users can view messages for their clients"
  ON chat_messages FOR SELECT
  USING (
    client_id IN (SELECT client_id FROM client_members WHERE user_id = auth.uid())
    OR get_user_role() = 'admin'
  );

CREATE POLICY "Users can insert messages for their clients"
  ON chat_messages FOR INSERT
  WITH CHECK (
    client_id IN (SELECT client_id FROM client_members WHERE user_id = auth.uid())
  );

-- -----------------------------------------------
-- TASKS
-- -----------------------------------------------
CREATE POLICY "Users can view tasks for their clients"
  ON tasks FOR SELECT
  USING (
    client_id IN (SELECT client_id FROM client_members WHERE user_id = auth.uid())
    OR get_user_role() = 'admin'
  );

CREATE POLICY "Users can create tasks for their clients"
  ON tasks FOR INSERT
  WITH CHECK (
    client_id IN (SELECT client_id FROM client_members WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can update tasks for their clients"
  ON tasks FOR UPDATE
  USING (
    client_id IN (SELECT client_id FROM client_members WHERE user_id = auth.uid())
    OR get_user_role() = 'admin'
  );

-- -----------------------------------------------
-- APPROVALS
-- -----------------------------------------------
CREATE POLICY "Users can view approvals for their clients"
  ON approvals FOR SELECT
  USING (
    client_id IN (SELECT client_id FROM client_members WHERE user_id = auth.uid())
    OR get_user_role() = 'admin'
  );

CREATE POLICY "Users can create approvals for their clients"
  ON approvals FOR INSERT
  WITH CHECK (
    client_id IN (SELECT client_id FROM client_members WHERE user_id = auth.uid())
  );

CREATE POLICY "Managers and admins can decide on approvals"
  ON approvals FOR UPDATE
  USING (
    get_user_role() IN ('admin', 'seo_manager')
    OR (
      get_user_role() = 'seo_executive'
      AND client_id IN (SELECT client_id FROM client_members WHERE user_id = auth.uid())
    )
  );

-- -----------------------------------------------
-- CLIENT MEMORY
-- -----------------------------------------------
CREATE POLICY "Users can view memory for their clients"
  ON client_memory FOR SELECT
  USING (
    client_id IN (SELECT client_id FROM client_members WHERE user_id = auth.uid())
    OR get_user_role() = 'admin'
  );

CREATE POLICY "Users can write memory for their clients"
  ON client_memory FOR ALL
  USING (
    client_id IN (SELECT client_id FROM client_members WHERE user_id = auth.uid())
    OR get_user_role() = 'admin'
  );

-- -----------------------------------------------
-- AGENCY MEMORY (read by all authenticated, write by admins/managers)
-- -----------------------------------------------
CREATE POLICY "All authenticated users can read agency memory"
  ON agency_memory FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins and managers can write agency memory"
  ON agency_memory FOR ALL
  USING (get_user_role() IN ('admin', 'seo_manager'));

-- -----------------------------------------------
-- REALTIME: enable publications
-- -----------------------------------------------
ALTER PUBLICATION supabase_realtime ADD TABLE tasks;
ALTER PUBLICATION supabase_realtime ADD TABLE approvals;
ALTER PUBLICATION supabase_realtime ADD TABLE chat_messages;

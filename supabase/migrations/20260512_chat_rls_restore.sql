-- ========================================
-- SECURITY: Restore chat_conversations / chat_messages RLS
-- ========================================
-- 20260509_rls_clean_reset.sql opened chat_conversations and chat_messages
-- to `anon, authenticated USING (true)`, regressing the earlier
-- 20260509_chat_logs.sql hardening which intended super_admin-only reads.
-- This migration restores the intended state.
--
-- Public chat insert is allowed (visitors from reefa.pl POST messages
-- via the public widget). Reads/updates/deletes are super_admin only.
-- ========================================

ALTER TABLE chat_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

-- Drop ALL existing permissive policies on chat tables (use loop to catch
-- any with non-standard names left by old migrations)
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT policyname, tablename FROM pg_policies
           WHERE tablename IN ('chat_messages','chat_conversations','blog_b2b_pageviews') LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', r.policyname, r.tablename);
  END LOOP;
END$$;
-- And any leftovers from the earlier hardening attempt
DROP POLICY IF EXISTS "Super admins can view chat conversations" ON chat_conversations;
DROP POLICY IF EXISTS "Super admins can view chat messages" ON chat_messages;
DROP POLICY IF EXISTS "Allow anon insert" ON chat_messages;
DROP POLICY IF EXISTS "Allow anon insert conversations" ON chat_conversations;

-- ---- chat_conversations -------------------------------------------------

-- Public widget on reefa.pl creates conversations
CREATE POLICY "chat_conversations anon insert" ON chat_conversations
  FOR INSERT TO anon WITH CHECK (true);

-- Super_admins read/manage everything
CREATE POLICY "chat_conversations super_admin select" ON chat_conversations
  FOR SELECT TO authenticated
  USING (is_super_admin());

CREATE POLICY "chat_conversations super_admin update" ON chat_conversations
  FOR UPDATE TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

CREATE POLICY "chat_conversations super_admin delete" ON chat_conversations
  FOR DELETE TO authenticated
  USING (is_super_admin());

-- ---- chat_messages ------------------------------------------------------

-- Public widget on reefa.pl posts user messages
CREATE POLICY "chat_messages anon insert" ON chat_messages
  FOR INSERT TO anon WITH CHECK (true);

-- Super_admins read all messages
CREATE POLICY "chat_messages super_admin select" ON chat_messages
  FOR SELECT TO authenticated
  USING (is_super_admin());

CREATE POLICY "chat_messages super_admin delete" ON chat_messages
  FOR DELETE TO authenticated
  USING (is_super_admin());

-- ---- blog_b2b_pageviews -------------------------------------------------
-- Also regressed by 20260509_rls_clean_reset.sql. Anon inserts page-views
-- but only super_admin should read aggregated analytics.

ALTER TABLE blog_b2b_pageviews ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "blog_b2b_pageviews all" ON blog_b2b_pageviews;

CREATE POLICY "blog_b2b_pageviews anon insert" ON blog_b2b_pageviews
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "blog_b2b_pageviews super_admin select" ON blog_b2b_pageviews
  FOR SELECT TO authenticated
  USING (is_super_admin());

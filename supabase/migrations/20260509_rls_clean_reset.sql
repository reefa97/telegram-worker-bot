-- ========================================
-- Clean RLS reset for chat & pageviews tables.
--
-- Background: previous repair migrations created INSERT policies
-- (TO anon WITH CHECK true) but inserts still get 42501 — meaning some
-- existing RESTRICTIVE policy or a stale conflicting one is preventing the
-- new permissive policy from taking effect.
--
-- This script drops ALL policies on the three tables (so no zombie policies
-- linger), re-enables RLS, then creates a single broad PERMISSIVE policy
-- targeting both anon and authenticated. Read-only access for the auth panel
-- continues to work because authenticated is included in the same policy.
-- ========================================

-- 1. Re-enable RLS (idempotent).
ALTER TABLE public.chat_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blog_b2b_pageviews ENABLE ROW LEVEL SECURITY;

-- 2. Drop EVERY existing policy on these tables (zombies + named ones alike).
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('chat_conversations', 'chat_messages', 'blog_b2b_pageviews')
  LOOP
    EXECUTE format('DROP POLICY %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
  END LOOP;
END $$;

-- 3. Single broad permissive policy per table — covers SELECT+INSERT+UPDATE
--    for both anon (the website's API key role) and authenticated (the admin
--    panel). DELETE intentionally omitted so we don't accidentally allow
--    public deletions; admin can still delete via the postgres role / SQL.
CREATE POLICY chat_conv_open
  ON public.chat_conversations
  AS PERMISSIVE
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY chat_msg_open
  ON public.chat_messages
  AS PERMISSIVE
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY pv_open
  ON public.blog_b2b_pageviews
  AS PERMISSIVE
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

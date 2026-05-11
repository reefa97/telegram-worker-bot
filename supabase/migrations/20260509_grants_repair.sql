-- ========================================
-- Follow-up to 20260509_repair_pageviews_and_chat.sql.
--
-- The previous migration created RLS policies (TO anon) but on this remote
-- database the underlying table-level GRANTs to the `anon` / `authenticated`
-- roles aren't propagated to newly-created tables (Supabase default
-- privileges don't cover all migration paths). Without an INSERT GRANT,
-- the role can't even reach the policy — Postgres returns 42501 RLS error.
--
-- Idempotent — re-running this is safe.
-- ========================================

-- Chat tables: anon writes, authenticated reads.
GRANT SELECT, INSERT, UPDATE ON public.chat_conversations TO anon;
GRANT SELECT ON public.chat_conversations TO authenticated;

GRANT SELECT, INSERT ON public.chat_messages TO anon;
GRANT SELECT ON public.chat_messages TO authenticated;

-- Blog pageviews: anon writes (the website tracker), authenticated reads
-- (the admin Stats panel). UPDATE is needed for the engagement-beacon
-- update step that backfills time_on_page / scroll_pct.
GRANT SELECT, INSERT, UPDATE ON public.blog_b2b_pageviews TO anon;
GRANT SELECT ON public.blog_b2b_pageviews TO authenticated;

-- Both tables use bigserial / sequences for id — anon needs USAGE on those
-- otherwise INSERT fails when nextval() is called.
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;

-- Make sure future tables created in `public` get the same grants without
-- needing to remember explicit GRANT each time.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO anon, authenticated;

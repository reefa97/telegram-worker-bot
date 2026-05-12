-- ========================================
-- SECURITY: Revoke exec_sql from PUBLIC/anon/authenticated
-- ========================================
-- exec_sql(text) is SECURITY DEFINER and runs arbitrary SQL as the
-- function owner. Default Postgres grants EXECUTE on functions to
-- PUBLIC, which means any client with the anon key could:
--   supabase.rpc('exec_sql', { sql_query: 'DROP TABLE workers CASCADE' })
-- and wipe the database.
--
-- This migration removes that public access. Only service_role
-- (used by python_search migration scripts) retains access.
-- ========================================

REVOKE EXECUTE ON FUNCTION exec_sql(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION exec_sql(text) FROM anon;
REVOKE EXECUTE ON FUNCTION exec_sql(text) FROM authenticated;

-- ========================================
-- Allow the anon role to update ONLY the cover_image_url column on
-- blog_b2b_articles.
--
-- Why: the new cover-mirror pipeline runs from /api/blog-revalidate and
-- /api/blog-pick-cover on Vercel, which authenticate with the Supabase anon
-- key. Without this, the mirror flow silently fails — RLS denies the PATCH
-- but PostgREST still returns 204 with `Prefer: return=minimal` (the bug
-- has now been fixed in the lib by switching to return=representation; this
-- migration unblocks the actual write).
--
-- Scope safety: column-level GRANT means anon CANNOT change article body,
-- title, status, or any other field — only the cover URL. This keeps the
-- attack surface narrow even though the anon key is technically in client
-- code (the website).
-- ========================================

-- Revoke any blanket UPDATE that might let anon write everything, then
-- grant just the cover column.
REVOKE UPDATE ON public.blog_b2b_articles FROM anon;
GRANT UPDATE (cover_image_url) ON public.blog_b2b_articles TO anon;

-- Add the matching RLS policy. Without it, even with the column GRANT,
-- the row-level check would still reject anon updates.
DROP POLICY IF EXISTS blog_articles_update_anon_cover ON public.blog_b2b_articles;
CREATE POLICY blog_articles_update_anon_cover
  ON public.blog_b2b_articles
  AS PERMISSIVE
  FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

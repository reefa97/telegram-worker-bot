-- ========================================
-- Storage bucket for self-hosted blog cover images.
--
-- Why: Pixabay and Unsplash rotate their CDN URLs (links work for a couple
-- of weeks then 400). To prevent blog covers from rotting, we mirror every
-- third-party cover into our own Supabase Storage at publish time.
--
-- Lifecycle:
--   1. Edge function (blog-autopublish) writes article with Pixabay URL.
--   2. /api/blog-revalidate (called after publish) detects third-party URL,
--      downloads → uploads to this bucket → updates cover_image_url to the
--      stable Supabase Storage public URL.
--   3. /api/blog-mirror-covers can also be run on-demand to backfill or
--      re-mirror after manual cover changes in the BlogPanel.
-- ========================================

-- 1. Public bucket so Next.js Image can fetch directly without signed URLs.
INSERT INTO storage.buckets (id, name, public)
VALUES ('blog-covers', 'blog-covers', true)
ON CONFLICT (id) DO NOTHING;

-- 2. RLS for storage.objects scoped to this bucket.
--    Reads: public (bucket.public=true makes this automatic; the policy is
--    a belt-and-suspenders explicit grant).
--    Writes: anon role (the Next.js API routes use the anon key to upload
--    after downloading from Pixabay).
DROP POLICY IF EXISTS blog_covers_storage_select ON storage.objects;
CREATE POLICY blog_covers_storage_select ON storage.objects
  FOR SELECT TO anon, authenticated USING (bucket_id = 'blog-covers');

DROP POLICY IF EXISTS blog_covers_storage_insert ON storage.objects;
CREATE POLICY blog_covers_storage_insert ON storage.objects
  FOR INSERT TO anon, authenticated WITH CHECK (bucket_id = 'blog-covers');

DROP POLICY IF EXISTS blog_covers_storage_update ON storage.objects;
CREATE POLICY blog_covers_storage_update ON storage.objects
  FOR UPDATE TO anon, authenticated
  USING (bucket_id = 'blog-covers') WITH CHECK (bucket_id = 'blog-covers');

DROP POLICY IF EXISTS blog_covers_storage_delete ON storage.objects;
CREATE POLICY blog_covers_storage_delete ON storage.objects
  FOR DELETE TO anon, authenticated USING (bucket_id = 'blog-covers');

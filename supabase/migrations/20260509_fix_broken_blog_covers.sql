-- ========================================
-- Replace dead Pixabay CDN URLs in blog_b2b_articles with locally-hosted
-- images. The Pixabay CDN rotates URLs on its own schedule — links that
-- worked when an article was generated start returning HTTP 400 weeks
-- later. Until the auto-publish pipeline is updated to mirror Pixabay
-- assets to Supabase Storage at generation time (todo), we self-host.
-- ========================================

-- Fix the 3 currently-broken articles. Match by slug so re-running this
-- after a future fix doesn't accidentally regress a healthy URL.
UPDATE public.blog_b2b_articles
SET cover_image_url = 'https://reefa.pl/images/blog/office-cleaning-hero.png'
WHERE slug = 'sprzatanie-biur-24-7-bpo-ssc-krakow-katowice'
  AND cover_image_url LIKE 'https://pixabay.com/%';

UPDATE public.blog_b2b_articles
SET cover_image_url = 'https://reefa.pl/images/blog/checklista-sprzatania-biura.jpg'
WHERE slug = 'umowa-o-sprzatanie-biura-checklist-2026'
  AND cover_image_url LIKE 'https://pixabay.com/%';

UPDATE public.blog_b2b_articles
SET cover_image_url = 'https://reefa.pl/images/blog/office-interior.png'
WHERE slug = 'sprzatanie-biura-krakow-cennik-2026'
  AND cover_image_url LIKE 'https://pixabay.com/%';

-- Generic safety net — for any other article still pointing at pixabay.com,
-- fall back to the cleaning-service.png placeholder so we never serve a
-- broken hero again. Run only against articles whose URL still has the
-- Pixabay CDN prefix.
UPDATE public.blog_b2b_articles
SET cover_image_url = 'https://reefa.pl/images/blog/cleaning-service.png'
WHERE cover_image_url LIKE 'https://pixabay.com/%';

-- Add an UPDATE policy on blog_b2b_articles for authenticated admins so
-- future cover swaps can happen via the BlogPanel UI without needing SQL.
-- Read access already exists for the panel; this only affects writes.
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'blog_b2b_articles'
      AND policyname LIKE '%update%authenticated%'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.blog_b2b_articles', r.policyname);
  END LOOP;
END $$;

CREATE POLICY blog_articles_update_authenticated
  ON public.blog_b2b_articles
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

GRANT UPDATE ON public.blog_b2b_articles TO authenticated;

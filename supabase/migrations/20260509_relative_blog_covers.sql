-- ========================================
-- Make blog cover URLs relative.
--
-- Why: Next.js Image optimisation refuses to proxy its own hostname
-- (reefa.pl) — it expects either a relative path (`/images/...`) or a
-- whitelisted external host. Cover URLs were patched as absolute
-- `https://reefa.pl/images/blog/...` which breaks /_next/image rendering.
-- Strip the host part so Next.js treats them as same-origin assets.
-- ========================================

UPDATE public.blog_b2b_articles
SET cover_image_url = REPLACE(cover_image_url, 'https://reefa.pl', '')
WHERE cover_image_url LIKE 'https://reefa.pl/%';

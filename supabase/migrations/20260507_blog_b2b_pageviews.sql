-- ========================================
-- Blog pageview tracking for reefa.pl B2B
-- Privacy-friendly: no cookies, no PII, only hashed daily-unique session id.
-- ========================================

CREATE TABLE IF NOT EXISTS public.blog_b2b_pageviews (
  id BIGSERIAL PRIMARY KEY,
  slug TEXT NOT NULL,
  -- Where the page was hit. e.g. 'reefa.pl', 'app.reefa.pl', etc.
  source TEXT DEFAULT 'reefa.pl',
  -- Where the visitor came from (parsed from Referer header)
  referrer TEXT,
  referrer_domain TEXT,
  -- User agent — truncated to 200 chars to keep storage tight
  user_agent TEXT,
  -- 2-char ISO from x-vercel-ip-country header (Vercel adds this automatically)
  country TEXT,
  -- ip-hash + day-bucket: identifies a unique session per article per day
  -- without storing IP. Used to compute "unique views" vs raw "page views".
  session_hash TEXT,
  is_bot BOOLEAN DEFAULT FALSE,
  -- Locale of the page (pl|en|ru) — same article seen on /blog/x and /en/blog/x
  -- count separately so we know which locale gets traffic.
  locale TEXT DEFAULT 'pl',
  viewed_at TIMESTAMPTZ DEFAULT NOW()
);

-- Composite indexes for the most common queries
CREATE INDEX IF NOT EXISTS idx_b2b_pv_slug_date ON public.blog_b2b_pageviews(slug, viewed_at DESC);
CREATE INDEX IF NOT EXISTS idx_b2b_pv_date ON public.blog_b2b_pageviews(viewed_at DESC);
CREATE INDEX IF NOT EXISTS idx_b2b_pv_session ON public.blog_b2b_pageviews(session_hash, viewed_at);
CREATE INDEX IF NOT EXISTS idx_b2b_pv_referrer ON public.blog_b2b_pageviews(referrer_domain);

ALTER TABLE public.blog_b2b_pageviews ENABLE ROW LEVEL SECURITY;

-- Public can INSERT (the tracker writes from anonymous frontend through API),
-- but only authenticated can read. Service role bypasses RLS for analytics.
CREATE POLICY "Public can insert pageviews"
  ON public.blog_b2b_pageviews FOR INSERT
  TO anon WITH CHECK (true);

CREATE POLICY "Authenticated can read pageviews"
  ON public.blog_b2b_pageviews FOR ALL
  TO authenticated USING (true) WITH CHECK (true);

-- ========================================
-- Aggregation RPCs (used by the CMS Statystyki tab)
-- ========================================

-- Top-level stats — total views, unique sessions, today's count, last-7d count.
CREATE OR REPLACE FUNCTION public.blog_b2b_view_summary(p_days INT DEFAULT 30)
RETURNS TABLE (
  total_views BIGINT,
  unique_sessions BIGINT,
  views_today BIGINT,
  views_last_7d BIGINT,
  views_last_30d BIGINT,
  bot_views BIGINT,
  countries_count BIGINT
) LANGUAGE sql STABLE SECURITY DEFINER AS $$
  WITH window_views AS (
    SELECT * FROM public.blog_b2b_pageviews
    WHERE viewed_at >= NOW() - (p_days || ' days')::INTERVAL
      AND is_bot = FALSE
  )
  SELECT
    (SELECT COUNT(*) FROM window_views) AS total_views,
    (SELECT COUNT(DISTINCT session_hash) FROM window_views WHERE session_hash IS NOT NULL) AS unique_sessions,
    (SELECT COUNT(*) FROM public.blog_b2b_pageviews WHERE viewed_at >= CURRENT_DATE AND is_bot = FALSE) AS views_today,
    (SELECT COUNT(*) FROM public.blog_b2b_pageviews WHERE viewed_at >= NOW() - INTERVAL '7 days' AND is_bot = FALSE) AS views_last_7d,
    (SELECT COUNT(*) FROM public.blog_b2b_pageviews WHERE viewed_at >= NOW() - INTERVAL '30 days' AND is_bot = FALSE) AS views_last_30d,
    (SELECT COUNT(*) FROM window_views WHERE is_bot = TRUE) AS bot_views,
    (SELECT COUNT(DISTINCT country) FROM window_views WHERE country IS NOT NULL) AS countries_count;
$$;

-- Per-article ranking with daily breakdown sparkline data.
CREATE OR REPLACE FUNCTION public.blog_b2b_views_per_article(p_days INT DEFAULT 30)
RETURNS TABLE (
  slug TEXT,
  title TEXT,
  status TEXT,
  total_views BIGINT,
  unique_sessions BIGINT,
  avg_daily NUMERIC
) LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    a.slug,
    a.title,
    a.status,
    COALESCE(COUNT(pv.id), 0) AS total_views,
    COALESCE(COUNT(DISTINCT pv.session_hash) FILTER (WHERE pv.session_hash IS NOT NULL), 0) AS unique_sessions,
    ROUND(COALESCE(COUNT(pv.id), 0)::NUMERIC / GREATEST(p_days, 1), 1) AS avg_daily
  FROM public.blog_b2b_articles a
  LEFT JOIN public.blog_b2b_pageviews pv
    ON pv.slug = a.slug
    AND pv.viewed_at >= NOW() - (p_days || ' days')::INTERVAL
    AND pv.is_bot = FALSE
  GROUP BY a.id, a.slug, a.title, a.status
  ORDER BY total_views DESC;
$$;

-- Daily timeseries — for the chart in CMS.
CREATE OR REPLACE FUNCTION public.blog_b2b_daily_views(p_days INT DEFAULT 30)
RETURNS TABLE (day DATE, views BIGINT, unique_sessions BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  WITH days AS (
    SELECT generate_series(
      (CURRENT_DATE - (p_days - 1) * INTERVAL '1 day')::DATE,
      CURRENT_DATE,
      '1 day'::INTERVAL
    )::DATE AS day
  )
  SELECT
    d.day,
    COALESCE(COUNT(pv.id), 0) AS views,
    COALESCE(COUNT(DISTINCT pv.session_hash) FILTER (WHERE pv.session_hash IS NOT NULL), 0) AS unique_sessions
  FROM days d
  LEFT JOIN public.blog_b2b_pageviews pv
    ON DATE(pv.viewed_at AT TIME ZONE 'Europe/Warsaw') = d.day
    AND pv.is_bot = FALSE
  GROUP BY d.day
  ORDER BY d.day;
$$;

-- Top referrer domains over the window.
CREATE OR REPLACE FUNCTION public.blog_b2b_top_referrers(p_days INT DEFAULT 30, p_limit INT DEFAULT 15)
RETURNS TABLE (referrer_domain TEXT, views BIGINT, unique_sessions BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    COALESCE(NULLIF(referrer_domain, ''), '(direct)') AS referrer_domain,
    COUNT(*) AS views,
    COUNT(DISTINCT session_hash) AS unique_sessions
  FROM public.blog_b2b_pageviews
  WHERE viewed_at >= NOW() - (p_days || ' days')::INTERVAL
    AND is_bot = FALSE
  GROUP BY 1
  ORDER BY views DESC
  LIMIT p_limit;
$$;

-- Top countries.
CREATE OR REPLACE FUNCTION public.blog_b2b_top_countries(p_days INT DEFAULT 30, p_limit INT DEFAULT 15)
RETURNS TABLE (country TEXT, views BIGINT, unique_sessions BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    COALESCE(NULLIF(country, ''), '??') AS country,
    COUNT(*) AS views,
    COUNT(DISTINCT session_hash) AS unique_sessions
  FROM public.blog_b2b_pageviews
  WHERE viewed_at >= NOW() - (p_days || ' days')::INTERVAL
    AND is_bot = FALSE
  GROUP BY 1
  ORDER BY views DESC
  LIMIT p_limit;
$$;

-- Per-locale split.
CREATE OR REPLACE FUNCTION public.blog_b2b_views_by_locale(p_days INT DEFAULT 30)
RETURNS TABLE (locale TEXT, views BIGINT, unique_sessions BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    COALESCE(NULLIF(locale, ''), 'pl') AS locale,
    COUNT(*) AS views,
    COUNT(DISTINCT session_hash) AS unique_sessions
  FROM public.blog_b2b_pageviews
  WHERE viewed_at >= NOW() - (p_days || ' days')::INTERVAL
    AND is_bot = FALSE
  GROUP BY 1
  ORDER BY views DESC;
$$;

GRANT EXECUTE ON FUNCTION public.blog_b2b_view_summary(INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.blog_b2b_views_per_article(INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.blog_b2b_daily_views(INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.blog_b2b_top_referrers(INT, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.blog_b2b_top_countries(INT, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.blog_b2b_views_by_locale(INT) TO authenticated;

-- ========================================
-- Blog pageviews v2: cookie-based extended tracking
-- Adds visitor_id (1y persistent), session_id (30m rolling), time-on-page,
-- scroll depth, UTM params, and device type. Requires user consent.
-- ========================================

ALTER TABLE public.blog_b2b_pageviews
  ADD COLUMN IF NOT EXISTS visitor_id TEXT,
  ADD COLUMN IF NOT EXISTS session_id TEXT,
  ADD COLUMN IF NOT EXISTS time_on_page_seconds INT,
  ADD COLUMN IF NOT EXISTS max_scroll_pct SMALLINT,
  ADD COLUMN IF NOT EXISTS utm_source TEXT,
  ADD COLUMN IF NOT EXISTS utm_medium TEXT,
  ADD COLUMN IF NOT EXISTS utm_campaign TEXT,
  ADD COLUMN IF NOT EXISTS device_type TEXT,  -- mobile | tablet | desktop
  ADD COLUMN IF NOT EXISTS consent_level TEXT, -- 'analytics' | 'necessary'
  ADD COLUMN IF NOT EXISTS is_returning BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_b2b_pv_visitor ON public.blog_b2b_pageviews(visitor_id) WHERE visitor_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_b2b_pv_session ON public.blog_b2b_pageviews(session_id) WHERE session_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_b2b_pv_utm ON public.blog_b2b_pageviews(utm_source) WHERE utm_source IS NOT NULL;

-- ========================================
-- Updated RPCs to use the richer data
-- ========================================

-- Summary now includes returning-visitor ratio + avg engagement
CREATE OR REPLACE FUNCTION public.blog_b2b_view_summary(p_days INT DEFAULT 30)
RETURNS TABLE (
  total_views BIGINT,
  unique_sessions BIGINT,
  unique_visitors BIGINT,
  returning_visitors BIGINT,
  views_today BIGINT,
  views_last_7d BIGINT,
  views_last_30d BIGINT,
  bot_views BIGINT,
  countries_count BIGINT,
  avg_time_on_page NUMERIC,
  avg_scroll_pct NUMERIC
) LANGUAGE sql STABLE SECURITY DEFINER AS $$
  WITH window_views AS (
    SELECT * FROM public.blog_b2b_pageviews
    WHERE viewed_at >= NOW() - (p_days || ' days')::INTERVAL AND is_bot = FALSE
  )
  SELECT
    (SELECT COUNT(*) FROM window_views),
    (SELECT COUNT(DISTINCT session_hash) FROM window_views WHERE session_hash IS NOT NULL),
    (SELECT COUNT(DISTINCT visitor_id) FROM window_views WHERE visitor_id IS NOT NULL),
    (SELECT COUNT(DISTINCT visitor_id) FROM window_views WHERE is_returning = TRUE AND visitor_id IS NOT NULL),
    (SELECT COUNT(*) FROM public.blog_b2b_pageviews WHERE viewed_at >= CURRENT_DATE AND is_bot = FALSE),
    (SELECT COUNT(*) FROM public.blog_b2b_pageviews WHERE viewed_at >= NOW() - INTERVAL '7 days' AND is_bot = FALSE),
    (SELECT COUNT(*) FROM public.blog_b2b_pageviews WHERE viewed_at >= NOW() - INTERVAL '30 days' AND is_bot = FALSE),
    (SELECT COUNT(*) FROM window_views WHERE is_bot = TRUE),
    (SELECT COUNT(DISTINCT country) FROM window_views WHERE country IS NOT NULL),
    (SELECT ROUND(AVG(time_on_page_seconds), 1) FROM window_views WHERE time_on_page_seconds IS NOT NULL AND time_on_page_seconds > 0 AND time_on_page_seconds < 3600),
    (SELECT ROUND(AVG(max_scroll_pct), 1) FROM window_views WHERE max_scroll_pct IS NOT NULL);
$$;

GRANT EXECUTE ON FUNCTION public.blog_b2b_view_summary(INT) TO authenticated;

-- Per-article stats with engagement metrics
CREATE OR REPLACE FUNCTION public.blog_b2b_views_per_article(p_days INT DEFAULT 30)
RETURNS TABLE (
  slug TEXT, title TEXT, status TEXT,
  total_views BIGINT, unique_sessions BIGINT, unique_visitors BIGINT,
  avg_daily NUMERIC,
  avg_time_seconds NUMERIC, avg_scroll_pct NUMERIC
) LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT a.slug, a.title, a.status,
    COALESCE(COUNT(pv.id), 0),
    COALESCE(COUNT(DISTINCT pv.session_hash) FILTER (WHERE pv.session_hash IS NOT NULL), 0),
    COALESCE(COUNT(DISTINCT pv.visitor_id) FILTER (WHERE pv.visitor_id IS NOT NULL), 0),
    ROUND(COALESCE(COUNT(pv.id), 0)::NUMERIC / GREATEST(p_days, 1), 1),
    ROUND(AVG(pv.time_on_page_seconds) FILTER (WHERE pv.time_on_page_seconds IS NOT NULL AND pv.time_on_page_seconds > 0 AND pv.time_on_page_seconds < 3600), 1),
    ROUND(AVG(pv.max_scroll_pct) FILTER (WHERE pv.max_scroll_pct IS NOT NULL), 1)
  FROM public.blog_b2b_articles a
  LEFT JOIN public.blog_b2b_pageviews pv
    ON pv.slug = a.slug AND pv.viewed_at >= NOW() - (p_days || ' days')::INTERVAL AND pv.is_bot = FALSE
  GROUP BY a.id, a.slug, a.title, a.status
  ORDER BY 4 DESC;
$$;

GRANT EXECUTE ON FUNCTION public.blog_b2b_views_per_article(INT) TO authenticated;

-- UTM source breakdown (campaign attribution)
CREATE OR REPLACE FUNCTION public.blog_b2b_utm_sources(p_days INT DEFAULT 30, p_limit INT DEFAULT 20)
RETURNS TABLE (utm_source TEXT, utm_medium TEXT, utm_campaign TEXT, views BIGINT, unique_visitors BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    COALESCE(NULLIF(pv.utm_source, ''), '(none)'),
    COALESCE(NULLIF(pv.utm_medium, ''), ''),
    COALESCE(NULLIF(pv.utm_campaign, ''), ''),
    COUNT(*),
    COUNT(DISTINCT pv.visitor_id) FILTER (WHERE pv.visitor_id IS NOT NULL)
  FROM public.blog_b2b_pageviews pv
  WHERE pv.viewed_at >= NOW() - (p_days || ' days')::INTERVAL
    AND pv.is_bot = FALSE
    AND pv.utm_source IS NOT NULL
  GROUP BY 1, 2, 3
  ORDER BY 4 DESC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.blog_b2b_utm_sources(INT, INT) TO authenticated;

-- Device breakdown
CREATE OR REPLACE FUNCTION public.blog_b2b_device_split(p_days INT DEFAULT 30)
RETURNS TABLE (device_type TEXT, views BIGINT, unique_sessions BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    COALESCE(NULLIF(device_type, ''), 'unknown'),
    COUNT(*),
    COUNT(DISTINCT session_hash)
  FROM public.blog_b2b_pageviews
  WHERE viewed_at >= NOW() - (p_days || ' days')::INTERVAL
    AND is_bot = FALSE
  GROUP BY 1
  ORDER BY 2 DESC;
$$;

GRANT EXECUTE ON FUNCTION public.blog_b2b_device_split(INT) TO authenticated;

-- New vs returning visitor breakdown
CREATE OR REPLACE FUNCTION public.blog_b2b_new_vs_returning(p_days INT DEFAULT 30)
RETURNS TABLE (cohort TEXT, visitors BIGINT, views BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    CASE WHEN is_returning THEN 'returning' ELSE 'new' END,
    COUNT(DISTINCT visitor_id),
    COUNT(*)
  FROM public.blog_b2b_pageviews
  WHERE viewed_at >= NOW() - (p_days || ' days')::INTERVAL
    AND is_bot = FALSE
    AND visitor_id IS NOT NULL
  GROUP BY 1;
$$;

GRANT EXECUTE ON FUNCTION public.blog_b2b_new_vs_returning(INT) TO authenticated;

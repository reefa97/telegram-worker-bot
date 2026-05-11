-- ========================================
-- Blog Autopublisher for reefa.pl B2B
-- Mirrors home.reefa.pl architecture but:
--  - separate `blog_b2b_*` table prefix to avoid clashing with home tables
--    (same Supabase project hosts both projects' data)
--  - Polish-only content output
--  - settings table with auto_publish toggle
--  - generator-friendly schema (topic_dedup_hash for non-repeating generation)
-- ========================================

-- 1. Articles table
CREATE TABLE IF NOT EXISTS public.blog_b2b_articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  excerpt TEXT,
  cover_image_url TEXT,
  body_markdown TEXT NOT NULL,
  category TEXT,
  tags TEXT[] DEFAULT ARRAY[]::TEXT[],
  reading_time_minutes INT,
  status TEXT NOT NULL DEFAULT 'draft', -- draft | published | archived
  published_at TIMESTAMPTZ,
  author_name TEXT DEFAULT 'Reefa',
  meta_title TEXT,
  meta_description TEXT,
  -- B2B specific
  primary_keyword TEXT,
  pillar_no SMALLINT,
  spoke_no TEXT,
  word_count INT,
  -- regeneration history (counter, not full versions; full history lives in queue.attempt_count)
  regeneration_count INT DEFAULT 0,
  last_regeneration_feedback TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_blog_b2b_articles_status ON public.blog_b2b_articles(status);
CREATE INDEX IF NOT EXISTS idx_blog_b2b_articles_published_at ON public.blog_b2b_articles(published_at DESC) WHERE status = 'published';
CREATE INDEX IF NOT EXISTS idx_blog_b2b_articles_pillar ON public.blog_b2b_articles(pillar_no);

ALTER TABLE public.blog_b2b_articles ENABLE ROW LEVEL SECURITY;

-- Anon: only published articles
CREATE POLICY "Public can read published B2B articles"
  ON public.blog_b2b_articles FOR SELECT
  TO anon USING (status = 'published');

-- Authenticated (panel): full access
CREATE POLICY "Authenticated can manage B2B articles"
  ON public.blog_b2b_articles FOR ALL
  TO authenticated USING (true) WITH CHECK (true);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.set_blog_b2b_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  -- Auto-set published_at when transitioning to published
  IF (TG_OP = 'UPDATE' AND OLD.status <> 'published' AND NEW.status = 'published' AND NEW.published_at IS NULL) THEN
    NEW.published_at = NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_blog_b2b_articles_updated_at ON public.blog_b2b_articles;
CREATE TRIGGER trg_blog_b2b_articles_updated_at
  BEFORE UPDATE ON public.blog_b2b_articles
  FOR EACH ROW EXECUTE FUNCTION public.set_blog_b2b_updated_at();

-- 2. Topic queue
CREATE TABLE IF NOT EXISTS public.blog_b2b_topic_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pillar_no SMALLINT,
  spoke_no TEXT,
  proposed_title TEXT NOT NULL,
  primary_keyword TEXT NOT NULL,
  content_type TEXT,
  audience TEXT,
  seo_grade TEXT,
  estimated_volume INT,
  word_count_target INT DEFAULT 2200,
  internal_link_targets JSONB DEFAULT '[]'::jsonb,
  brief_md TEXT NOT NULL,
  priority_order INT NOT NULL,
  status TEXT DEFAULT 'pending',
  -- pending | generating | generated | published | skipped | failed
  scheduled_for DATE,
  generated_article_id UUID REFERENCES public.blog_b2b_articles(id) ON DELETE SET NULL,
  generated_at TIMESTAMPTZ,
  error_message TEXT,
  attempt_count INT DEFAULT 0,
  -- Used by topic-generator to deduplicate (lowercased, normalized title + keyword)
  dedup_hash TEXT GENERATED ALWAYS AS (
    lower(trim(proposed_title)) || '|' || lower(trim(primary_keyword))
  ) STORED,
  -- Source: 'manual' (seed) | 'ai-generated' (auto-generator)
  source TEXT DEFAULT 'manual',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_blog_b2b_queue_dedup ON public.blog_b2b_topic_queue(dedup_hash);
CREATE INDEX IF NOT EXISTS idx_blog_b2b_queue_status_priority ON public.blog_b2b_topic_queue(status, priority_order ASC);

ALTER TABLE public.blog_b2b_topic_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can manage B2B queue"
  ON public.blog_b2b_topic_queue FOR ALL
  TO authenticated USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS trg_blog_b2b_queue_updated_at ON public.blog_b2b_topic_queue;
CREATE TRIGGER trg_blog_b2b_queue_updated_at
  BEFORE UPDATE ON public.blog_b2b_topic_queue
  FOR EACH ROW EXECUTE FUNCTION public.set_blog_b2b_updated_at();

-- 3. Settings (single row — toggle for auto-publish, etc.)
CREATE TABLE IF NOT EXISTS public.blog_b2b_settings (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1), -- Singleton: only one row ever
  auto_publish BOOLEAN DEFAULT FALSE,
  auto_topup_enabled BOOLEAN DEFAULT TRUE,
  auto_topup_threshold INT DEFAULT 7, -- generate more topics when pending count drops below this
  notify_telegram BOOLEAN DEFAULT TRUE,
  paused_until DATE,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES public.admin_users(id) ON DELETE SET NULL
);

INSERT INTO public.blog_b2b_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.blog_b2b_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can manage B2B settings"
  ON public.blog_b2b_settings FOR ALL
  TO authenticated USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS trg_blog_b2b_settings_updated_at ON public.blog_b2b_settings;
CREATE TRIGGER trg_blog_b2b_settings_updated_at
  BEFORE UPDATE ON public.blog_b2b_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_blog_b2b_updated_at();

-- 4. RPC for stats — used in CMS dashboard
CREATE OR REPLACE FUNCTION public.blog_b2b_stats()
RETURNS TABLE (
  total_articles BIGINT,
  drafts BIGINT,
  published BIGINT,
  archived BIGINT,
  pending_topics BIGINT,
  generated_today BIGINT
) LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    (SELECT COUNT(*) FROM public.blog_b2b_articles) AS total_articles,
    (SELECT COUNT(*) FROM public.blog_b2b_articles WHERE status = 'draft') AS drafts,
    (SELECT COUNT(*) FROM public.blog_b2b_articles WHERE status = 'published') AS published,
    (SELECT COUNT(*) FROM public.blog_b2b_articles WHERE status = 'archived') AS archived,
    (SELECT COUNT(*) FROM public.blog_b2b_topic_queue WHERE status = 'pending') AS pending_topics,
    (SELECT COUNT(*) FROM public.blog_b2b_articles WHERE created_at >= CURRENT_DATE) AS generated_today;
$$;

GRANT EXECUTE ON FUNCTION public.blog_b2b_stats() TO authenticated;

COMMENT ON TABLE public.blog_b2b_articles IS
  'Blog articles for reefa.pl (B2B). Generated by Claude Sonnet via blog-autopublish edge function. Public reads only published rows.';
COMMENT ON TABLE public.blog_b2b_topic_queue IS
  'Topic backlog for B2B blog autopublisher. priority_order ASC = next to publish. dedup_hash prevents duplicates from auto-generator.';
COMMENT ON TABLE public.blog_b2b_settings IS
  'Singleton settings row (id=1). auto_publish=true means generated articles bypass draft state.';

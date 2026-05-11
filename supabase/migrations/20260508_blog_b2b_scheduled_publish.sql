-- ========================================
-- Delayed auto-publication (10-minute review window).
-- When admin enables `auto_publish` in settings, articles are no longer
-- published immediately — they land as draft with a future timestamp,
-- giving the admin a chance to review/cancel before they go live.
-- A separate cron promotes them when the time is up.
-- ========================================

ALTER TABLE public.blog_b2b_articles
  ADD COLUMN IF NOT EXISTS scheduled_publish_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_b2b_scheduled_publish
  ON public.blog_b2b_articles(scheduled_publish_at)
  WHERE scheduled_publish_at IS NOT NULL AND status = 'draft';

COMMENT ON COLUMN public.blog_b2b_articles.scheduled_publish_at IS
  'When set on a draft, the article will be auto-promoted to published once
  this timestamp passes. Cleared when promotion happens or admin cancels.';

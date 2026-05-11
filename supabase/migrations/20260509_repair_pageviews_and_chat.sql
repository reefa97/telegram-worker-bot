-- ========================================
-- Repair migration — covers two production gaps spotted on 2026-05-09:
--
-- 1. blog_b2b_pageviews has RLS enabled but no working INSERT policy. The
--    site's tracking endpoint silently fails to write. We re-create the
--    INSERT policy for the anon role (required so the public website API
--    route, which uses the anon key, can log pageviews).
--
-- 2. The chat-bot logging migration (20260509_chat_logs.sql) was authored
--    but never applied to the remote project. Tables ship here so chat
--    conversations and messages start being recorded.
--
-- All statements are idempotent — re-running this is safe.
-- ========================================

-- ── 1. Repair blog_b2b_pageviews INSERT policy ────────────────────
DO $$
BEGIN
  -- Drop any stale variant of the policy, regardless of name.
  PERFORM 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'blog_b2b_pageviews';
END $$;

DROP POLICY IF EXISTS "Public can insert pageviews" ON public.blog_b2b_pageviews;
DROP POLICY IF EXISTS pv_insert_anon ON public.blog_b2b_pageviews;
DROP POLICY IF EXISTS pv_select_authenticated ON public.blog_b2b_pageviews;
DROP POLICY IF EXISTS pv_update_anon ON public.blog_b2b_pageviews;
DROP POLICY IF EXISTS "Authenticated can read pageviews" ON public.blog_b2b_pageviews;

ALTER TABLE public.blog_b2b_pageviews ENABLE ROW LEVEL SECURITY;

-- Anon writes (the site's API route uses the anon key).
CREATE POLICY pv_insert_anon ON public.blog_b2b_pageviews
  FOR INSERT TO anon WITH CHECK (true);

-- Anon updates (engagement beacon updates time_on_page + scroll_pct after
-- the initial pageview row was inserted — same anon key).
CREATE POLICY pv_update_anon ON public.blog_b2b_pageviews
  FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- Reads from the authenticated admin panel.
CREATE POLICY pv_select_authenticated ON public.blog_b2b_pageviews
  FOR SELECT TO authenticated USING (true);

-- Make sure the v2 columns exist (in case someone applied only v1).
ALTER TABLE public.blog_b2b_pageviews
  ADD COLUMN IF NOT EXISTS visitor_id TEXT,
  ADD COLUMN IF NOT EXISTS session_id TEXT,
  ADD COLUMN IF NOT EXISTS time_on_page_seconds INT,
  ADD COLUMN IF NOT EXISTS max_scroll_pct SMALLINT,
  ADD COLUMN IF NOT EXISTS utm_source TEXT,
  ADD COLUMN IF NOT EXISTS utm_medium TEXT,
  ADD COLUMN IF NOT EXISTS utm_campaign TEXT,
  ADD COLUMN IF NOT EXISTS device_type TEXT,
  ADD COLUMN IF NOT EXISTS consent_level TEXT,
  ADD COLUMN IF NOT EXISTS is_returning BOOLEAN DEFAULT FALSE;

-- ── 2. Chat conversation logging tables (re-applies safely) ───────
CREATE TABLE IF NOT EXISTS public.chat_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL,
  locale TEXT NOT NULL,
  ip_hash TEXT,
  user_agent TEXT,
  origin_path TEXT,
  message_count INT NOT NULL DEFAULT 0,
  total_input_tokens INT NOT NULL DEFAULT 0,
  total_output_tokens INT NOT NULL DEFAULT 0,
  total_cache_read_tokens INT NOT NULL DEFAULT 0,
  total_cache_write_tokens INT NOT NULL DEFAULT 0,
  escalated BOOLEAN NOT NULL DEFAULT FALSE,
  escalation_reason TEXT,
  has_lead_intent BOOLEAN NOT NULL DEFAULT FALSE,
  -- AI-generated short summary of the conversation, populated by a
  -- background job (see ChatStatsPanel "Summarise" button). Populated
  -- lazily; empty until the panel runs analysis.
  ai_summary TEXT,
  ai_topic TEXT,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '90 days'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_conversations_session ON public.chat_conversations(session_id);
CREATE INDEX IF NOT EXISTS idx_chat_conversations_created ON public.chat_conversations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_conversations_expires ON public.chat_conversations(expires_at);
CREATE INDEX IF NOT EXISTS idx_chat_conversations_lead ON public.chat_conversations(has_lead_intent) WHERE has_lead_intent = TRUE;
CREATE INDEX IF NOT EXISTS idx_chat_conversations_escalated ON public.chat_conversations(escalated) WHERE escalated = TRUE;

CREATE TABLE IF NOT EXISTS public.chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'tool')),
  content TEXT NOT NULL,
  model TEXT,
  input_tokens INT,
  output_tokens INT,
  cache_read_tokens INT,
  cache_write_tokens INT,
  tool_use JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation
  ON public.chat_messages(conversation_id, created_at);

ALTER TABLE public.chat_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS chat_conv_insert_anon ON public.chat_conversations;
CREATE POLICY chat_conv_insert_anon ON public.chat_conversations
  FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS chat_conv_update_anon ON public.chat_conversations;
CREATE POLICY chat_conv_update_anon ON public.chat_conversations
  FOR UPDATE TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS chat_conv_select_authenticated ON public.chat_conversations;
CREATE POLICY chat_conv_select_authenticated ON public.chat_conversations
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS chat_conv_update_authenticated ON public.chat_conversations;
CREATE POLICY chat_conv_update_authenticated ON public.chat_conversations
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS chat_msg_insert_anon ON public.chat_messages;
CREATE POLICY chat_msg_insert_anon ON public.chat_messages
  FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS chat_msg_select_authenticated ON public.chat_messages;
CREATE POLICY chat_msg_select_authenticated ON public.chat_messages
  FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.chat_purge_expired() RETURNS INT AS $$
DECLARE
  deleted_count INT;
BEGIN
  WITH del AS (
    DELETE FROM public.chat_conversations WHERE expires_at < NOW() RETURNING 1
  )
  SELECT COUNT(*) INTO deleted_count FROM del;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 3. Aggregation RPCs for the Stats Panel ───────────────────────
-- Top 5 numbers (last N days). SECURITY DEFINER so the function runs as the
-- owner and can read past RLS — caller still needs `authenticated` to call.
CREATE OR REPLACE FUNCTION public.chat_stats_summary(p_days INT DEFAULT 30)
RETURNS TABLE (
  total_conversations BIGINT,
  total_messages BIGINT,
  conversations_today BIGINT,
  conversations_last_7d BIGINT,
  escalated_count BIGINT,
  lead_intent_count BIGINT,
  total_input_tokens BIGINT,
  total_output_tokens BIGINT,
  total_cache_read_tokens BIGINT,
  unique_visitors BIGINT,
  avg_messages_per_conv NUMERIC
) LANGUAGE sql STABLE SECURITY DEFINER AS $$
  WITH window_conv AS (
    SELECT * FROM public.chat_conversations
    WHERE created_at >= NOW() - (p_days || ' days')::INTERVAL
  )
  SELECT
    (SELECT COUNT(*) FROM window_conv),
    (SELECT COUNT(*) FROM public.chat_messages m
       WHERE m.conversation_id IN (SELECT id FROM window_conv)),
    (SELECT COUNT(*) FROM public.chat_conversations WHERE created_at >= CURRENT_DATE),
    (SELECT COUNT(*) FROM public.chat_conversations WHERE created_at >= NOW() - INTERVAL '7 days'),
    (SELECT COUNT(*) FROM window_conv WHERE escalated = TRUE),
    (SELECT COUNT(*) FROM window_conv WHERE has_lead_intent = TRUE),
    (SELECT COALESCE(SUM(total_input_tokens), 0) FROM window_conv),
    (SELECT COALESCE(SUM(total_output_tokens), 0) FROM window_conv),
    (SELECT COALESCE(SUM(total_cache_read_tokens), 0) FROM window_conv),
    (SELECT COUNT(DISTINCT ip_hash) FROM window_conv WHERE ip_hash IS NOT NULL),
    (SELECT ROUND(AVG(message_count), 1) FROM window_conv WHERE message_count > 0);
$$;

GRANT EXECUTE ON FUNCTION public.chat_stats_summary(INT) TO authenticated;

-- Daily counts for a small line chart in the panel.
-- Aggregates conversations and messages independently per-day, then joins —
-- this avoids the "ungrouped column in correlated subquery" error that
-- earlier per-row JOIN-style approaches hit under GROUP BY.
CREATE OR REPLACE FUNCTION public.chat_stats_daily(p_days INT DEFAULT 30)
RETURNS TABLE (
  day DATE,
  conversations BIGINT,
  messages BIGINT,
  escalated BIGINT,
  leads BIGINT
) LANGUAGE sql STABLE SECURITY DEFINER AS $$
  WITH conv_days AS (
    SELECT
      DATE_TRUNC('day', created_at)::DATE AS day,
      COUNT(*)::BIGINT AS conversations,
      SUM(CASE WHEN escalated THEN 1 ELSE 0 END)::BIGINT AS escalated,
      SUM(CASE WHEN has_lead_intent THEN 1 ELSE 0 END)::BIGINT AS leads
    FROM public.chat_conversations
    WHERE created_at >= NOW() - (p_days || ' days')::INTERVAL
    GROUP BY DATE_TRUNC('day', created_at)
  ),
  msg_days AS (
    SELECT
      DATE_TRUNC('day', created_at)::DATE AS day,
      COUNT(*)::BIGINT AS messages
    FROM public.chat_messages
    WHERE created_at >= NOW() - (p_days || ' days')::INTERVAL
    GROUP BY DATE_TRUNC('day', created_at)
  )
  SELECT
    cd.day,
    cd.conversations,
    COALESCE(md.messages, 0)::BIGINT AS messages,
    cd.escalated,
    cd.leads
  FROM conv_days cd
  LEFT JOIN msg_days md ON md.day = cd.day
  ORDER BY cd.day DESC;
$$;

GRANT EXECUTE ON FUNCTION public.chat_stats_daily(INT) TO authenticated;

-- Distribution by locale.
CREATE OR REPLACE FUNCTION public.chat_stats_by_locale(p_days INT DEFAULT 30)
RETURNS TABLE (
  locale TEXT,
  conversations BIGINT,
  messages BIGINT
) LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    c.locale,
    COUNT(*) AS conversations,
    SUM(c.message_count) AS messages
  FROM public.chat_conversations c
  WHERE c.created_at >= NOW() - (p_days || ' days')::INTERVAL
  GROUP BY c.locale
  ORDER BY conversations DESC;
$$;

GRANT EXECUTE ON FUNCTION public.chat_stats_by_locale(INT) TO authenticated;

-- Top topics (after AI summarisation has run).
CREATE OR REPLACE FUNCTION public.chat_stats_top_topics(p_days INT DEFAULT 30, p_limit INT DEFAULT 20)
RETURNS TABLE (
  topic TEXT,
  conversations BIGINT
) LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    COALESCE(NULLIF(ai_topic, ''), '— jeszcze nie zanalizowano —') AS topic,
    COUNT(*) AS conversations
  FROM public.chat_conversations
  WHERE created_at >= NOW() - (p_days || ' days')::INTERVAL
  GROUP BY COALESCE(NULLIF(ai_topic, ''), '— jeszcze nie zanalizowano —')
  ORDER BY conversations DESC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.chat_stats_top_topics(INT, INT) TO authenticated;

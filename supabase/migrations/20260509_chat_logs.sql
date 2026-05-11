-- ========================================
-- Chat-bot conversation logs.
--
-- Captures conversations from the on-site AI assistant (reefa.pl chat widget)
-- so super-admins can analyse:
--   • Most-asked questions  → blog topic ideas, FAQ updates
--   • Where users drop off  → UX friction
--   • Lead intent signals   → conversion optimisation
--   • Cost telemetry        → token usage by locale, model
--
-- Privacy (RODO):
--   • IP is hashed (truncated SHA-256) — never stored as plain text
--   • Conversations expire after 90 days via `expires_at` (cron deletes)
--   • Users can clear their session-id from localStorage; server-side
--     deletion endpoint is /api/chat/forget (TODO if needed)
-- ========================================

-- ── Conversations table ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.chat_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Stable id from the client's localStorage. New session = new row.
  session_id TEXT NOT NULL,
  locale TEXT NOT NULL,
  -- Truncated SHA-256 of (ip + daily_salt). Same IP same day → same hash;
  -- next day → different hash. Lets us count unique users without storing IP.
  ip_hash TEXT,
  user_agent TEXT,
  -- Page URL where the chat started (path only, no query params/PII).
  origin_path TEXT,
  -- Aggregates updated on each message — saves a JOIN at read time.
  message_count INT NOT NULL DEFAULT 0,
  total_input_tokens INT NOT NULL DEFAULT 0,
  total_output_tokens INT NOT NULL DEFAULT 0,
  total_cache_read_tokens INT NOT NULL DEFAULT 0,
  total_cache_write_tokens INT NOT NULL DEFAULT 0,
  -- Triggered-when-classified signals — set by the API route.
  escalated BOOLEAN NOT NULL DEFAULT FALSE,
  escalation_reason TEXT,
  has_lead_intent BOOLEAN NOT NULL DEFAULT FALSE,
  -- 90-day TTL — cron job deletes after expiry (see below).
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '90 days'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_conversations_session
  ON public.chat_conversations(session_id);
CREATE INDEX IF NOT EXISTS idx_chat_conversations_created
  ON public.chat_conversations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_conversations_expires
  ON public.chat_conversations(expires_at);
CREATE INDEX IF NOT EXISTS idx_chat_conversations_lead
  ON public.chat_conversations(has_lead_intent) WHERE has_lead_intent = TRUE;

-- ── Messages table ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'tool')),
  content TEXT NOT NULL,
  -- Token usage from Anthropic API response (assistant rows only).
  model TEXT,
  input_tokens INT,
  output_tokens INT,
  cache_read_tokens INT,
  cache_write_tokens INT,
  -- Tool calls Claude made during this turn (escalate_to_human, etc.)
  tool_use JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation
  ON public.chat_messages(conversation_id, created_at);

-- ── Row-Level Security ────────────────────────────────────────────
-- Inserts: anon role (the website API route uses the public anon key, so
--          we explicitly allow inserts there — read access is denied).
-- Reads:   super_admin only, through the panel.
ALTER TABLE public.chat_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS chat_conv_insert_anon ON public.chat_conversations;
CREATE POLICY chat_conv_insert_anon ON public.chat_conversations
  FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS chat_conv_update_anon ON public.chat_conversations;
CREATE POLICY chat_conv_update_anon ON public.chat_conversations
  FOR UPDATE TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS chat_conv_select_super_admin ON public.chat_conversations;
CREATE POLICY chat_conv_select_super_admin ON public.chat_conversations
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.admin_users WHERE id = auth.uid() AND role = 'super_admin'));

DROP POLICY IF EXISTS chat_msg_insert_anon ON public.chat_messages;
CREATE POLICY chat_msg_insert_anon ON public.chat_messages
  FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS chat_msg_select_super_admin ON public.chat_messages;
CREATE POLICY chat_msg_select_super_admin ON public.chat_messages
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.admin_users WHERE id = auth.uid() AND role = 'super_admin'));

-- ── Cleanup: drop expired conversations (cron) ────────────────────
-- Run this from a Supabase cron / Edge Function nightly. Cascades to messages.
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

COMMENT ON TABLE public.chat_conversations IS
  'Logs of conversations with the reefa.pl AI chat widget. 90-day TTL.';

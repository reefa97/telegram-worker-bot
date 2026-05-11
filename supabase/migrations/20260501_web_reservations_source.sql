-- ========================================
-- Web Reservations Integration
-- Adds source + metadata to crm_leads so reservations from external
-- websites (home.reefa.pl etc.) flow into the existing CRM pipeline.
-- ========================================

-- 1. Add source + metadata columns (idempotent)
ALTER TABLE public.crm_leads
  ADD COLUMN IF NOT EXISTS source TEXT,
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- 2. Index for filtering CRM by source (e.g. "show only web leads")
CREATE INDEX IF NOT EXISTS idx_crm_leads_source ON public.crm_leads(source);
CREATE INDEX IF NOT EXISTS idx_crm_leads_created_at_desc ON public.crm_leads(created_at DESC);

-- 3. Comment for documentation
COMMENT ON COLUMN public.crm_leads.source IS
  'Origin of the lead: e.g. ''home.reefa.pl'', ''reefa.pl'', ''manual'', ''email'', ''phone''.';
COMMENT ON COLUMN public.crm_leads.metadata IS
  'Structured data specific to the source. For web reservations: { service, service_label, price, calculator_state, address, note, frequency, date, time, ip, user_agent }.';

-- 4. RPC: count leads by source for the dashboard widget
CREATE OR REPLACE FUNCTION public.crm_leads_by_source(p_days INT DEFAULT 30)
RETURNS TABLE (source TEXT, count BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    COALESCE(source, 'unknown') AS source,
    COUNT(*)::BIGINT AS count
  FROM public.crm_leads
  WHERE created_at >= NOW() - (p_days || ' days')::INTERVAL
  GROUP BY 1
  ORDER BY 2 DESC;
$$;

GRANT EXECUTE ON FUNCTION public.crm_leads_by_source(INT) TO authenticated;

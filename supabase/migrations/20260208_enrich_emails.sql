-- Migration: Enrich Email Search Results with Social Links and AI metadata
-- Date: 2026-02-08

ALTER TABLE email_search_results 
ADD COLUMN IF NOT EXISTS facebook TEXT,
ADD COLUMN IF NOT EXISTS instagram TEXT,
ADD COLUMN IF NOT EXISTS twitter TEXT,
ADD COLUMN IF NOT EXISTS linkedin TEXT,
ADD COLUMN IF NOT EXISTS contact_page TEXT,
ADD COLUMN IF NOT EXISTS is_business_email BOOLEAN DEFAULT false;

COMMENT ON COLUMN email_search_results.is_business_email IS 'True if AI identified this as a primary business/contact email';

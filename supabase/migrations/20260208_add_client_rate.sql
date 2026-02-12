-- Migration: Add client_rate to cleaning_objects
-- Date: 2026-02-08

ALTER TABLE cleaning_objects 
ADD COLUMN IF NOT EXISTS client_rate NUMERIC(10, 2) DEFAULT 0;

-- Comment to explain the purpose
COMMENT ON COLUMN cleaning_objects.client_rate IS 'Amount paid by the client for this object (for internal earnings tracking)';

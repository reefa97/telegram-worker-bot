-- Add source_type column to email_search_results
ALTER TABLE email_search_results 
ADD COLUMN IF NOT EXISTS source_type TEXT DEFAULT 'organic';

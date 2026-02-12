-- Add unique constraint to prevent duplicate emails for the same job
ALTER TABLE email_search_results 
ADD CONSTRAINT unique_job_email UNIQUE (job_id, email);

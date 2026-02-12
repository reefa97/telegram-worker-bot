-- Migration: Schedule Late Shift Checks
-- Date: 2026-02-09
-- Description: Schedules the check-late-shifts Edge Function to run every 10 minutes to notify supervisors of late workers.

-- Enable necessary extensions (idempotent)
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Unschedules existing job if any (safe check)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'check-late-shifts') THEN
        PERFORM cron.unschedule('check-late-shifts');
    END IF;
END $$;

-- Schedule the new job
-- Runs every 10 minutes: */10 * * * *
select cron.schedule(
  'check-late-shifts',
  '*/10 * * * *',
  $$
  select
    net.http_post(
      url:='https://mxjfqszjpnlmagsikqfk.supabase.co/functions/v1/check-late-shifts',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im14amZxc3pqcG5sbWFnc2lrcWZrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDA3OTQ1MywiZXhwIjoyMDc5NjU1NDUzfQ.y1_di9f2XoltBuivaadOZQ7ZJfRMmifvQJIyjVzcrps"}'::jsonb,
      body:='{}'::jsonb
    ) as request_id;
  $$
);

-- Confirmation
select * from cron.job where jobname = 'check-late-shifts';

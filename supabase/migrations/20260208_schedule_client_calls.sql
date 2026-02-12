-- Migration: Schedule Client Call Reminders
-- Date: 2026-02-08

-- Enable necessary extensions
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Unschedules existing job if any (safe check)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'notify-client-calls-daily') THEN
        PERFORM cron.unschedule('notify-client-calls-daily');
    END IF;
END $$;

-- Schedule the new job
-- Runs every day at 09:00 AM UTC
select cron.schedule(
  'notify-client-calls-daily',
  '0 9 * * *',
  $$
  select
    net.http_post(
        url:='https://mxjfqszjpnlmagsikqfk.supabase.co/functions/v1/notify-client-calls',
        headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im14amZxc3pqcG5sbWFnc2lrcWZrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDA3OTQ1MywiZXhwIjoyMDc5NjU1NDUzfQ.y1_di9f2XoltBuivaadOZQ7ZJfRMmifvQJIyjVzcrps"}'::jsonb,
        body:='{}'::jsonb
    ) as request_id;
  $$
);

-- Register cron job to check for pending (ignored) client request tasks every 4 hours
SELECT cron.unschedule('check-pending-cr-tasks')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'check-pending-cr-tasks');

SELECT cron.schedule(
  'check-pending-cr-tasks',
  '0 */4 * * *',
  $$
  SELECT net.http_post(
    url := 'https://mxjfqszjpnlmagsikqfk.supabase.co/functions/v1/check-pending-cr-tasks',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im14amZxc3pqcG5sbWFnc2lrcWZrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDA3OTQ1MywiZXhwIjoyMDc5NjU1NDUzfQ.y1_di9f2XoltBuivaadOZQ7ZJfRMmifvQJIyjVzcrps"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

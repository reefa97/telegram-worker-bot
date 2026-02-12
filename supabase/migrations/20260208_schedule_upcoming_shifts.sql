-- Enable pg_cron if not enabled
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Schedule the job to run every 15 minutes
-- REPLACE <SERVICE_ROLE_KEY> with your service role key (settings -> API)

select
  cron.schedule(
    'notify-upcoming-shifts',
    '*/15 * * * *', -- Every 15 minutes
    $$
    select
      net.http_post(
        url:='https://mxjfqszjpnlmagsikqfk.supabase.co/functions/v1/notify-upcoming-shifts',
        headers:='{"Content-Type": "application/json", "Authorization": "Bearer <SERVICE_ROLE_KEY>"}'::jsonb
      ) as request_id;
    $$
  );

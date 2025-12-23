-- Enable necessary extensions
-- Эти расширения нужны для планировщика и отправки запросов
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Удаляем старую задачу, если она была (чтобы избежать дубликатов при повторном запуске)
select cron.unschedule('check-tasks-morning-evening');

-- Создаем новую задачу
-- Расписание: 0 8,20 * * * (в 8:00 и 20:00 каждый день по UTC)
select cron.schedule(
  'check-tasks-morning-evening',
  '0 8,20 * * *',
  $$
  select
    net.http_post(
        url:='https://mxjfqszjpnlmagsikqfk.supabase.co/functions/v1/check-tasks-cron',
        headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im14amZxc3pqcG5sbWFnc2lrcWZrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDA3OTQ1MywiZXhwIjoyMDc5NjU1NDUzfQ.y1_di9f2XoltBuivaadOZQ7ZJfRMmifvQJIyjVzcrps"}'::jsonb,
        body:='{}'::jsonb
    ) as request_id;
  $$
);

-- Проверка: показать список активных задач
select * from cron.job;

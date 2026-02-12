-- Check if table exists and has data
SELECT to_regclass('public.processed_updates');

-- Check count of processed updates
SELECT count(*) FROM processed_updates;

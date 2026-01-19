-- Drop the UNIQUE constraint on telegram_user_id to allow multiple worker records for the same Telegram User
-- Only if the constraint exists (Postgres usually names it workers_telegram_user_id_key)

DO $$ 
BEGIN 
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workers_telegram_user_id_key') THEN 
        ALTER TABLE workers DROP CONSTRAINT workers_telegram_user_id_key; 
    END IF; 
END $$;

-- Verify it's dropped (optional, mostly for manual checking)
-- duplicate telegram_user_id values will now be allowed.

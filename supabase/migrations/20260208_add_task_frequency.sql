-- Add frequency column to distinguish between weekly and monthly tasks
ALTER TABLE object_tasks
ADD COLUMN IF NOT EXISTS frequency TEXT DEFAULT 'weekly';

-- Update existing recurring tasks to be 'weekly' by default
UPDATE object_tasks
SET frequency = 'weekly'
WHERE is_recurring = true AND frequency IS NULL;

-- Update specific date tasks to have NULL frequency or 'specific_dates'
-- Let's keep is_recurring as the main flag, and use frequency for subtype of recurring.
-- If is_recurring is false, frequency is irrelevant (or can be null).

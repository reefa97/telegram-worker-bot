-- Remove salary fields from workers table
ALTER TABLE workers 
DROP COLUMN IF EXISTS salary_amount,
DROP COLUMN IF EXISTS salary_percentage;

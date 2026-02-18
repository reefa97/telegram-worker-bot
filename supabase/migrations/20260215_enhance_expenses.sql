-- Add reimbursement and receipt fields to admin_expenses
ALTER TABLE admin_expenses ADD COLUMN IF NOT EXISTS is_reimbursement BOOLEAN DEFAULT FALSE;
ALTER TABLE admin_expenses ADD COLUMN IF NOT EXISTS receipt_url TEXT;

-- Create storage bucket for receipts if it doesn't exist
-- Note: Supabase storage setup usually happens via dashboard or specific API, 
-- but we can ensure the bucket exists in our application logic or research if there's a SQL way.
-- For standard Supabase storage, it's managed via the `storage` schema.

INSERT INTO storage.buckets (id, name, public)
VALUES ('receipts', 'receipts', true)
ON CONFLICT (id) DO NOTHING;

-- RLS for storage.objects in 'receipts' bucket
-- Authenticated users can upload
CREATE POLICY "Allow authenticated uploads" ON storage.objects
FOR INSERT TO authenticated WITH CHECK (bucket_id = 'receipts');

-- All users (or public if bucket is public) can view
CREATE POLICY "Allow public view" ON storage.objects
FOR SELECT TO public USING (bucket_id = 'receipts');

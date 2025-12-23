-- Create storage bucket for shift photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('shift-photos', 'shift-photos', true)
ON CONFLICT (id) DO NOTHING;

-- Policy to allow authenticated users (workers) to upload photos
CREATE POLICY "Workers can upload photos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK ( bucket_id = 'shift-photos' );

-- Policy to allow public access to view photos (or at least authenticated)
CREATE POLICY "Public access to photos"
ON storage.objects FOR SELECT
TO public
USING ( bucket_id = 'shift-photos' );

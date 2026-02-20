-- ========================================
-- Quality Control: Photo Support Migration
-- ========================================

-- 1. Add photo_urls column to quality_check_items
ALTER TABLE quality_check_items
  ADD COLUMN IF NOT EXISTS photo_urls TEXT[] DEFAULT '{}';

-- 2. Create storage bucket for quality check photos
INSERT INTO storage.buckets (id, name, public)
  VALUES ('quality_checks', 'quality_checks', true)
  ON CONFLICT (id) DO NOTHING;

-- 3. Storage RLS policies (drop first to make re-runnable)

DROP POLICY IF EXISTS "Anyone can view quality photos" ON storage.objects;
CREATE POLICY "Anyone can view quality photos"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'quality_checks');

DROP POLICY IF EXISTS "Admins can upload quality photos" ON storage.objects;
CREATE POLICY "Admins can upload quality photos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'quality_checks'
    AND EXISTS (
      SELECT 1 FROM admin_users
      WHERE id = auth.uid()
      AND role IN ('super_admin', 'sub_admin')
    )
  );

DROP POLICY IF EXISTS "Admins can update quality photos" ON storage.objects;
CREATE POLICY "Admins can update quality photos"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'quality_checks'
    AND EXISTS (
      SELECT 1 FROM admin_users
      WHERE id = auth.uid()
      AND role IN ('super_admin', 'sub_admin')
    )
  );

DROP POLICY IF EXISTS "Admins can delete quality photos" ON storage.objects;
CREATE POLICY "Admins can delete quality photos"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'quality_checks'
    AND EXISTS (
      SELECT 1 FROM admin_users
      WHERE id = auth.uid()
      AND role IN ('super_admin', 'sub_admin')
    )
  );

-- ========================================
-- Storage RLS for the `procedures` bucket.
--
-- The bucket itself is `public: true` (created in 20260509_procedures.sql),
-- which means files can be FETCHED through the public URL without auth.
-- But Supabase still requires explicit RLS policies on `storage.objects`
-- for INSERT / UPDATE / DELETE — otherwise any upload returns
-- "new row violates row-level security policy".
--
-- Match the table-level pattern: super_admin writes, anyone-authenticated
-- reads through the API (public reads work without these policies because
-- the bucket is public).
-- ========================================

-- Allow super_admin to insert files into the procedures bucket.
DROP POLICY IF EXISTS proc_storage_insert_super_admin ON storage.objects;
CREATE POLICY proc_storage_insert_super_admin ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'procedures'
    AND EXISTS (
      SELECT 1 FROM public.admin_users
      WHERE id = auth.uid() AND role = 'super_admin'
    )
  );

-- Allow super_admin to update file metadata (e.g. moving, replacing).
DROP POLICY IF EXISTS proc_storage_update_super_admin ON storage.objects;
CREATE POLICY proc_storage_update_super_admin ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'procedures'
    AND EXISTS (
      SELECT 1 FROM public.admin_users
      WHERE id = auth.uid() AND role = 'super_admin'
    )
  )
  WITH CHECK (
    bucket_id = 'procedures'
    AND EXISTS (
      SELECT 1 FROM public.admin_users
      WHERE id = auth.uid() AND role = 'super_admin'
    )
  );

-- Allow super_admin to delete files when removing an attachment.
DROP POLICY IF EXISTS proc_storage_delete_super_admin ON storage.objects;
CREATE POLICY proc_storage_delete_super_admin ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'procedures'
    AND EXISTS (
      SELECT 1 FROM public.admin_users
      WHERE id = auth.uid() AND role = 'super_admin'
    )
  );

-- Authenticated select (admins viewing the panel). Public select via the
-- public URL also works because the bucket is `public: true`.
DROP POLICY IF EXISTS proc_storage_select_authenticated ON storage.objects;
CREATE POLICY proc_storage_select_authenticated ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'procedures');

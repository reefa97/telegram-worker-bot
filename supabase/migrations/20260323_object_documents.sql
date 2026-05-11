-- Table to track documents uploaded for cleaning objects
CREATE TABLE IF NOT EXISTS object_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    object_id UUID NOT NULL REFERENCES cleaning_objects(id) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_size INTEGER,
    uploaded_by UUID REFERENCES admin_users(id),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for fast lookup by object
CREATE INDEX IF NOT EXISTS idx_object_documents_object_id ON object_documents(object_id);

-- RLS policies
ALTER TABLE object_documents ENABLE ROW LEVEL SECURITY;

-- Admins can do everything
CREATE POLICY "Admins full access to object_documents"
ON object_documents FOR ALL
USING (true)
WITH CHECK (true);

-- Create storage bucket for object documents
INSERT INTO storage.buckets (id, name, public)
VALUES ('object-documents', 'object-documents', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies: allow authenticated users to upload/read/delete
CREATE POLICY "Authenticated users can upload object documents"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'object-documents');

CREATE POLICY "Anyone can read object documents"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'object-documents');

CREATE POLICY "Authenticated users can delete object documents"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'object-documents');

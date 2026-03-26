-- Email Tracking tables for offer open tracking

CREATE TABLE IF NOT EXISTS email_tracks (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    object_id uuid REFERENCES cleaning_objects(id) ON DELETE SET NULL,
    recipient_email varchar NOT NULL,
    subject varchar NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    notes text
);

CREATE TABLE IF NOT EXISTS email_opens (
    id bigserial PRIMARY KEY,
    track_id uuid NOT NULL REFERENCES email_tracks(id) ON DELETE CASCADE,
    opened_at timestamptz NOT NULL DEFAULT now(),
    ip varchar,
    user_agent text
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_email_tracks_created_by ON email_tracks(created_by);
CREATE INDEX IF NOT EXISTS idx_email_tracks_object_id ON email_tracks(object_id);
CREATE INDEX IF NOT EXISTS idx_email_opens_track_id ON email_opens(track_id);

-- RLS policies
ALTER TABLE email_tracks ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_opens ENABLE ROW LEVEL SECURITY;

-- email_tracks: users can only see/manage their own tracks
CREATE POLICY "email_tracks_select" ON email_tracks FOR SELECT TO authenticated
    USING (created_by = auth.uid());

CREATE POLICY "email_tracks_insert" ON email_tracks FOR INSERT TO authenticated
    WITH CHECK (created_by = auth.uid());

CREATE POLICY "email_tracks_delete" ON email_tracks FOR DELETE TO authenticated
    USING (created_by = auth.uid());

-- email_opens: authenticated users can see opens for their own tracks
CREATE POLICY "email_opens_select" ON email_opens FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM email_tracks WHERE email_tracks.id = email_opens.track_id AND email_tracks.created_by = auth.uid()
    ));

-- email_opens: public insert (for the tracking pixel endpoint using service_role)
-- No INSERT policy for authenticated — inserts are done via service_role in the Edge Function

-- Allow admins to view all requests
CREATE POLICY "Admins can view all requests" ON procurement_requests
    FOR SELECT
    USING (
        auth.uid() IN (SELECT id FROM admin_users)
    );

-- Allow admins to update requests (e.g. status)
CREATE POLICY "Admins can update requests" ON procurement_requests
    FOR UPDATE
    USING (
        auth.uid() IN (SELECT id FROM admin_users)
    );

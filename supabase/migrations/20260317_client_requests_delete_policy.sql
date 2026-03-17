-- Allow authenticated users (admins) to delete client requests
CREATE POLICY "Admins can delete requests" ON client_requests
FOR DELETE TO authenticated
USING (true);

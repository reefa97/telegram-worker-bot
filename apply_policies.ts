
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const sql = `
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
`;

console.log("Applying SQL policies...");

const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql });

if (error) {
    console.error("Error applying policies:", error);
} else {
    console.log("Policies applied successfully:", data);
}

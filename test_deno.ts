import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
);

async function check() {
    const { data, error } = await supabase
        .from('admin_users')
        .select('*')
        .eq('email', 'test@test.pl');

    console.log("admin_users check:", data, error);

    // Check if there is a trigger doing this. There is no direct REST endpoint for pg_trigger,
    // so we can use RPC if we create one, or we just trust the user's intuition 
    // that a trigger exists and look for where it was created in migrations.
}

check();

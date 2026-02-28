import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const supabaseUrl = Deno.env.get("VITE_SUPABASE_URL");
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
    const { data: res1, error: err1 } = await supabase.rpc('get_table_triggers', { tbl: 'email_search_jobs' });
    console.log("Triggers:", JSON.stringify(res1, null, 2));
}
check();

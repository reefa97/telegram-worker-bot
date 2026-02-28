import postgres from 'https://deno.land/x/postgresjs@v3.4.4/mod.js';

// We need a direct connection string to query Postgres.
// We only have Supabase URL and keys.
// Supabase REST APIs don't easily allow arbitrary SELECTs over system tables without RPC functions.
// Let's create a better RPC function that RETURNS JSONB.

const supabaseUrl = Deno.env.get("VITE_SUPABASE_URL");
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkTriggers() {
    const fn_sql = `
    CREATE OR REPLACE FUNCTION get_table_triggers(tbl text)
    RETURNS JSONB AS $$
    DECLARE
        result JSONB;
    BEGIN
        SELECT jsonb_agg(
            jsonb_build_object(
                'trigger_name', t.tgname,
                'function_name', p.proname,
                'trigger_def', pg_get_triggerdef(t.oid),
                'function_body', p.prosrc
            )
        ) INTO result
        FROM pg_trigger t
        JOIN pg_class c ON t.tgrelid = c.oid
        JOIN pg_proc p ON t.tgfoid = p.oid
        WHERE c.relname = tbl AND t.tgisinternal = false;
        
        RETURN COALESCE(result, '[]'::jsonb);
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER;
    `;

    console.log("Creating RPC...");
    const { error: err1 } = await supabase.rpc('exec_sql', { sql_query: fn_sql });
    console.log("RPC Create Error:", err1);

    console.log("\nCalling get_table_triggers('workers')...");
    const { data: res1, error: err2 } = await supabase.rpc('get_table_triggers', { tbl: 'workers' });
    console.log("Result for workers:", JSON.stringify(res1, null, 2));
    if (err2) console.log("Error:", err2);

    console.log("\nCalling get_table_triggers('worker_objects')...");
    const { data: res2, error: err3 } = await supabase.rpc('get_table_triggers', { tbl: 'worker_objects' });
    console.log("Result for worker_objects:", JSON.stringify(res2, null, 2));
    if (err3) console.log("Error:", err3);
}

checkTriggers();

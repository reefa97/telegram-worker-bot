import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
    const { data: res1, error: err1 } = await supabase.rpc('get_table_triggers', { tbl: 'email_search_jobs' });
    console.log("Triggers:", res1);
}
check();

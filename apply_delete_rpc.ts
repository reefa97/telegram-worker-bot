import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envFile = fs.readFileSync('.env', 'utf8');
const env: { [key: string]: string } = {};
envFile.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match && !line.startsWith('#')) {
        env[match[1]] = match[2].replace(/["']/g, '');
    }
});

const supabase = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function apply() {
    console.log("Applying delete_quality_check RPC...");
    const sql = fs.readFileSync('supabase/migrations/20260221_delete_qc_check.sql', 'utf8');
    const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql });

    if (error) {
        console.error("Error applying RPC:", error);
    } else {
        console.log("RPC applied successfully.");
    }
}

apply();

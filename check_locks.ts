import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envFile = fs.readFileSync('.env', 'utf8');
const env: { [key: string]: string } = {};
envFile.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match && !line.startsWith('#')) {
        env[match[1]] = match[2].trim().replace(/["']/g, '');
    }
});

const supabase = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
    console.log("Checking for active queries and locks...");
    const query = `
    SELECT pid, state, query, wait_event_type, wait_event, state_change 
    FROM pg_stat_activity 
    WHERE state != 'idle' AND pid != pg_backend_pid();
  `;
    const { data, error } = await supabase.rpc('exec_sql', { sql_query: query });

    if (error) {
        console.error("Error executing query:", error);
    } else {
        console.log("Active Queries:", JSON.stringify(data, null, 2));
    }
}

run();

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
async function check() {
  const { data, error } = await supabase.rpc('exec_sql', {
    sql_query: "SELECT polname, polcmd, polqual, polwithcheck FROM pg_policy WHERE polrelid = 'admin_users'::regclass;"
  });
  if (error) console.log("Error:", error);
  else console.dir(data, { depth: null });
}
check();

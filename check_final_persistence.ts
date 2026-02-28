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
  console.log("Checking for checks created in the last 30 minutes...");
  const thirtyMinsAgo = new Date(Date.now() - 30 * 60000).toISOString();
  
  const { data, error } = await supabase
    .from('quality_checks')
    .select('*, cleaning_objects(name), admin_users(name)')
    .gt('created_at', thirtyMinsAgo)
    .order('created_at', { ascending: false });

  if (error) console.error("Error:", error);
  else console.log("Recent checks:", JSON.stringify(data, null, 2));
}
run();

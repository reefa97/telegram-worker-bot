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

async function check() {
  const { data: checks } = await supabase.from('quality_checks').select('*').limit(5);
  console.log("Checks samples:", JSON.stringify(checks, null, 2));
  
  const { data: objects } = await supabase.from('cleaning_objects').select('id, name').limit(10);
  console.log("Objects samples:", JSON.stringify(objects, null, 2));

  const { data: admins } = await supabase.from('admin_users').select('id, email, name').limit(10);
  console.log("Admins samples:", JSON.stringify(admins, null, 2));
}
check();

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const envFile = fs.readFileSync('.env', 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match && !line.startsWith('#')) {
        env[match[1]] = match[2].trim().replace(/["']/g, '');
    }
});
const supabase = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
async function run() {
  const { data: admins } = await supabase.from('admin_users').select('*');
  process.stdout.write("ADMINS_DATA:" + JSON.stringify(admins) + "\n");
}
run();

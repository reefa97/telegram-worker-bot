const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('.env', 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match && !line.startsWith('#')) {
        env[match[1]] = match[2].replace(/["']/g, '');
    }
});

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
  const { data, error } = await supabase.from('cleaning_objects').select('*').limit(1);
  if (data && data.length > 0) {
    console.log("Keys in cleaning_objects:", Object.keys(data[0]));
  } else {
    console.log("No data or error:", error);
  }
}
check();

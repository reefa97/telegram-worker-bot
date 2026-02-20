import fs from 'fs';

// Read .env file directly
const envFile = fs.readFileSync('.env', 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
        env[match[1]] = match[2];
    }
});

const SUPABASE_URL = env.SUPABASE_URL;
const SUPABASE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

async function run() {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/admin_users?email=eq.test@test.pl`, {
        headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`
        }
    });

    const data = await res.json();
    console.log("admin_users containing test@test.pl:");
    console.log(JSON.stringify(data, null, 2));
}

run();

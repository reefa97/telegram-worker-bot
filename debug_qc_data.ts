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
    console.log("--- ADMIN USERS ---");
    const { data: admins } = await supabase.from('admin_users').select('id, email, name, role');
    console.log(JSON.stringify(admins, null, 2));

    console.log("\n--- CLEANING OBJECTS ---");
    // Assuming there might be a manager_id or similar in cleaning_objects
    const { data: objects } = await supabase.from('cleaning_objects').select('*').limit(5);
    console.log(JSON.stringify(objects, null, 2));

    console.log("\n--- RECENT QUALITY CHECKS ---");
    const { data: checks } = await supabase.from('quality_checks')
        .select('*, cleaning_objects(name), admin_users(name, email)')
        .order('created_at', { ascending: false })
        .limit(5);
    console.log(JSON.stringify(checks, null, 2));
}
check();

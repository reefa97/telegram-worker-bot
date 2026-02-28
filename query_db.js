import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

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

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function run() {
    const { data } = await supabase
        .from('client_objects')
        .select(`
            object_id,
            cleaning_objects(id, name)
        `)
        .limit(2);

    console.log(JSON.stringify(data, null, 2));
}

run();

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const envFile = fs.readFileSync('.env.local', 'utf-8');
const env = {};
envFile.split('\n').forEach(line => {
    const [key, ...val] = line.split('=');
    if (key && val) env[key] = val.join('=').trim();
});

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

async function check() {
    // 1. check if there's any trigger on workers
    // (We might need postgres connection to check triggers, but we can just check if an empty insert creates a worker_objects)
    
    const { data: objects } = await supabase.from('cleaning_objects').select('id, name');
    console.log('Objects count:', objects?.length);
    console.log('Unique objects count:', new Set(objects?.map(o => o.id)).size);

    // try inserting a dummy worker
    const token = 'dummy_' + Date.now();
    const { data: newWorker, error: wErr } = await supabase.from('workers').insert({
        first_name: 'Dummy',
        last_name: 'Test',
        phone_number: '1234567890',
        invitation_token: token,
    }).select().single();

    if (wErr) {
        console.error('Error inserting worker:', wErr);
        return;
    }

    console.log('Inserted dummy worker:', newWorker.id);

    // check if it has any worker_objects already!
    const { data: wo, error: woErr } = await supabase.from('worker_objects').select('*').eq('worker_id', newWorker.id);
    console.log('Worker objects created automatically?:', wo);
    
    // clean up
    await supabase.rpc('soft_delete_worker', { worker_id: newWorker.id });
}

check();

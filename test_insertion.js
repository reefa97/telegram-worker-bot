import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
const envFile = fs.readFileSync('.env', 'utf-8');
const env = {};
envFile.split('\n').forEach(line => {
    const [key, ...val] = line.split('=');
    if (key && val) env[key] = val.join('=').trim();
});
const supabaseUrl = env.VITE_SUPABASE_URL;
const supabaseServiceKey = env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseServiceKey);
async function run() {
    // 1. Create a dummy worker
    const token = 'formtest_' + Date.now();
    const w = await supabase.from('workers').insert({
        first_name: 'Form', last_name: 'Test', phone_number: '555', invitation_token: token
    }).select().single();
    
    // Simulate what the UI exactly does!
    // The UI does this:
    let formData_selectedObjects = []; // Assume user checked two objects
    const objs = await supabase.from('cleaning_objects').select('id').limit(2);
    formData_selectedObjects.push(objs.data[0].id);
    formData_selectedObjects.push(objs.data[0].id); // Simulated double check
    
    console.log('Simulated double click state:', formData_selectedObjects);
    const uniqueObjectIds = Array.from(new Set(formData_selectedObjects.filter(Boolean)));
    const workerObjects = uniqueObjectIds.map(objId => ({
        worker_id: w.data.id,
        object_id: objId,
    }));
    
    console.log('Sending this array to worker_objects:', workerObjects);
    const { error: woError } = await supabase.from('worker_objects').insert(workerObjects);
    console.log('Insert Error:', woError);
    
    await supabase.from('workers').delete().eq('id', w.data.id);
}
run();

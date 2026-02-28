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

async function test() {
    console.log("--- STARTING END-TO-END QC DELETION TEST ---");

    // 1. Get test data IDs
    const { data: object } = await supabase.from('cleaning_objects').select('id').limit(1).single();
    const { data: admin } = await supabase.from('admin_users').select('id').limit(1).single();
    const { data: worker } = await supabase.from('workers').select('id, total_points').limit(1).single();

    if (!object || !admin || !worker) {
        console.error("Missing baseline data for test.");
        return;
    }

    const initialPoints = worker.total_points;
    console.log(`Worker initial points: ${initialPoints}`);

    // 2. Insert Check
    const { data: check, error: checkErr } = await supabase.from('quality_checks').insert({
        object_id: object.id,
        manager_id: admin.id,
        score_percentage: 100,
        notes: 'TEST CHECK FOR DELETION'
    }).select('id').single();

    if (checkErr) throw checkErr;
    console.log(`Inserted check: ${check.id}`);

    // 3. Award Points
    const pointsChange = 10;
    console.log(`Awarding ${pointsChange} points...`);

    // Award points to worker
    await supabase.from('workers').update({ total_points: initialPoints + pointsChange }).eq('id', worker.id);

    // Log the change
    await supabase.from('worker_points_log').insert({
        worker_id: worker.id,
        check_id: check.id,
        points_change: pointsChange,
        reason: 'Test award'
    });

    // Verify award
    const { data: workerAfterAward } = await supabase.from('workers').select('total_points').eq('id', worker.id).single();
    console.log(`Worker points after award: ${workerAfterAward.total_points}`);

    // 4. Run DELETION RPC
    console.log("Calling delete_quality_check RPC...");
    const { error: rpcErr } = await supabase.rpc('delete_quality_check', { p_check_id: check.id });
    if (rpcErr) throw rpcErr;

    // 5. FINAL VERIFICATION
    const { data: workerFinal } = await supabase.from('workers').select('total_points').eq('id', worker.id).single();
    console.log(`Worker points after deletion: ${workerFinal.total_points}`);

    if (workerFinal.total_points === initialPoints) {
        console.log("✅ SUCCESS: Points reversed to initial state.");
    } else {
        console.log(`❌ FAILURE: Expected ${initialPoints}, but got ${workerFinal.total_points}`);
    }

    const { data: checkFinal } = await supabase.from('quality_checks').select('id').eq('id', check.id).single();
    if (!checkFinal) {
        console.log("✅ SUCCESS: Check was deleted.");
    } else {
        console.log("❌ FAILURE: Check still exists.");
    }
}

test().catch(console.error);

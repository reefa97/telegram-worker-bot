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
    console.log("--- STARTING QC DELETION TEST ---");

    // 1. Find a worker and a check that awarded points
    const { data: logEntry } = await supabase.from('worker_points_log')
        .select('worker_id, check_id, points_change')
        .not('check_id', 'is', null)
        .limit(1)
        .single();

    if (!logEntry) {
        console.log("No checks with points found to test. Skipping reversal test.");
        return;
    }

    const { worker_id, check_id, points_change } = logEntry;
    console.log(`Found check ${check_id} with ${points_change} points for worker ${worker_id}`);

    // 2. Get current points of the worker
    const { data: workerBefore } = await supabase.from('workers').select('total_points').eq('id', worker_id).single();
    console.log(`Worker points before deletion: ${workerBefore.total_points}`);

    // 3. Delete the check via RPC
    console.log("Deleting check via RPC...");
    const { error } = await supabase.rpc('delete_quality_check', { p_check_id: check_id });
    if (error) {
        console.error("RPC Error:", error);
        return;
    }

    // 4. Verify points reversal
    const { data: workerAfter } = await supabase.from('workers').select('total_points').eq('id', worker_id).single();
    console.log(`Worker points after deletion: ${workerAfter.total_points}`);

    const expectedPoints = Math.max(0, workerBefore.total_points - points_change);
    if (workerAfter.total_points === expectedPoints) {
        console.log("✅ SUCCESS: Points reversed correctly.");
    } else {
        console.log(`❌ FAILURE: Expected ${expectedPoints} points, but got ${workerAfter.total_points}`);
    }

    // 5. Verify check is gone
    const { data: checkCheck } = await supabase.from('quality_checks').select('id').eq('id', check_id).single();
    if (!checkCheck) {
        console.log("✅ SUCCESS: Check was deleted.");
    } else {
        console.log("❌ FAILURE: Check still exists.");
    }
}

test();

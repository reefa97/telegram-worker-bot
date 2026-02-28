import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
    // Get all client_objects to see their structure
    const { data, error } = await supabase
        .from('client_objects')
        .select(`
            object_id,
            cleaning_objects (
                id,
                name
            )
        `)
        .limit(1);

    console.log(JSON.stringify(data, null, 2));
}

run();

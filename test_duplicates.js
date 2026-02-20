import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
    const email = 'test@test.pl';
    const { data: adminUsers, error } = await supabase
        .from('admin_users')
        .select('*')
        .eq('email', email);

    console.log("Duplicate checks for 'test@test.pl':");
    console.log(adminUsers);
}

run();

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkTriggers() {
    // We can query pg_trigger through an RPC or we can just fetch admin_users to see if there are duplicates
    const { data: duplicates, error } = await supabase
        .from('admin_users')
        .select('email, role')
        .eq('email', 'test@test.pl');
        
    console.log(duplicates);
}

checkTriggers();

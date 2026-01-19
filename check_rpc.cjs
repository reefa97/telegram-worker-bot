const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://mxjfqszjpnlmagsikqfk.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im14amZxc3pqcG5sbWFnc2lrcWZrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDA3OTQ1MywiZXhwIjoyMDc5NjU1NDUzfQ.y1_di9f2XoltBuivaadOZQ7ZJfRMmifvQJIyjVzcrps';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkRpc() {
    console.log('Testing exec RPC...');
    const { data, error } = await supabase.rpc('exec', { query: 'SELECT 1' });

    if (error) {
        console.error('Error calling exec:', error);

        console.log('Testing exec_sql RPC...');
        const { data: data2, error: error2 } = await supabase.rpc('exec_sql', { sql_query: 'SELECT 1' });

        if (error2) {
            console.error('Error calling exec_sql:', error2);
        } else {
            console.log('exec_sql is available!');
        }
    } else {
        console.log('exec is available!');
    }
}

checkRpc();

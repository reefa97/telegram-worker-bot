require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data, error } = await supabase.rpc('exec_sql', {
    sql: `SELECT policyname, permissive, roles, cmd, qual, with_check 
          FROM pg_policies WHERE tablename = 'quality_checks';`
  });
  console.log("Policies for quality_checks:", JSON.stringify(data, null, 2));
}
check();

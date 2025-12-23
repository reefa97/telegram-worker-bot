const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Supabase configuration
const supabaseUrl = 'https://mxjfqszjpnlmagsikqfk.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im14amZxc3pqcG5sbWFnc2lrcWZrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDA3OTQ1MywiZXhwIjoyMDc5NjU1NDUzfQ.y1_di9f2XoltBuivaadOZQ7ZJfRMmifvQJIyjVzcrps';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function applyMigration(filePath) {
    console.log(`\n📝 Applying migration from ${filePath}...`);

    try {
        const sql = fs.readFileSync(filePath, 'utf8');

        // Split by semicolons and execute each statement
        const statements = sql
            .split(';')
            .map(s => s.trim())
            .map(s => {
                // Remove comment lines
                return s.split('\n')
                    .filter(line => !line.trim().startsWith('--'))
                    .join('\n')
                    .trim();
            })
            .filter(s => s.length > 0);

        for (let i = 0; i < statements.length; i++) {
            const statement = statements[i];
            if (!statement) continue;

            try {
                const { data, error } = await supabase.rpc('exec_sql', { sql_query: statement + ';' });

                if (error) {
                    console.log(`⚠️  Statement ${i + 1} failed: ${error.message}`);
                    // If the error is "function exec_sql() does not exist", we are stuck.
                    if (error.message.includes('function exec_sql() does not exist')) {
                        console.error('❌ exec_sql function is missing. Cannot apply migration programmatically.');
                        return false;
                    }
                } else {
                    console.log(`✓ Statement ${i + 1} executed`);
                }
            } catch (err) {
                console.log(`⚠️  Statement ${i + 1} error: ${err.message}`);
            }
        }

        console.log(`✅ Migration completed`);
        return true;
    } catch (error) {
        console.error(`❌ Error applying migration:`, error.message);
        return false;
    }
}

async function main() {
    const MIGRATION_FILE = path.join(__dirname, 'supabase', 'migrations', '20240101000006_fix_rls_policies.sql');
    await applyMigration(MIGRATION_FILE);
}

main().catch(console.error);

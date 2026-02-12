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
        // Note: This simple splitting might break on complex PL/pgSQL with semicolons inside strings.
        // But for this simple cron schedule migration, it should be fine.
        // Actually, the migration uses $$ quoting, so we should be careful.
        // Better to send the whole thing if the RPC supports it, OR just split carefully.
        // The previous script split by ';'.
        // Let's try to send the whole block if possible, or use the previous logic but improving it?
        // Actually, the previous logic was:
        /*
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
        */
        // The cron.schedule command is one statement ending in ; 
        // The DO $$ block also ends in ;
        // So splitting by ; at the end of lines should work if formatted correctly.

        // Let's just try to execute the whole file content in one go if `exec_sql` supports multiple statements.
        // Usually it does not.
        // So let's stick to the user's pattern but maybe be careful.

        const statements = sql
            .split(';')
            .map(s => s.trim())
            .filter(s => s.length > 0);

        for (let i = 0; i < statements.length; i++) {
            const statement = statements[i];
            // Basic cleanup of comments
            const cleanStatement = statement.split('\n').filter(l => !l.trim().startsWith('--')).join('\n').trim();

            if (!cleanStatement) continue;

            try {
                // Try to use exec_sql RPC
                const { data, error } = await supabase.rpc('exec_sql', { sql_query: cleanStatement });

                if (error) {
                    console.error(`⚠️  Statement ${i + 1} failed: ${error.message}`);
                    console.error(`Statement: ${cleanStatement}`);
                } else {
                    console.log(`✓ Statement ${i + 1} executed`);
                }
            } catch (err) {
                console.error(`⚠️  Statement ${i + 1} error: ${err.message}`);
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
    const MIGRATION_FILE = path.join(__dirname, 'supabase', 'migrations', 'SCHEDULE_LATE_SHIFTS.sql');
    await applyMigration(MIGRATION_FILE);
}

main().catch(console.error);

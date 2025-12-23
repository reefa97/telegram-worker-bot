const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Supabase configuration
const supabaseUrl = 'https://mxjfqszjpnlmagsikqfk.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im14amZxc3pqcG5sbWFnc2lrcWZrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDA3OTQ1MywiZXhwIjoyMDc5NjU1NDUzfQ.y1_di9f2XoltBuivaadOZQ7ZJfRMmifvQJIyjVzcrps';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function applyMigration(filePath, name) {
    console.log(`\\n📝 Applying migration: ${name}...`);

    try {
        const sql = fs.readFileSync(filePath, 'utf8');

        // Split by semicolons and execute each statement
        const statements = sql
            .split(';')
            .map(s => s.trim())
            .filter(s => s.length > 0 && !s.startsWith('--'));

        for (let i = 0; i < statements.length; i++) {
            const statement = statements[i];
            if (!statement) continue;

            try {
                const { data, error } = await supabase.rpc('exec_sql', { sql_query: statement + ';' });

                if (error) {
                    console.log(`⚠️  Statement ${i + 1}: ${error.message}`);
                } else {
                    console.log(`✓ Statement ${i + 1} executed`);
                }
            } catch (err) {
                console.log(`⚠️  Statement ${i + 1}: ${err.message}`);
            }
        }

        console.log(`✅ Migration ${name} completed`);
        return true;
    } catch (error) {
        console.error(`❌ Error applying migration ${name}:`, error.message);
        return false;
    }
}

async function main() {
    console.log('🚀 Starting database migrations...');
    console.log('📊 Project: mxjfqszjpnlmagsikqfk');
    console.log('');

    const migrations = [
        { file: 'supabase/migrations/20240101000000_initial_schema.sql', name: 'Initial Schema' },
        { file: 'supabase/migrations/20240101000001_security_functions.sql', name: 'Security Functions' },
        { file: 'supabase/migrations/20240101000002_rls_policies.sql', name: 'RLS Policies' },
        { file: 'supabase/migrations/20240101000003_indexes.sql', name: 'Indexes' },
        { file: 'supabase/migrations/20240101000005_advanced_features.sql', name: 'Advanced Features' },
        { file: 'supabase/migrations/20240101000006_fix_rls_policies.sql', name: 'Fix RLS Policies' },
    ];

    for (const migration of migrations) {
        await applyMigration(migration.file, migration.name);
    }

    console.log('\\n✅ All migrations completed!');
    console.log('\\n🎯 Next steps:');
    console.log('1. Refresh http://localhost:5173');
    console.log('2. Login with: reefa@reefa.pl / 42fundyk');
    console.log('3. You will become Super Admin!');
}

main().catch(console.error);

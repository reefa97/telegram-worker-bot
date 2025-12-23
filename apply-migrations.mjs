import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

// Supabase configuration
const supabaseUrl = 'https://mxjfqszjpnlmagsikqfk.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im14amZxc3pqcG5sbWFnc2lrcWZrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDA3OTQ1MywiZXhwIjoyMDc5NjU1NDUzfQ.y1_di9f2XoltBuivaadOZQ7ZJfRMmifvQJIyjVzcrps';

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
        persistSession: false,
        autoRefreshToken: false
    }
});

async function executeSqlDirect(sql) {
    try {
        // Use direct PostgreSQL REST API
        const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec`, {
            method: 'POST',
            headers: {
                'apikey': supabaseServiceKey,
                'Authorization': `Bearer ${supabaseServiceKey}`,
                'Content-Type': 'application/json',
                'Prefer': 'return=minimal'
            },
            body: JSON.stringify({ query: sql })
        });

        return { success: !response.error, error: response.error };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

async function applyMigration(filePath, name) {
    console.log(`\n📝 Applying migration: ${name}...`);

    try {
        const sql = fs.readFileSync(filePath, 'utf8');
        console.log(`   Reading ${filePath}`);
        console.log(`   SQL length: ${sql.length} characters`);

        // Try to execute the entire migration at once using pg-meta endpoints
        const response = await fetch(`${supabaseUrl}/pg/migrations`, {
            method: 'POST',
            headers: {
                'apikey': supabaseServiceKey,
                'Authorization': `Bearer ${supabaseServiceKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ sql })
        });

        if (response.ok) {
            console.log(`✅ Migration ${name} applied successfully`);
            return true;
        } else {
            console.log(`⚠️  API response: ${response.status} - trying alternative method...`);

            // Alternative: Save migration and suggest manual application
            const outputFile = `/tmp/migration_${Date.now()}.sql`;
            fs.writeFileSync(outputFile, sql);
            console.log(`   Saved to: ${outputFile}`);
            return false;
        }
    } catch (error) {
        console.error(`❌ Error:`, error.message);
        return false;
    }
}

async function main() {
    console.log('🚀 Starting database migrations...');
    console.log('📊 Project: mxjfqszjpnlmagsikqfk\n');

    const migrations = [
        { file: 'supabase/migrations/20240101000000_initial_schema.sql', name: 'Initial Schema' },
        { file: 'supabase/migrations/20240101000001_security_functions.sql', name: 'Security Functions' },
        { file: 'supabase/migrations/20240101000002_rls_policies.sql', name: 'RLS Policies' },
        { file: 'supabase/migrations/20240101000003_indexes.sql', name: 'Indexes' },
    ];

    let allSuccessful = true;

    for (const migration of migrations) {
        const success = await applyMigration(migration.file, migration.name);
        if (!success) allSuccessful = false;
    }

    if (allSuccessful) {
        console.log('\n✅ All migrations completed successfully!');
        console.log('\n🎯 Next steps:');
        console.log('1. Refresh http://localhost:5173');
        console.log('2. Login with: reefa@reefa.pl / 42fundyk');
        console.log('3. You will become Super Admin!');
    } else {
        console.log('\n⚠️  Could not apply migrations via API');
        console.log('\n📋 Please apply migrations manually:');
        console.log('1. Open: https://supabase.com/dashboard/project/mxjfqszjpnlmagsikqfk/sql');
        console.log('2. Copy content from each migration file');
        console.log('3. Paste and run in SQL Editor');
    }
}

main().catch(console.error);

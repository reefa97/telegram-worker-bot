import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

// Supabase configuration
const supabaseUrl = 'https://mxjfqszjpnlmagsikqfk.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im14amZxc3pqcG5sbWFnc2lrcWZrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDA3OTQ1MywiZXhwIjoyMDc5NjU1NDUzfQ.y1_di9f2XoltBuivaadOZQ7ZJfRMmifvQJIyjVzcrps';

async function applyMigration() {
    console.log('🚀 Applying ADMIN_USERS_MIGRATION.sql...');

    try {
        const sql = fs.readFileSync('ADMIN_USERS_MIGRATION.sql', 'utf8');

        // Use direct PostgreSQL REST API via Supabase SQL execution endpoint if available, but usually we use the management API or PG connection.
        // However, the existing apply-migrations.mjs tried to use /pg/migrations which might not work on all projects or requires specific setup.
        // Let's try the /rest/v1/rpc/exec approach if a stored procedure exists, but likely it doesn't.

        // Actually, let's just use the Supabase JS client to call a function if we had one for SQL, but we don't.
        // Wait, the previous script tried `fetch(`${supabaseUrl}/rest/v1/rpc/exec`...` which implies there might be an `exec` RPC function?
        // Let's try to check if we can run it.

        // If we can't run SQL directly from here easily without psql, the best way for the user is to run it in the Dashboard.
        // BUT, I can try to use the 'postgres' package if I could install it, but I can't.

        // Let's try the exact same method as apply-migrations.mjs's "executeSqlDirect" if it works?
        // No, that function assumes an `exec` function exists in the DB.

        // Let's try to simply read the file and print instructions for the user if we can't run it.
        // OR, since I have the `supabase` CLI installed (implied by `npx supabase functions deploy`), I can use `npx supabase db reset` logic? No that deletes data.

        // Wait, `npx supabase db push`?
        // The user seems to be using a remote project.

        // Actually, the `apply-migrations.mjs` script in the project suggests they rely on it.
        // Let's try to run `apply-migrations.mjs` but pointing to my new file.

        // I will write this script to attempt the API call method used in `apply-migrations.mjs`.

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
            console.log('✅ Migration applied successfully!');
            return true;
        } else {
            console.error('❌ Failed to apply migration via API:', await response.text());
            return false;
        }
    } catch (error) {
        console.error('❌ Error:', error);
        return false;
    }
}

applyMigration();

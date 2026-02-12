const fs = require('fs');
const path = require('path');

// Supabase configuration
const supabaseUrl = 'https://mxjfqszjpnlmagsikqfk.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im14amZxc3pqcG5sbWFnc2lrcWZrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDA3OTQ1MywiZXhwIjoyMDc5NjU1NDUzfQ.y1_di9f2XoltBuivaadOZQ7ZJfRMmifvQJIyjVzcrps';

async function applyMigration(filePath) {
    console.log(`\n📝 Applying migration from ${filePath}...`);

    try {
        const sql = fs.readFileSync(filePath, 'utf8');

        // Use the pg/migrations endpoint common in some Supabase setups or the management API if available.
        // Based on previous successful scripts in this project (apply-migrations.mjs).
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
            console.log(`✅ Migration applied successfully!`);
            return true;
        } else {
            const text = await response.text();
            console.error(`❌ Failed to apply via API. Status: ${response.status}`);
            console.error(`Response: ${text}`);
            return false;
        }
    } catch (error) {
        console.error(`❌ Error executing script:`, error.message);
        return false;
    }
}

async function main() {
    const MIGRATION_FILE = path.join(__dirname, 'supabase', 'migrations', '20260207_email_search_admin_schema.sql');
    await applyMigration(MIGRATION_FILE);
}

main().catch(console.error);

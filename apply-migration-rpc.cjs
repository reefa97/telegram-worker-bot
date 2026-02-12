const fs = require('fs');
const path = require('path');

const supabaseUrl = 'https://mxjfqszjpnlmagsikqfk.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im14amZxc3pqcG5sbWFnc2lrcWZrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDA3OTQ1MywiZXhwIjoyMDc5NjU1NDUzfQ.y1_di9f2XoltBuivaadOZQ7ZJfRMmifvQJIyjVzcrps';

async function applyMigration(filePath) {
    console.log(`\n📝 Applying migration from ${filePath}...`);
    const sql = fs.readFileSync(filePath, 'utf8');

    try {
        const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
            method: 'POST',
            headers: {
                'apikey': supabaseServiceKey,
                'Authorization': `Bearer ${supabaseServiceKey}`,
                'Content-Type': 'application/json',
                'Prefer': 'params=single-object'
            },
            body: JSON.stringify({ sql_query: sql })
        });

        if (response.ok) {
            console.log(`✅ Migration applied successfully!`);
            return true;
        } else {
            const error = await response.json();
            console.error(`❌ Failed to apply. Status: ${response.status}`);
            console.error(`Error:`, JSON.stringify(error, null, 2));
            return false;
        }
    } catch (err) {
        console.error(`❌ Fetch error:`, err.message);
        return false;
    }
}

const migrationFile = process.argv[2];
if (!migrationFile) {
    console.error('Please provide a migration file path.');
    process.exit(1);
}

applyMigration(path.resolve(migrationFile));

const fs = require('fs');
const path = require('path');

// Supabase configuration
const supabaseUrl = 'https://mxjfqszjpnlmagsikqfk.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im14amZxc3pqcG5sbWFnc2lrcWZrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDA3OTQ1MywiZXhwIjoyMDc5NjU1NDUzfQ.y1_di9f2XoltBuivaadOZQ7ZJfRMmifvQJIyjVzcrps';

async function applyMigration(filePath) {
    console.log(`\n📝 Applying migration from ${filePath}...`);

    try {
        const sql = fs.readFileSync(filePath, 'utf8');

        // Try to execute the entire migration at once using pg-meta endpoints
        // This endpoint requires the service_role key
        const response = await fetch(`${supabaseUrl}/pg/migrations`, {
            method: 'POST',
            headers: {
                'apikey': supabaseServiceKey,
                'Authorization': `Bearer ${supabaseServiceKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                query: sql // The endpoint might expect 'query' or 'sql' or 'statements'
                // Wait, apply-migrations.mjs used key 'sql' in body: JSON.stringify({ sql })
                // Let's verify what apply-migrations.mjs did.
            })
        });

        // Re-reading apply-migrations.mjs logic from my memory/context:
        // It used: body: JSON.stringify({ sql }) for /pg/migrations

        // Let's retry with 'sql' key as per previous file view
        const response2 = await fetch(`${supabaseUrl}/pg/migrations`, {
            method: 'POST',
            headers: {
                'apikey': supabaseServiceKey,
                'Authorization': `Bearer ${supabaseServiceKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ sql })
        });


        if (response2.ok) {
            console.log(`✅ Migration applied successfully`);
            return true;
        } else {
            const text = await response2.text();
            console.log(`⚠️  API response: ${response2.status} - ${text}`);

            // Fallback: try /rest/v1/rpc/exec if it exists? 
            // Often used for SQL execution if the function 'exec' exists.
            // But let's see if the first method works.
            return false;
        }
    } catch (error) {
        console.error(`❌ Error applying migration:`, error.message);
        return false;
    }
}

async function main() {
    const MIGRATION_FILE = path.join(__dirname, 'FIX_PERMISSIONS_AND_VISIBILITY.sql');
    await applyMigration(MIGRATION_FILE);
}

main().catch(console.error);

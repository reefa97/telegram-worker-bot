
import { Client } from "https://deno.land/x/postgres@v0.17.0/mod.ts";

const dbUrl = "postgresql://postgres.mxjfqszjpnlmagsikqfk:42Fundyk%236259@aws-1-eu-north-1.pooler.supabase.com:5432/postgres";

const client = new Client(dbUrl);

async function main() {
    await client.connect();

    try {
        console.log("Creating policies for 'signatures' bucket...");

        // 1. Policy for Public Read (SELECT)
        // Check if policy exists first to avoid error, or just drop and recreate
        try {
            await client.queryArray`DROP POLICY IF EXISTS "Public Read Signatures" ON storage.objects`;
        } catch (e) { console.log("Error dropping policy (might not exist):", e.message); }

        await client.queryArray`
      CREATE POLICY "Public Read Signatures"
      ON storage.objects FOR SELECT
      USING ( bucket_id = 'signatures' );
    `;
        console.log("Policy 'Public Read Signatures' created.");

        // 2. Policy for Authenticated Insert
        try {
            await client.queryArray`DROP POLICY IF EXISTS "Authenticated Insert Signatures" ON storage.objects`;
        } catch (e) { console.log("Error dropping policy:", e.message); }

        await client.queryArray`
      CREATE POLICY "Authenticated Insert Signatures"
      ON storage.objects FOR INSERT
      TO authenticated
      WITH CHECK ( bucket_id = 'signatures' );
    `;
        console.log("Policy 'Authenticated Insert Signatures' created.");

        // 3. Policy for Authenticated Update (optional)
        try {
            await client.queryArray`DROP POLICY IF EXISTS "Authenticated Update Signatures" ON storage.objects`;
        } catch (e) { console.log("Error dropping policy:", e.message); }

        await client.queryArray`
      CREATE POLICY "Authenticated Update Signatures"
      ON storage.objects FOR UPDATE
      TO authenticated
      USING ( bucket_id = 'signatures' );
    `;
        console.log("Policy 'Authenticated Update Signatures' created.");

    } catch (err) {
        console.error("Error setting up policies:", err);
    } finally {
        await client.end();
    }
}

main();

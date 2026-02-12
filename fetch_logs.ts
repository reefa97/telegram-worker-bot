
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import "https://deno.land/std@0.168.0/dotenv/load.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("VITE_SUPABASE_ANON_KEY")!; // Using Anon for now as service role might not be in .env.local

// Try to read .env from current dir since deno run might not load it automatically if not named .env
const envText = await Deno.readTextFile(".env");
const envVars = {};
envText.split("\n").forEach(line => {
    const [key, value] = line.split("=");
    if (key && value) envVars[key.trim()] = value.trim();
});

const url = envVars["VITE_SUPABASE_URL"];
// We likely need SERVICE_ROLE_KEY to read system_logs if RLS is strict. 
// However, the .env file I read earlier only had ANON_KEY.
// Let's try ANON_KEY first. If it fails, I might need to ask user or find service key.
// Wait, system_logs usually requires admin access.
// Let's assume ANON_KEY works checking the policy "Admins can read all logs". 
// But I'm not an admin user logged in.
// I will try to use the key found in .env. 

const key = envVars["VITE_SUPABASE_ANON_KEY"];

console.log("URL:", url);
console.log("Key prefix:", key.substring(0, 10));

const supabase = createClient(url, key);

async function fetchLogs() {
    console.log("Fetching system_logs...");
    const { data, error } = await supabase
        .from("system_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20);

    if (error) {
        console.error("Error fetching logs:", error);
    } else {
        console.log("Logs found:", data.length);
        data.forEach(log => {
            console.log(`[${log.created_at}] [${log.level}] ${log.message}`);
            if (log.metadata) console.log(JSON.stringify(log.metadata, null, 2));
            console.log("-".repeat(20));
        });
    }
}

fetchLogs();

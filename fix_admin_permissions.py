
import os
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

url = os.getenv("VITE_SUPABASE_URL") or os.getenv("SUPABASE_URL")
key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not url or not key:
    print("Error: Missing Supabase credentials")
    exit(1)

supabase = create_client(url, key)

sql_fix = """
DO $$
BEGIN
    -- 1. Grant usage on schema to authenticated
    GRANT USAGE ON SCHEMA public TO authenticated;
    
    -- 2. Grant SELECT on admin_users to authenticated
    GRANT SELECT ON public.admin_users TO authenticated;

    -- 3. Create/Replace a simple self-read policy (idempotent)
    DROP POLICY IF EXISTS "Authenticated users can read own profile" ON public.admin_users;
    
    CREATE POLICY "Authenticated users can read own profile"
    ON public.admin_users
    FOR SELECT
    TO authenticated
    USING (auth.uid() = id);
    
    -- 4. Enable RLS (just in case)
    ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;
END $$;
"""

print("Executing SQL fix via exec_sql RPC...")
try:
    response = supabase.rpc("exec_sql", {"sql_query": sql_fix}).execute()
    print("SQL execution successful.")
except Exception as e:
    print(f"Error executing SQL: {e}")
    # Try alternate method if RPC not found or fails
    print("Trying alternate method if available (direct raw query not supported by py-client easily)")

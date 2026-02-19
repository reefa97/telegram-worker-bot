
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

sql_enable_rls = """
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;
"""

print("Re-enabling RLS on admin_users via exec_sql RPC...")
try:
    response = supabase.rpc("exec_sql", {"sql_query": sql_enable_rls}).execute()
    print("SQL execution successful (RLS Enabled).")
except Exception as e:
    print(f"Error executing SQL: {e}")

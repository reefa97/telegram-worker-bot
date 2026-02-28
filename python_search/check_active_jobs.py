import os
from dotenv import load_dotenv
from supabase import create_client

load_dotenv("../.env")
url = os.getenv("VITE_SUPABASE_URL")
key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
supabase = create_client(url, key)

res = supabase.table("email_search_jobs").select("*").in_("status", ["pending", "processing"]).order("created_at", desc=False).execute()
print(f"--- ACTIVE JOBS ({len(res.data)}) ---")
for j in res.data:
    print(f"ID: {j['id']} | Query: {j['query']} | Status: {j['status']} | Found: {j.get('total_emails_found', 0)}")

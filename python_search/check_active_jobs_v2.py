import os
from dotenv import load_dotenv
from supabase import create_client

# Try multiple locations for .env
env_paths = ["../.env", "../../.env", ".env"]
for p in env_paths:
    if os.path.exists(p):
        load_dotenv(p)
        break

url = os.getenv("VITE_SUPABASE_URL") or os.getenv("SUPABASE_URL")
key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not url or not key:
    print("Error: Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
    exit(1)

supabase = create_client(url, key)

res = supabase.table("email_search_jobs").select("*").in_("status", ["pending", "processing"]).order("created_at", desc=False).execute()
print(f"--- ACTIVE JOBS ({len(res.data)}) ---")
for j in res.data:
    print(f"ID: {j['id']} | Query: {j['query']} | Status: {j['status']} | Found: {j.get('total_emails_found', 0)}")

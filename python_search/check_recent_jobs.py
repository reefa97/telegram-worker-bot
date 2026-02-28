import os
from dotenv import load_dotenv
from supabase import create_client
from datetime import datetime, timezone, timedelta

# Load from project root .env
load_dotenv("../.env")
url = os.getenv("VITE_SUPABASE_URL")
key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not url or not key:
    # Fallback if names are different
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not url or not key:
    print("Error: Missing credentials")
    exit(1)

supabase = create_client(url, key)

now = datetime.now(timezone.utc)
one_hour_ago = now - timedelta(hours=1)

res = supabase.table("email_search_jobs").select("*").gte("created_at", one_hour_ago.isoformat()).order("created_at", desc=True).execute()
print(f"--- JOBS IN LAST HOUR ({len(res.data)}) ---")
for j in res.data:
    print(f"ID: {j['id']} | Admin: {j['admin_id']} | Query: {j['query']} | Status: {j['status']}")

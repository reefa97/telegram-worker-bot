import os
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()
url = os.getenv("SUPABASE_URL")
key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
supabase = create_client(url, key)

jobs = supabase.table("email_search_jobs").select("*").order("created_at", desc=True).limit(5).execute()
print("--- JOBS ---")
for job in jobs.data:
    print(job)

admins = supabase.table("admin_users").select("id, email").limit(5).execute()
print("\n--- ADMINS ---")
for admin in admins.data:
    print(admin)

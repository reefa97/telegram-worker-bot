
import os
import asyncio
from pathlib import Path
from dotenv import load_dotenv
from supabase import create_client

# Load environment variables
env_path = Path(__file__).resolve().parent / '.env'
if not env_path.exists():
    env_path = Path(__file__).resolve().parent.parent / '.env'
load_dotenv(dotenv_path=env_path)

supabase_url = os.getenv("SUPABASE_URL") or os.getenv("VITE_SUPABASE_URL")
supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not supabase_url or not supabase_key:
    print("Error: Supabase credentials not found.")
    exit(1)

supabase = create_client(supabase_url, supabase_key)

def main():
    print("Fetching latest job...")
    try:
        jobs = supabase.table("email_search_jobs").select("*").order("created_at", desc=True).limit(1).execute()
        if not jobs.data:
            print("No jobs found.")
            return

        job = jobs.data[0]
        print(f"Job ID: {job.get('id')}")
        print(f"Status: {job.get('status')}")
        print(f"Query: {job.get('query')}")
        print(f"Admin ID: {job.get('admin_id')}")
        print(f"Serper Token in Job: {job.get('serper_token')}")
        print(f"Created At: {job.get('created_at')}")
        print(f"Stopped At: {job.get('stopped_at')}")
        
        admin_id = job.get('admin_id')
        if admin_id:
            print(f"Fetching admin user {admin_id}...")
            admin = supabase.table("admin_users").select("serper_token").eq("id", admin_id).single().execute()
            if admin.data:
                token = admin.data.get('serper_token')
                print(f"Admin Serper Token: {token[:5]}..." if token else "Admin Serper Token: None/Empty")
            else:
                print("Admin user not found.")
        else:
            print("No admin_id in job.")

    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()

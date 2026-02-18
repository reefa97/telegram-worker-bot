
import os
import asyncio
from dotenv import load_dotenv
from supabase import create_client, Client
from pathlib import Path

# Load environment variables
env_path = Path(__file__).resolve().parent.parent / '.env'
load_dotenv(dotenv_path=env_path)

SUPABASE_URL = os.getenv("SUPABASE_URL") or os.getenv("VITE_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("Error: Missing Supabase credentials")
    exit(1)

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

async def check_results():
    print("Checking search results...")
    try:
        # Get the 3 most recent completed jobs
        response = supabase.table("email_search_jobs")\
            .select("id, query, total_emails_found, status")\
            .order("created_at", desc=True)\
            .limit(3)\
            .execute()
        
        jobs = response.data
        if not jobs:
            print("No jobs found.")
            return

        for job in jobs:
            print(f"Job: {job['query']} (ID: {job['id']}) - Status: {job['status']}")
            print(f"Reported Count (in jobs table): {job['total_emails_found']}")
            
            # Count actual rows in results table
            count_res = supabase.table("email_search_results")\
                .select("*", count="exact", head=True)\
                .eq("job_id", job['id'])\
                .execute()
            
            print(f"Actual Rows in results table: {count_res.count}")
            print("-" * 30)

    except Exception as e:
        print(f"Error checking results: {e}")

if __name__ == "__main__":
    asyncio.run(check_results())

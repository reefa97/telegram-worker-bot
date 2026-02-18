
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

async def check_jobs():
    print("Checking for stuck jobs...")
    try:
        response = supabase.table("email_search_jobs").select("*").eq("status", "processing").execute()
        jobs = response.data
        
        if not jobs:
            print("No jobs currently in 'processing' state.")
        else:
            print(f"Found {len(jobs)} stuck jobs:")
            for job in jobs:
                print(f"- Job ID: {job['id']}")
                print(f"  Query: {job['query']}")
                print(f"  Started At: {job.get('started_at')}")
                print(f"  Updated At: {job.get('updated_at')}")
                print("-" * 30)
                
    except Exception as e:
        print(f"Error checking jobs: {e}")

if __name__ == "__main__":
    asyncio.run(check_jobs())

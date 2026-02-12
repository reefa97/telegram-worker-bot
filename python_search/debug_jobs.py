import os
import asyncio
from dotenv import load_dotenv
from supabase import create_client

from pathlib import Path

# Load environment variables
env_path = Path(__file__).resolve().parent.parent / '.env'
load_dotenv(dotenv_path=env_path)

# Also try loading .env.local
env_local_path = Path(__file__).resolve().parent.parent / '.env.local'
if env_local_path.exists():
    print(f"Loading env from {env_local_path}")
    load_dotenv(dotenv_path=env_local_path, override=True)
else:
    print(f"Loading env from {env_path}")

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    SUPABASE_URL = os.getenv("VITE_SUPABASE_URL") or SUPABASE_URL
    SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY") # Try again just in case

print(f"SUPABASE_URL found: {bool(SUPABASE_URL)}")
print(f"SUPABASE_KEY found: {bool(SUPABASE_KEY)}")

print(f"Available env keys: {list(os.environ.keys())}")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("Error: Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
    exit(1)

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

async def add_error_column():
    print("Adding error column to email_search_jobs...")
    try:
        supabase.rpc("exec_sql", {"sql_query": "ALTER TABLE email_search_jobs ADD COLUMN IF NOT EXISTS error TEXT;"}).execute()
        print("Column 'error' added successfully (or already exists).")
    except Exception as e:
        print(f"Error adding column: {e}")

async def inspect_jobs():
    await add_error_column()
    print("Fetching last 5 jobs...")
    try:
        response = supabase.table("email_search_jobs")\
            .select("*")\
            .order("created_at", desc=True)\
            .limit(5)\
            .execute()
        
        jobs = response.data
        for job in jobs:
            print(f"\nID: {job.get('id')}")
            print(f"Query: {job.get('query')}")
            print(f"Status: {job.get('status')}")
            print(f"Created At: {job.get('created_at')}")
            print(f"Stopped At: {job.get('stopped_at')}")
            print(f"Error (if any): {job.get('error')}") # Guessing column name
            print("-" * 30)
            
    except Exception as e:
        print(f"Error fetching jobs: {e}")

if __name__ == "__main__":
    asyncio.run(inspect_jobs())

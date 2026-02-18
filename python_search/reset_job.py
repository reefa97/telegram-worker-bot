
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

async def reset_job():
    job_id = "2c783867-46e6-478b-84cf-7e3703b67475"
    print(f"Resetting job {job_id} to pending...")
    try:
        supabase.table("email_search_jobs").update({
            "status": "pending",
            "started_at": None,
            "updated_at": "now()"
        }).eq("id", job_id).execute()
        print("Job reset successfully.")
    except Exception as e:
        print(f"Error resetting job: {e}")

if __name__ == "__main__":
    asyncio.run(reset_job())

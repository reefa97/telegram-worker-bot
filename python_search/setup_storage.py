import os
from pathlib import Path
from dotenv import load_dotenv
from supabase import create_client, Client

# Load environment variables
env_path = Path(__file__).resolve().parent.parent / '.env'
load_dotenv(dotenv_path=env_path)

SUPABASE_URL = os.getenv("SUPABASE_URL") or os.getenv("VITE_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("Error: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not found in .env")
    exit(1)

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

def setup_storage():
    bucket_name = 'receipts'
    print(f"Creating storage bucket: {bucket_name}...")
    try:
        # Check if bucket exists
        buckets = supabase.storage.list_buckets()
        existing = next((b for b in buckets if b.name == bucket_name), None)
        
        if existing:
            print(f"Bucket '{bucket_name}' already exists.")
        else:
            # Create public bucket
            supabase.storage.create_bucket(bucket_name, options={'public': True})
            print(f"Bucket '{bucket_name}' created successfully.")
            
    except Exception as e:
        print(f"Error managing storage bucket: {e}")

if __name__ == "__main__":
    setup_storage()

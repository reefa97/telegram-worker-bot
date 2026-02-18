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

def apply_migration(file_name):
    file_path = Path(__file__).resolve().parent.parent / 'supabase/migrations' / file_name
    if not file_path.exists():
        print(f"File not found: {file_path}")
        return

    with open(file_path, 'r') as f:
        sql = f.read()

    print(f"Applying {file_name}...")
    try:
        supabase.rpc('exec_sql', {'sql_query': sql}).execute()
        print(f"Successfully applied {file_name}")
    except Exception as e:
        print(f"Error applying {file_name}: {e}")

if __name__ == "__main__":
    migrations = [
        "20260215_fix_finance_policies.sql"
    ]

    for migration in migrations:
        apply_migration(migration)

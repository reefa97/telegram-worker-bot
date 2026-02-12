
import os
from supabase import create_client
from dotenv import load_dotenv
from pathlib import Path

# Load environment variables
env_path = Path(__file__).resolve().parent / '.env'
if not env_path.exists():
    env_path = Path(__file__).resolve().parent.parent / '.env'
load_dotenv(dotenv_path=env_path)

supabase_url = os.getenv("SUPABASE_URL") or os.getenv("VITE_SUPABASE_URL")
supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

supabase = create_client(supabase_url, supabase_key)

def check_rpc():
    print("Checking exec_sql RPC...")
    try:
        # Try a harmless select
        response = supabase.rpc("exec_sql", {"sql_query": "SELECT 1"}).execute()
        print("RPC Success:", response.data)
        return True
    except Exception as e:
        print("RPC Failed:", e)
        return False

if __name__ == "__main__":
    check_rpc()

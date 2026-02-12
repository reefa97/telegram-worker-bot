
import asyncio
import os
from pathlib import Path
from dotenv import load_dotenv
from core.search import SearchManager

# Load environment variables
env_path = Path(__file__).resolve().parent.parent / '.env'
load_dotenv(dotenv_path=env_path)

# Start
async def main():
    api_key = os.getenv("SERPER_API_KEY") # This might not be set in .env of the project root depending on how it's set up
    # We need to get the key. worker.py gets it from admin_users table or job.
    # Let's try to load it from the same place as worker.py or just use a known key if available.
    
    # Actually, worker.py loads env vars. Let's rely on that.
    # But usually SERPER_API_KEY is not in .env, it's in the DB.
    # However, sometimes it is in .env for dev.
    
    # Let's try to fetch it from the DB using supabase if not in env.
    from supabase import create_client
    
    supabase_url = os.getenv("SUPABASE_URL") or os.getenv("VITE_SUPABASE_URL")
    supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    
    if not supabase_url or not supabase_key:
        print("Error: Supabase credentials not found in environment.")
        return

    supabase = create_client(supabase_url, supabase_key)
    
    # Init Search Manager
    # We need a key. Let's just pick one from admin_users for testing.
    # Or rely on the one passed to the job.
    
    # Fetch a token from admin_users
    try:
        user_data = supabase.table("admin_users").select("serper_token").neq("serper_token", "null").limit(1).execute()
        if user_data.data and user_data.data[0].get('serper_token'):
            serper_token = user_data.data[0]['serper_token']
            print(f"Using serper token from DB: {serper_token[:5]}...")
        else:
            print("No serper token found in DB.")
            return
    except Exception as e:
        print(f"Error fetching token: {e}")
        import traceback
        traceback.print_exc()
        return

    # Fallback: try to hardcode a key if possible or ask user to provide one?
    # Actually, let's just use the key if we find it in the print output of worker log if any.
    # But wait, I can just inspect the table directly with supabase if I knew the key.
    
    # Let's try to use the key from environment if SERPER_API_KEY is present (it was not).
    
    # Let's simple fix implementation:
    # user_data = supabase.table("admin_users").select("serper_token").limit(1).execute()
    # print(f"DEBUG: {user_data}")

    search_mgr = SearchManager(api_key=serper_token)
    query = "stomatologia kraków"
    
    print(f"Searching for '{query}' in Maps (Places)...")
    maps_urls = search_mgr.search(query, page=1, search_type="maps")
    
    print(f"Found {len(maps_urls)} Maps URLs:")
    for url in maps_urls:
        print(f" - {url}")

if __name__ == "__main__":
    asyncio.run(main())

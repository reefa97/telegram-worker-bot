
import os
from dotenv import load_dotenv
from supabase import create_client

# Load vars
load_dotenv()

url = os.getenv("VITE_SUPABASE_URL") or os.getenv("SUPABASE_URL")
key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not url or not key:
    print("Error: Missing Supabase credentials")
    exit(1)

supabase = create_client(url, key)

user_id = "48ae3af3-23e0-4ed8-bfac-785d579e6918"

print(f"Checking admin_users for ID: {user_id}...")

response = supabase.table("admin_users").select("*").eq("id", user_id).execute()

if response.data:
    print("User FOUND in admin_users:")
    print(response.data)
else:
    print("User NOT FOUND in admin_users.")
    print("Attempting to create super_admin record...")
    
    new_user = {
        "id": user_id,
        "email": "reefa@reefa.pl",
        "role": "super_admin",
        # Add other required fields if any, typically defaults handle them or they are nullable
    }
    
    try:
        insert_res = supabase.table("admin_users").insert(new_user).execute()
        print("Successfully created admin user:", insert_res.data)
    except Exception as e:
        print("Failed to create user:", e)


import asyncio
import os
from pathlib import Path
from dotenv import load_dotenv
from core.validator import EmailValidator
from supabase import create_client

# Load environment variables
env_path = Path(__file__).resolve().parent / '.env'
if not env_path.exists():
    env_path = Path(__file__).resolve().parent.parent / '.env'
load_dotenv(dotenv_path=env_path)

env_local_path = Path(__file__).resolve().parent.parent / '.env.local'
if env_local_path.exists():
    load_dotenv(dotenv_path=env_local_path, override=True)

supabase_url = os.getenv("SUPABASE_URL") or os.getenv("VITE_SUPABASE_URL")
supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not supabase_url or not supabase_key:
    print("Error: Supabase credentials not found.")
    exit(1)

supabase = create_client(supabase_url, supabase_key)

def test_emails_logic():
    print("--- Testing EmailValidator Logic ---")
    test_cases = [
        ("info@stomatologia-krakow.pl", True),       # Good
        ("bad-email", False),                        # Bad format
        ("andrzej.banas@polskapress.pl", False),     # Blocked Domain
        ("redakcja@gazetakrakowska.pl", False),      # Blocked Keyword (redakcja)
        ("abuse@company.com", False),                # Blocked Prefix
        ("contact@google.com", False),               # Blocked Domain (google.com in blacklist util? actually validator has its own list)
                                                     # Wait, validator.py has gmail.com blocked.
        ("user@gmail.com", False),                   # Blocked (Free provider)
        ("test@nonexistent-domain-12345.com", False) # MX Record Fail (likely)
    ]

    for email, expected in test_cases:
        is_valid = EmailValidator.validate(email)
        status = "PASS" if is_valid == expected else "FAIL"
        print(f"[{status}] {email}: Got {is_valid}, Expected {expected}")
        
def test_deduplication_query():
    print("\n--- Testing Deduplication Query ---")
    # Fetch a real admin_id and email to simulate collision
    try:
        # Get last job
        job = supabase.table("email_search_jobs").select("*").limit(1).order("created_at", desc=True).execute()
        if not job.data:
            print("No jobs found to test.")
            return

        admin_id = job.data[0]['admin_id']
        print(f"Using Admin ID: {admin_id}")
        
        # Get an email that exists for this admin
        # We need to join with jobs...
        # Let's just pick an email from 'email_search_results' linked to this admin jobs
        
        # First get jobs for this admin
        jobs = supabase.table("email_search_jobs").select("id").eq("admin_id", admin_id).limit(5).execute()
        job_ids = [j['id'] for j in jobs.data]
        
        if not job_ids:
            print("No jobs for this admin.")
            return
            
        # Get an email from results
        res = supabase.table("email_search_results").select("email").in_("job_id", job_ids).limit(1).execute()
        
        if not res.data:
            print("No existing emails found for this admin. Cannot test duplicate detection.")
            return
            
        existing_email = res.data[0]['email']
        print(f"Found existing email in DB: {existing_email}")
        
        # Now simulate the check used in worker.py
        to_check = [existing_email, "new_unique_email@example.com"]
        
        print(f"Checking list: {to_check}")
        
        response = supabase.table("email_search_results")\
            .select("""
                email,
                email_search_jobs!inner(admin_id)
            """)\
            .eq("email_search_jobs.admin_id", admin_id)\
            .in_("email", to_check)\
            .execute()
            
        found_duplicates = {row['email'] for row in response.data}
        print(f"Duplicates found by DB: {found_duplicates}")
        
        if existing_email in found_duplicates and "new_unique_email@example.com" not in found_duplicates:
            print("[PASS] Deduplication query works correctly.")
        else:
            print("[FAIL] Deduplication query output unexpected.")

    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    test_emails_logic()
    test_deduplication_query()

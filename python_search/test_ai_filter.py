
import asyncio
import os
from pathlib import Path
from dotenv import load_dotenv
from core.enrichment import BusinessAnalyzer

# Load environment variables
env_path = Path(__file__).resolve().parent / '.env'
if not env_path.exists():
    env_path = Path(__file__).resolve().parent.parent / '.env'
load_dotenv(dotenv_path=env_path)

env_local_path = Path(__file__).resolve().parent.parent / '.env.local'
if env_local_path.exists():
    load_dotenv(dotenv_path=env_local_path, override=True)

async def test_filter():
    print("Testing AI Email Filtering...")
    
    # Fetch OpenAI Key from DB
    from supabase import create_client
    supabase_url = os.getenv("SUPABASE_URL") or os.getenv("VITE_SUPABASE_URL")
    supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    supabase = create_client(supabase_url, supabase_key)

    try:
        user_data = supabase.table("admin_users").select("openai_key").neq("openai_key", "null").limit(1).execute()
        if user_data.data and user_data.data[0].get('openai_key'):
             openai_key = user_data.data[0]['openai_key']
             os.environ["OPENAI_API_KEY"] = openai_key
             print("Fetched OpenAI key.")
        else:
             print("No OpenAI key found in DB.")
             return
    except Exception as e:
        print(f"Error fetching OpenAI key: {e}")
        return

    test_emails = [
        "info@stomatologia-krakow.pl",         # Relevant
        "rejestracja@dentystakrakow.com",      # Relevant
        "andrzej.banas@polskapress.pl",        # Irrelevant (Media)
        "redakcja@gazetakrakowska.pl",         # Irrelevant (Media)
        "biuro@naszemiasto.pl",                # Irrelevant (Media)
        "dr.kowalski@dental-clinic.eu",        # Relevant
        "kontakt@onetsalon.pl",                # Ambiguous/Irrelevant
        "abuse@domain.com"                     # Irrelevant (Generic)
    ]
    
    query = "stomatologia kraków"
    # Dummy business context (not strict for this test as we want to test the list filtering)
    
    print(f"Input Emails ({len(test_emails)}):")
    for e in test_emails:
        print(f" - {e}")

    # We are testing analyze_emails which takes a list
    # The current implementation uses business_name and url.
    # But analyze_emails docstring says: "Identify the most relevant business contact emails."
    # We should pass the query as business_name to provide context.
    
    filtered_emails = await BusinessAnalyzer.analyze_emails(
        emails=test_emails,
        business_name=query,
        business_url="http://google.com" # Dummy
    )
    
    print("\nAI Keep Decision:")
    found_relevant = 0
    for email in filtered_emails:
        print(f" [KEEP] {email}")
        if "polskapress" in email or "gazeta" in email:
            print(" [FAIL] Media email was kept!")
        else:
            found_relevant += 1
            
    print(f"\nKept {len(filtered_emails)} emails.")
    
    # Check consistency
    if "andrzej.banas@polskapress.pl" not in filtered_emails:
        print(" [PASS] Filtered out polskapress")
    else:
        print(" [FAIL] Failed to filter polskapress")

if __name__ == "__main__":
    asyncio.run(test_filter())

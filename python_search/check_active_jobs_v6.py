import os
from supabase import create_client

url = "https://mxjfqszjpnlmagsikqfk.supabase.co"
key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im14amZxc3pqcG5sbWFnc2lrcWZrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDA3OTQ1MywiZXhwIjoyMDc5NjU1NDUzfQ.y1_di9f2XoltBuivaadOZQ7ZJfRMmifvQJIyjVzcrps"

supabase = create_client(url, key)

print("--- STARTING QUERY ---")
try:
    res = supabase.table("email_search_jobs").select("id, query, status, total_emails_found").execute()
    print(f"TOTAL JOBS FOUND: {len(res.data)}")
    for j in res.data:
        print(f"ID: {j['id']} | Query: {j['query']} | Status: {j['status']} | Found: {j.get('total_emails_found', 0)}")
except Exception as e:
    print(f"CRITICAL ERROR: {e}")
print("--- ENDING QUERY ---")

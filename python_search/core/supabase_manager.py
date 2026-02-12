
import logging

logger = logging.getLogger("SupabaseManager")

class SupabaseManager:
    def __init__(self, supabase_client):
        self.supabase = supabase_client
        self.seen_emails = set()  # In-memory deduplication per job session

    def save_email(self, email, source_url, keyword, username="admin", job_id=None, source_type="organic", 
                   facebook=None, instagram=None, twitter=None, linkedin=None, contact_page=None, is_business_email=False):
        """
        Saves an email to the Supabase database with optional social links and enrichment status.
        Adapter: 'username' argument from Crawler is treated as 'job_id'.
        """
        email = email.lower().strip()
        actual_job_id = job_id if job_id else username

        # In-memory check: Only skip if NOT an enrichment update
        if email in self.seen_emails and not (is_business_email or facebook or instagram or twitter or linkedin or contact_page):
            return False

        try:
            data = {
                "job_id": actual_job_id,
                "email": email,
                "source_url": source_url,
                "source_type": source_type,
            }
            
            # Add enrichment data only if provided
            if facebook: data["facebook"] = facebook
            if instagram: data["instagram"] = instagram
            if twitter: data["twitter"] = twitter
            if linkedin: data["linkedin"] = linkedin
            if contact_page: data["contact_page"] = contact_page
            if is_business_email: data["is_business_email"] = True

            # Upsert logic: if email + job_id exists, update it.
            self.supabase.table("email_search_results").upsert(data, on_conflict="job_id,email").execute()
            
            self.seen_emails.add(email)
            return True
        except Exception as e:
            logger.warning(f"Failed to save/upsert email {email}: {e}")
            return False

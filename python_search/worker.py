import os
import time
import asyncio
import logging
import aiohttp
from datetime import datetime, timezone, timedelta
from dotenv import load_dotenv
from supabase import create_client, Client
from core.search import SearchManager
from core.crawler import AsyncCrawler
from core.supabase_manager import SupabaseManager
from core.enrichment import BusinessAnalyzer
from scheduler import check_balances_for_job

# Load environment variables
from pathlib import Path
env_path = Path(__file__).resolve().parent.parent / '.env'
load_dotenv(dotenv_path=env_path)

# Also try loading .env.local which often contains secrets in Next.js apps
env_local_path = Path(__file__).resolve().parent.parent / '.env.local'
if env_local_path.exists():
    load_dotenv(dotenv_path=env_local_path, override=True)

import traceback

# Setup Logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("EmailWorker")

# Supabase Config
SUPABASE_URL = os.getenv("SUPABASE_URL") # Ensure these are set in .env
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    # Try getting from VITE_ vars if standard ones missing (common in local devs)
    SUPABASE_URL = os.getenv("VITE_SUPABASE_URL") or SUPABASE_URL
    SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY") 
    
    if not SUPABASE_URL or not SUPABASE_KEY:
        logger.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env")
        exit(1)

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

async def process_job(job):
    job_id = job['id']
    query = job['query']
    
    print(f"DEBUG: Processing job {job_id}")
    try:
        admin_id = job.get('admin_id')
        serper_token = job.get('serper_token')
        print(f"DEBUG: admin_id={admin_id}, initial_token={serper_token}")
        
        # If token not in job, fetch from admin_users using admin_id
        if not serper_token and admin_id:
            try:
                print(f"DEBUG: Fetching token for admin {admin_id}")
                user_data = supabase.table("admin_users").select("serper_token").eq("id", admin_id).single().execute()
                print(f"DEBUG: user_data={user_data}")
                if user_data.data:
                    serper_token = user_data.data.get('serper_token')
                    print(f"DEBUG: Fetched token={serper_token}")
            except Exception as e:
                logger.error(f"Failed to fetch serper_token for admin {admin_id}: {e}")
                print(f"DEBUG: Fetch error: {e}")
    
        if not serper_token:
            print("DEBUG: No token found. Failing job.")
            logger.error(f"No Serper token found for job {job_id}. Skipping.")
            supabase.table("email_search_jobs").update({
                "status": "failed",
                "stopped_at": datetime.now(timezone.utc).isoformat()
            }).eq("id", job_id).execute()
            return
    
        logger.info(f"Processing job {job_id}: {query}")

        # Check API balances before starting
        await check_balances_for_job(serper_token, admin_id)

        # Update status to running
        try:
            supabase.table("email_search_jobs").update({
                "status": "running",
                "started_at": datetime.now(timezone.utc).isoformat()
            }).eq("id", job_id).execute()
        except Exception as start_err:
            logger.warning(f"Failed to mark job {job_id} as running: {start_err}")
    
        # Initialize Managers
        search_mgr = SearchManager(api_key=serper_token)
        db_manager = SupabaseManager(supabase)
        
        # Start Infinite Search Loop
        page = 1
        total_emails = 0
        
        # Load limits from env or defaults
        MAX_PAGES = int(os.getenv("MAX_SEARCH_PAGES", "4"))
        CRAWL_DEPTH = int(os.getenv("CRAWL_DEPTH", "1"))
        
        crawler = AsyncCrawler(deep_scan=True, max_depth=CRAWL_DEPTH)
    
        while page <= MAX_PAGES:
            logger.info(f"Searching Serper (Organic + Maps) page {page} for '{query}'...")
            
            # Fetch from Organic
            organic_urls = search_mgr.search(query, page=page, search_type="search")
            # Fetch from Maps
            maps_urls = search_mgr.search(query, page=page, search_type="maps")
            
            if not organic_urls and not maps_urls:
                logger.info("No more results from Serper.")
                break
            
            msg = f"Batch {page}: Found {len(organic_urls)} Organic, {len(maps_urls)} Maps."
            logger.info(msg + " Crawling...")
            try:
                with open("debug_worker.log", "a") as f:
                    f.write(f"{datetime.utcnow().isoformat()} - {msg}\n")
                    if maps_urls:
                         f.write(f"Maps URLs: {maps_urls}\n")
            except: pass
            
            # Crawl Maps URLs (Prioritize Maps for local relevance)
            maps_data = await crawler.crawl_urls(maps_urls, query, db_manager, username=job_id, source_type="maps")
            
            # Crawl Organic URLs
            organic_data = await crawler.crawl_urls(organic_urls, query, db_manager, username=job_id, source_type="organic")
    
            # Validate Emails (Syntax + MX Record + Blacklist)
            from core.validator import EmailValidator

            valid_emails = []
            for email in list(set(organic_data['emails'] + maps_data['emails'])):
                if EmailValidator.validate(email):
                    valid_emails.append(email)
                else:
                    logger.info(f"Skipping invalid/blocked email: {email}")

            # Deduplicate against DB (Global check for this admin)
            unique_emails = valid_emails
            if valid_emails:
                try:
                    # Check if emails exist in any OTHER job belonging to this admin
                    response = supabase.table("email_search_results")\
                        .select("""
                            email,
                            email_search_jobs!inner(admin_id)
                        """)\
                        .eq("email_search_jobs.admin_id", admin_id)\
                        .neq("job_id", job_id)\
                        .in_("email", valid_emails)\
                        .execute()
                    
                    existing_set = {row['email'] for row in response.data}
                    
                    if existing_set:
                        logger.info(f"Skipping {len(existing_set)} duplicates found in other jobs.")
                        unique_emails = [e for e in valid_emails if e not in existing_set]
                        
                except Exception as e:
                    logger.error(f"Deduplication check failed: {e}")
                    unique_emails = valid_emails
            
            all_emails = unique_emails
            best_emails = []
            
            if all_emails:
                logger.info(f"Enriching {len(all_emails)} emails with AI...")
                
                # Analyze emails as a batch
                best_emails = await BusinessAnalyzer.analyze_emails(all_emails, query, "")
                
                # Update database for recognized business emails
                if best_emails:
                    for email in best_emails:
                        db_manager.save_email(
                            email, "", query, job_id=job_id, 
                            is_business_email=True
                        )
            
            # Remove invalid/duplicate/irrelevant emails from database
            # 1. Emails that failed validation or deduplication
            found_total = list(set(organic_data['emails'] + maps_data['emails']))
            emails_to_remove = [e for e in found_total if e not in all_emails]
            
            # 2. Emails that AI rejected (if AI enrichment ran)
            if best_emails is None:
                logger.warning("AI enrichment failed (returned None). Skipping AI filtering (keeping all emails).")
                best_emails = all_emails
            elif all_emails:
                ai_rejected = [e for e in all_emails if e not in best_emails]
                emails_to_remove.extend(ai_rejected)
            
            if emails_to_remove:
                logger.info(f"Removing {len(emails_to_remove)} invalid/duplicate/irrelevant emails...")
                try:
                    # Supabase 'in' operator has limits, but for 50-100 emails it's fine.
                    supabase.table("email_search_results")\
                        .delete()\
                        .eq("job_id", job_id)\
                        .in_("email", emails_to_remove)\
                        .execute()
                except Exception as e:
                    logger.error(f"Failed to delete rejected emails: {e}")

            # Social Link Enrichment
            combined_social = {}
            for plat in ['facebook', 'instagram', 'twitter', 'linkedin']:
                combined_social[plat] = list(set(organic_data['social'][plat] + maps_data['social'][plat]))
            
            if any(combined_social.values()):
                logger.info("Analyzing social links with AI...")
                links_info = await BusinessAnalyzer.analyze_links(combined_social, query, "")
                
                # Update found (kept) emails with social metadata
                for email in best_emails:
                    db_manager.save_email(
                        email, "", query, job_id=job_id,
                        facebook=links_info.facebook,
                        instagram=links_info.instagram,
                        twitter=links_info.twitter,
                        linkedin=links_info.linkedin,
                        contact_page=links_info.contact
                    )
    
            new_emails_count = len(all_emails)
            
            if new_emails_count > 0:
                total_emails += new_emails_count
                # Update job progress
                try:
                    supabase.table("email_search_jobs").update({
                        "total_emails_found": total_emails
                    }).eq("id", job_id).execute()
                except Exception as update_err:
                    logger.warning(f"Failed to update total_emails_found (job may have been deleted): {update_err}")

            page += 1

            # Check if job was stopped by user
            try:
                current_job = supabase.table("email_search_jobs").select("status").eq("id", job_id).single().execute()
                if current_job.data and current_job.data['status'] == 'stopped':
                    logger.info("Job stopped by user.")
                    return
            except Exception as check_err:
                logger.warning(f"Job status check failed (job may have been deleted): {check_err}. Stopping.")
                return
    
        # Job Completed
        try:
            supabase.table("email_search_jobs").update({
                "status": "completed",
                "stopped_at": datetime.now(timezone.utc).isoformat()
            }).eq("id", job_id).execute()
            logger.info(f"Job {job_id} completed. Total emails: {total_emails}")
        except Exception as complete_err:
            logger.warning(f"Failed to mark job {job_id} as completed (may have been deleted): {complete_err}")

    except Exception as e:
        logger.error(f"Job failed: {e}", exc_info=True)
        # Log to file for debugging
        try:
            with open("error.log", "a") as f:
                f.write(f"Job {job_id} failed at {datetime.utcnow().isoformat()}:\n")
                traceback.print_exc(file=f)
                f.write("\n" + "-"*30 + "\n")
        except:
            pass # fallback if file write fails
        
        try:
            supabase.table("email_search_jobs").update({
                "status": "failed",
                "stopped_at": datetime.utcnow().isoformat()
            }).eq("id", job_id).execute()
        except Exception as fail_err:
            logger.warning(f"Failed to mark job {job_id} as failed (may have been deleted): {fail_err}")

from scheduler import scheduler_loop

async def worker_loop():
    logger.info("Email Search Worker started. Polling for jobs...")

    # On startup, reset any jobs stuck in running/processing to pending
    try:
        stuck = supabase.table("email_search_jobs")\
            .select("id, query")\
            .in_("status", ["running", "processing"])\
            .execute()
        if stuck.data:
            for j in stuck.data:
                logger.warning(f"Resetting stuck job {j['id']} ({j['query']}) to pending...")
                supabase.table("email_search_jobs").update({
                    "status": "pending",
                    "started_at": None
                }).eq("id", j['id']).execute()
    except Exception as e:
        logger.error(f"Failed to reset stuck jobs: {e}")

    # Start Scheduler in background
    asyncio.create_task(scheduler_loop())
    
    while True:
        try:
            # Fetch pending jobs
            response = supabase.table("email_search_jobs")\
                .select("*")\
                .eq("status", "pending")\
                .order("created_at", desc=False)\
                .limit(1)\
                .execute()
            
            jobs = response.data
            
            if jobs:
                for job in jobs:
                    await process_job(job)
            else:
                # Wait before next poll
                await asyncio.sleep(2)
                
        except Exception as e:
            logger.error(f"Worker poll error: {e}")
            await asyncio.sleep(5)

if __name__ == "__main__":
    asyncio.run(worker_loop())

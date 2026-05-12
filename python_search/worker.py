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
        all_found_emails = set()  # Track all unique emails across all pages
        
        # Load limits from env or defaults
        CRAWL_DEPTH = int(os.getenv("CRAWL_DEPTH", "1"))
        CRAWLER_CONCURRENCY = int(os.getenv("CRAWLER_CONCURRENCY", "2"))

        crawler = AsyncCrawler(deep_scan=True, max_depth=CRAWL_DEPTH, max_concurrency=CRAWLER_CONCURRENCY)
        consecutive_empty = 0  # Stop after 30 consecutive pages with no new results
        BROWSER_RECYCLE_PAGES = int(os.getenv("BROWSER_RECYCLE_PAGES", "10"))

        while True:
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
            if maps_urls:
                logger.debug(f"Maps URLs (batch {page}): {maps_urls}")
            
            # Crawl Maps URLs (Prioritize Maps for local relevance)
            # Add timeout per batch to prevent Playwright hangs from blocking the entire search
            BATCH_TIMEOUT = 120  # 2 minutes max per batch
            try:
                maps_data = await asyncio.wait_for(
                    crawler.crawl_urls(maps_urls, query, db_manager, username=job_id, source_type="maps"),
                    timeout=BATCH_TIMEOUT
                )
            except asyncio.TimeoutError:
                logger.warning(f"Page {page}: Maps crawling timed out after {BATCH_TIMEOUT}s")
                maps_data = {'emails': [], 'social': {}, 'contacts': []}

            # Crawl Organic URLs
            try:
                organic_data = await asyncio.wait_for(
                    crawler.crawl_urls(organic_urls, query, db_manager, username=job_id, source_type="organic"),
                    timeout=BATCH_TIMEOUT
                )
            except asyncio.TimeoutError:
                logger.warning(f"Page {page}: Organic crawling timed out after {BATCH_TIMEOUT}s")
                organic_data = {'emails': [], 'social': {}, 'contacts': []}
    
            # Validate Emails (Syntax + MX Record + Blacklist)
            from core.validator import EmailValidator

            raw_found_emails = list(set(organic_data['emails'] + maps_data['emails']))
            logger.info(f"Page {page}: Crawler found {len(raw_found_emails)} raw emails")

            valid_emails = []
            for email in raw_found_emails:
                if EmailValidator.validate(email):
                    valid_emails.append(email)
                else:
                    logger.info(f"Skipping invalid/blocked email: {email}")

            # Deduplicate within this batch only (same page may return same email twice)
            all_emails = list(set(valid_emails))
            logger.info(f"Page {page}: {len(all_emails)} emails passed validation (from {len(raw_found_emails)} raw)")

            # AI enrichment with Claude Haiku
            best_emails = all_emails
            if all_emails:
                logger.info(f"Filtering {len(all_emails)} emails with Claude Haiku...")
                ai_result = await BusinessAnalyzer.analyze_emails(all_emails, query, "")
                if ai_result is None:
                    logger.warning("AI filter failed (returned None). Keeping all emails.")
                    best_emails = all_emails
                elif not ai_result and all_emails:
                    logger.warning("AI returned empty list. Keeping all emails.")
                    best_emails = all_emails
                else:
                    best_emails = ai_result
                    logger.info(f"Page {page}: Claude kept {len(best_emails)}/{len(all_emails)} emails")

            # Remove invalid + AI-rejected emails from database
            found_total = list(set(organic_data['emails'] + maps_data['emails']))
            emails_to_remove = [e for e in found_total if e not in best_emails]

            if emails_to_remove:
                logger.info(f"Removing {len(emails_to_remove)} invalid/filtered emails...")
                try:
                    supabase.table("email_search_results")\
                        .delete()\
                        .eq("job_id", job_id)\
                        .in_("email", emails_to_remove)\
                        .execute()
                except Exception as e:
                    logger.error(f"Failed to delete rejected emails: {e}")

            # Track only truly new emails (not seen on previous pages)
            new_in_batch = [e for e in best_emails if e not in all_found_emails]
            all_found_emails.update(best_emails)

            if new_in_batch:
                total_emails = len(all_found_emails)
                logger.info(f"Page {page}: {len(new_in_batch)} new unique emails (total unique: {total_emails})")
                # Update job progress
                try:
                    supabase.table("email_search_jobs").update({
                        "total_emails_found": total_emails
                    }).eq("id", job_id).execute()
                except Exception as update_err:
                    logger.warning(f"Failed to update total_emails_found (job may have been deleted): {update_err}")

            # consecutive_empty tracks raw crawler output (before dedup),
            # so re-running the same query doesn't stop early due to duplicates
            if len(raw_found_emails) > 0:
                consecutive_empty = 0
            else:
                consecutive_empty += 1
                logger.info(f"Page {page}: no emails found (consecutive empty: {consecutive_empty}/30)")
                if consecutive_empty >= 30:
                    logger.info(f"30 consecutive pages with no new emails from crawler. Stopping search at page {page}.")
                    break

            page += 1

            # Recycle Chromium every N pages to release accumulated memory.
            # AsyncCrawler.close() drops the cached browser; next fetch lazily
            # spawns a fresh one. This prevents the OOM we saw on Railway.
            if BROWSER_RECYCLE_PAGES > 0 and page % BROWSER_RECYCLE_PAGES == 0:
                try:
                    logger.info(f"Page {page}: recycling Chromium to free memory")
                    await crawler.close()
                except Exception as recyc_err:
                    logger.warning(f"Browser recycle failed (non-critical): {recyc_err}")

            # Check if job was stopped by user
            try:
                current_job = supabase.table("email_search_jobs").select("status").eq("id", job_id).single().execute()
                if current_job.data and current_job.data['status'] == 'stopped':
                    logger.info("Job stopped by user.")
                    return
            except Exception as check_err:
                logger.warning(f"Job status check failed: {check_err}. Continuing search...")
                # Don't stop — just continue to next page

        # Clean up browser (normal path)
        await crawler.close()

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
        # exc_info=True already includes full traceback in stdout (Railway captures it).
        # Removed redundant file logging that was causing unbounded local disk growth.
        logger.error(f"Job {job_id} failed: {e}", exc_info=True)

        # Make sure the browser doesn't leak on the error path
        try:
            if 'crawler' in locals():
                await crawler.close()
        except Exception:
            pass

        try:
            supabase.table("email_search_jobs").update({
                "status": "failed",
                "stopped_at": datetime.utcnow().isoformat()
            }).eq("id", job_id).execute()
        except Exception as fail_err:
            logger.warning(f"Failed to mark job {job_id} as failed (may have been deleted): {fail_err}")

from scheduler import scheduler_loop

async def worker_loop():
    MAX_PARALLEL = int(os.getenv("MAX_PARALLEL_JOBS", "4"))
    JOB_TIMEOUT_SEC = int(os.getenv("JOB_TIMEOUT_SEC", "1200"))  # 20 min per job
    logger.info(
        f"Email Search Worker started. Parallelism = {MAX_PARALLEL}, "
        f"job timeout = {JOB_TIMEOUT_SEC}s. Polling for jobs..."
    )

    # On startup, reset any jobs stuck in running/processing to pending
    async def reset_stuck_jobs():
        try:
            # Find jobs stuck in "running" for more than 10 minutes
            cutoff = (datetime.now(timezone.utc) - timedelta(minutes=10)).isoformat()
            stuck = supabase.table("email_search_jobs")\
                .select("id, query, started_at")\
                .in_("status", ["running", "processing"])\
                .lt("started_at", cutoff)\
                .execute()
            if stuck.data:
                for j in stuck.data:
                    logger.warning(f"Resetting stuck job {j['id']} ({j['query']}) to completed (was stuck)...")
                    supabase.table("email_search_jobs").update({
                        "status": "completed",
                        "stopped_at": datetime.now(timezone.utc).isoformat()
                    }).eq("id", j['id']).execute()
        except Exception as e:
            logger.error(f"Failed to reset stuck jobs: {e}")

    await reset_stuck_jobs()

    # Start Scheduler in background
    asyncio.create_task(scheduler_loop())

    # Sliding pool: keep up to MAX_PARALLEL tasks in flight. As soon as one
    # finishes, the next pending job is fetched. Each job is wrapped in
    # asyncio.wait_for so one stuck Playwright can't block siblings.
    in_flight = set()
    stuck_check_counter = 0

    async def run_with_timeout(job):
        try:
            await asyncio.wait_for(process_job(job), timeout=JOB_TIMEOUT_SEC)
        except asyncio.TimeoutError:
            logger.error(f"Job {job.get('id')} hit JOB_TIMEOUT_SEC={JOB_TIMEOUT_SEC}s; marking failed")
            try:
                supabase.table("email_search_jobs").update({
                    "status": "failed",
                    "stopped_at": datetime.now(timezone.utc).isoformat(),
                    "error": f"timeout after {JOB_TIMEOUT_SEC}s",
                }).eq("id", job.get("id")).execute()
            except Exception as upd_err:
                logger.warning(f"Failed to mark timed-out job: {upd_err}")
        except Exception as e:
            logger.error(f"Job {job.get('id')} raised: {e}", exc_info=True)

    while True:
        try:
            stuck_check_counter += 1
            if stuck_check_counter >= 30:  # 30 polls ≈ 60s
                stuck_check_counter = 0
                await reset_stuck_jobs()

            slots = MAX_PARALLEL - len(in_flight)
            if slots > 0:
                response = supabase.table("email_search_jobs")\
                    .select("*")\
                    .eq("status", "pending")\
                    .order("created_at", desc=False)\
                    .limit(slots)\
                    .execute()
                jobs = response.data or []
                for job in jobs:
                    task = asyncio.create_task(run_with_timeout(job))
                    in_flight.add(task)
                    logger.info(f"Started job {job.get('id')} ({len(in_flight)}/{MAX_PARALLEL} in flight)")

            if not in_flight:
                await asyncio.sleep(2)
                continue

            # Wait for any task to finish, then loop back to top up the pool.
            done, _ = await asyncio.wait(in_flight, return_when=asyncio.FIRST_COMPLETED, timeout=10)
            for t in done:
                in_flight.discard(t)
                if t.exception():
                    logger.error(f"Unhandled task exception: {t.exception()}")

        except Exception as e:
            logger.error(f"Worker poll error: {e}", exc_info=True)
            await asyncio.sleep(5)

if __name__ == "__main__":
    asyncio.run(worker_loop())

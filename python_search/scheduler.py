import os
import time
import asyncio
import logging
import aiohttp
from datetime import datetime, timezone
from dotenv import load_dotenv
from supabase import create_client, Client
from pathlib import Path

# Load environment variables
env_path = Path(__file__).resolve().parent.parent / '.env'
load_dotenv(dotenv_path=env_path)

# Also try loading .env.local
env_local_path = Path(__file__).resolve().parent.parent / '.env.local'
if env_local_path.exists():
    load_dotenv(dotenv_path=env_local_path, override=True)

# Setup Logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("TaskScheduler")

# Supabase Config
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL:
    SUPABASE_URL = os.getenv("VITE_SUPABASE_URL")

if not SUPABASE_URL or not SUPABASE_KEY:
    logger.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env")
    exit(1)

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# Telegram Config
TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
if not TELEGRAM_BOT_TOKEN:
    logger.warning("TELEGRAM_BOT_TOKEN not found. Task notifications will be disabled.")

async def send_telegram_message(session, chat_id, text):
    if not TELEGRAM_BOT_TOKEN or not chat_id:
        return
    
    url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
    payload = {
        "chat_id": chat_id,
        "text": text,
        "parse_mode": "HTML"
    }
    try:
        async with session.post(url, json=payload) as response:
            if response.status != 200:
                logger.error(f"Failed to send Telegram message: {await response.text()}")
    except Exception as e:
        logger.error(f"Telegram send error: {e}")

async def check_task_notifications():
    if not TELEGRAM_BOT_TOKEN:
        return

    async with aiohttp.ClientSession() as session:
        try:
            # 1. New Task Assignments (created_by != assigned_to AND not notified)
            unnotified_tasks = supabase.table("admin_tasks")\
                .select("id, title, description, due_date, created_by, assigned_to, admin_users!assigned_to(telegram_chat_id, name)")\
                .eq("created_notification_sent", False)\
                .execute()
            
            if unnotified_tasks.data:
                for task in unnotified_tasks.data:
                    # Skip if assigned to self
                    if task['created_by'] == task['assigned_to']:
                        supabase.table("admin_tasks").update({"created_notification_sent": True}).eq("id", task['id']).execute()
                        continue

                    assignee = task['admin_users']
                    if isinstance(assignee, list) and assignee:
                        assignee = assignee[0]
                    
                    chat_id = assignee.get('telegram_chat_id') if assignee else None
                    
                    if chat_id:
                        due_dt = datetime.fromisoformat(task['due_date'].replace('Z', '+00:00'))
                        formatted_date = due_dt.strftime("%d.%m.%Y %H:%M")
                        
                        msg = (
                            f"📝 <b>Новая задача:</b> {task['title']}\n"
                            f"📅 <b>Срок:</b> {formatted_date}\n"
                            f"{f'ℹ️ {task['description']}' if task['description'] else ''}"
                        )
                        
                        await send_telegram_message(session, chat_id, msg)
                        logger.info(f"Sent new task notification for task {task['id']}")
                    
                    # Mark as notified
                    supabase.table("admin_tasks").update({"created_notification_sent": True}).eq("id", task['id']).execute()

            # 2. Due Date Reminders
            now = datetime.now(timezone.utc)
            
            # Find tasks that are due and not completed and not reminded
            due_tasks = supabase.table("admin_tasks")\
                .select("id, title, due_date, assigned_to, admin_users!assigned_to(telegram_chat_id)")\
                .eq("is_completed", False)\
                .eq("reminder_sent", False)\
                .lte("due_date", now.isoformat())\
                .execute()
            
            if due_tasks.data:
                for task in due_tasks.data:
                    assignee = task['admin_users']
                    if isinstance(assignee, list) and assignee:
                        assignee = assignee[0]
                        
                    chat_id = assignee.get('telegram_chat_id') if assignee else None
                    
                    if chat_id:
                        msg = (
                            f"⏰ <b>Напоминание о задаче:</b>\n"
                            f"❗ {task['title']}\n"
                            f"Срок выполнения наступил! Не забудьте отметить выполнение."
                        )
                        await send_telegram_message(session, chat_id, msg)
                        logger.info(f"Sent reminder for task {task['id']}")
                    
                    # Mark as reminded
                    supabase.table("admin_tasks").update({"reminder_sent": True}).eq("id", task['id']).execute()

        except Exception as e:
            logger.error(f"Error in check_task_notifications: {e}")

async def scheduler_loop():
    logger.info("Task Scheduler started. Checking for tasks every 60 seconds...")
    while True:
        try:
            await check_task_notifications()
            await asyncio.sleep(60)
        except KeyboardInterrupt:
            logger.info("Scheduler stopped by user.")
            break
        except Exception as e:
            logger.error(f"Scheduler loop error: {e}")
            await asyncio.sleep(5)

if __name__ == "__main__":
    try:
        asyncio.run(scheduler_loop())
    except KeyboardInterrupt:
        pass

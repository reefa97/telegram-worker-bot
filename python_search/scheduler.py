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

SERPER_LOW_BALANCE_THRESHOLD = int(os.getenv("SERPER_LOW_BALANCE_THRESHOLD", "100"))
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY") or os.getenv("LLM_API_KEY")
BALANCE_CHECK_INTERVAL_HOURS = 6
_balance_check_state: dict = {"last_check": None}


async def log_system_warning(message: str, metadata: dict | None = None):
    """Write a warning to system_logs so it appears in the web panel."""
    try:
        supabase.table("system_logs").insert({
            "level": "warn",
            "category": "balance",
            "message": message,
            "metadata": metadata or {}
        }).execute()
    except Exception as e:
        logger.error(f"Failed to write balance warning to system_logs: {e}")


async def check_api_balances():
    now = datetime.now(timezone.utc)
    last_check = _balance_check_state["last_check"]

    if last_check is not None:
        hours_since = (now - last_check).total_seconds() / 3600
        if hours_since < BALANCE_CHECK_INTERVAL_HOURS:
            return

    _balance_check_state["last_check"] = now
    logger.info("Checking API balances...")

    async with aiohttp.ClientSession() as session:
        # --- Serper: check balance per admin ---
        try:
            admins = supabase.table("admin_users")\
                .select("id, name, serper_token, telegram_chat_id")\
                .not_.is_("serper_token", "null")\
                .neq("serper_token", "")\
                .execute()

            for admin in admins.data:
                token = admin.get("serper_token")
                if not token:
                    continue
                try:
                    async with session.get(
                        "https://google.serper.dev/account",
                        headers={"X-API-KEY": token}
                    ) as resp:
                        if resp.status == 200:
                            data = await resp.json()
                            balance = data.get("balance", 0)
                            if balance < SERPER_LOW_BALANCE_THRESHOLD:
                                msg = (
                                    f"⚠️ <b>Мало кредитов Serper!</b>\n"
                                    f"Остаток: <b>{balance}</b> кредитов\n"
                                    f"Пожалуйста, пополни баланс на serper.dev"
                                )
                                logger.warning(f"Serper low balance for {admin['name']}: {balance}")
                                await log_system_warning(
                                    f"Мало кредитов Serper для {admin['name']}: {balance}",
                                    {"balance": balance, "admin_id": admin["id"]}
                                )
                                if admin.get("telegram_chat_id"):
                                    await send_telegram_message(session, admin["telegram_chat_id"], msg)
                        else:
                            logger.warning(f"Serper account check failed for {admin['name']}: HTTP {resp.status}")
                except Exception as e:
                    logger.error(f"Error checking Serper balance for {admin['name']}: {e}")
        except Exception as e:
            logger.error(f"Error fetching admins for Serper balance check: {e}")

        # --- OpenAI: test call to detect quota errors ---
        if OPENAI_API_KEY:
            try:
                async with session.post(
                    "https://api.openai.com/v1/chat/completions",
                    headers={
                        "Authorization": f"Bearer {OPENAI_API_KEY}",
                        "Content-Type": "application/json"
                    },
                    json={
                        "model": os.getenv("LLM_MODEL", "gpt-4o-mini"),
                        "messages": [{"role": "user", "content": "hi"}],
                        "max_tokens": 1
                    }
                ) as resp:
                    if resp.status in (429, 402):
                        data = await resp.json()
                        error_code = data.get("error", {}).get("code", "")
                        if error_code in ("insufficient_quota", "billing_hard_limit_reached"):
                            msg = (
                                "⚠️ <b>Закончились кредиты OpenAI!</b>\n"
                                "Поиск email работает, но AI-фильтрация отключена.\n"
                                "Пожалуйста, пополни баланс на platform.openai.com"
                            )
                            logger.warning(f"OpenAI quota exceeded: {error_code}")
                            await log_system_warning(
                                f"Закончились кредиты OpenAI: {error_code}",
                                {"error_code": error_code}
                            )
                            # Notify all admins with telegram_chat_id
                            try:
                                all_admins = supabase.table("admin_users")\
                                    .select("telegram_chat_id")\
                                    .not_.is_("telegram_chat_id", "null")\
                                    .execute()
                                for a in all_admins.data:
                                    if a.get("telegram_chat_id"):
                                        await send_telegram_message(session, a["telegram_chat_id"], msg)
                            except Exception as e:
                                logger.error(f"Failed to notify admins about OpenAI quota: {e}")
            except Exception as e:
                logger.error(f"Error checking OpenAI balance: {e}")


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
            await check_api_balances()
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

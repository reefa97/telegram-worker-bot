import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// -------- Helpers --------

async function getBotToken(): Promise<string> {
    const { data } = await supabase
        .from("bot_settings")
        .select("telegram_bot_token")
        .single();
    if (!data?.telegram_bot_token) throw new Error("Bot token not found");
    return data.telegram_bot_token;
}

async function sendTelegram(botToken: string, chatId: number | string, text: string) {
    const numericChatId = typeof chatId === "string" ? parseInt(chatId) : chatId;
    if (!numericChatId || isNaN(numericChatId)) return;

    try {
        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                chat_id: numericChatId,
                text: text,
                parse_mode: "HTML",
            }),
        });
    } catch (e) {
        console.error(`Failed to send to ${numericChatId}:`, e);
    }
}

async function sendMediaGroup(botToken: string, chatId: number | string, photoUrls: string[], caption: string) {
    const numericChatId = typeof chatId === "string" ? parseInt(chatId) : chatId;
    if (!numericChatId || isNaN(numericChatId) || photoUrls.length === 0) return;

    const media = photoUrls.slice(0, 10).map((url, idx) => ({
        type: "photo" as const,
        media: url,
        ...(idx === 0 ? { caption, parse_mode: "HTML" } : {}),
    }));

    try {
        await fetch(`https://api.telegram.org/bot${botToken}/sendMediaGroup`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                chat_id: numericChatId,
                media,
            }),
        });
    } catch (e) {
        console.error(`Failed to send media group to ${numericChatId}:`, e);
    }
}

// -------- 1. CRON: Daily reminders for managers about scheduled checks --------

async function handleCronReminders(botToken: string) {
    const now = new Date();
    const todayDow = now.getDay() === 0 ? 7 : now.getDay(); // 1=Mon, 7=Sun

    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowDow = tomorrow.getDay() === 0 ? 7 : tomorrow.getDay();

    // Get all schedules
    const { data: schedules, error } = await supabase
        .from("quality_check_schedules")
        .select("*");

    if (error) throw error;
    if (!schedules || schedules.length === 0) return { sent: 0 };

    // Filter schedules for today and tomorrow, respecting frequency
    const isScheduledForDay = (s: any, dow: number, checkDate: Date): boolean => {
        if (s.day_of_week !== dow) return false;
        if (s.frequency_weeks > 1 && s.last_check_date) {
            const lastCheck = new Date(s.last_check_date);
            const weeksSince = Math.floor(
                (checkDate.getTime() - lastCheck.getTime()) / (7 * 24 * 60 * 60 * 1000)
            );
            if (weeksSince < s.frequency_weeks) return false;
        }
        return true;
    };

    // Group by manager_id
    const managerSchedules: Record<string, { today: string[]; tomorrow: string[] }> = {};

    for (const s of schedules) {
        if (!managerSchedules[s.manager_id]) {
            managerSchedules[s.manager_id] = { today: [], tomorrow: [] };
        }

        // Get object name
        const { data: obj } = await supabase
            .from("cleaning_objects")
            .select("name")
            .eq("id", s.object_id)
            .single();
        const objName = obj?.name || "Неизвестный объект";

        if (isScheduledForDay(s, todayDow, now)) {
            managerSchedules[s.manager_id].today.push(objName);
        }
        if (isScheduledForDay(s, tomorrowDow, tomorrow)) {
            managerSchedules[s.manager_id].tomorrow.push(objName);
        }
    }

    let sentCount = 0;

    // Send messages to each manager
    for (const [managerId, tasks] of Object.entries(managerSchedules)) {
        if (tasks.today.length === 0 && tasks.tomorrow.length === 0) continue;

        // Get manager's telegram_chat_id
        const { data: admin } = await supabase
            .from("admin_users")
            .select("telegram_chat_id, name, email")
            .eq("id", managerId)
            .single();

        if (!admin?.telegram_chat_id) continue;

        // Get last check notes for context
        let lastProblems = "";
        for (const tasks_list of [...tasks.today, ...tasks.tomorrow]) {
            // Get last check for these objects
            const { data: lastCheck } = await supabase
                .from("quality_checks")
                .select("score_percentage, notes, object_id")
                .eq("manager_id", managerId)
                .order("check_date", { ascending: false })
                .limit(1)
                .single();

            if (lastCheck && lastCheck.score_percentage < 80 && lastCheck.notes) {
                lastProblems = `\n⚠️ В прошлый раз были проблемы: <i>${lastCheck.notes}</i>`;
                break;
            }
        }

        let msg = "";

        if (tasks.today.length > 0) {
            msg += `📋 <b>Сегодня запланирован контроль качества:</b>\n\n`;
            tasks.today.forEach(name => { msg += `• ${name}\n`; });
            msg += lastProblems;
        }

        if (tasks.tomorrow.length > 0) {
            if (msg) msg += "\n\n";
            msg += `🔔 <b>Завтра контроль качества на объектах:</b>\n\n`;
            tasks.tomorrow.forEach(name => { msg += `• ${name}\n`; });
            if (!lastProblems) {
                // Try to add last problems for tomorrow's objects too
                const { data: lastCheck } = await supabase
                    .from("quality_checks")
                    .select("score_percentage, notes")
                    .eq("manager_id", managerId)
                    .order("check_date", { ascending: false })
                    .limit(1)
                    .single();

                if (lastCheck && lastCheck.score_percentage < 80 && lastCheck.notes) {
                    msg += `\n⚠️ В прошлый раз были проблемы: <i>${lastCheck.notes}</i>`;
                }
            }
        }

        if (msg) {
            await sendTelegram(botToken, admin.telegram_chat_id, msg);
            sentCount++;
        }
    }

    return { sent: sentCount };
}

// -------- 2. POST-CHECK: Notify workers after a quality check --------

async function handleCheckNotification(botToken: string, checkId: string) {
    // Get the check details
    const { data: check, error: checkError } = await supabase
        .from("quality_checks")
        .select("*")
        .eq("id", checkId)
        .single();

    if (checkError || !check) throw new Error(`Check not found: ${checkId}`);

    // Get object name
    const { data: obj } = await supabase
        .from("cleaning_objects")
        .select("name")
        .eq("id", check.object_id)
        .single();
    const objectName = obj?.name || "Неизвестный объект";

    // Get manager name
    const { data: manager } = await supabase
        .from("admin_users")
        .select("name, email")
        .eq("id", check.manager_id)
        .single();
    const managerName = manager?.name || manager?.email || "Менеджер";

    // Determine status
    let statusEmoji: string;
    let statusText: string;
    if (check.score_percentage >= 80) {
        statusEmoji = "✅";
        statusText = "Отлично!";
    } else if (check.score_percentage >= 50) {
        statusEmoji = "⚠️";
        statusText = "Нужно исправить";
    } else {
        statusEmoji = "❌";
        statusText = "Требует внимания";
    }

    // Build message
    let msg = `${statusEmoji} <b>Проверка чистоты: ${objectName}</b>\n\n`;
    msg += `📊 Оценка: <b>${check.score_percentage}%</b> — ${statusText}\n`;
    msg += `👤 Проверяющий: ${managerName}\n`;
    if (check.notes) {
        msg += `💬 Комментарий: <i>${check.notes}</i>\n`;
    }

    // Get check items for details
    const { data: items } = await supabase
        .from("quality_check_items")
        .select("task_name, is_passed, photo_urls")
        .eq("check_id", checkId);

    if (items && items.length > 0) {
        msg += `\n📝 Детали:\n`;
        items.forEach((item: { task_name: string; is_passed: boolean }) => {
            msg += `${item.is_passed ? "✅" : "❌"} ${item.task_name}\n`;
        });
    }

    // Collect photo URLs from failed items for low-score notifications
    const failedPhotos: string[] = [];
    if (items && check.score_percentage < 80) {
        for (const item of items) {
            if (!item.is_passed && item.photo_urls && item.photo_urls.length > 0) {
                failedPhotos.push(...item.photo_urls);
            }
        }
    }

    const { data: workerObjects } = await supabase
        .from("worker_objects")
        .select("worker_id, workers(telegram_chat_id, first_name)")
        .eq("object_id", check.object_id);

    // Get Guardians (owner_ids) for this object
    const { data: objOwners } = await supabase
        .from("cleaning_objects")
        .select("owner_ids")
        .eq("id", check.object_id)
        .single();

    const guardianIds = objOwners?.owner_ids || [];

    let sentCount = 0;

    // 1. Notify Workers
    if (workerObjects) {
        for (const wo of workerObjects) {
            const chatId = (wo as any).workers?.telegram_chat_id;
            if (chatId) {
                await sendTelegram(botToken, chatId, msg);
                // Send photos for low-score checks
                if (failedPhotos.length > 0) {
                    await sendMediaGroup(
                        botToken,
                        chatId,
                        failedPhotos,
                        `📷 Фото нарушений на объекте <b>${objectName}</b>`
                    );
                }
                sentCount++;
            }
        }
    }

    // 2. Notify Guardians (Coordinators)
    if (guardianIds.length > 0) {
        const { data: guardians } = await supabase
            .from("admin_users")
            .select("telegram_chat_id")
            .in("id", guardianIds);

        if (guardians) {
            for (const g of guardians) {
                if (g.telegram_chat_id) {
                    const guardianMsg = `📢 <b>Уведомление для опекуна</b>\n\n${msg}`;
                    await sendTelegram(botToken, g.telegram_chat_id, guardianMsg);
                }
            }
        }
    }

    // Also notify the manager who performed the check (confirmation)
    const { data: checkManager } = await supabase
        .from("admin_users")
        .select("telegram_chat_id")
        .eq("id", check.manager_id)
        .single();

    if (checkManager?.telegram_chat_id) {
        const confirmMsg = `✅ Проверка сохранена!\n\n📍 ${objectName}\n📊 Оценка: <b>${check.score_percentage}%</b>\n👷 Уведомлено работников: ${sentCount}`;
        await sendTelegram(botToken, checkManager.telegram_chat_id, confirmMsg);
    }

    return { sent: sentCount };
}

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// -------- Main Handler --------

serve(async (req) => {
    // Handle CORS preflight requests
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const botToken = await getBotToken();

        // Determine mode from request
        const url = new URL(req.url);
        const mode = url.searchParams.get("mode");

        if (req.method === "POST") {
            // POST = Notification after check completion
            const body = await req.json();
            const checkId = body.check_id;

            if (!checkId) {
                return new Response(JSON.stringify({ error: "check_id required" }), {
                    status: 400,
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                });
            }

            const result = await handleCheckNotification(botToken, checkId);
            return new Response(JSON.stringify({ success: true, ...result }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        // GET or cron invocation = Daily reminder
        const result = await handleCronReminders(botToken);
        return new Response(JSON.stringify({ success: true, ...result }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    } catch (error: any) {
        console.error("Quality check notification error:", error);
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
});

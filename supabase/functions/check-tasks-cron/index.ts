import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

interface Task {
    id: string;
    title: string;
    description: string;
    object_id: string;
    cleaning_objects: { name: string };
    is_recurring: boolean;
    scheduled_days: number[];
    scheduled_dates: string[];
}

async function sendTelegramMessage(botToken: string, chatId: number, text: string) {
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            chat_id: chatId,
            text: text,
            parse_mode: "HTML",
        }),
    });
}

function isScheduledForDate(task: Task, date: Date): boolean {
    const dateString = date.toISOString().split('T')[0];
    const dayOfWeek = date.getDay();

    if (task.is_recurring) {
        return task.scheduled_days && task.scheduled_days.includes(dayOfWeek);
    } else {
        return task.scheduled_dates && task.scheduled_dates.includes(dateString);
    }
}

serve(async (req) => {
    try {
        // 1. Get Bot Token
        const { data: botSettings } = await supabase
            .from("bot_settings")
            .select("telegram_bot_token")
            .single();

        if (!botSettings?.telegram_bot_token) {
            throw new Error("Bot token not found");
        }

        // 2. Determine check type (Today (morning) or Tomorrow (evening))
        // We can infer this from the current time, or pass a query param.
        // For simplicity, let's check both "Tomorrow" and "Today" and construct appropriate messages.
        // Ideally, this function runs twice a day.

        const now = new Date();
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);

        // 3. Get all SPECIAL tasks
        const { data: specialTasks, error } = await supabase
            .from("object_tasks")
            .select("*, cleaning_objects(name)")
            .eq("is_special_task", true)
            .eq("is_active", true);

        if (error) throw error;
        if (!specialTasks || specialTasks.length === 0) return new Response("No special tasks");

        // 4. Group by Object
        const tasksByObject: Record<string, { tomorrow: Task[], today: Task[], name: string }> = {};

        for (const task of specialTasks) {
            if (!tasksByObject[task.object_id]) {
                tasksByObject[task.object_id] = { tomorrow: [], today: [], name: task.cleaning_objects?.name || "Unknown" };
            }

            if (isScheduledForDate(task, tomorrow)) {
                tasksByObject[task.object_id].tomorrow.push(task);
            }
            if (isScheduledForDate(task, now)) {
                tasksByObject[task.object_id].today.push(task);
            }
        }

        // 5. Notify Workers
        // We iterate over objects, find assigned workers, and send messages.
        for (const [objectId, todo] of Object.entries(tasksByObject)) {
            if (todo.tomorrow.length === 0 && todo.today.length === 0) continue;

            // Get workers assigned to this object
            const { data: workerObjects } = await supabase
                .from("worker_objects")
                .select("worker_id, workers(telegram_chat_id, first_name)")
                .eq("object_id", objectId);

            if (!workerObjects) continue;

            for (const wo of workerObjects) {
                if (!wo.workers?.telegram_chat_id) continue;

                const chatId = parseInt(wo.workers.telegram_chat_id);

                // Handle "Tomorrow" reminders (e.g., sent in evening)
                if (todo.tomorrow.length > 0) {
                    // Basic check: only send evening reminder if it's PM
                    if (now.getHours() >= 16) {
                        let msg = `⚠️ <b>Напоминание на завтра</b>\n\n`;
                        msg += `📍 Объект: <b>${todo.name}</b>\n`;
                        msg += `Специальные задачи:\n`;
                        todo.tomorrow.forEach(t => msg += `- ${t.title}\n`);
                        await sendTelegramMessage(botSettings.telegram_bot_token, chatId, msg);
                    }
                }

                // Handle "Today" reminders (e.g., sent in morning)
                if (todo.today.length > 0) {
                    // Basic check: only send morning reminder if it's AM
                    if (now.getHours() < 12) {
                        let msg = `⭐️ <b>Сегодня особый день!</b>\n\n`;
                        msg += `📍 Объект: <b>${todo.name}</b>\n`;
                        msg += `Не забудьте про специальные задачи:\n`;
                        todo.today.forEach(t => msg += `- ${t.title}\n`);
                        await sendTelegramMessage(botSettings.telegram_bot_token, chatId, msg);
                    }
                }
            }
        }

        return new Response(JSON.stringify({ success: true }), {
            headers: { "Content-Type": "application/json" },
        });
    } catch (error: any) {
        console.error("Cron Error:", error);
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
        });
    }
});

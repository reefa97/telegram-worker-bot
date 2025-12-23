import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function sendTelegramMessage(botToken: string, chatId: number, text: string) {
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            chat_id: chatId,
            text: text,
            parse_mode: "HTML",
        }),
    });
}

serve(async (req) => {
    try {
        // Get bot token
        const { data: botSettings } = await supabase
            .from("bot_settings")
            .select("telegram_bot_token")
            .single();

        if (!botSettings?.telegram_bot_token) {
            return new Response("No bot token", { status: 500 });
        }

        const botToken = botSettings.telegram_bot_token;
        const now = new Date();

        // 1. Check for upcoming shifts (45 mins)
        // Get current day of week (0-6, Sunday is 0 in JS, but we stored 0=Monday in our UI?)
        // In UI: ['Понедельник', ...] -> index 0 is Monday.
        // In JS: getDay() -> 0 is Sunday, 1 is Monday.
        // So we need to convert.
        let currentDayOfWeek = now.getDay() - 1;
        if (currentDayOfWeek === -1) currentDayOfWeek = 6; // Sunday

        // Get shifts for today
        const { data: shifts } = await supabase
            .from("scheduled_shifts")
            .select("*, workers(telegram_chat_id, first_name), cleaning_objects(name)")
            .eq("day_of_week", currentDayOfWeek)
            .eq("is_active", true);

        if (shifts) {
            for (const shift of shifts) {
                if (!shift.workers?.telegram_chat_id) continue;

                // Parse start time (HH:MM)
                const [hours, minutes] = shift.start_time.split(':').map(Number);
                const shiftDate = new Date(now);
                shiftDate.setHours(hours, minutes, 0, 0);

                // Calculate difference in minutes
                const diffMs = shiftDate.getTime() - now.getTime();
                const diffMinutes = Math.floor(diffMs / 60000);

                // Notify if between 40 and 50 minutes
                if (diffMinutes >= 40 && diffMinutes <= 50) {
                    // Check if already notified today?
                    // For simplicity, we assume cron runs every 15 mins, so this hits once.
                    // Or we can check notifications_log.

                    await sendTelegramMessage(
                        botToken,
                        parseInt(shift.workers.telegram_chat_id),
                        `⏰ <b>Напоминание о смене</b>\n\nЧерез 45 минут у вас запланирована смена на объекте <b>${shift.cleaning_objects.name}</b>.`
                    );
                }
            }
        }

        // 2. Check for forgotten active sessions (> 12 hours)
        const twelveHoursAgo = new Date(now.getTime() - 12 * 60 * 60 * 1000);

        const { data: longSessions } = await supabase
            .from("work_sessions")
            .select("*, workers(telegram_chat_id, first_name)")
            .is("end_time", null)
            .lt("start_time", twelveHoursAgo.toISOString());

        if (longSessions) {
            for (const session of longSessions) {
                if (!session.workers?.telegram_chat_id) continue;

                // Check if we already notified about this session recently (e.g. in last 24h)
                // This is complex without a log.
                // For now, we'll just send it. To avoid spam, we should probably add a flag to session or log.
                // Let's check notifications_log

                const { data: existingLog } = await supabase
                    .from("notifications_log")
                    .select("id")
                    .eq("notification_type", "forgot_end_reminder")
                    .contains("metadata", { session_id: session.id })
                    .gt("created_at", new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()) // sent in last 24h
                    .maybeSingle();

                if (!existingLog) {
                    await sendTelegramMessage(
                        botToken,
                        parseInt(session.workers.telegram_chat_id),
                        `⚠️ <b>Вы забыли завершить смену?</b>\n\nВаша смена длится уже более 12 часов. Пожалуйста, завершите её, если вы закончили работу.`
                    );

                    await supabase.from("notifications_log").insert({
                        notification_type: "forgot_end_reminder",
                        message: "Sent 12h reminder",
                        metadata: { session_id: session.id }
                    });
                }
            }
        }

        return new Response(JSON.stringify({ ok: true }), {
            headers: { "Content-Type": "application/json" },
        });
    } catch (error) {
        console.error("Error:", error);
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
        });
    }
});

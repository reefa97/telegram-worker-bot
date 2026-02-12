
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// -------------- HELPERS --------------

async function getNotificationRecipients(objectId?: string, workerId?: string) {
    const recipients = new Set<string>();

    // 1. Worker's Creator (Personal Guardian)
    if (workerId) {
        const { data: worker } = await supabase
            .from("workers")
            .select("created_by")
            .eq("id", workerId)
            .single();

        if (worker && worker.created_by) {
            const { data: admin } = await supabase
                .from("admin_users")
                .select("telegram_chat_id")
                .eq("id", worker.created_by)
                .single();
            if (admin?.telegram_chat_id) recipients.add(admin.telegram_chat_id);
        }
    }

    // 2. Object Owners (Guardians) via RPC
    if (objectId) {
        const { data: owners, error } = await supabase.rpc('get_object_owners_with_chat_ids', {
            target_object_id: objectId
        });
        if (owners && owners.length > 0) {
            owners.forEach((o: any) => {
                if (o.telegram_chat_id) recipients.add(o.telegram_chat_id);
            });
        }
    }

    // 3. Fallback: All Admins
    if (recipients.size === 0) {
        const { data: allAdmins } = await supabase
            .from("admin_users")
            .select("telegram_chat_id")
            .not("telegram_chat_id", "is", null);

        if (allAdmins) {
            allAdmins.forEach((a: { telegram_chat_id: string | null }) => {
                if (a.telegram_chat_id) recipients.add(a.telegram_chat_id);
            });
        }
    }

    return Array.from(recipients);
}


async function sendTelegramMessage(botToken: string, chatId: number, text: string) {
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    try {
        const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                chat_id: chatId,
                text: text,
                parse_mode: "HTML",
            }),
        });
        return res.json();
    } catch (err) {
        console.error(`[sendTelegramMessage] Error sending to ${chatId}:`, err);
    }
}


// -------------- MAIN LOGIC --------------

serve(async (req: Request) => {
    try {
        // 1. Get current time in Poland (Assuming user timezone if not specified, usually standard practice for this context)
        // Actually, timestamps in DB are usually UTC or offset. Let's use UTC comparison for robustness over "day of week".
        // Or just check if day matches. 
        // `scheduled_shifts` has `time` type for `start_time` (e.g. "08:00:00").
        // We need to compare current time with schedule.

        // Check if invoked manually or periodically
        const now = new Date();
        // Get time string HH:MM:SS
        // Note: Deno deploy runs in UTC? We need to know project timezone. 
        // Assuming Shifts are intended in Local Time. Let's assume user is in Poland/CET?
        // Start simple: Use UTC and assume schedules are stored appropriately or just check relative diff.
        // Wait, scheduled_shifts usually store local time like "08:00".

        // Let's get "current time" in Europe/Warsaw
        const options = { timeZone: 'Europe/Warsaw', hour12: false, hour: '2-digit', minute: '2-digit' };
        // The user said "Poland" context in previous turns (e.g. krakow).
        const formatter = new Intl.DateTimeFormat('en-GB', {
            timeZone: 'Europe/Warsaw',
            hour: 'numeric',
            minute: 'numeric',
            weekday: 'long' // "Monday"
        });

        const parts = formatter.formatToParts(now);
        const hour = parts.find(p => p.type === 'hour')?.value;
        const minute = parts.find(p => p.type === 'minute')?.value;
        const weekdayName = parts.find(p => p.type === 'weekday')?.value;

        const currentTimeStr = `${hour}:${minute}`;

        // Map weekday name to 0-6 (Sun-Sat)
        const daysMap: Record<string, number> = {
            "Sunday": 0, "Monday": 1, "Tuesday": 2, "Wednesday": 3,
            "Thursday": 4, "Friday": 5, "Saturday": 6
        };
        const currentDayOfWeek = daysMap[weekdayName || "Monday"];

        console.log(`Checking late shifts for Day: ${currentDayOfWeek}, Time: ${currentTimeStr}`);

        // FETCH SHIFTS
        // We want shifts that started > 5 minutes ago and < 65 minutes ago (1 hour window)
        // Actually simpler: Fetch all active shifts for TODAY.
        const { data: shifts, error: shiftsError } = await supabase
            .from("scheduled_shifts")
            .select("*, workers(id, first_name, last_name, phone_number), cleaning_objects(id, name)")
            .eq("is_active", true)
            .eq("day_of_week", currentDayOfWeek);

        if (shiftsError || !shifts) {
            console.error("Error fetching shifts:", shiftsError);
            return new Response("Error fetching shifts", { status: 500 });
        }

        // Get Bot Token
        const { data: botSettings } = await supabase
            .from("bot_settings")
            .select("telegram_bot_token")
            .eq("is_active", true)
            .maybeSingle();

        if (!botSettings?.telegram_bot_token) {
            console.error("Bot token not found/inactive");
            return new Response("Bot inactive", { status: 200 });
        }
        const token = botSettings.telegram_bot_token;

        // Process each shift
        const results = [];

        for (const shift of shifts) {
            try {
                // Parse shift time
                const [sh, sm] = shift.start_time.split(':').map(Number);
                const shiftMinutes = sh * 60 + sm;

                const [ch, cm] = [parseInt(hour!), parseInt(minute!)];
                const currentMinutes = ch * 60 + cm;

                const diff = currentMinutes - shiftMinutes;

                // "Not started within 5 minutes" -> diff >= 5.
                // Avoid re-notifying forever: check if diff < 60 min (e.g. up to 1 hour late).
                // AND ensure we haven't logged a notification for this specific day/shift.

                if (diff >= 5 && diff < 60) {
                    // Check for existing work session today
                    const todayStr = new Date().toISOString().split('T')[0];
                    const { data: session } = await supabase
                        .from("work_sessions")
                        .select("id")
                        .eq("worker_id", shift.worker_id)
                        .eq("object_id", shift.object_id)
                        .gte("start_time", `${todayStr}T00:00:00`)
                        .maybeSingle();

                    if (!session) {
                        // WORKER IS LATE!

                        // Check if already notified today
                        const { data: logs } = await supabase
                            .from("notifications_log")
                            .select("id")
                            .eq("worker_id", shift.worker_id)
                            .eq("notification_type", "late_start_alert")
                            .gte("sent_at", `${todayStr}T00:00:00`)
                            .maybeSingle();

                        if (!logs) {
                            // Send Notification
                            const workerName = `${shift.workers.first_name} ${shift.workers.last_name}`;
                            const objectName = shift.cleaning_objects.name;
                            const phone = shift.workers.phone_number || "Не указан";

                            // Clean phone for tel link
                            const phoneLink = phone.replace(/[^0-9+]/g, '');
                            const phoneHtml = phoneLink ? `<a href="tel:${phoneLink}">${phone}</a>` : phone;

                            const message = `⚠️ <b>ОПОЗДАНИЕ НА СМЕНУ!</b>\n\n` +
                                `👤 Сотрудник: <b>${workerName}</b>\n` +
                                `📍 Объект: <b>${objectName}</b>\n` +
                                `⏰ Время начала: <b>${shift.start_time}</b>\n` +
                                `⏳ Опоздание: <b>${diff} мин</b>\n\n` +
                                `📞 Позвонить: ${phoneHtml}`;

                            const recipients = await getNotificationRecipients(shift.object_id, shift.worker_id);

                            for (const chatId of recipients) {
                                await sendTelegramMessage(token, parseInt(chatId), message);
                            }

                            // Log it
                            await supabase.from("notifications_log").insert({
                                worker_id: shift.worker_id,
                                notification_type: "late_start_alert",
                                message: `Late start alert: ${workerName} for ${objectName}`,
                                metadata: { shift_id: shift.id, delay: diff }
                            });

                            results.push({ worker: workerName, status: "Alert Sent" });
                        } else {
                            results.push({ worker: shift.worker_id, status: "Already Alerted" });
                        }
                    } else {
                        results.push({ worker: shift.worker_id, status: "On Time (Session Exists)" });
                    }
                } else {
                    results.push({ worker: shift.worker_id, status: "Not Late Yet / Too Late" });
                }

            } catch (e) {
                console.error("Error processing shift:", e);
            }
        }

        return new Response(JSON.stringify(results), { headers: { "Content-Type": "application/json" } });

    } catch (err) {
        console.error(err);
        return new Response(String(err), { status: 500 });
    }
});

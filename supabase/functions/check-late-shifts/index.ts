
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// -------------- HELPERS --------------

async function getGuardianRecipients(objectId: string, workerId: string): Promise<string[]> {
    const recipients = new Set<string>();

    // 1. Worker's creator (personal guardian)
    const { data: worker } = await supabase
        .from("workers")
        .select("created_by")
        .eq("id", workerId)
        .single();

    if (worker?.created_by) {
        const { data: admin } = await supabase
            .from("admin_users")
            .select("telegram_chat_id")
            .eq("id", worker.created_by)
            .single();
        if (admin?.telegram_chat_id) recipients.add(String(admin.telegram_chat_id));
    }

    // 2. Object owners via RPC
    const { data: owners } = await supabase.rpc('get_object_owners_with_chat_ids', {
        target_object_id: objectId
    });
    if (owners) {
        owners.forEach((o: any) => {
            if (o.telegram_chat_id) recipients.add(String(o.telegram_chat_id));
        });
    }

    // 3. Fallback: all admins with telegram_chat_id
    if (recipients.size === 0) {
        const { data: allAdmins } = await supabase
            .from("admin_users")
            .select("telegram_chat_id")
            .not("telegram_chat_id", "is", null);
        if (allAdmins) {
            allAdmins.forEach((a: any) => {
                if (a.telegram_chat_id) recipients.add(String(a.telegram_chat_id));
            });
        }
    }

    // Filter out invalid chat_ids (must be numeric)
    return Array.from(recipients).filter(id => /^-?\d+$/.test(id));
}


async function sendTelegramMessage(botToken: string, chatId: number, text: string) {
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    try {
        const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
        });
        return res.json();
    } catch (err) {
        console.error(`[sendTelegramMessage] Error sending to ${chatId}:`, err);
    }
}

// notification_type includes object_id prefix to deduplicate per worker+object+milestone+day
function makeNotifType(type: string, objectId: string): string {
    return `${type}_${objectId.slice(0, 8)}`;
}

async function wasNotificationSent(workerId: string, objectId: string, type: string, todayStr: string): Promise<boolean> {
    const notifType = makeNotifType(type, objectId);
    const { data, error } = await supabase
        .from("notifications_log")
        .select("id")
        .eq("worker_id", workerId)
        .eq("notification_type", notifType)
        .gte("sent_at", `${todayStr}T00:00:00`)
        .limit(1);
    if (error) {
        console.error("[wasNotificationSent] Error:", error);
        return false;
    }
    return Array.isArray(data) && data.length > 0;
}


// -------------- MAIN LOGIC --------------

serve(async (req: Request) => {
    try {
        const now = new Date();

        // Get current time and weekday in Warsaw timezone
        const formatter = new Intl.DateTimeFormat('en-GB', {
            timeZone: 'Europe/Warsaw',
            hour: 'numeric',
            minute: 'numeric',
            weekday: 'long'
        });
        const parts = formatter.formatToParts(now);
        const hour = parseInt(parts.find(p => p.type === 'hour')?.value ?? '0');
        const minute = parseInt(parts.find(p => p.type === 'minute')?.value ?? '0');
        const weekdayName = parts.find(p => p.type === 'weekday')?.value ?? 'Monday';

        const daysMap: Record<string, number> = {
            "Sunday": 7, "Monday": 1, "Tuesday": 2, "Wednesday": 3,
            "Thursday": 4, "Friday": 5, "Saturday": 6
        };
        const currentDayOfWeek = daysMap[weekdayName];
        const currentMinutes = hour * 60 + minute;

        // Today's date in Warsaw timezone
        const todayStr = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'Europe/Warsaw',
            year: 'numeric', month: '2-digit', day: '2-digit'
        }).format(now);

        console.log(`[check-late-shifts] ${weekdayName} (${currentDayOfWeek}), ${hour}:${String(minute).padStart(2,'0')}, date=${todayStr}`);

        // Fetch cleaning objects that are scheduled today
        const { data: objects, error: objError } = await supabase
            .from("cleaning_objects")
            .select("id, name, schedule_days, schedule_time_start, schedule_day_times, late_notifications_enabled")
            .eq("is_active", true)
            .not("schedule_days", "is", null)
            .not("schedule_time_start", "is", null)
            .neq("late_notifications_enabled", false);

        if (objError) {
            console.error("[check-late-shifts] Error fetching objects:", JSON.stringify(objError));
            return new Response("Error fetching objects", { status: 500 });
        }

        // Filter objects scheduled for today
        const todayObjects = (objects || []).filter((obj: any) =>
            Array.isArray(obj.schedule_days) && obj.schedule_days.includes(currentDayOfWeek)
        );

        console.log(`[check-late-shifts] Objects scheduled today: ${todayObjects.length}`);

        if (todayObjects.length === 0) {
            return new Response(JSON.stringify({ message: "No objects scheduled today", day: currentDayOfWeek }), {
                headers: { "Content-Type": "application/json" }
            });
        }

        // Get bot token
        const { data: botSettings } = await supabase
            .from("bot_settings")
            .select("telegram_bot_token")
            .eq("is_active", true)
            .maybeSingle();

        if (!botSettings?.telegram_bot_token) {
            console.error("[check-late-shifts] Bot token not found");
            return new Response("Bot inactive", { status: 200 });
        }
        const token = botSettings.telegram_bot_token;

        // Fetch all worker_objects assignments with worker info
        const objectIds = todayObjects.map((o: any) => o.id);
        const { data: assignments } = await supabase
            .from("worker_objects")
            .select("worker_id, object_id, schedule_days, workers(id, first_name, last_name, phone_number, telegram_chat_id, is_active)")
            .in("object_id", objectIds);

        console.log(`[check-late-shifts] Worker assignments found: ${assignments?.length ?? 0}`);

        const results = [];

        for (const obj of todayObjects) {
            try {
                // Parse schedule start time (use per-day override if available)
                const dayTimes = obj.schedule_day_times || {};
                const dayKey = String(currentDayOfWeek);
                const startTime = dayTimes[dayKey] || obj.schedule_time_start;
                const [sh, sm] = startTime.split(':').map(Number);
                const shiftStartMinutes = sh * 60 + sm;
                const diff = currentMinutes - shiftStartMinutes;

                // Only check if 1–120 minutes past start time
                if (diff < 1 || diff > 120) {
                    console.log(`[check-late-shifts] ${obj.name}: diff=${diff}min, skipping`);
                    continue;
                }

                // Get active workers assigned to this object (filtered by worker's schedule_days if set)
                const objAssignments = (assignments || []).filter((a: any) =>
                    a.object_id === obj.id && a.workers?.is_active &&
                    (!a.schedule_days || a.schedule_days.length === 0 || a.schedule_days.includes(currentDayOfWeek))
                );

                if (objAssignments.length === 0) {
                    console.log(`[check-late-shifts] ${obj.name}: no active workers assigned`);
                    continue;
                }

                for (const assignment of objAssignments) {
                    const worker = assignment.workers;
                    if (!worker) continue;

                    // Check if worker already started a session today for this object
                    const { data: session } = await supabase
                        .from("work_sessions")
                        .select("id")
                        .eq("worker_id", worker.id)
                        .eq("object_id", obj.id)
                        .gte("start_time", `${todayStr}T00:00:00`)
                        .maybeSingle();

                    if (session) {
                        results.push({ worker: `${worker.first_name} ${worker.last_name}`, object: obj.name, status: "Session active" });
                        continue;
                    }

                    const workerName = `${worker.first_name} ${worker.last_name}`;
                    const phone = worker.phone_number || "Не указан";
                    const phoneLink = phone.replace(/[^0-9+]/g, '');
                    const phoneHtml = phoneLink ? `<a href="tel:${phoneLink}">${phone}</a>` : phone;

                    const milestones = [
                        { minutes: 20, type: "late_20" },
                        { minutes: 40, type: "late_40" },
                        { minutes: 60, type: "late_60" },
                    ];

                    for (const milestone of milestones) {
                        if (diff < milestone.minutes) continue;

                        const alreadySent = await wasNotificationSent(worker.id, obj.id, milestone.type, todayStr);
                        if (alreadySent) continue;

                        const lateMin = milestone.minutes;

                        // Claim this notification slot FIRST to prevent race conditions
                        // If another invocation already inserted, this will fail due to unique index
                        const { error: logError } = await supabase.from("notifications_log").insert({
                            worker_id: worker.id,
                            notification_type: makeNotifType(milestone.type, obj.id),
                            message: `Late ${lateMin}min: ${workerName} at ${obj.name}`,
                            metadata: { object_id: obj.id, delay_actual: diff, threshold: lateMin }
                        });

                        if (logError) {
                            // Unique violation = another invocation already handled this
                            console.log(`[check-late-shifts] Skipping ${workerName}@${obj.name} late_${lateMin} — already claimed`);
                            continue;
                        }

                        const guardianEmoji = lateMin === 20 ? "⚠️" : lateMin === 40 ? "🟡" : "🔴";

                        // === Guardian message ===
                        const guardianMessage =
                            `${guardianEmoji} <b>Опоздание на смену — ${lateMin} мин</b>\n\n` +
                            `👤 Сотрудник: <b>${workerName}</b>\n` +
                            `📍 Объект: <b>${obj.name}</b>\n` +
                            `⏰ Начало смены: <b>${startTime.slice(0,5)}</b>\n` +
                            `⏳ Опоздание: <b>${diff} мин</b>\n\n` +
                            `📞 Позвонить: ${phoneHtml}`;

                        const guardians = await getGuardianRecipients(obj.id, worker.id);
                        console.log(`[check-late-shifts] ${workerName} @ ${obj.name} — late ${lateMin}min | guardians: ${guardians.join(',') || 'NONE'}`);

                        for (const chatId of guardians) {
                            const res = await sendTelegramMessage(token, parseInt(chatId), guardianMessage);
                            console.log(`[check-late-shifts] Guardian msg → ${chatId}:`, JSON.stringify(res?.ok));
                        }

                        // === Worker message ===
                        if (worker.telegram_chat_id) {
                            let workerMessage: string;
                            if (lateMin === 20) {
                                workerMessage =
                                    `⏰ <b>Напоминание о смене</b>\n\n` +
                                    `Ваша смена на объекте <b>${obj.name}</b> началась в ${startTime.slice(0,5)}.\n\n` +
                                    `Вы опаздываете уже на 20 минут.\n` +
                                    `Если вы уже на месте — <b>начните смену через бот</b>.\n` +
                                    `Если нет — поторопитесь!`;
                            } else if (lateMin === 40) {
                                workerMessage =
                                    `⚠️ <b>Вы опаздываете!</b>\n\n` +
                                    `Смена на объекте <b>${obj.name}</b> началась 40 минут назад.\n\n` +
                                    `Если вы уже на объекте — <b>немедленно начните смену</b> через бот.\n` +
                                    `Если нет — сообщите куратору о причине.`;
                            } else {
                                workerMessage =
                                    `🚨 <b>Серьёзное опоздание!</b>\n\n` +
                                    `Вы опаздываете на смену (${obj.name}) уже на 60 минут.\n\n` +
                                    `Пожалуйста, <b>срочно начните смену</b> или немедленно свяжитесь с куратором.`;
                            }
                            await sendTelegramMessage(token, worker.telegram_chat_id, workerMessage);
                        }

                        results.push({ worker: workerName, object: obj.name, milestone: lateMin, status: "Sent", guardians: guardians.length });
                    }
                }
            } catch (e) {
                console.error(`[check-late-shifts] Error processing object ${obj.name}:`, e);
            }
        }

        return new Response(JSON.stringify(results), { headers: { "Content-Type": "application/json" } });

    } catch (err) {
        console.error("[check-late-shifts] Fatal error:", err);
        return new Response(String(err), { status: 500 });
    }
});


import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// -------------- HELPERS --------------

async function getGuardianRecipients(objectId?: string, workerId?: string): Promise<string[]> {
    const recipients = new Set<string>();

    if (workerId) {
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
            if (admin?.telegram_chat_id) recipients.add(admin.telegram_chat_id);
        }
    }

    if (objectId) {
        const { data: owners } = await supabase.rpc('get_object_owners_with_chat_ids', {
            target_object_id: objectId
        });
        if (owners) {
            owners.forEach((o: any) => {
                if (o.telegram_chat_id) recipients.add(o.telegram_chat_id);
            });
        }
    }

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


async function sendTelegramMessage(botToken: string, chatId: number | string, text: string) {
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

async function wasNotificationSent(workerId: string, notificationType: string, todayStr: string): Promise<boolean> {
    const { data } = await supabase
        .from("notifications_log")
        .select("id")
        .eq("worker_id", workerId)
        .eq("notification_type", notificationType)
        .gte("sent_at", `${todayStr}T00:00:00`)
        .maybeSingle();
    return !!data;
}


// -------------- MAIN LOGIC --------------

serve(async (req: Request) => {
    try {
        const now = new Date();

        const formatter = new Intl.DateTimeFormat('en-GB', {
            timeZone: 'Europe/Warsaw',
            hour: 'numeric',
            minute: 'numeric',
            weekday: 'long'
        });

        const parts = formatter.formatToParts(now);
        const hour = parts.find(p => p.type === 'hour')?.value!;
        const minute = parts.find(p => p.type === 'minute')?.value!;
        const weekdayName = parts.find(p => p.type === 'weekday')?.value;

        const daysMap: Record<string, number> = {
            "Sunday": 0, "Monday": 1, "Tuesday": 2, "Wednesday": 3,
            "Thursday": 4, "Friday": 5, "Saturday": 6
        };
        const currentDayOfWeek = daysMap[weekdayName || "Monday"];

        // Today in Warsaw timezone (for log checks)
        const warsawFormatter = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'Europe/Warsaw',
            year: 'numeric', month: '2-digit', day: '2-digit'
        });
        const todayStr = warsawFormatter.format(now); // "YYYY-MM-DD"

        console.log(`Checking late shifts for Day: ${currentDayOfWeek}, Time: ${hour}:${minute}, Date: ${todayStr}`);

        const { data: shifts, error: shiftsError } = await supabase
            .from("scheduled_shifts")
            .select("*, workers(id, first_name, last_name, phone_number, telegram_chat_id), cleaning_objects(id, name)")
            .eq("is_active", true)
            .eq("day_of_week", currentDayOfWeek);

        if (shiftsError || !shifts) {
            console.error("Error fetching shifts:", shiftsError);
            return new Response("Error fetching shifts", { status: 500 });
        }

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

        const results = [];

        for (const shift of shifts) {
            try {
                const [sh, sm] = shift.start_time.split(':').map(Number);
                const shiftMinutes = sh * 60 + sm;
                const currentMinutes = parseInt(hour) * 60 + parseInt(minute);
                const diff = currentMinutes - shiftMinutes;

                // Only check in range 1–90 minutes late
                if (diff < 1 || diff > 90) {
                    results.push({ worker: shift.worker_id, status: "Not in late range", diff });
                    continue;
                }

                // Check if shift already started
                const { data: session } = await supabase
                    .from("work_sessions")
                    .select("id")
                    .eq("worker_id", shift.worker_id)
                    .eq("object_id", shift.object_id)
                    .gte("start_time", `${todayStr}T00:00:00`)
                    .maybeSingle();

                if (session) {
                    results.push({ worker: shift.worker_id, status: "On Time (Session Exists)" });
                    continue;
                }

                const workerName = `${shift.workers.first_name} ${shift.workers.last_name}`;
                const objectName = shift.cleaning_objects.name;
                const phone = shift.workers.phone_number || "Не указан";
                const phoneLink = phone.replace(/[^0-9+]/g, '');
                const phoneHtml = phoneLink ? `<a href="tel:${phoneLink}">${phone}</a>` : phone;
                const workerChatId = shift.workers.telegram_chat_id;

                // Milestones: 10, 20, 30 min
                const milestones = [
                    { minutes: 10, type: "late_10" },
                    { minutes: 20, type: "late_20" },
                    { minutes: 30, type: "late_30" },
                ];

                for (const milestone of milestones) {
                    if (diff < milestone.minutes) continue;

                    const alreadySent = await wasNotificationSent(shift.worker_id, milestone.type, todayStr);
                    if (alreadySent) continue;

                    const lateMin = milestone.minutes;

                    // === Guardian message ===
                    const guardianEmoji = lateMin === 10 ? "⚠️" : lateMin === 20 ? "🟡" : "🔴";
                    const guardianMessage =
                        `${guardianEmoji} <b>Опоздание на смену — ${lateMin} мин</b>\n\n` +
                        `👤 Сотрудник: <b>${workerName}</b>\n` +
                        `📍 Объект: <b>${objectName}</b>\n` +
                        `⏰ Начало смены: <b>${shift.start_time}</b>\n` +
                        `⏳ Опоздание: <b>${diff} мин</b>\n\n` +
                        `📞 Позвонить: ${phoneHtml}`;

                    const guardians = await getGuardianRecipients(shift.object_id, shift.worker_id);
                    for (const chatId of guardians) {
                        await sendTelegramMessage(token, parseInt(chatId), guardianMessage);
                    }

                    // === Worker message ===
                    if (workerChatId) {
                        let workerMessage: string;
                        if (lateMin === 10) {
                            workerMessage =
                                `⏰ <b>Напоминание о смене</b>\n\n` +
                                `Ваша смена на объекте <b>${objectName}</b> началась в ${shift.start_time}.\n\n` +
                                `Если вы уже на месте — пожалуйста, <b>начните смену через бот</b>.\n` +
                                `Если нет — поторопитесь!`;
                        } else if (lateMin === 20) {
                            workerMessage =
                                `⚠️ <b>Вы опаздываете!</b>\n\n` +
                                `Смена на объекте <b>${objectName}</b> началась 20 минут назад.\n\n` +
                                `Если вы уже на объекте — <b>немедленно начните смену</b> через бот.\n` +
                                `Если вас нет на месте — сообщите куратору о причине.`;
                        } else {
                            workerMessage =
                                `🚨 <b>Серьёзное опоздание!</b>\n\n` +
                                `Вы опаздываете на смену (${objectName}) уже на 30 минут.\n\n` +
                                `Пожалуйста, <b>срочно начните смену</b> или немедленно свяжитесь с куратором.`;
                        }
                        await sendTelegramMessage(token, workerChatId, workerMessage);
                    }

                    // Log notification
                    await supabase.from("notifications_log").insert({
                        worker_id: shift.worker_id,
                        notification_type: milestone.type,
                        message: `Late ${lateMin}min alert: ${workerName} at ${objectName}`,
                        metadata: { shift_id: shift.id, delay_actual: diff, threshold: lateMin }
                    });

                    results.push({ worker: workerName, milestone: lateMin, status: "Sent" });
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

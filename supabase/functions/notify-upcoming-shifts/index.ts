
import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const supabaseClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )

        // 1. Calculate Target Time (Now + 1 Hour)
        const now = new Date();
        const oneHourLater = new Date(now.getTime() + 60 * 60 * 1000);

        // Get components for Warsaw timezone
        const getWarsawComponents = (date: Date) => {
            const options: Intl.DateTimeFormatOptions = {
                timeZone: 'Europe/Warsaw',
                hour: '2-digit',
                minute: '2-digit',
                weekday: 'short',
                hour12: false
            };
            const parts = new Intl.DateTimeFormat('en-GB', options).formatToParts(date);
            const comps: any = {};
            parts.forEach(p => comps[p.type] = p.value);

            // Determine day index (1-7, Mon-Sun)
            const weekdayStr = comps.weekday; // Mon, Tue, etc.
            const days: Record<string, number> = { 'Mon': 1, 'Tue': 2, 'Wed': 3, 'Thu': 4, 'Fri': 5, 'Sat': 6, 'Sun': 7 };

            return {
                hour: parseInt(comps.hour),
                minute: parseInt(comps.minute),
                dayOfWeek: days[weekdayStr] || 1
            };
        };

        const target = getWarsawComponents(oneHourLater);
        const targetTimeMinutes = target.hour * 60 + target.minute;

        console.log(`Checking for shifts starting around ${target.hour}:${target.minute} on day ${target.dayOfWeek}`);

        // 2. Find matching objects
        const { data: objects, error: objectsError } = await supabaseClient
            .from('cleaning_objects')
            .select('id, name, address, schedule_days, schedule_time_start, schedule_day_times')
            .eq('is_active', true)
            .not('schedule_days', 'is', null)
            .not('schedule_time_start', 'is', null);

        if (objectsError) throw objectsError;

        const upcomingShifts = objects.filter((obj: any) => {
            if (!obj.schedule_days.includes(target.dayOfWeek)) return false;

            // Use per-day time override if available
            const dayTimes = obj.schedule_day_times || {};
            const dayKey = String(target.dayOfWeek);
            const startTime = dayTimes[dayKey] || obj.schedule_time_start;

            const [h, m] = startTime.split(':').map(Number);
            const objTimeMinutes = h * 60 + m;

            const diff = Math.abs(objTimeMinutes - targetTimeMinutes);
            return diff <= 10; // 10 minutes tolerance
        });

        console.log(`Found ${upcomingShifts.length} objects with upcoming shifts.`);

        const notificationsSent: any[] = [];

        let botToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
        if (!botToken) {
            const { data: settings } = await supabaseClient
                .from('bot_settings')
                .select('telegram_bot_token')
                .limit(1)
                .maybeSingle();

            if (settings?.telegram_bot_token) {
                botToken = settings.telegram_bot_token;
            } else {
                return new Response(JSON.stringify({ error: 'Missing Bot Token' }), { status: 500, headers: corsHeaders });
            }
        }

        for (const obj of upcomingShifts) {
            const { data: assignments } = await supabaseClient
                .from('worker_objects')
                .select('schedule_days, worker:workers(id, first_name, telegram_chat_id, is_active)')
                .eq('object_id', obj.id);

            if (!assignments) continue;

            const workers = assignments
                .filter((a: any) => {
                    // Filter by worker's schedule_days if set
                    if (a.schedule_days && a.schedule_days.length > 0) {
                        return a.schedule_days.includes(target.dayOfWeek);
                    }
                    return true;
                })
                .map((a: any) => a.worker)
                .filter((w: any) => w && w.is_active && w.telegram_chat_id);

            for (const worker of workers) {
                // Check recently sent
                const twelveHoursAgo = new Date(now.getTime() - 12 * 60 * 60 * 1000).toISOString();
                const { data: logs } = await supabaseClient
                    .from('notifications_log')
                    .select('id')
                    .eq('worker_id', worker.id)
                    .eq('object_id', obj.id)
                    .eq('notification_type', 'shift_reminder')
                    .gte('sent_at', twelveHoursAgo);

                if (logs && logs.length > 0) continue;

                // Use per-day time override for the message
                const dayTimes = obj.schedule_day_times || {};
                const dayKey = String(target.dayOfWeek);
                const shiftStartTime = dayTimes[dayKey] || obj.schedule_time_start;

                const message = `🔔 *Напоминание о смене*\n\nЧерез час (в ${shiftStartTime.slice(0,5)}) начинается работа на объекте:\n\n🏢 *${obj.name}*\n📍 ${obj.address}`;

                try {
                    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            chat_id: worker.telegram_chat_id,
                            text: message,
                            parse_mode: 'Markdown'
                        })
                    });

                    if (response.ok) {
                        await supabaseClient.from('notifications_log').insert({
                            worker_id: worker.id,
                            object_id: obj.id,
                            notification_type: 'shift_reminder',
                            sent_at: new Date().toISOString(),
                            message: message
                        });
                        notificationsSent.push({ worker: worker.first_name, object: obj.name });
                    }
                } catch (err) {
                    console.error(err);
                }
            }
        }

        return new Response(JSON.stringify({ success: true, count: notificationsSent.length, details: notificationsSent }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    } catch (error: any) {
        return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
})

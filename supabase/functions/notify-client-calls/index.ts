
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

        const now = new Date();

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

        const remindersSent: any[] = [];

        // ============================================
        // PART 1: Object-level reminders (existing)
        // ============================================
        const { data: objects, error: objectsError } = await supabaseClient
            .from('cleaning_objects')
            .select(`
                id,
                name,
                client_phones,
                client_contact_names,
                reminder_active,
                reminder_frequency,
                reminder_assignee_id,
                last_reminder_at,
                assignee:admin_users!reminder_assignee_id(id, name, telegram_chat_id)
            `)
            .eq('reminder_active', true)
            .not('reminder_assignee_id', 'is', null);

        if (objectsError) throw objectsError;

        console.log(`Found ${objects?.length || 0} objects with active reminders.`);

        for (const obj of (objects || [])) {
            const lastReminder = obj.last_reminder_at ? new Date(obj.last_reminder_at) : null;
            let isDue = false;

            if (!lastReminder) {
                isDue = true;
            } else {
                const diffMs = now.getTime() - lastReminder.getTime();
                const diffDays = diffMs / (1000 * 60 * 60 * 24);

                if (obj.reminder_frequency === 'weekly' && diffDays >= 7) isDue = true;
                else if (obj.reminder_frequency === 'monthly' && diffDays >= 30) isDue = true;
                else if (obj.reminder_frequency === 'quarterly' && diffDays >= 90) isDue = true;
            }

            if (isDue && obj.assignee?.telegram_chat_id) {
                let contactList = '';
                if (obj.client_phones && obj.client_phones.length > 0) {
                    contactList = obj.client_phones.map((p: string, i: number) => {
                        const nameText = obj.client_contact_names?.[i] ? ` (${obj.client_contact_names[i]})` : '';
                        return `• <code>${p}</code>${nameText}`;
                    }).join('\n');
                } else {
                    contactList = 'номер не указан';
                }

                const message = `📞 <b>Напоминание о звонке клиенту</b>\n\n` +
                    `🏢 Объект: <b>${obj.name}</b>\n` +
                    `📱 Контакты клиента:\n${contactList}\n\n` +
                    `Пожалуйста, позвоните клиенту, уточните все ли у него хорошо.`;

                try {
                    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            chat_id: obj.assignee.telegram_chat_id,
                            text: message,
                            parse_mode: 'HTML'
                        })
                    });

                    if (response.ok) {
                        await supabaseClient
                            .from('cleaning_objects')
                            .update({ last_reminder_at: now.toISOString() })
                            .eq('id', obj.id);

                        await supabaseClient.from('notifications_log').insert({
                            object_id: obj.id,
                            notification_type: 'client_call_reminder',
                            sent_at: now.toISOString(),
                            message: `Call reminder for ${obj.name} sent to ${obj.assignee.name}`
                        });

                        remindersSent.push({ object: obj.name, assignee: obj.assignee.name });
                    } else {
                        const errorData = await response.json();
                        console.error(`Failed to send reminder to ${obj.assignee.telegram_chat_id}:`, errorData);
                    }
                } catch (err) {
                    console.error(`Error sending message for object ${obj.id}:`, err);
                }
            }
        }

        // ============================================
        // PART 2: Courtesy calls — daily digest
        // ============================================
        try {
            // Get all clients due for a courtesy call
            const { data: dueClients } = await supabaseClient
                .from('admin_users')
                .select('id, name, email, phone, next_courtesy_call_due')
                .eq('role', 'client')
                .lte('next_courtesy_call_due', now.toISOString());

            const dueCount = dueClients?.length || 0;
            console.log(`Courtesy calls due: ${dueCount}`);

            // Only send courtesy call digest to the designated coordinator
            const COURTESY_CALLS_CHAT_ID = '5125127700';
            if (dueCount > 0) {
                const clientWord = dueCount === 1 ? 'клиенту' : 'клиентам';
                const message = `📞 <b>Прозвоны клиентам</b>\n\n` +
                    `Сегодня нужно позвонить <b>${dueCount}</b> ${clientWord}.\n\n` +
                    `Нажмите кнопку «📞 Звонки клиентам» чтобы начать прозвон.`;

                try {
                    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            chat_id: COURTESY_CALLS_CHAT_ID,
                            text: message,
                            parse_mode: 'HTML'
                        })
                    });
                    remindersSent.push({ type: 'courtesy_digest', chat_id: COURTESY_CALLS_CHAT_ID, count: dueCount });
                } catch (err) {
                    console.error(`Error sending courtesy digest:`, err);
                }
            }
        } catch (err) {
            console.error('Error in courtesy calls digest:', err);
        }

        return new Response(JSON.stringify({
            success: true,
            count: remindersSent.length,
            details: remindersSent
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

    } catch (error: any) {
        console.error('Critical error in notify-client-calls:', error);
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
})

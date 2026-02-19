import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

serve(async (req) => {
    try {
        const { chat_id, message } = await req.json();

        if (!chat_id || !message) {
            return new Response(JSON.stringify({ error: 'chat_id and message required' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
        if (!botToken) {
            return new Response(JSON.stringify({ error: 'Bot token not configured' }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: typeof chat_id === 'string' ? parseInt(chat_id) : chat_id,
                text: message,
                parse_mode: 'HTML'
            })
        });

        const data = await res.json();

        if (!data.ok) {
            console.error('Telegram API error:', data);
            return new Response(JSON.stringify({ error: data.description || 'Telegram error' }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        return new Response(JSON.stringify({ success: true }), {
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error) {
        console.error('Error:', error);
        return new Response(JSON.stringify({ error: String(error) }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
});

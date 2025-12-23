import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        const { workerId, message } = await req.json();

        const supabaseClient = createClient(
            Deno.env.get("SUPABASE_URL") ?? "",
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
        );

        // Get worker's telegram chat ID
        const { data: worker } = await supabaseClient
            .from("workers")
            .select("telegram_chat_id, first_name, last_name")
            .eq("id", workerId)
            .single();

        if (!worker || !worker.telegram_chat_id) {
            return new Response(
                JSON.stringify({ error: "Worker not found or not activated in Telegram" }),
                { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        // Get bot token
        const { data: botSettings } = await supabaseClient
            .from("bot_settings")
            .select("telegram_bot_token")
            .single();

        if (!botSettings?.telegram_bot_token) {
            return new Response(
                JSON.stringify({ error: "Bot token not configured" }),
                { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        // Send message via Telegram Bot API
        const telegramResponse = await fetch(
            `https://api.telegram.org/bot${botSettings.telegram_bot_token}/sendMessage`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    chat_id: worker.telegram_chat_id,
                    text: message,
                    parse_mode: "HTML",
                }),
            }
        );

        const result = await telegramResponse.json();

        if (!result.ok) {
            return new Response(
                JSON.stringify({ error: "Failed to send message", details: result }),
                { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        return new Response(
            JSON.stringify({ success: true, message: "Message sent successfully" }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    } catch (error) {
        return new Response(
            JSON.stringify({ error: error.message }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});

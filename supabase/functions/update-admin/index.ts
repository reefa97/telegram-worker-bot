import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        const { adminId, password, permissions, name, phone, telegram_chat_id } = await req.json();

        if (!adminId) {
            throw new Error("Admin ID is required");
        }

        const supabaseAdmin = createClient(
            Deno.env.get("SUPABASE_URL") ?? "",
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
        );

        // 1. Update Password (if provided)
        if (password && password.length > 0) {
            const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(
                adminId,
                { password: password }
            );

            if (authError) throw authError;
        }

        // 2. Update DB Fields (permissions, name, phone, telegram)
        const updates: any = {};
        if (permissions) updates.permissions = permissions;
        if (name !== undefined) updates.name = name;
        if (phone !== undefined) updates.phone = phone;
        if (telegram_chat_id !== undefined) {
            const chatId = telegram_chat_id || null;
            updates.telegram_chat_id = chatId;
            if (chatId) updates.is_active = true;
            // If clearing ID (chatId is null), should we set is_active false? 
            // Maybe not, they might still be active via other means? 
            // But for manual integrity, if they remove ID, they can't get msgs.
            // Let's leave is_active alone if clearing, or set to false? 
            // Safest to set false if removing ID.
            if (!chatId) updates.is_active = false;
        }

        if (Object.keys(updates).length > 0) {
            const { error: dbError } = await supabaseAdmin
                .from("admin_users")
                .update(updates)
                .eq("id", adminId);

            if (dbError) throw dbError;
        }

        return new Response(
            JSON.stringify({ success: true }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    } catch (error) {
        return new Response(
            JSON.stringify({ error: error.message }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});

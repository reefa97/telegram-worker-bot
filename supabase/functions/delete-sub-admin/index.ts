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
        const { adminId } = await req.json();

        const supabaseAdmin = createClient(
            Deno.env.get("SUPABASE_URL") ?? "",
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
        );

        // Delete from admin_users table first (RLS will handle permission check)
        const { error: dbError } = await supabaseAdmin
            .from("admin_users")
            .delete()
            .eq("id", adminId)
            .in("role", ["sub_admin", "manager"]); // Allow deleting both types

        if (dbError) {
            return new Response(
                JSON.stringify({ error: dbError.message }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        // Delete from auth.users
        const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(adminId);

        if (authError) {
            console.error("Auth deletion error:", authError);
            // Continue even if auth deletion fails (user might already be deleted)
        }

        return new Response(
            JSON.stringify({ success: true, message: "Sub-admin deleted successfully" }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    } catch (error) {
        return new Response(
            JSON.stringify({ error: error.message }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});

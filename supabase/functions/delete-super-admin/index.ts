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
        const { adminId, requesterId } = await req.json();

        const supabaseAdmin = createClient(
            Deno.env.get("SUPABASE_URL") ?? "",
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
        );

        // Verify requester is a super admin
        const { data: requester } = await supabaseAdmin
            .from("admin_users")
            .select("role")
            .eq("id", requesterId)
            .single();

        if (!requester || requester.role !== "super_admin") {
            return new Response(
                JSON.stringify({ error: "Unauthorized: Only super admins can delete super admins" }),
                { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        // Verify target is a super admin
        const { data: target } = await supabaseAdmin
            .from("admin_users")
            .select("role")
            .eq("id", adminId)
            .single();

        if (!target || target.role !== "super_admin") {
            return new Response(
                JSON.stringify({ error: "Target user is not a super admin" }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        // Delete from admin_users table
        const { error: dbError } = await supabaseAdmin
            .from("admin_users")
            .delete()
            .eq("id", adminId);

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
        }

        return new Response(
            JSON.stringify({ success: true, message: "Super admin deleted successfully" }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    } catch (error) {
        return new Response(
            JSON.stringify({ error: (error as Error).message }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});

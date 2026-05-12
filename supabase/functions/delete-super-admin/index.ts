import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') ?? 'https://app.reefa.pl')
    .split(',').map(o => o.trim()).filter(Boolean);

function corsFor(req: Request): Record<string, string> {
    const origin = req.headers.get('Origin') || '';
    const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
    return {
        "Access-Control-Allow-Origin": allowed,
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Vary": "Origin",
    };
}

serve(async (req: Request) => {
    const cors = corsFor(req);
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: cors });
    }
    if (req.method !== "POST") {
        return new Response(JSON.stringify({ error: "Method not allowed" }),
            { status: 405, headers: { ...cors, "Content-Type": "application/json" } });
    }

    try {
        const supabaseAdmin = createClient(
            Deno.env.get("SUPABASE_URL") ?? "",
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
        );

        // --- Auth: requester is VERIFIED from JWT, not body ---
        const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
        if (!jwt) {
            return new Response(JSON.stringify({ error: "Authorization required" }),
                { status: 401, headers: { ...cors, "Content-Type": "application/json" } });
        }
        const { data: userData, error: authErr } = await supabaseAdmin.auth.getUser(jwt);
        if (authErr || !userData?.user) {
            return new Response(JSON.stringify({ error: "Invalid or expired token" }),
                { status: 401, headers: { ...cors, "Content-Type": "application/json" } });
        }
        const requesterId = userData.user.id;
        const { data: requester } = await supabaseAdmin
            .from("admin_users").select("role").eq("id", requesterId).single();
        if (requester?.role !== "super_admin") {
            return new Response(
                JSON.stringify({ error: "Only super_admin can delete super_admins" }),
                { status: 403, headers: { ...cors, "Content-Type": "application/json" } }
            );
        }

        const { adminId } = await req.json();
        if (!adminId) {
            return new Response(JSON.stringify({ error: "adminId required" }),
                { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
        }

        // Don't allow deleting yourself
        if (adminId === requesterId) {
            return new Response(JSON.stringify({ error: "Cannot delete your own super_admin account" }),
                { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
        }

        const { data: target } = await supabaseAdmin
            .from("admin_users").select("role").eq("id", adminId).single();
        if (!target) {
            return new Response(JSON.stringify({ error: "Target not found" }),
                { status: 404, headers: { ...cors, "Content-Type": "application/json" } });
        }
        if (target.role !== "super_admin") {
            return new Response(JSON.stringify({ error: "This endpoint only deletes super_admin" }),
                { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
        }

        // Don't allow deleting the last super_admin
        const { count } = await supabaseAdmin
            .from("admin_users").select("id", { count: "exact", head: true }).eq("role", "super_admin");
        if ((count ?? 0) <= 1) {
            return new Response(JSON.stringify({ error: "Cannot delete the last super_admin" }),
                { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
        }

        const { error: dbError } = await supabaseAdmin
            .from("admin_users").delete().eq("id", adminId);
        if (dbError) {
            return new Response(JSON.stringify({ error: dbError.message }),
                { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
        }

        const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(adminId);
        if (authError) console.error("Auth deletion error:", authError);

        return new Response(
            JSON.stringify({ success: true, message: "Super admin deleted" }),
            { headers: { ...cors, "Content-Type": "application/json" } }
        );
    } catch (error) {
        return new Response(
            JSON.stringify({ error: (error as Error).message }),
            { status: 500, headers: { ...cors, "Content-Type": "application/json" } }
        );
    }
});

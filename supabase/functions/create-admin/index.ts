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
        return new Response(JSON.stringify({ error: "Method not allowed" }), {
            status: 405, headers: { ...cors, "Content-Type": "application/json" }
        });
    }

    try {
        const supabaseAdmin = createClient(
            Deno.env.get("SUPABASE_URL") ?? "",
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
        );

        // --- Auth: caller must be authenticated super_admin or sub_admin ---
        const authHeader = req.headers.get("Authorization") || "";
        const jwt = authHeader.replace(/^Bearer\s+/i, "");
        if (!jwt) {
            return new Response(JSON.stringify({ error: "Authorization required" }),
                { status: 401, headers: { ...cors, "Content-Type": "application/json" } });
        }
        const { data: userData, error: authErr } = await supabaseAdmin.auth.getUser(jwt);
        if (authErr || !userData?.user) {
            return new Response(JSON.stringify({ error: "Invalid or expired token" }),
                { status: 401, headers: { ...cors, "Content-Type": "application/json" } });
        }
        const callerId = userData.user.id;
        const { data: caller } = await supabaseAdmin
            .from("admin_users").select("role").eq("id", callerId).single();
        const callerRole = caller?.role;
        if (!callerRole || !["super_admin", "sub_admin"].includes(callerRole)) {
            return new Response(JSON.stringify({ error: "Insufficient privileges" }),
                { status: 403, headers: { ...cors, "Content-Type": "application/json" } });
        }

        const { email, password, role, permissions, name, phone, telegram_chat_id } = await req.json();

        const allowedRoles = ["super_admin", "sub_admin", "manager", "client"];
        const userRole = role || "sub_admin";
        if (!allowedRoles.includes(userRole)) {
            return new Response(
                JSON.stringify({ error: `Invalid role: ${userRole}` }),
                { status: 400, headers: { ...cors, "Content-Type": "application/json" } }
            );
        }

        // --- Role policy: who can create whom ---
        // super_admin can create anyone.
        // sub_admin can only create role='client'.
        if (callerRole === "sub_admin" && userRole !== "client") {
            return new Response(
                JSON.stringify({ error: "sub_admin may only create clients" }),
                { status: 403, headers: { ...cors, "Content-Type": "application/json" } }
            );
        }

        // Create user in auth.users
        const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
            email, password,
            email_confirm: true,
            user_metadata: { name, role: userRole },
        });

        if (authError || !authData?.user) {
            return new Response(
                JSON.stringify({ error: authError?.message || "auth user create failed" }),
                { status: 400, headers: { ...cors, "Content-Type": "application/json" } }
            );
        }

        // Create admin record — created_by is the VERIFIED caller, not body
        const { data: adminData, error: adminError } = await supabaseAdmin
            .from("admin_users")
            .insert({
                id: authData.user.id,
                email,
                role: userRole,
                created_by: callerId,
                permissions: userRole === "client" ? {} : (permissions || {}),
                name,
                phone,
                telegram_chat_id: telegram_chat_id || null,
                is_active: userRole === "client" ? true : !!telegram_chat_id,
                plain_password: password || null,
            })
            .select()
            .single();

        if (adminError) {
            await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
            return new Response(
                JSON.stringify({ error: adminError.message }),
                { status: 400, headers: { ...cors, "Content-Type": "application/json" } }
            );
        }

        return new Response(
            JSON.stringify({ success: true, admin: adminData }),
            { headers: { ...cors, "Content-Type": "application/json" } }
        );
    } catch (error) {
        return new Response(
            JSON.stringify({ error: (error as Error).message }),
            { status: 500, headers: { ...cors, "Content-Type": "application/json" } }
        );
    }
});

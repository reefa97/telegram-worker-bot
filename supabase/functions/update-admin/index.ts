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

        // --- Auth ---
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
        const callerId = userData.user.id;

        const { adminId, password, permissions, name, phone, telegram_chat_id } = await req.json();
        if (!adminId) {
            return new Response(JSON.stringify({ error: "adminId required" }),
                { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
        }

        // Fetch caller and target roles to enforce policy
        const { data: rows, error: lookupErr } = await supabaseAdmin
            .from("admin_users")
            .select("id, role")
            .in("id", [callerId, adminId]);
        if (lookupErr) throw lookupErr;
        const caller = rows?.find(r => r.id === callerId);
        const target = rows?.find(r => r.id === adminId);
        if (!caller) {
            return new Response(JSON.stringify({ error: "Caller is not a known admin user" }),
                { status: 403, headers: { ...cors, "Content-Type": "application/json" } });
        }
        if (!target) {
            return new Response(JSON.stringify({ error: "Target admin not found" }),
                { status: 404, headers: { ...cors, "Content-Type": "application/json" } });
        }

        // Policy:
        // - super_admin can update anyone
        // - sub_admin can update only role='client' users they manage
        // - users can update themselves (limited fields — password/name/phone)
        const isSelf = callerId === adminId;
        const isSuper = caller.role === "super_admin";
        const isSubUpdatingClient = caller.role === "sub_admin" && target.role === "client";

        if (!isSelf && !isSuper && !isSubUpdatingClient) {
            return new Response(JSON.stringify({ error: "Insufficient privileges" }),
                { status: 403, headers: { ...cors, "Content-Type": "application/json" } });
        }

        // Self-update restrictions: only password/name/phone, NOT permissions or telegram_chat_id
        if (isSelf && !isSuper) {
            if (permissions !== undefined) {
                return new Response(JSON.stringify({ error: "Cannot edit own permissions" }),
                    { status: 403, headers: { ...cors, "Content-Type": "application/json" } });
            }
            if (telegram_chat_id !== undefined) {
                return new Response(JSON.stringify({ error: "Cannot edit own telegram_chat_id" }),
                    { status: 403, headers: { ...cors, "Content-Type": "application/json" } });
            }
        }

        // 1. Update Password (if provided)
        if (password && password.length > 0) {
            const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(
                adminId, { password }
            );
            if (authError) throw authError;
        }

        // 2. Update DB fields
        const updates: any = {};
        if (password && password.length > 0) updates.plain_password = password;
        if (permissions !== undefined && (isSuper || isSubUpdatingClient)) updates.permissions = permissions;
        if (name !== undefined) updates.name = name;
        if (phone !== undefined) updates.phone = phone;
        if (telegram_chat_id !== undefined && !isSelf) {
            const chatId = telegram_chat_id || null;
            updates.telegram_chat_id = chatId;
            updates.is_active = !!chatId;
        }

        if (Object.keys(updates).length > 0) {
            const { error: dbError } = await supabaseAdmin
                .from("admin_users").update(updates).eq("id", adminId);
            if (dbError) throw dbError;
        }

        return new Response(
            JSON.stringify({ success: true }),
            { headers: { ...cors, "Content-Type": "application/json" } }
        );
    } catch (error) {
        return new Response(
            JSON.stringify({ error: (error as Error).message }),
            { status: 500, headers: { ...cors, "Content-Type": "application/json" } }
        );
    }
});

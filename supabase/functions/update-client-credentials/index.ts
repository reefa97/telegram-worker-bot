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

    // --- Auth: caller must be admin (super_admin/sub_admin/manager) ---
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
    const { data: caller } = await supabaseAdmin
      .from("admin_users").select("role").eq("id", userData.user.id).single();
    if (!caller || !["super_admin", "sub_admin", "manager"].includes(caller.role)) {
      return new Response(JSON.stringify({ error: "Only admins can update client credentials" }),
        { status: 403, headers: { ...cors, "Content-Type": "application/json" } });
    }

    const { clientId, email, password, name } = await req.json();
    if (!clientId) {
      return new Response(JSON.stringify({ error: "clientId required" }),
        { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
    }

    // Verify target is a client (this endpoint is client-only)
    const { data: target } = await supabaseAdmin
      .from("admin_users").select("role").eq("id", clientId).single();
    if (!target) {
      return new Response(JSON.stringify({ error: "Client not found" }),
        { status: 404, headers: { ...cors, "Content-Type": "application/json" } });
    }
    if (target.role !== "client") {
      return new Response(JSON.stringify({ error: "Target is not a client" }),
        { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
    }

    const authUpdate: Record<string, string> = {};
    if (email) authUpdate.email = email;
    if (password) authUpdate.password = password;

    if (Object.keys(authUpdate).length > 0) {
      const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(clientId, authUpdate);
      if (authError) {
        return new Response(JSON.stringify({ error: authError.message }),
          { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
      }
    }

    const dbUpdate: Record<string, string> = {};
    if (email) dbUpdate.email = email;
    if (name !== undefined) dbUpdate.name = name;
    if (password) dbUpdate.plain_password = password;

    if (Object.keys(dbUpdate).length > 0) {
      const { error: dbError } = await supabaseAdmin
        .from("admin_users").update(dbUpdate).eq("id", clientId);
      if (dbError) {
        return new Response(JSON.stringify({ error: dbError.message }),
          { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
      }
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

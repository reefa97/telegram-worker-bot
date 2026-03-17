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
        const { email, password, role, createdBy, permissions, name, phone, telegram_chat_id } = await req.json();

        const supabaseAdmin = createClient(
            Deno.env.get("SUPABASE_URL") ?? "",
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
        );

        // Validate role first
        const allowedRoles = ['super_admin', 'sub_admin', 'manager', 'client'];
        const userRole = role || 'sub_admin';
        console.log('Role received:', role, 'Assigned role:', userRole);

        if (!allowedRoles.includes(userRole)) {
            return new Response(
                JSON.stringify({ error: `Invalid role: ${userRole}. Allowed: ${allowedRoles.join(', ')}` }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        // Create user in auth.users
        const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            user_metadata: { name, role: userRole } // Store name and role in metadata
        });

        if (authError) {
            return new Response(
                JSON.stringify({ error: authError.message }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        // Create admin record
        const { data: adminData, error: adminError } = await supabaseAdmin
            .from("admin_users")
            .insert({
                id: authData.user.id,
                email,
                role: userRole,
                created_by: createdBy,
                permissions: userRole === 'client' ? {} : (permissions || {}),
                name,
                phone,
                telegram_chat_id: telegram_chat_id || null,
                is_active: userRole === 'client' ? true : !!telegram_chat_id,
                ...(userRole === 'client' ? { plain_password: password } : {}),
            })
            .select()
            .single();

        if (adminError) {
            // Rollback auth user creation
            await supabaseAdmin.auth.admin.deleteUser(authData.user.id);

            return new Response(
                JSON.stringify({ error: adminError.message }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        return new Response(
            JSON.stringify({ success: true, admin: adminData }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    } catch (error) {
        return new Response(
            JSON.stringify({ error: (error as Error).message }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});

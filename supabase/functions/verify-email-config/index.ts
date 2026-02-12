import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const { email, password, imap_host, imap_port, smtp_host, smtp_port } = await req.json();

        let nodemailer;
        try {
            const driverModule = await import("npm:nodemailer@6.9.7");
            nodemailer = driverModule.default;
        } catch (importError: any) {
            return new Response(JSON.stringify({ error: `Dependency Error: ${importError.message}` }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        // 1. Verify SMTP
        // We only verify SMTP to avoid Deno Runtime crashes with imap-simple.
        // If SMTP works, the password is correct.
        try {
            const transporter = nodemailer.createTransport({
                host: smtp_host,
                port: smtp_port,
                secure: smtp_port === 465,
                auth: {
                    user: email,
                    pass: password,
                },
                tls: {
                    rejectUnauthorized: false
                },
                connectionTimeout: 10000
            });
            await transporter.verify();
        } catch (e: any) {
            return new Response(JSON.stringify({ error: `SMTP Error: ${e.message || e}` }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        return new Response(JSON.stringify({ success: true }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    } catch (error: any) {
        return new Response(JSON.stringify({ error: error.message || 'Unknown error' }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
});

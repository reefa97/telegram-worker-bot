import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

// Transparent 1x1 GIF (43 bytes)
const TRANSPARENT_GIF = new Uint8Array([
    0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00,
    0x01, 0x00, 0x80, 0x00, 0x00, 0xff, 0xff, 0xff,
    0x00, 0x00, 0x00, 0x21, 0xf9, 0x04, 0x01, 0x00,
    0x00, 0x00, 0x00, 0x2c, 0x00, 0x00, 0x00, 0x00,
    0x01, 0x00, 0x01, 0x00, 0x00, 0x02, 0x02, 0x44,
    0x01, 0x00, 0x3b,
]);

const GIF_HEADERS = {
    "Content-Type": "image/gif",
    "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    "Pragma": "no-cache",
    "Expires": "0",
};

serve(async (req: Request) => {
    // Extract track_id from URL path: /track-pixel/{uuid}
    const url = new URL(req.url);
    const pathParts = url.pathname.split("/").filter(Boolean);
    const trackId = pathParts[pathParts.length - 1];

    if (!trackId || trackId === "track-pixel") {
        return new Response(TRANSPARENT_GIF, { headers: GIF_HEADERS });
    }

    // Fire-and-forget: record the open and send notification
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "";
    const userAgent = req.headers.get("user-agent") || "";

    // Use EdgeRuntime.waitUntil-like pattern: don't await, just fire
    const recordOpen = async () => {
        try {
            const supabase = createClient(
                Deno.env.get("SUPABASE_URL") ?? "",
                Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
            );

            // Fetch track info — also check creation time to skip preview opens
            const { data: track } = await supabase
                .from("email_tracks")
                .select("subject, recipient_email, created_at")
                .eq("id", trackId)
                .single();

            if (!track) return;

            // Ignore opens within 60 seconds of creation (email editor preview)
            const createdAt = new Date(track.created_at).getTime();
            if (Date.now() - createdAt < 60_000) return;

            // Record the open
            await supabase.from("email_opens").insert({
                track_id: trackId,
                ip,
                user_agent: userAgent,
            });

            // Count total opens for this track
            const { count } = await supabase
                .from("email_opens")
                .select("id", { count: "exact", head: true })
                .eq("track_id", trackId);

            // Get bot token and admin chat_id for notification
            const { data: botSettings } = await supabase
                .from("bot_settings")
                .select("telegram_bot_token")
                .single();

            if (!botSettings?.telegram_bot_token) return;

            // Get the creator's telegram_chat_id
            const { data: trackWithUser } = await supabase
                .from("email_tracks")
                .select("created_by")
                .eq("id", trackId)
                .single();

            if (!trackWithUser) return;

            const { data: adminUser } = await supabase
                .from("admin_users")
                .select("telegram_chat_id")
                .eq("id", trackWithUser.created_by)
                .single();

            if (!adminUser?.telegram_chat_id) return;

            const now = new Date().toLocaleString("pl-PL", { timeZone: "Europe/Warsaw" });
            const message = `\u{1F4EC} Otwarta oferta: ${track.subject}\n\u{1F4E8} Odbiorca: ${track.recipient_email}\n\u{1F552} Czas: ${now}\n\u{1F50D} Otwarcie #${count || 1}`;

            await fetch(
                `https://api.telegram.org/bot${botSettings.telegram_bot_token}/sendMessage`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        chat_id: adminUser.telegram_chat_id,
                        text: message,
                    }),
                }
            );
        } catch (e) {
            console.error("track-pixel background error:", e);
        }
    };

    // Fire without awaiting — don't block GIF response
    recordOpen();

    return new Response(TRANSPARENT_GIF, { headers: GIF_HEADERS });
});


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
        const { image, objectId } = await req.json();

        if (!image) {
            throw new Error("No image provided");
        }

        const supabaseAdmin = createClient(
            Deno.env.get("SUPABASE_URL") ?? "",
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
        );

        // 1. Get OpenAI Key from Admin Users (any admin with key, or specific one?)
        // Ideally from the user who made the request, but we don't have auth context here easily without passing token.
        // Let's grab the first non-null key for now, assuming shared organization key logic from python script.
        const { data: adminData } = await supabaseAdmin
            .from("admin_users")
            .select("openai_key")
            .not("openai_key", "is", null)
            .limit(1)
            .single();

        const openaiKey = adminData?.openai_key;

        if (!openaiKey) {
            throw new Error("OpenAI API Key not found. Please add it to admin_users table.");
        }

        // 2. Call OpenAI GPT-4o
        const response = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${openaiKey}`,
            },
            body: JSON.stringify({
                model: "gpt-4o",
                messages: [
                    {
                        role: "system",
                        content: `You are an AI that extracts cleaning tasks from images of contracts or checklists. 
                        Output ONLY valid JSON array of tasks. 
                        Each task object should have:
                        - title: string (The task name)
                        - description: string (Any details, optional)
                        - is_recurring: boolean (true if daily/weekly, false if one-time date)
                        - scheduled_days: number[] (0=Sun, 1=Mon... 6=Sat). If Daily, return [0,1,2,3,4,5,6]. If specific days, return those. If monthly/unknown, guess or leave empty.
                        - scheduled_dates: string[] (YYYY-MM-DD) if is_recurring is false.
                        
                        Example:
                        [
                            {"title": "Mop floors", "description": "Use pine cleaner", "is_recurring": true, "scheduled_days": [1,3,5], "scheduled_dates": []},
                            {"title": "Deep clean windows", "description": "", "is_recurring": false, "scheduled_days": [], "scheduled_dates": ["2024-12-25"]}
                        ]
                        Do not include markdown formatting like \`\`\`json.`
                    },
                    {
                        role: "user",
                        content: [
                            { type: "text", text: "Extract these tasks:" },
                            { type: "image_url", image_url: { url: image } } // 'image' can be base64 data URI or public URL
                        ]
                    }
                ],
                max_tokens: 2000
            })
        });

        const data = await response.json();

        if (data.error) {
            throw new Error(`OpenAI Error: ${data.error.message}`);
        }

        const content = data.choices[0].message.content;
        let tasks = [];
        try {
            // Remove markdown code blocks if present
            const cleanContent = content.replace(/```json/g, '').replace(/```/g, '').trim();
            tasks = JSON.parse(cleanContent);
        } catch (e) {
            console.error("Failed to parse JSON:", content);
            throw new Error("Failed to parse AI response");
        }

        return new Response(
            JSON.stringify({ tasks }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );

    } catch (error) {
        return new Response(
            JSON.stringify({ error: (error as Error).message }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});

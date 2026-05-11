
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `Jesteś ekspertem od analizy dokumentów dla firm sprzątających w Polsce.

Twoim zadaniem jest przeczytanie dokumentu (umowa, specyfikacja, checklist, harmonogram) i wyodrębnienie WYŁĄCZNIE zadań sprzątania/utrzymania czystości z przypisaniem do dni tygodnia.

## ZASADY EKSTRAKCJI:

1. **Wyodrębniaj TYLKO konkretne czynności do wykonania** — ignoruj dane firmowe, adresy, NIP, warunki płatności, kary umowne, dane kontaktowe, podpisy itp.

2. **Każde zadanie powinno być konkretne i zrozumiałe** — np. "Mycie podłóg" zamiast "Utrzymanie czystości" (chyba że dokument nie precyzuje).

3. **Przypisz dni tygodnia** na podstawie informacji z dokumentu:
   - Jeśli dokument mówi "codziennie" → scheduled_days: [1,2,3,4,5,6,7]
   - Jeśli "od poniedziałku do piątku" → scheduled_days: [1,2,3,4,5]
   - Jeśli "raz w tygodniu" bez podanego dnia → scheduled_days: [1] (domyślnie poniedziałek)
   - Jeśli "raz w miesiącu" → is_recurring: true, scheduled_days: [1]
   - Jeśli podane konkretne dni → użyj ich (1=Pon, 2=Wt, 3=Śr, 4=Czw, 5=Pt, 6=Sob, 7=Ndz)

4. **Częstotliwość w opisie** — jeśli dokument mówi "2x w tygodniu", "co 2 tygodnie", "raz w miesiącu" itp., dodaj tę informację do pola description.

5. **Grupuj logicznie** — jeśli dokument wymienia podobne czynności dla różnych pomieszczeń, można je połączyć lub zostawić osobno (zależy od dokumentu).

## FORMAT ODPOWIEDZI:

Odpowiedz WYŁĄCZNIE poprawną tablicą JSON (bez markdown, bez tekstu przed/po):

[
  {
    "title": "Mycie podłóg",
    "description": "Wszystkie pomieszczenia biurowe, środek do paneli",
    "is_recurring": true,
    "scheduled_days": [1,2,3,4,5],
    "scheduled_dates": []
  },
  {
    "title": "Mycie okien",
    "description": "Raz w miesiącu, wszystkie okna wewnątrz i na zewnątrz",
    "is_recurring": true,
    "scheduled_days": [5],
    "scheduled_dates": []
  }
]

Numeracja dni: 1=Poniedziałek, 2=Wtorek, 3=Środa, 4=Czwartek, 5=Piątek, 6=Sobota, 7=Niedziela.
Nie dodawaj żadnego tekstu poza tablicą JSON.`;

serve(async (req: Request) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        const { image } = await req.json();

        if (!image) {
            throw new Error("No image provided");
        }

        const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
        if (!anthropicKey) {
            throw new Error("ANTHROPIC_API_KEY not configured");
        }

        // Prepare content — support base64 data URI for images and PDFs
        let mediaType = "image/jpeg";
        let base64Data = image;
        let isPdf = false;

        if (image.startsWith("data:")) {
            const match = image.match(/^data:([^;]+);base64,(.+)$/);
            if (match) {
                mediaType = match[1];
                base64Data = match[2];
                isPdf = mediaType === "application/pdf";
            }
        }

        // Build the file content block — PDF uses "document" type, images use "image" type
        const fileBlock = isPdf
            ? {
                type: "document",
                source: {
                    type: "base64",
                    media_type: "application/pdf",
                    data: base64Data,
                },
            }
            : {
                type: "image",
                source: {
                    type: "base64",
                    media_type: mediaType,
                    data: base64Data,
                },
            };

        // Call Claude Haiku with vision/document
        const response = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-api-key": anthropicKey,
                "anthropic-version": "2023-06-01",
            },
            body: JSON.stringify({
                model: "claude-haiku-4-5-20251001",
                max_tokens: 4096,
                system: SYSTEM_PROMPT,
                messages: [
                    {
                        role: "user",
                        content: [
                            fileBlock,
                            {
                                type: "text",
                                text: "Przeanalizuj ten dokument i wyodrębnij zadania sprzątania z przypisaniem do dni tygodnia.",
                            },
                        ],
                    },
                ],
            }),
        });

        const data = await response.json();

        if (data.error) {
            throw new Error(`Claude Error: ${data.error.message}`);
        }

        const content = data.content?.[0]?.text || "";
        let tasks = [];
        try {
            // Try direct parse first
            let text = content.trim();
            // Remove markdown code blocks if present
            if (text.includes("```")) {
                const match = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
                if (match) text = match[1].trim();
            }
            tasks = JSON.parse(text);
        } catch {
            // Fallback: find JSON array in response
            const bracketStart = content.indexOf("[");
            const bracketEnd = content.lastIndexOf("]");
            if (bracketStart !== -1 && bracketEnd !== -1) {
                tasks = JSON.parse(content.slice(bracketStart, bracketEnd + 1));
            } else {
                console.error("Failed to parse JSON:", content);
                throw new Error("AI nie zwróciło poprawnego JSON");
            }
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

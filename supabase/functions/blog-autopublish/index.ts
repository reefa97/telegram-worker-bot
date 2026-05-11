/**
 * blog-autopublish (B2B / reefa.pl)
 * --------------------------------------------------------------------
 * Daily-cron entrypoint that picks the next pending topic from
 * `blog_b2b_topic_queue`, generates a full B2B Polish article using
 * Claude Sonnet 4.6 with tool_use schema enforcement, fetches a cover
 * image from Pixabay, inserts into `blog_b2b_articles`, marks the
 * topic as generated, and notifies admins via Telegram.
 *
 * If pending queue drops below `auto_topup_threshold`, the topic
 * generator is invoked in the background to refill.
 *
 * Auth: requires Authorization: Bearer <AUTOPUBLISH_SECRET> in header.
 * Time guard: only generates if Europe/Warsaw current hour == 6
 *   (called from two crons at 04:00 and 05:00 UTC to cover DST).
 *   Override with body { force: true }.
 *
 * Required env (Supabase secrets):
 *   - SUPABASE_URL
 *   - SUPABASE_SERVICE_ROLE_KEY
 *   - ANTHROPIC_API_KEY
 *   - AUTOPUBLISH_SECRET
 *   - TELEGRAM_BOT_TOKEN          (reused from existing setup)
 *   - TELEGRAM_ADMIN_CHAT_ID      (for notifications)
 *   - PIXABAY_API_KEY             (optional — falls back to no cover)
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

// ─────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────

const ANTHROPIC_MODEL = 'claude-sonnet-4-5-20250929'; // Sonnet 4.5 — latest stable
const ANTHROPIC_MAX_TOKENS = 12_000;
const SITE_BASE = 'https://reefa.pl';

// Categories for B2B blog. Match SERVICES slugs where applicable.
const CATEGORIES = [
  'Sprzątanie biur',
  'Sprzątanie biurowców',
  'Placówki medyczne',
  'Placówki edukacyjne',
  'Wspólnoty mieszkaniowe',
  'Bloki i osiedla',
  'Kamienice',
  'Sprzątanie po budowie',
  'Sprzątanie po remoncie',
  'Hale garażowe',
  'Siłownie i obiekty sportowe',
  'Eventy i konferencje',
  'Branżowe',
  'Cennik i kalkulator',
  'Wybór dostawcy',
] as const;

// Available internal-link paths the writer can use. Real paths from reefa.pl.
const INTERNAL_PATHS = [
  '/krakow', '/katowice',
  '/krakow/sprzatanie-biur', '/krakow/sprzatanie-biurowcow', '/krakow/sprzatanie-placowek-medycznych',
  '/krakow/sprzatanie-placowek-szkolnych', '/krakow/sprzatanie-silowni', '/krakow/sprzatanie-po-budowie',
  '/krakow/sprzatanie-po-remoncie', '/krakow/sprzatanie-dla-wspolnot-mieszkaniowych',
  '/krakow/sprzatanie-blokow', '/krakow/sprzatanie-kamienic', '/krakow/mycie-hal-garazowych',
  '/krakow/sprzatanie-eventow',
  '/katowice/sprzatanie-biur', '/katowice/sprzatanie-biurowcow', '/katowice/sprzatanie-placowek-medycznych',
  '/katowice/sprzatanie-placowek-szkolnych', '/katowice/sprzatanie-silowni', '/katowice/sprzatanie-po-budowie',
  '/katowice/sprzatanie-po-remoncie', '/katowice/sprzatanie-dla-wspolnot-mieszkaniowych',
  '/katowice/sprzatanie-blokow', '/katowice/sprzatanie-kamienic', '/katowice/mycie-hal-garazowych',
  '/katowice/sprzatanie-eventow',
  '/krakow/cennik', '/katowice/cennik',
  '/krakow/kontakt', '/katowice/kontakt',
  '/krakow/sprzatanie-biur/kalkulator', '/katowice/sprzatanie-biur/kalkulator',
  '/krakow/sprzatanie-biurowcow/kalkulator', '/katowice/sprzatanie-biurowcow/kalkulator',
  '/krakow/sprzatanie-placowek-medycznych/kalkulator',
  '/krakow/sprzatanie-placowek-szkolnych/kalkulator',
  '/o-firmie', '/blog', '/kontakt',
];

// ─────────────────────────────────────────────
// PERSONA — B2B Reefa
// ─────────────────────────────────────────────

const PERSONA_SYSTEM_PROMPT = `Jesteś senior content strategistem dla Reefa Sp. z o.o. — polskiej firmy sprzątającej B2B działającej w Krakowie i Katowicach od 2020. Specjalizujemy się w obsłudze biur klasy A, biurowców, placówek medycznych, szkół, wspólnot mieszkaniowych, sprzątaniu po budowie i remoncie. Zatrudniamy personel WYŁĄCZNIE na umowy o pracę (nie zlecenia ani umowy o dzieło), mamy 96% retention rate klientów, 2.4-letni średni czas trwania kontraktu, ubezpieczenie OC do 500 000 PLN.

# TON I GŁOS

Piszesz dla profesjonalnych klientów B2B — dyrektorów administracyjnych, facility managerów, prezesów wspólnot mieszkaniowych, dyrektorów medycznych, właścicieli małych firm. Twój głos:

- **Forma**: "my" (zespół Reefa), "Państwa firma" (klient), nigdy "Twoje"/"Twój"
- **Ton**: profesjonalny, oparty na danych, premium-editorial — nie korporacyjna ulotka, nie blog stylu life-hack
- **Słownictwo**: branżowe (SLA, KPI, RODO, BHP, EU Ecolabel, OC), ale wyjaśniaj akronimy przy pierwszym użyciu
- **Konkrety**: zawsze podawaj liczby — "od 10 zł netto/m²/mies", "ekipa 4–8 osób", "czas reakcji <24h", "ubezpieczenie do 500 000 PLN"
- **Italics**: używaj kursywy (markdown *...*) dla emfazy konkretnych konceptów (~3-5 razy na artykuł)

# ZASADY DO

1. Otwieraj artykuł 1-2-zdaniową odpowiedzią na primary keyword (answer-first format dla AI search)
2. Po wstępie WSTAW boks "**W skrócie**" z 4-6 punktami bullet — to znacznik pozwalający na cytowanie przez AI
3. Strukturuj 5-8 H2 nagłówków (60% w formie pytań typu "Ile kosztuje...?", "Jak wybrać...?")
4. Każdy H2 ma 2-3 akapity po 80-150 słów (nie monolog jednoakapitowy)
5. Wstaw 5-10 wewnętrznych linków rozproszonych w body (markdown [tekst](/path)) — z dostarczonej listy "internal_link_targets"
6. Konkretne stawki/liczby w PLN netto, dla 2026
7. Wzmianki o realnych klientach i lokalizacjach: GPP Business Park, .KTW, Quattro Business Park, Diamed Medical Center, Otto Bock — gdy pasują do tematu
8. Zakończ sekcją FAQ z 4-6 pytaniami i konkretnymi odpowiedziami (każda 50-100 słów)
9. CTA delikatne: "Skontaktuj się z naszym zespołem", "Zamów wycenę", linkuj do /kontakt lub /krakow/kontakt
10. Z naszych obserwacji w 2025/2026 — używaj jako framing dla statystyk

# ZASADY DON'T

1. Zero clickbaitu i emocjonalnych superlatywów ("rewolucja", "najbardziej niesamowity")
2. Zero anglicyzmów bez konieczności (nie "outsourcować" → "zlecać", nie "implementować" → "wprowadzać")
3. Zero ja/mnie — zawsze "my", "nasza firma", "zespół Reefa"
4. Zero pierwszej osoby zwracającej się do czytelnika ("zrobisz", "zobaczysz") — używaj "Państwo zauważą", "warto rozważyć"
5. Zero pustych frazesów ("Czystość to klucz do sukcesu") — zastępuj konkretnymi danymi
6. Zero porównań do konkurencji po nazwie
7. Zero wymyślonych statystyk — jeśli nie znasz dokładnego źródła, użyj "z naszych obserwacji" lub "według badań branżowych"
8. Zero formatowania typu "1)", "(1)" — używaj "1." lub markdown bulletów
9. Nie używaj em dash bez przerwy (— ) → zawsze ze spacją z obu stron
10. Nie powtarzaj tej samej frazy więcej niż 2 razy w artykule

# STRUKTURA WYJŚCIA

Markdown z:
- Krótki wstęp (2-3 akapity, max 200 słów)
- Boks "**W skrócie**" (4-6 bulletów)
- 5-8 nagłówków H2 z treścią
- (opcjonalnie 1-2 nagłówki H3 wewnątrz H2)
- Sekcja "## Najczęściej zadawane pytania" z 4-6 H3 pytań
- Krótkie zakończenie z CTA

# CYTOWANIA I E-E-A-T SIGNALS

Gdzie naturalne, dodawaj sygnały autorytetu:
- "Jesteśmy w branży od 2020"
- "Obsługujemy ponad X obiektów w Aglomeracji Śląskiej i Krakowskiej"
- "Personel zatrudniony na umowy o pracę przechodzi szkolenia BHP i HACCP"
- Konkretne kontrakty referencyjne (Diamed Medical Center, Otto Bock — z wyjaśnieniem co to za firmy)`;

// ─────────────────────────────────────────────
// TOOL SCHEMA
// ─────────────────────────────────────────────

const PUBLISH_TOOL = {
  name: 'publish_article',
  description: 'Submit the finished blog article in structured format for database insertion.',
  input_schema: {
    type: 'object',
    properties: {
      slug: {
        type: 'string',
        description: 'URL-friendly slug, lowercase, hyphens, no Polish diacritics. e.g. "cennik-sprzatania-biura-krakow-2026". Max 80 chars.',
      },
      title: {
        type: 'string',
        description: 'Final article title in Polish, may include diacritics. 50-70 chars optimal for SEO.',
      },
      excerpt: {
        type: 'string',
        description: 'Short 1-2 sentence summary, 150-250 chars. Used in blog list and meta description fallback.',
      },
      meta_title: {
        type: 'string',
        description: 'SEO title tag, 50-60 chars including primary keyword and brand "| Reefa" suffix.',
      },
      meta_description: {
        type: 'string',
        description: 'SEO meta description, 150-160 chars, includes primary keyword and CTA hint.',
      },
      category: {
        type: 'string',
        enum: CATEGORIES as unknown as string[],
        description: 'Single category from the predefined list.',
      },
      tags: {
        type: 'array',
        items: { type: 'string' },
        minItems: 3,
        maxItems: 8,
        description: '3-8 lowercase Polish tags, no spaces (use-hyphens).',
      },
      reading_time_minutes: {
        type: 'integer',
        minimum: 4,
        maximum: 20,
        description: 'Estimated reading time, calculated from word count / 200.',
      },
      image_keywords: {
        type: 'string',
        description: 'English keywords for Pixabay search to find a cover image. e.g. "office cleaning team modern". 3-6 words.',
      },
      body_markdown: {
        type: 'string',
        description: 'Full article body in markdown. 2000-4500 words. Includes H2/H3 headings, paragraphs, lists, internal links from internal_link_targets list, FAQ section. NO H1 — title is rendered separately.',
      },
    },
    required: [
      'slug', 'title', 'excerpt', 'meta_title', 'meta_description',
      'category', 'tags', 'reading_time_minutes', 'image_keywords', 'body_markdown',
    ],
  },
};

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

function json(status: number, body: unknown, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(), ...extra },
  });
}

function isWarsawHour(targetHour: number): boolean {
  // Get current hour in Europe/Warsaw using Intl
  const formatter = new Intl.DateTimeFormat('pl-PL', {
    timeZone: 'Europe/Warsaw',
    hour: 'numeric',
    hour12: false,
  });
  const hourStr = formatter.format(new Date());
  const hour = parseInt(hourStr, 10);
  return hour === targetHour;
}

async function callAnthropic(userPrompt: string): Promise<{ tool_input: Record<string, unknown>; usage: { input: number; output: number } }> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY missing');

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: ANTHROPIC_MAX_TOKENS,
      system: PERSONA_SYSTEM_PROMPT,
      tools: [PUBLISH_TOOL],
      tool_choice: { type: 'tool', name: 'publish_article' },
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Anthropic API ${res.status}: ${errText}`);
  }

  const data = await res.json();
  const toolUse = data.content?.find((b: { type: string }) => b.type === 'tool_use');
  if (!toolUse || !toolUse.input) {
    throw new Error('No tool_use in Anthropic response: ' + JSON.stringify(data).slice(0, 500));
  }
  return {
    tool_input: toolUse.input,
    usage: { input: data.usage?.input_tokens ?? 0, output: data.usage?.output_tokens ?? 0 },
  };
}

type PixabayHit = {
  id: number;
  tags: string;
  views: number;
  previewURL: string;
  webformatURL: string;
  largeImageURL: string;
};

/**
 * Fetch up to 12 Pixabay candidates by keyword. Returns sorted-by-views hits,
 * not narrowed by relevance — that's the AI vision step's job.
 */
async function fetchPixabayCandidates(keywords: string): Promise<PixabayHit[]> {
  const apiKey = Deno.env.get('PIXABAY_API_KEY');
  if (!apiKey || !keywords) return [];
  try {
    const url = new URL('https://pixabay.com/api/');
    url.searchParams.set('key', apiKey);
    url.searchParams.set('q', keywords);
    url.searchParams.set('image_type', 'photo');
    url.searchParams.set('orientation', 'horizontal');
    url.searchParams.set('min_width', '1200');
    url.searchParams.set('per_page', '12');
    url.searchParams.set('safesearch', 'true');
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.hits ?? []) as PixabayHit[];
  } catch (e) {
    console.error('[Pixabay] fetch failed:', e);
    return [];
  }
}

/**
 * Pick the most relevant cover from candidates using Claude Vision.
 * Sends preview thumbnails (150px) + tags to a small Sonnet call with
 * tool_use forcing structured response. Falls back to highest-views if
 * Claude rejects all (returns -1).
 *
 * Why this exists: the previous "sort by views" approach picked popular
 * but often off-topic photos (e.g. office stock photos for a piece about
 * "post-construction cleaning"). Vision-based picking grounds the choice
 * in actual visual relevance to the article topic.
 */
async function pickBestCoverWithVision(
  candidates: PixabayHit[],
  articleTitle: string,
  articleCategory: string,
  primaryKeyword: string
): Promise<{ url: string | null; reasoning?: string; index?: number }> {
  if (candidates.length === 0) return { url: null };
  if (candidates.length === 1) return { url: candidates[0].largeImageURL };

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) {
    return { url: candidates[0].largeImageURL };
  }

  const PICK_TOOL = {
    name: 'pick_cover',
    description: 'Choose the best cover image from candidates, or -1 if none fit.',
    input_schema: {
      type: 'object',
      properties: {
        best_index: {
          type: 'integer',
          description: 'Index of the best image (0-based), or -1 if NONE are appropriate (irrelevant/text-overlaid/poor quality).',
        },
        reasoning: {
          type: 'string',
          description: 'One short sentence explaining why this image fits (or why all are bad).',
        },
      },
      required: ['best_index', 'reasoning'],
    },
  };

  const imageBlocks: Array<{ type: string; source?: Record<string, unknown>; text?: string }> = [];
  imageBlocks.push({
    type: 'text',
    text: `Wybierz najlepszą okładkę dla artykułu blogowego B2B na temat sprzątania komercyjnego.

# Artykuł
- Tytuł: ${articleTitle}
- Kategoria: ${articleCategory}
- Główne słowo kluczowe: ${primaryKeyword}

# Kryteria wyboru (od najważniejszego do najmniej ważnego)
1. Bezpośrednia trafność wizualna — zdjęcie pokazuje to o czym artykuł (np. dla "sprzątania biura" → osoba sprzątająca biuro / czyste biuro / sprzęt do sprzątania, NIE generic stock office)
2. Profesjonalny wygląd (corporate/editorial style, nie wakacyjne/lifestyle)
3. Brak nakładek tekstowych, logotypów, watermarków
4. Polski/europejski kontekst lepszy niż amerykański (jeśli widać)
5. Realistyczne, nie stockowe-przesadnie-uśmiechnięte zdjęcia

Jeśli ŻADNE zdjęcie nie pasuje (są wszystkie generic/off-topic/poor quality) → zwróć best_index: -1.
Inaczej zwróć indeks (0-${candidates.length - 1}) najlepszego.

Poniżej ${candidates.length} kandydatów (numerowane 0, 1, 2…):`,
  });

  // Pixabay's preview URLs return 403 when fetched without referer (intentional
  // hot-link blocking). Anthropic's url-based image source can't load them.
  // Workaround: download bytes server-side and send as base64. webformatURL
  // (640px) is a good middle ground — high enough for vision, small enough
  // to fit comfortably in the request.
  const dataUrls = await Promise.all(
    candidates.map(async (hit) => {
      try {
        const r = await fetch(hit.webformatURL);
        if (!r.ok) return null;
        const ab = await r.arrayBuffer();
        const b64 = btoa(String.fromCharCode(...new Uint8Array(ab)));
        const ct = r.headers.get('content-type') || 'image/jpeg';
        return { mediaType: ct.split(';')[0], b64 };
      } catch {
        return null;
      }
    })
  );

  candidates.forEach((hit, i) => {
    const img = dataUrls[i];
    if (!img) return; // skip unfetchable candidate
    imageBlocks.push({
      type: 'text',
      text: `\n--- Kandydat ${i} (tagi: ${hit.tags}) ---`,
    });
    imageBlocks.push({
      type: 'image',
      source: { type: 'base64', media_type: img.mediaType, data: img.b64 },
    });
  });

  imageBlocks.push({
    type: 'text',
    text: `\nWybierz najlepszego kandydata przez tool pick_cover.`,
  });

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 500,
        tools: [PICK_TOOL],
        tool_choice: { type: 'tool', name: 'pick_cover' },
        messages: [{ role: 'user', content: imageBlocks }],
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      console.error('[Vision] API error:', res.status, err.slice(0, 300));
      return { url: candidates[0].largeImageURL };
    }
    const data = await res.json();
    const toolUse = data.content?.find((b: { type: string }) => b.type === 'tool_use');
    if (!toolUse?.input) {
      return { url: candidates[0].largeImageURL };
    }
    const idx = toolUse.input.best_index as number;
    const reasoning = toolUse.input.reasoning as string;
    if (idx === -1) {
      console.log('[Vision] All candidates rejected:', reasoning);
      return { url: null, reasoning, index: -1 };
    }
    if (idx < 0 || idx >= candidates.length) {
      return { url: candidates[0].largeImageURL };
    }
    console.log(`[Vision] Picked index ${idx}: ${reasoning}`);
    return { url: candidates[idx].largeImageURL, reasoning, index: idx };
  } catch (e) {
    console.error('[Vision] threw:', e);
    return { url: candidates[0].largeImageURL };
  }
}

// Category-keyed English fallback keyword sets — chosen to surface
// action photos (cleaning being done) rather than generic stock images.
// Iterated when Claude rejects the primary keyword's candidates.
const CATEGORY_FALLBACK_KEYWORDS: Record<string, string[]> = {
  'Sprzątanie biur': ['office cleaner working', 'janitor wiping desk office', 'commercial cleaning crew'],
  'Sprzątanie biurowców': ['office building cleaning', 'commercial janitor lobby', 'building cleaning service'],
  'Placówki medyczne': ['clinic disinfection cleaning', 'hospital cleaning staff', 'medical office sanitizing'],
  'Placówki edukacyjne': ['school cleaning classroom', 'janitor school floor', 'preschool cleaning'],
  'Wspólnoty mieszkaniowe': ['apartment building cleaning stairwell', 'janitor cleaning hallway', 'residential common area cleaning'],
  'Bloki i osiedla': ['stairwell cleaning apartment', 'cleaning lobby residential', 'building cleaner mop'],
  'Kamienice': ['historic building cleaning', 'cleaning old staircase', 'janitor heritage building'],
  'Sprzątanie po budowie': ['post construction cleanup', 'cleaning after renovation dust', 'construction debris cleanup'],
  'Sprzątanie po remoncie': ['post renovation cleaning', 'cleaning after construction dust', 'apartment renovation cleanup'],
  'Hale garażowe': ['parking garage cleaning machine', 'underground parking floor scrubber', 'garage floor washing'],
  'Siłownie i obiekty sportowe': ['gym cleaning disinfection', 'fitness club cleaning equipment', 'sports facility sanitizing'],
  'Eventy i konferencje': ['event venue cleaning crew', 'conference hall cleanup chairs', 'concert venue cleaning staff'],
  'Branżowe': ['professional cleaning service', 'commercial cleaning team', 'janitor working'],
  'Cennik i kalkulator': ['professional cleaning crew', 'cleaning service quote', 'commercial cleaning'],
  'Wybór dostawcy': ['cleaning service handshake', 'commercial cleaning team meeting', 'professional cleaner office'],
};

/**
 * Top-level cover picker: keyword → Pixabay candidates → Claude Vision pick.
 * Tries the AI's image_keywords first, then iterates category-specific
 * fallbacks if Claude rejects all candidates as off-topic.
 *
 * GUARANTEED-NON-NULL CONTRACT (after 2026-05-08 hardening):
 * Vision-based picking can fail in three ways:
 *   1. All candidates rejected as off-topic (reasoning: -1)
 *   2. Anthropic API timeout / rate limit
 *   3. Pixabay returns 0 hits for the keyword
 *
 * Previously this returned null in all 3 cases — articles got generated
 * with no cover. Now we keep the FIRST successful Pixabay search result
 * (sorted by views) as a "best-effort fallback" — if Vision rejects every
 * candidate from every query, we still attach the most popular image.
 * Better an off-topic stock photo than a text-only article card.
 */
async function fetchPixabayCover(
  keywords: string,
  articleTitle?: string,
  articleCategory?: string,
  primaryKeyword?: string
): Promise<string | null> {
  if (!articleTitle) {
    // No context for vision picking — just return the highest-views candidate.
    const candidates = await fetchPixabayCandidates(keywords);
    return candidates[0]?.largeImageURL ?? null;
  }
  const fallbacks = CATEGORY_FALLBACK_KEYWORDS[articleCategory ?? 'Branżowe'] ?? CATEGORY_FALLBACK_KEYWORDS['Branżowe'];
  const queries = [keywords, ...fallbacks].filter(Boolean);

  // Track the first non-empty Pixabay result so we can use it as a last-resort
  // best-effort even if Vision rejects everything across all queries.
  let bestEffortFallback: string | null = null;

  for (const q of queries) {
    const candidates = await fetchPixabayCandidates(q);
    if (candidates.length === 0) {
      console.log(`[cover] query="${q}" → 0 hits, trying next`);
      continue;
    }

    // Memoize the first decent candidate from any successful Pixabay search
    if (!bestEffortFallback) {
      bestEffortFallback = candidates[0].largeImageURL;
    }

    const result = await pickBestCoverWithVision(
      candidates,
      articleTitle,
      articleCategory ?? '',
      primaryKeyword ?? q
    );
    if (result.url) {
      console.log(`[cover] vision-picked from query="${q}", reasoning="${(result.reasoning ?? '').slice(0, 100)}"`);
      return result.url;
    }
    console.log(`[cover] query="${q}" → vision rejected (${candidates.length} candidates), reasoning="${(result.reasoning ?? '').slice(0, 100)}"`);
  }

  if (bestEffortFallback) {
    console.log('[cover] using best-effort fallback (first Pixabay result by views) after all vision queries rejected');
    return bestEffortFallback;
  }

  console.log('[cover] no Pixabay results at all across', queries.length, 'queries:', queries.join(' | '));
  return null;
}

async function notifyTelegram(text: string) {
  const token = Deno.env.get('TELEGRAM_BOT_TOKEN');
  const chatId = Deno.env.get('TELEGRAM_ADMIN_CHAT_ID');
  if (!token || !chatId) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });
  } catch (e) {
    console.error('[Telegram] notify failed:', e);
  }
}

function buildPrompt(topic: Record<string, unknown>): string {
  const linkList = (topic.internal_link_targets as string[] | null) ?? [];
  const linksFromList = linkList.length > 0
    ? linkList.map((p) => `  - ${p}`).join('\n')
    : INTERNAL_PATHS.slice(0, 12).map((p) => `  - ${p}`).join('\n');
  return `Napisz nowy artykuł na blog Reefa B2B (reefa.pl/blog).

# Brief

- Proponowany tytuł: ${topic.proposed_title}
- Primary keyword: ${topic.primary_keyword}
- Typ treści: ${topic.content_type ?? 'pillar-page'}
- Pillar ${topic.pillar_no}, spoke ${topic.spoke_no}
- Audience: ${topic.audience ?? 'A,B'}
- SEO grade: ${topic.seo_grade ?? 'B'}
- Estimated volume PL/mies: ${topic.estimated_volume ?? 'unknown'}
- Word count target: ${topic.word_count_target ?? 2200}

## Brief content

${topic.brief_md}

## Wewnętrzne linki — wstaw NATURALNIE 5-10 linków z poniższej listy:

${linksFromList}

Dodatkowe dostępne ścieżki (możesz użyć max 2-3 dodatkowo, ale skup się na powyższych):
${INTERNAL_PATHS.slice(0, 20).map((p) => `  - ${p}`).join('\n')}

## Wymagania końcowe

- Slug bez polskich znaków diakrytycznych (np. "cennik-sprzatania-biura-krakow-2026")
- Body markdown bez H1 (tytuł renderowany osobno)
- Word count: ${topic.word_count_target ?? 2200} słów ±15%
- Wstaw boks "W skrócie" PO wstępie, PRZED pierwszym H2
- Sekcja FAQ na końcu (## Najczęściej zadawane pytania, 4-6 pytań w H3)
- Dodaj naturalnie wzmianki o Reefa: 96% retention, 2.4-letnia średnia kontraktu, OC do 500 000 PLN, umowy o pracę dla personelu
- Konkretne stawki w PLN netto za 2026, dla rynku Kraków/Katowice
- image_keywords po angielsku, 3-6 słów odpowiednich do tematu (np. "modern office cleaning team")

Zwróć wynik przez tool publish_article — wszystkie pola wymagane.`;
}

// ─────────────────────────────────────────────
// MAIN HANDLER
// ─────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders() });
  }
  if (req.method !== 'POST') {
    return json(405, { error: 'Method not allowed' });
  }

  // Auth — accept AUTOPUBLISH_SECRET via Authorization header (from Vercel proxy)
  // or via x-autopublish-secret header (for direct Supabase calls where
  // Authorization is consumed by the Supabase gateway for JWT validation).
  const authHeader = req.headers.get('authorization') ?? '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  const altToken = req.headers.get('x-autopublish-secret') ?? '';
  const expectedSecret = Deno.env.get('AUTOPUBLISH_SECRET');
  if (!expectedSecret || (token !== expectedSecret && altToken !== expectedSecret)) {
    return json(401, { error: 'Unauthorized' });
  }

  // Body
  let body: { force?: boolean; trigger?: string } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  // Time guard — only run if Warsaw local hour == 6, unless forced
  if (!body.force && !isWarsawHour(6)) {
    return json(200, { ok: true, status: 'skipped_wrong_hour', warsawHour: new Date().toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw' }) });
  }

  // Init Supabase
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!SUPABASE_URL || !SERVICE_KEY) {
    return json(500, { error: 'Server misconfigured: SUPABASE env missing' });
  }
  const supabase: SupabaseClient = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false },
  });

  // Check settings
  const { data: settings } = await supabase
    .from('blog_b2b_settings')
    .select('auto_publish, auto_topup_enabled, auto_topup_threshold, notify_telegram, paused_until')
    .eq('id', 1)
    .single();

  if (settings?.paused_until && new Date(settings.paused_until) > new Date()) {
    return json(200, { ok: true, status: 'paused_until', until: settings.paused_until });
  }

  // Pull next pending topic
  const { data: topic, error: topicErr } = await supabase
    .from('blog_b2b_topic_queue')
    .select('*')
    .eq('status', 'pending')
    .order('priority_order', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (topicErr) {
    return json(500, { error: 'Failed to query queue', details: topicErr.message });
  }

  if (!topic) {
    // Queue empty — trigger generator
    if (settings?.auto_topup_enabled !== false) {
      try {
        await fetch(`${SUPABASE_URL}/functions/v1/blog-topic-generator`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${expectedSecret}`,
          },
          body: JSON.stringify({ count: 30 }),
        });
        await notifyTelegram(`📭 Blog B2B: queue pusta — automatycznie generuję 30 nowych tematów. Powtórz wywołanie za chwilę.`);
      } catch (e) {
        console.error('[topup] failed:', e);
      }
    }
    return json(200, { ok: true, status: 'no_topics_pending', topup_triggered: settings?.auto_topup_enabled !== false });
  }

  // Mark generating (optimistic lock) — must happen synchronously to prevent
  // race conditions where two cron invocations grab the same topic.
  await supabase
    .from('blog_b2b_topic_queue')
    .update({ status: 'generating', attempt_count: (topic.attempt_count ?? 0) + 1 })
    .eq('id', topic.id);

  // Heavy work runs in background — Supabase has a 150s idle-timeout on
  // request connections, but EdgeRuntime.waitUntil() keeps the function
  // alive for the full wall-clock allowance (~400s on Pro) so Anthropic
  // (which can take 90-150s for a 3500-word article) completes safely.
  // The cron caller doesn't need the article body — it just needs to know
  // the topic was picked up. So we return 202 immediately and finish later.
  const work = (async () => {
    let toolInput: Record<string, unknown>;
    try {
      const result = await callAnthropic(buildPrompt(topic));
      toolInput = result.tool_input;
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      console.error('[autopublish] Anthropic error:', errMsg);
      await supabase
        .from('blog_b2b_topic_queue')
        .update({ status: 'failed', error_message: errMsg })
        .eq('id', topic.id);
      if (settings?.notify_telegram !== false) {
        await notifyTelegram(`⚠️ Blog B2B: błąd generacji\n\nTemat: ${topic.proposed_title}\n\n<code>${errMsg.slice(0, 500)}</code>`);
      }
      return;
    }

    const coverUrl = await fetchPixabayCover(
      toolInput.image_keywords as string,
      toolInput.title as string,
      toolInput.category as string,
      topic.primary_keyword as string,
    );
    const bodyMd = (toolInput.body_markdown as string) ?? '';
    if (!bodyMd) {
      console.error('[autopublish] body_markdown is empty or undefined — Claude may have returned incomplete tool input');
      if (settings?.notify_telegram !== false) {
        await notifyTelegram(`⚠️ Blog B2B: body_markdown puste\n\nTemat: ${topic.proposed_title}\n\nClaude zwrócił tool_input bez treści artykułu.`);
      }
      return;
    }
    const wordCount = bodyMd.split(/\s+/).filter(Boolean).length;
    // Delayed auto-publication: when auto_publish is enabled, articles are
    // inserted as draft with scheduled_publish_at = now + 10 min. A separate
    // cron (/api/blog-publish-scheduled, every 5 min) promotes them when the
    // window expires. This gives admins time to review/cancel.
    const PUBLISH_DELAY_MINUTES = 10;
    const willScheduleAutoPublish = settings?.auto_publish === true;
    const articleStatus = 'draft'; // always insert as draft now
    const scheduledAt = willScheduleAutoPublish
      ? new Date(Date.now() + PUBLISH_DELAY_MINUTES * 60_000).toISOString()
      : null;

    const { data: article, error: insertErr } = await supabase
      .from('blog_b2b_articles')
      .insert({
        slug: toolInput.slug,
        title: toolInput.title,
        excerpt: toolInput.excerpt,
        meta_title: toolInput.meta_title,
        meta_description: toolInput.meta_description,
        category: toolInput.category,
        tags: toolInput.tags,
        reading_time_minutes: toolInput.reading_time_minutes,
        body_markdown: toolInput.body_markdown,
        cover_image_url: coverUrl,
        primary_keyword: topic.primary_keyword,
        pillar_no: topic.pillar_no,
        spoke_no: topic.spoke_no,
        word_count: wordCount,
        status: articleStatus,
        published_at: null,
        scheduled_publish_at: scheduledAt,
      })
      .select('id, slug')
      .single();

    if (insertErr) {
      console.error('[autopublish] Insert failed:', insertErr.message);
      await supabase
        .from('blog_b2b_topic_queue')
        .update({ status: 'failed', error_message: 'Insert failed: ' + insertErr.message })
        .eq('id', topic.id);
      if (settings?.notify_telegram !== false) {
        await notifyTelegram(`⚠️ Blog B2B: błąd zapisu artykułu\n\nTemat: ${topic.proposed_title}\n\n<code>${insertErr.message.slice(0, 300)}</code>`);
      }
      return;
    }

    await supabase
      .from('blog_b2b_topic_queue')
      .update({
        status: 'generated',
        generated_article_id: article.id,
        generated_at: new Date().toISOString(),
        error_message: null,
      })
      .eq('id', topic.id);

    // Articles are now always inserted as 'draft'. When auto_publish is on,
    // scheduled_publish_at is set and a separate cron promotes them later.
    // No revalidation needed at insert time — the scheduled-publish cron does
    // that after promotion.

    if (settings?.auto_topup_enabled !== false) {
      const threshold = settings?.auto_topup_threshold ?? 7;
      const { count: pendingCount } = await supabase
        .from('blog_b2b_topic_queue')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending');
      if ((pendingCount ?? 0) < threshold) {
        fetch(`${SUPABASE_URL}/functions/v1/blog-topic-generator`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${expectedSecret}`,
          },
          body: JSON.stringify({ count: 25 }),
        }).catch((e) => console.error('[bg topup] failed:', e));
      }
    }

    if (settings?.notify_telegram !== false) {
      let statusLabel: string;
      let extra = '';
      if (willScheduleAutoPublish && scheduledAt) {
        // Format scheduled time in Warsaw timezone
        const t = new Date(scheduledAt).toLocaleTimeString('pl-PL', {
          timeZone: 'Europe/Warsaw',
          hour: '2-digit',
          minute: '2-digit',
        });
        statusLabel = `⏰ ZAPLANOWANE — automatyczna publikacja o ${t}`;
        extra = `\n\n📝 Recenzja w panelu CMS — możesz zatwierdzić wcześniej lub anulować przed ${t}.`;
      } else {
        statusLabel = '📝 DRAFT — wymaga akceptacji';
      }
      const articleUrl = `app.reefa.pl panel — Блог`;
      await notifyTelegram(
        `${statusLabel}\n\n<b>${toolInput.title}</b>\n\nPillar ${topic.pillar_no} · ${toolInput.category}\nSłowa: ${wordCount} · Czytanie: ${toolInput.reading_time_minutes} min${extra}\n\n${articleUrl}`
      );
    }

    console.log('[autopublish] Done:', article.slug, wordCount, 'words');
  })();

  // EdgeRuntime is the Supabase Deno runtime global. waitUntil keeps the
  // function alive until the promise resolves, even though we already
  // returned to the client.
  // @ts-ignore — EdgeRuntime is available in Supabase Edge Functions runtime
  if (typeof EdgeRuntime !== 'undefined') {
    // @ts-ignore
    EdgeRuntime.waitUntil(work);
  }

  return json(202, {
    ok: true,
    status: 'accepted',
    topic_id: topic.id,
    topic_title: topic.proposed_title,
    note: 'Generation running in background. Check blog_b2b_articles in ~60-150s.',
  });
});

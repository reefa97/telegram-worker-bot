/**
 * blog-topic-generator
 * --------------------------------------------------------------------
 * Generates new B2B blog topics for reefa.pl when the queue runs low.
 * Pulls all existing topics + already-generated article slugs, sends
 * the deduplication context to Claude, and asks for N fresh topics
 * that don't overlap.
 *
 * Triggered:
 *   - Inline by blog-autopublish when pending_count < auto_topup_threshold
 *   - Manually via the CMS panel ("Wygeneruj nowe tematy" button)
 *
 * Auth: same AUTOPUBLISH_SECRET as blog-autopublish.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const ANTHROPIC_MODEL = 'claude-sonnet-4-5-20250929';
const ANTHROPIC_MAX_TOKENS = 16_000;
const DEFAULT_TOPIC_COUNT = 25;

const TOPIC_GENERATOR_SYSTEM = `Jesteś senior content strategistem dla Reefa Sp. z o.o. — polskiej firmy sprzątającej B2B działającej w Krakowie i Katowicach.

Twoje zadanie: zaproponować NOWE tematy artykułów blogowych, które:
1. NIE pokrywają się z już wygenerowanymi tematami (lista poniżej)
2. Są wartościowe SEO — mają przewidywalne search intent w Polsce
3. Są dopasowane do segmentu B2B (kierowane do facility managerów, dyrektorów administracyjnych, prezesów wspólnot, dyrektorów medycznych)
4. Pasują do oferty Reefa: sprzątanie biur, biurowców, placówek medycznych, szkół, wspólnot, blokow, kamienic, sił, sprzątanie po budowie/remoncie, mycie hal garażowych

# Pillar architecture (5 filarów)

1. Biura i biurowce klasy A
2. Placówki medyczne
3. Wspólnoty mieszkaniowe i bloki
4. Pobudowlane i poremontowe
5. Specjalistyczne (gym, szkoły, garaże, magazyny, restauracje, hotele itp.)

# Co lubi Google dla B2B w PL 2026

- Konkretne pytania ("Ile kosztuje X w 2026?")
- Comparisons ("X vs Y")
- Case studies z konkretnymi liczbami
- Cennikowe ("Cennik X w Krakowie/Katowicach")
- Checklisty ("Checklist wyboru X")
- Long-tail z lokalizacją (Kraków, Katowice, Aglomeracja Śląska)

# Dostępne ścieżki internal linkingu

/krakow, /katowice, /krakow/sprzatanie-biur, /krakow/sprzatanie-biurowcow, /krakow/sprzatanie-placowek-medycznych, /krakow/sprzatanie-placowek-szkolnych, /krakow/sprzatanie-silowni, /krakow/sprzatanie-po-budowie, /krakow/sprzatanie-po-remoncie, /krakow/sprzatanie-dla-wspolnot-mieszkaniowych, /krakow/sprzatanie-blokow, /krakow/sprzatanie-kamienic, /krakow/mycie-hal-garazowych, /krakow/cennik, /krakow/kontakt, /katowice (z odpowiednikami), /o-firmie, /blog`;

const TOPIC_TOOL = {
  name: 'submit_topics',
  description: 'Submit N new blog topics with full briefs',
  input_schema: {
    type: 'object',
    properties: {
      topics: {
        type: 'array',
        minItems: 5,
        maxItems: 50,
        items: {
          type: 'object',
          properties: {
            pillar_no: { type: 'integer', minimum: 1, maximum: 5 },
            spoke_no: { type: 'string', description: 'e.g. "1.12", "2.10"' },
            proposed_title: { type: 'string', description: 'Polish blog title, 50-90 chars' },
            primary_keyword: { type: 'string', description: 'PL primary keyword, 2-5 words' },
            content_type: {
              type: 'string',
              enum: ['pillar-page', 'how-to-guide', 'listicle', 'comparison', 'case-study', 'data-research'],
            },
            audience: { type: 'string', description: 'A | B | C | A,B etc. A=duże firmy, B=małe-średnie, C=zarządcy nieruchomości' },
            seo_grade: { type: 'string', enum: ['A', 'B', 'C'] },
            estimated_volume: { type: 'integer', description: 'PL monthly searches estimate, 30-2000' },
            word_count_target: { type: 'integer', minimum: 1800, maximum: 5000 },
            internal_link_targets: {
              type: 'array',
              items: { type: 'string' },
              minItems: 2,
              maxItems: 5,
              description: 'Paths from /krakow/* or /katowice/* most relevant to this topic',
            },
            brief_md: {
              type: 'string',
              description: '80-150 word brief for the writer: angle, key data points, structure, audience focus',
            },
          },
          required: [
            'pillar_no', 'spoke_no', 'proposed_title', 'primary_keyword',
            'content_type', 'audience', 'seo_grade', 'estimated_volume',
            'word_count_target', 'internal_link_targets', 'brief_md',
          ],
        },
      },
    },
    required: ['topics'],
  },
};

function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders() });
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });

  // Auth
  const authHeader = req.headers.get('authorization') ?? '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (token !== Deno.env.get('AUTOPUBLISH_SECRET')) {
    return json(401, { error: 'Unauthorized' });
  }

  let body: { count?: number } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const targetCount = Math.min(50, Math.max(5, body.count ?? DEFAULT_TOPIC_COUNT));

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!SUPABASE_URL || !SERVICE_KEY) {
    return json(500, { error: 'Server misconfigured' });
  }
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  // Load existing topics for dedup context
  const [{ data: queueRows }, { data: articleRows }] = await Promise.all([
    supabase.from('blog_b2b_topic_queue').select('proposed_title, primary_keyword, dedup_hash, pillar_no, spoke_no'),
    supabase.from('blog_b2b_articles').select('title, primary_keyword, slug'),
  ]);

  const existingTopics = (queueRows ?? []).map((r) => `[P${r.pillar_no}/${r.spoke_no}] ${r.proposed_title} (kw: ${r.primary_keyword})`);
  const existingArticleTitles = (articleRows ?? []).map((r) => `${r.title} (kw: ${r.primary_keyword ?? '?'})`);
  const existingHashes = new Set((queueRows ?? []).map((r) => r.dedup_hash));

  // Find max priority_order to continue numbering
  const maxPriority = (queueRows ?? []).reduce((m, r: { priority_order?: number } & Record<string, unknown>) => {
    const p = (r.priority_order as number | undefined) ?? 0;
    return Math.max(m, p);
  }, 0);

  // Find max spoke_no per pillar to continue numbering
  const spokeMaxByPillar: Record<number, number> = {};
  for (const r of queueRows ?? []) {
    const pillar = r.pillar_no as number | undefined;
    const spoke = (r.spoke_no as string | undefined) ?? '';
    if (!pillar) continue;
    const m = spoke.match(/^(\d+)\.(\d+)$/);
    if (m) {
      const sub = parseInt(m[2], 10);
      if (!spokeMaxByPillar[pillar] || sub > spokeMaxByPillar[pillar]) {
        spokeMaxByPillar[pillar] = sub;
      }
    }
  }

  const userPrompt = `Wygeneruj ${targetCount} NOWYCH tematów blogowych dla reefa.pl B2B, KTÓRE NIE POKRYWAJĄ SIĘ Z PONIŻSZYMI:

# Już istniejące tematy w queue (NIE generuj duplikatów):

${existingTopics.length > 0 ? existingTopics.slice(0, 100).join('\n') : '(brak — pierwszy seed)'}

# Już opublikowane artykuły (NIE generuj duplikatów):

${existingArticleTitles.length > 0 ? existingArticleTitles.slice(0, 50).join('\n') : '(brak)'}

# Wymagania

- ${targetCount} unikalnych tematów
- Pokrywa różne pillary (1-5), nie wszystko z jednego
- Mix typów (pillar-page, how-to-guide, listicle, comparison, case-study)
- Audience mix (A=duże firmy 40%, B=małe-średnie 35%, C=zarządcy 25%)
- spoke_no kontynuuj numerację od:
  - Pillar 1: następny numer ${(spokeMaxByPillar[1] ?? 0) + 1}
  - Pillar 2: następny numer ${(spokeMaxByPillar[2] ?? 0) + 1}
  - Pillar 3: następny numer ${(spokeMaxByPillar[3] ?? 0) + 1}
  - Pillar 4: następny numer ${(spokeMaxByPillar[4] ?? 0) + 1}
  - Pillar 5: następny numer ${(spokeMaxByPillar[5] ?? 0) + 1}
- internal_link_targets — zawsze 2-5 ścieżek z dostępnej listy
- brief_md — 80-150 słów konkretnych wskazówek dla writera

Zwróć przez tool submit_topics.`;

  // Call Anthropic
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) return json(500, { error: 'ANTHROPIC_API_KEY missing' });

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
      system: TOPIC_GENERATOR_SYSTEM,
      tools: [TOPIC_TOOL],
      tool_choice: { type: 'tool', name: 'submit_topics' },
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    return json(500, { error: 'Anthropic failed', details: errText.slice(0, 500) });
  }
  const data = await res.json();
  const toolUse = data.content?.find((b: { type: string }) => b.type === 'tool_use');
  if (!toolUse?.input?.topics) {
    return json(500, { error: 'No tool_use in response' });
  }

  // Insert topics — skip duplicates (by dedup_hash unique index)
  const topics = toolUse.input.topics as Array<Record<string, unknown>>;
  const insertRows: Record<string, unknown>[] = [];
  let nextPriority = maxPriority + 1;
  let skipped = 0;

  for (const t of topics) {
    const title = String(t.proposed_title).trim().toLowerCase();
    const kw = String(t.primary_keyword).trim().toLowerCase();
    const hash = `${title}|${kw}`;
    if (existingHashes.has(hash)) {
      skipped++;
      continue;
    }
    existingHashes.add(hash);
    insertRows.push({
      priority_order: nextPriority++,
      pillar_no: t.pillar_no,
      spoke_no: t.spoke_no,
      proposed_title: t.proposed_title,
      primary_keyword: t.primary_keyword,
      content_type: t.content_type,
      audience: t.audience,
      seo_grade: t.seo_grade,
      estimated_volume: t.estimated_volume,
      word_count_target: t.word_count_target,
      internal_link_targets: t.internal_link_targets,
      brief_md: t.brief_md,
      status: 'pending',
      source: 'ai-generated',
    });
  }

  if (insertRows.length === 0) {
    return json(200, { ok: true, status: 'all_duplicates', skipped, attempted: topics.length });
  }

  const { data: inserted, error: insertErr } = await supabase
    .from('blog_b2b_topic_queue')
    .insert(insertRows)
    .select('id');

  if (insertErr) {
    return json(500, { error: 'Insert failed', details: insertErr.message });
  }

  return json(200, {
    ok: true,
    status: 'generated',
    inserted: inserted?.length ?? 0,
    skipped,
    requested: targetCount,
    next_priority_start: maxPriority + 1,
  });
});

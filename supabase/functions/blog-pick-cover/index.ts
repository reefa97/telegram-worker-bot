/**
 * blog-pick-cover
 * --------------------------------------------------------------------
 * Re-pick the cover image for an existing article. Used from CMS:
 *   - "Pobierz nową okładkę" button next to a draft article
 *   - When admin doesn't like the auto-picked cover
 *
 * Optional `keywords` body param overrides the AI-generated image_keywords
 * stored on the article. If not provided, derives from article title +
 * primary_keyword.
 *
 * Auth: AUTOPUBLISH_SECRET.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const ANTHROPIC_MODEL = 'claude-sonnet-4-5-20250929';

type PixabayHit = {
  id: number;
  tags: string;
  views: number;
  previewURL: string;
  webformatURL: string;
  largeImageURL: string;
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

async function pixabaySearch(keywords: string): Promise<PixabayHit[]> {
  const apiKey = Deno.env.get('PIXABAY_API_KEY');
  if (!apiKey) return [];
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
}

async function pickWithVision(
  candidates: PixabayHit[],
  title: string,
  category: string,
  keyword: string,
  excludeUrl?: string | null,
): Promise<{ url: string | null; reasoning: string; index: number }> {
  if (candidates.length === 0) return { url: null, reasoning: 'no candidates', index: -1 };
  // Filter out the current cover so user gets variety on regen
  const pool = excludeUrl ? candidates.filter((h) => h.largeImageURL !== excludeUrl) : candidates;
  if (pool.length === 0) return { url: null, reasoning: 'all candidates were the current cover', index: -1 };
  if (pool.length === 1) return { url: pool[0].largeImageURL, reasoning: 'only one alternative', index: 0 };

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) return { url: pool[0].largeImageURL, reasoning: 'no anthropic key, fell back to first', index: 0 };

  const PICK_TOOL = {
    name: 'pick_cover',
    input_schema: {
      type: 'object',
      properties: {
        best_index: { type: 'integer' },
        reasoning: { type: 'string' },
      },
      required: ['best_index', 'reasoning'],
    },
  };

  // Pixabay preview URLs are referer-protected. Download bytes ourselves and
  // send as base64 to Anthropic. webformatURL (640px) is the right balance.
  type PixabayHitWithFormat = PixabayHit & { webformatURL: string };
  const dataUrls = await Promise.all(
    (pool as PixabayHitWithFormat[]).map(async (hit) => {
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

  const blocks: Array<Record<string, unknown>> = [
    {
      type: 'text',
      text: `Wybierz najlepszą okładkę dla artykułu "${title}" (kategoria: ${category}, słowo kluczowe: ${keyword}).

Kryteria: bezpośrednia trafność wizualna do tematu, profesjonalny wygląd, brak nakładek tekstowych. Jeśli żadne nie pasuje — zwróć -1.

Kandydaci (numerowane 0-${pool.length - 1}):`,
    },
  ];
  pool.forEach((hit, i) => {
    const img = dataUrls[i];
    if (!img) return;
    blocks.push({ type: 'text', text: `\n--- ${i} (tagi: ${hit.tags}) ---` });
    blocks.push({ type: 'image', source: { type: 'base64', media_type: img.mediaType, data: img.b64 } });
  });

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
      messages: [{ role: 'user', content: blocks }],
    }),
  });
  if (!res.ok) {
    return { url: pool[0].largeImageURL, reasoning: 'anthropic api error', index: 0 };
  }
  const data = await res.json();
  const toolUse = data.content?.find((b: { type: string }) => b.type === 'tool_use');
  if (!toolUse?.input) return { url: pool[0].largeImageURL, reasoning: 'no tool_use', index: 0 };
  const idx = toolUse.input.best_index as number;
  const reasoning = (toolUse.input.reasoning as string) ?? '';
  if (idx === -1) return { url: null, reasoning, index: -1 };
  if (idx < 0 || idx >= pool.length) return { url: pool[0].largeImageURL, reasoning: 'invalid index, fell back', index: 0 };
  return { url: pool[idx].largeImageURL, reasoning, index: idx };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders() });
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });

  const auth = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (auth !== Deno.env.get('AUTOPUBLISH_SECRET')) {
    return json(401, { error: 'Unauthorized' });
  }

  let body: { article_id?: string; keywords?: string } = {};
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'Invalid JSON' });
  }
  if (!body.article_id) return json(400, { error: 'article_id required' });

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!SUPABASE_URL || !SERVICE_KEY) return json(500, { error: 'Server misconfigured' });

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  const { data: article, error } = await supabase
    .from('blog_b2b_articles')
    .select('id, title, category, primary_keyword, cover_image_url')
    .eq('id', body.article_id)
    .single();
  if (error || !article) return json(404, { error: 'Article not found' });

  // Build queries: try explicit user keywords first, then a category-based
  // English fallback set. The fallbacks are chosen to surface action photos
  // (cleaning being done) rather than generic stock office images.
  const userQuery = body.keywords?.trim();
  const categoryFallbacks: Record<string, string[]> = {
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
  const fallbacks = categoryFallbacks[article.category ?? 'Branżowe'] ?? categoryFallbacks['Branżowe'];
  const queries = userQuery ? [userQuery, ...fallbacks] : fallbacks;

  const tried: Array<{ query: string; candidates: number; reasoning?: string }> = [];
  // Guaranteed-non-null contract: keep first decent Pixabay result so even
  // if Vision rejects everything we still attach SOME cover.
  let bestEffortFallback: string | null = null;

  for (const q of queries) {
    const candidates = await pixabaySearch(q);
    if (candidates.length === 0) {
      tried.push({ query: q, candidates: 0 });
      continue;
    }
    if (!bestEffortFallback) {
      bestEffortFallback = candidates[0].largeImageURL;
    }
    const pick = await pickWithVision(
      candidates,
      article.title,
      article.category ?? '',
      article.primary_keyword ?? '',
      article.cover_image_url,
    );
    tried.push({ query: q, candidates: candidates.length, reasoning: pick.reasoning });
    if (pick.url) {
      const { error: updErr } = await supabase
        .from('blog_b2b_articles')
        .update({ cover_image_url: pick.url })
        .eq('id', article.id);
      if (updErr) return json(500, { error: 'Update failed', details: updErr.message });
      return json(200, {
        ok: true,
        cover_image_url: pick.url,
        reasoning: pick.reasoning,
        picked_index: pick.index,
        winning_query: q,
        attempts: tried,
      });
    }
  }

  // Vision rejected all queries — apply best-effort fallback (most-viewed image
  // from first non-empty Pixabay search) so the article never lands cover-less.
  if (bestEffortFallback) {
    const { error: updErr } = await supabase
      .from('blog_b2b_articles')
      .update({ cover_image_url: bestEffortFallback })
      .eq('id', article.id);
    if (updErr) return json(500, { error: 'Update failed', details: updErr.message });
    return json(200, {
      ok: true,
      cover_image_url: bestEffortFallback,
      reasoning: 'Vision rejected all candidates across all queries — using highest-views Pixabay result as best-effort fallback',
      picked_index: 0,
      winning_query: 'best-effort',
      attempts: tried,
    });
  }

  return json(200, {
    ok: false,
    status: 'no_pixabay_results',
    attempts: tried,
  });
});

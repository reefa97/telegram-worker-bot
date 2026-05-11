/**
 * blog-regenerate
 * --------------------------------------------------------------------
 * Regenerates an existing draft article from CMS panel — used when
 * admin clicks "Wygeneruj ponownie" with optional feedback text.
 *
 * Loads the original topic + existing article + feedback, asks Claude
 * for a new version, and updates the article body in place
 * (preserves slug + id; bumps regeneration_count).
 *
 * Auth: same AUTOPUBLISH_SECRET.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const ANTHROPIC_MODEL = 'claude-sonnet-4-5-20250929';
const ANTHROPIC_MAX_TOKENS = 12_000;

// Reuse the same persona as autopublish — keep in sync if updating.
const PERSONA_SYSTEM_PROMPT = `Jesteś senior content strategistem dla Reefa Sp. z o.o. — polskiej firmy sprzątającej B2B. Piszesz dla profesjonalnych klientów B2B (dyrektorzy administracyjni, facility managerowie, prezesy wspólnot). Forma "my" (zespół), "Państwa firma" (klient). Konkretne liczby zawsze (10 zł/m², 96% retention, OC do 500k PLN, umowy o pracę). Bez clickbaitu, bez anglicyzmów, bez ja/mnie. Markdown z H2/H3, boks "W skrócie" po wstępie, FAQ na końcu. 2000-4500 słów.`;

const PUBLISH_TOOL = {
  name: 'publish_article',
  input_schema: {
    type: 'object',
    properties: {
      slug: { type: 'string' },
      title: { type: 'string' },
      excerpt: { type: 'string' },
      meta_title: { type: 'string' },
      meta_description: { type: 'string' },
      tags: { type: 'array', items: { type: 'string' } },
      reading_time_minutes: { type: 'integer' },
      body_markdown: { type: 'string' },
    },
    required: ['slug', 'title', 'excerpt', 'meta_title', 'meta_description', 'tags', 'reading_time_minutes', 'body_markdown'],
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

  const authHeader = req.headers.get('authorization') ?? '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (token !== Deno.env.get('AUTOPUBLISH_SECRET')) {
    return json(401, { error: 'Unauthorized' });
  }

  let body: { article_id?: string; feedback?: string } = {};
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

  // Load article
  const { data: article, error: artErr } = await supabase
    .from('blog_b2b_articles')
    .select('*')
    .eq('id', body.article_id)
    .single();
  if (artErr || !article) return json(404, { error: 'Article not found' });

  // Load corresponding topic (if available)
  const { data: topic } = await supabase
    .from('blog_b2b_topic_queue')
    .select('*')
    .eq('generated_article_id', article.id)
    .maybeSingle();

  // Build prompt with feedback
  const feedback = (body.feedback ?? '').trim();
  const userPrompt = `Wygeneruj POPRAWIONĄ wersję poniższego artykułu. NIE zmieniaj slug i title bez powodu — zachowaj kontynuację SEO.

# Bieżący artykuł

- Title: ${article.title}
- Slug: ${article.slug}
- Excerpt: ${article.excerpt}
- Primary keyword: ${article.primary_keyword ?? topic?.primary_keyword ?? '?'}
- Word count: ${article.word_count}

# Brief oryginalny

${topic?.brief_md ?? '(brak — artykuł stworzony bez briefu)'}

# Feedback od redakcji

${feedback || '(brak konkretnego feedbacku — popraw co możesz w stronę większej konkretności, lepszych liczb, lepszej struktury, mocniejszego intro)'}

# Bieżąca wersja body (do poprawy):

\`\`\`markdown
${article.body_markdown}
\`\`\`

# Wymagania

- Zachowaj slug, jeśli to nie jest konkretnie wymienione w feedbacku
- Body markdown bez H1
- Boks "W skrócie" po wstępie
- Sekcja FAQ na końcu (## Najczęściej zadawane pytania)
- Konkretne dane Reefa (96% retention, 2.4 lat średni kontrakt, OC do 500k, umowy o pracę)
- Word count: ${article.word_count} ±15% (chyba że feedback prosi o inną długość)

Zwróć przez tool publish_article.`;

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
      system: PERSONA_SYSTEM_PROMPT,
      tools: [PUBLISH_TOOL],
      tool_choice: { type: 'tool', name: 'publish_article' },
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    return json(500, { error: 'Anthropic failed', details: errText.slice(0, 500) });
  }
  const data = await res.json();
  const toolUse = data.content?.find((b: { type: string }) => b.type === 'tool_use');
  if (!toolUse?.input) return json(500, { error: 'No tool_use in response' });

  const newInput = toolUse.input as Record<string, unknown>;
  const newWordCount = (newInput.body_markdown as string).split(/\s+/).filter(Boolean).length;

  // Update article in place
  const { error: updErr } = await supabase
    .from('blog_b2b_articles')
    .update({
      title: newInput.title,
      excerpt: newInput.excerpt,
      meta_title: newInput.meta_title,
      meta_description: newInput.meta_description,
      tags: newInput.tags,
      reading_time_minutes: newInput.reading_time_minutes,
      body_markdown: newInput.body_markdown,
      word_count: newWordCount,
      regeneration_count: (article.regeneration_count ?? 0) + 1,
      last_regeneration_feedback: feedback || null,
      // Keep slug, status, cover unchanged
    })
    .eq('id', article.id);

  if (updErr) return json(500, { error: 'Update failed', details: updErr.message });

  return json(200, {
    ok: true,
    article_id: article.id,
    new_word_count: newWordCount,
    regeneration_count: (article.regeneration_count ?? 0) + 1,
  });
});

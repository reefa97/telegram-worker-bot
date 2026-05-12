/**
 * expand-email-search
 * --------------------------------------------------------------------
 * Receives a high-level search intent: { topic, location?, admin_id }
 * Uses Claude Haiku to generate 5-20 Serper-friendly sub-queries
 * optimized for maximum email harvest, then creates one email_search_jobs
 * row per sub-query, all tagged with the same batch_id.
 *
 * The existing python worker picks up the pending jobs and runs them
 * one by one — no changes required there.
 *
 * Auth: admin user JWT (we trust the admin_id passed in payload after
 * verifying their session token matches).
 *
 * Returns: { batch_id, queries[], jobs_created }
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface ExpandPayload {
  topic: string;
  location?: string;
  admin_id: string;
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

async function generateQueries(topic: string, location: string): Promise<string[]> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY missing in function secrets');

  const locationLine = location.trim()
    ? `Location: ${location.trim()} (could be a city, voivodeship or region)`
    : `Location: not specified — assume the whole Poland`;

  const system = `You are an SEO/lead-generation strategist. Given a business niche and a location in Poland, you generate a list of Google search queries optimized for harvesting publicly-listed business email addresses.

Rules for the queries you generate:
1. Always include Polish keywords (the businesses are Polish).
2. If the user gave a voivodeship/region, split into 3-5 of its largest cities (e.g. Małopolska → Kraków, Tarnów, Nowy Sącz, Oświęcim). If a single city was given, keep it but vary keywords.
3. If location is empty, target the 5-7 largest Polish cities.
4. Mix query types:
   - "<niche> <city> kontakt"
   - "<niche> <city> email"
   - "<niche> <city> biuro@"
   - "<synonym> <city>" (use 2-3 Polish synonyms for the niche)
   - For weak/B2B niches add free-mail hints: "<niche> <city> @gmail.com", "<niche> <city> @wp.pl"
5. Avoid quotation marks inside queries unless essential.
6. Output between 5 and 20 queries depending on how broad the input is:
   - Narrow (single small city + specific niche) → 5-8 queries.
   - Medium (single big city like Kraków/Warszawa) → 10-14 queries.
   - Broad (voivodeship or empty location) → 15-20 queries.
7. Each query must be a single line, plain text, suitable to send directly to Google/Serper.

Return ONLY a JSON object: { "queries": ["...", "..."] }. No prose, no markdown, no comments.`;

  const user = `Niche / topic: ${topic.trim()}
${locationLine}

Generate the optimized Serper query list now.`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1500,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Anthropic API ${res.status}: ${errText.slice(0, 300)}`);
  }
  const data = await res.json();
  const text = data?.content?.[0]?.text || '';
  // strip ```json blocks if model wraps anyway
  const cleaned = text.replace(/```json\s*|\s*```/g, '').trim();
  let parsed: any;
  try {
    parsed = JSON.parse(cleaned);
  } catch (e) {
    throw new Error(`Failed to parse AI JSON: ${cleaned.slice(0, 200)}`);
  }
  const queries: unknown = parsed?.queries;
  if (!Array.isArray(queries)) throw new Error('AI response missing queries[]');
  const cleanQueries = queries
    .filter((q): q is string => typeof q === 'string')
    .map((q) => q.trim())
    .filter((q) => q.length > 2 && q.length < 200);
  if (cleanQueries.length === 0) throw new Error('AI returned 0 valid queries');
  // hard cap to be safe
  return cleanQueries.slice(0, 20);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return json(405, { error: 'Method not allowed' });
  }

  let body: ExpandPayload;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'Invalid JSON body' });
  }

  const topic = (body.topic || '').trim();
  const location = (body.location || '').trim();
  const adminId = (body.admin_id || '').trim();

  if (!topic) return json(400, { error: 'topic is required' });
  if (!adminId) return json(400, { error: 'admin_id is required' });

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) {
    return json(500, { error: 'Supabase env not configured' });
  }
  const supabase = createClient(supabaseUrl, serviceKey);

  // Verify caller via Authorization header — must be the same admin
  const authHeader = req.headers.get('Authorization') || '';
  const accessToken = authHeader.replace(/^Bearer\s+/i, '');
  if (accessToken) {
    const { data: userData } = await supabase.auth.getUser(accessToken);
    if (!userData?.user || userData.user.id !== adminId) {
      return json(403, { error: 'admin_id does not match authenticated user' });
    }
  }

  // 1. Ask the AI for sub-queries
  let queries: string[];
  try {
    queries = await generateQueries(topic, location);
  } catch (err) {
    return json(500, { error: 'AI expansion failed', detail: String(err) });
  }

  // 2. Create one job per sub-query, sharing a batch_id
  const batchId = crypto.randomUUID();
  const rows = queries.map((q) => ({
    admin_id: adminId,
    query: q,
    status: 'pending',
    batch_id: batchId,
    batch_topic: topic,
    batch_location: location || null,
  }));

  const { error: insertError, data: insertedJobs } = await supabase
    .from('email_search_jobs')
    .insert(rows)
    .select('id, query');

  if (insertError) {
    return json(500, { error: 'Failed to create jobs', detail: insertError.message });
  }

  return json(200, {
    batch_id: batchId,
    queries,
    jobs_created: insertedJobs?.length || 0,
    jobs: insertedJobs || [],
  });
});

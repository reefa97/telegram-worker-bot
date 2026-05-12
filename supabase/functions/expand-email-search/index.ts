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

  const system = `You are an SEO/lead-generation strategist. Given a business niche and a location in Poland, you generate Google search queries that an email-harvesting crawler will run via the Serper.dev API.

Hard constraints (ignore these and Google returns 0 results):
- DO NOT use operators like "biuro@", "@gmail.com", "@wp.pl", "@interia.pl" — they look like broken syntax and Google returns 0 results.
- DO NOT use "site:", "intext:", "inurl:" or quoted phrases unless absolutely necessary.
- DO NOT append words like "email", "telefon", "kontakt" unless they appear naturally in the niche name. They overly constrain the query and Google returns 0 results.

What to vary instead:
1. NICHE SYNONYMS (most leverage): generate 3-5 Polish synonyms and rephrasings of the niche. Examples:
   - "gabinet alergologiczny" → also try "alergolog", "poradnia alergologiczna", "centrum alergologiczne", "specjalista alergolog", "alergologia".
   - "firma budowlana" → also try "wykonawca generalny", "przedsiębiorstwo budowlane", "usługi budowlane", "budownictwo", "remonty i wykończenia".
2. LOCATION:
   - If the user gave a voivodeship/region, split into 4-6 of its biggest cities (e.g. Małopolska → Kraków, Tarnów, Nowy Sącz, Oświęcim, Chrzanów, Wieliczka).
   - If a single big city is given (Kraków/Warszawa/Wrocław/Poznań/Gdańsk), add 2-4 district variants ("Kraków Krowodrza", "Kraków Nowa Huta", "Kraków Podgórze").
   - If a single small city is given, keep it but invest the variation budget into synonyms.
   - If location is empty, target the 6-8 largest Polish cities (Warszawa, Kraków, Wrocław, Poznań, Gdańsk, Łódź, Katowice, Szczecin).
3. Each query = "<niche-synonym> <location>" with NOTHING ELSE appended.
4. Plain text only, no quotes, no special chars.
5. Output count:
   - Narrow input (small city, specific niche) → 6-8 queries.
   - Medium (1 big city, common niche) → 9-12 queries.
   - Broad (voivodeship or empty location) → 12-18 queries.
6. No duplicates. No queries shorter than 3 words.

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

  // Verify caller via Authorization header — strict: must be present AND match
  const authHeader = req.headers.get('Authorization') || '';
  const accessToken = authHeader.replace(/^Bearer\s+/i, '');
  if (!accessToken) {
    return json(401, { error: 'Authorization header required' });
  }
  const { data: userData, error: authError } = await supabase.auth.getUser(accessToken);
  if (authError || !userData?.user) {
    return json(401, { error: 'Invalid or expired token' });
  }
  if (userData.user.id !== adminId) {
    return json(403, { error: 'admin_id does not match authenticated user' });
  }
  // Verify caller is an admin (not a client)
  const { data: caller } = await supabase
    .from('admin_users')
    .select('role')
    .eq('id', adminId)
    .single();
  if (!caller || !['super_admin', 'sub_admin', 'manager'].includes(caller.role)) {
    return json(403, { error: 'Only admin users can run AI email search' });
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

/**
 * submit-web-reservation
 * --------------------------------------------------------------------
 * Public, anonymous endpoint that accepts reservation/contact form
 * submissions from external websites (home.reefa.pl) and:
 *
 *   1. Validates the payload (basic shape + honeypot anti-spam).
 *   2. Inserts a new row into `public.crm_leads` with:
 *        source   = origin domain (e.g. 'home.reefa.pl')
 *        metadata = full payload
 *   3. Sends a Telegram notification to every active row in
 *      `public.bot_admins` so the admin team sees it instantly.
 *
 * Trigger: HTTP POST  https://<project>.supabase.co/functions/v1/submit-web-reservation
 * Auth   : none (public). Spam guard: honeypot field + minimum-length checks.
 *
 * Required environment variables (set via `supabase secrets set`):
 *   - SUPABASE_URL
 *   - SUPABASE_SERVICE_ROLE_KEY
 *   - TELEGRAM_BOT_TOKEN
 *
 * Optional:
 *   - ALLOWED_ORIGINS  comma-separated list, defaults to '*'
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

// ---------- types ----------
type Kind = 'reservation' | 'contact';

interface Payload {
  kind: Kind;
  source?: string;
  service?: string;        // slug, e.g. 'sprzatanie-mieszkan-cykliczne'
  service_label?: string;  // human-readable, e.g. 'Cykliczne sprzątanie mieszkań i domów'
  price?: number | null;
  calculator?: Record<string, unknown>;
  frequency?: string;
  date?: string;
  time?: string;
  contact: {
    name: string;
    phone: string;
    email?: string;
    address?: string;
    note?: string;
  };
  hp?: string; // honeypot — must be empty
}

// ---------- helpers ----------
const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') ?? '*').split(',').map((s) => s.trim());

function corsHeadersFor(origin: string | null): Record<string, string> {
  const allow =
    ALLOWED_ORIGINS.includes('*') || (origin && ALLOWED_ORIGINS.includes(origin))
      ? origin ?? '*'
      : ALLOWED_ORIGINS[0] ?? '*';
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}

function json(status: number, body: unknown, cors: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string)
  );
}

function buildTelegramMessage(p: Payload): string {
  const lines: string[] = [];
  const emoji = p.kind === 'reservation' ? '📅' : '📨';
  lines.push(`${emoji} <b>${p.kind === 'reservation' ? 'Nowa rezerwacja' : 'Nowe zapytanie'}</b>`);
  lines.push(`<i>${escapeHtml(p.source || 'web')}</i>`);
  lines.push('');

  if (p.service_label) lines.push(`🧹 <b>Usługa:</b> ${escapeHtml(p.service_label)}`);
  if (p.frequency) lines.push(`🔁 <b>Częstotliwość:</b> ${escapeHtml(p.frequency)}`);
  if (typeof p.price === 'number') lines.push(`💰 <b>Cena:</b> ${p.price} zł`);
  if (p.date) lines.push(`📆 <b>Termin:</b> ${escapeHtml(p.date)}${p.time ? ` · ${escapeHtml(p.time)}` : ''}`);

  if (p.calculator && Object.keys(p.calculator).length > 0) {
    const summary = Object.entries(p.calculator)
      .map(([k, v]) => `${k}: ${v}`)
      .join(', ');
    lines.push(`📐 <b>Parametry:</b> ${escapeHtml(summary)}`);
  }

  lines.push('');
  lines.push(`👤 <b>${escapeHtml(p.contact.name)}</b>`);
  lines.push(`📞 ${escapeHtml(p.contact.phone)}`);
  if (p.contact.email) lines.push(`✉️ ${escapeHtml(p.contact.email)}`);
  if (p.contact.address) lines.push(`📍 ${escapeHtml(p.contact.address)}`);
  if (p.contact.note) {
    lines.push('');
    lines.push(`📝 <i>${escapeHtml(p.contact.note)}</i>`);
  }

  return lines.join('\n');
}

async function notifyTelegram(supabase: ReturnType<typeof createClient>, message: string): Promise<{ ok: number; failed: number }> {
  const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
  if (!botToken) {
    console.warn('TELEGRAM_BOT_TOKEN not set — skipping Telegram notification');
    return { ok: 0, failed: 0 };
  }

  const { data: admins, error } = await supabase
    .from('bot_admins')
    .select('telegram_chat_id')
    .eq('is_active', true);

  if (error) {
    console.error('Failed to load bot_admins:', error);
    return { ok: 0, failed: 0 };
  }

  if (!admins || admins.length === 0) {
    console.warn('No active bot_admins to notify');
    return { ok: 0, failed: 0 };
  }

  let ok = 0;
  let failed = 0;

  await Promise.all(
    admins.map(async (a) => {
      try {
        const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: a.telegram_chat_id,
            text: message,
            parse_mode: 'HTML',
          }),
        });
        const data = await res.json();
        if (data.ok) ok++;
        else {
          failed++;
          console.error('Telegram sendMessage failed:', data);
        }
      } catch (e) {
        failed++;
        console.error('Telegram fetch error:', e);
      }
    })
  );

  return { ok, failed };
}

// ---------- main handler ----------
serve(async (req) => {
  const origin = req.headers.get('origin');
  const cors = corsHeadersFor(origin);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors });
  }
  if (req.method !== 'POST') {
    return json(405, { error: 'Method not allowed' }, cors);
  }

  let payload: Payload;
  try {
    payload = await req.json();
  } catch {
    return json(400, { error: 'Invalid JSON' }, cors);
  }

  // ---- Anti-spam: honeypot ----
  if (payload.hp && payload.hp.trim() !== '') {
    // Pretend success — don't tell the bot
    return json(200, { ok: true, id: 'spam-discarded' }, cors);
  }

  // ---- Validation ----
  const errors: string[] = [];
  if (!['reservation', 'contact'].includes(payload.kind)) errors.push('kind');
  if (!payload.contact?.name || payload.contact.name.trim().length < 2) errors.push('contact.name');
  if (!payload.contact?.phone || payload.contact.phone.replace(/\D/g, '').length < 6) errors.push('contact.phone');
  if (errors.length > 0) {
    return json(400, { error: 'Validation failed', fields: errors }, cors);
  }

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
  const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    return json(500, { error: 'Server misconfigured' }, cors);
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  // ---- Insert into CRM pipeline ----
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
  const userAgent = req.headers.get('user-agent') ?? null;
  const source = payload.source || origin || 'web';

  const title =
    payload.kind === 'reservation'
      ? `Rezerwacja · ${payload.service_label ?? payload.service ?? 'usługa'} · ${payload.contact.name}`
      : `Zapytanie · ${payload.contact.name}`;

  const description = [
    payload.contact.address && `Adres: ${payload.contact.address}`,
    payload.contact.note && `Uwagi: ${payload.contact.note}`,
    payload.frequency && `Częstotliwość: ${payload.frequency}`,
    payload.date && `Termin: ${payload.date}${payload.time ? ' · ' + payload.time : ''}`,
  ]
    .filter(Boolean)
    .join('\n');

  const { data: lead, error: insertErr } = await supabase
    .from('crm_leads')
    .insert({
      title,
      status: 'new',
      value: typeof payload.price === 'number' ? payload.price : 0,
      contact_info: {
        name: payload.contact.name,
        phone: payload.contact.phone,
        email: payload.contact.email ?? null,
      },
      description,
      source,
      metadata: {
        kind: payload.kind,
        service: payload.service ?? null,
        service_label: payload.service_label ?? null,
        price: payload.price ?? null,
        calculator: payload.calculator ?? null,
        frequency: payload.frequency ?? null,
        date: payload.date ?? null,
        time: payload.time ?? null,
        address: payload.contact.address ?? null,
        note: payload.contact.note ?? null,
        ip,
        user_agent: userAgent,
        submitted_at: new Date().toISOString(),
      },
    })
    .select('id')
    .single();

  if (insertErr) {
    console.error('Insert into crm_leads failed:', insertErr);
    return json(500, { error: 'Database insert failed' }, cors);
  }

  // ---- Telegram notification (fire-and-forget OK) ----
  const message = buildTelegramMessage(payload);
  const notifResult = await notifyTelegram(supabase, message);

  return json(
    200,
    {
      ok: true,
      id: lead.id,
      notified: notifResult,
    },
    cors
  );
});

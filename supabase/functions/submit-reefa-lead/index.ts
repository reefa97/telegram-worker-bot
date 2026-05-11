/**
 * submit-reefa-lead
 * --------------------------------------------------------------------
 * Public anonymous endpoint that accepts B2B lead submissions from
 * reefa.pl (Next.js site) and inserts them into `public.crm_leads`
 * with source = 'reefa.pl' so they show up in the admin panel.
 *
 * Telegram notifications are NOT sent from here — reefa.pl's own
 * /api/lead route handles Telegram via TELEGRAM_BOT_TOKEN env vars
 * on Vercel. This function only mirrors the lead into the CRM.
 *
 * Trigger: HTTP POST  https://<project>.supabase.co/functions/v1/submit-reefa-lead
 * Auth   : none (public). Spam guard: honeypot field + phone validation.
 *
 * Payload shape (matches reefa-platform/components/LeadForm.tsx):
 *   {
 *     variant: 'callback' | 'inquiry',
 *     phone: string,                 // required
 *     email?: string,
 *     message?: string,
 *     source?: string,               // form id / page section
 *     pageUrl?: string,
 *     referrer?: string,
 *     locale?: 'pl' | 'en' | 'ru',
 *     calculator?: {
 *       type: 'office' | 'medical' | 'school' | 'residential',
 *       area: number,
 *       daysPerWeek: number,
 *       selectedDays: number[],
 *       weeklyHours: number,
 *       rate: number,
 *       monthly: number,
 *       monthlyLow: number,
 *       monthlyHigh: number,
 *       isAtMinimum: boolean,
 *     },
 *     hp?: string,                   // honeypot — must be empty
 *   }
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

type Variant = 'callback' | 'inquiry';
type CalcType = 'office' | 'medical' | 'school' | 'residential';

interface CalculatorPayload {
  type: CalcType;
  area: number;
  daysPerWeek: number;
  selectedDays: number[];
  weeklyHours: number;
  rate: number;
  monthly: number;
  monthlyLow: number;
  monthlyHigh: number;
  isAtMinimum: boolean;
}

interface Payload {
  variant?: Variant;
  phone?: string;
  email?: string;
  message?: string;
  source?: string;
  pageUrl?: string;
  referrer?: string;
  locale?: string;
  calculator?: CalculatorPayload;
  hp?: string;
}

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

const TYPE_LABEL: Record<CalcType, string> = {
  office: 'Biuro',
  medical: 'Placówka medyczna',
  school: 'Placówka edukacyjna',
  residential: 'Klatka schodowa',
};

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/** Sanitize calculator payload — clamp/round so we don't store garbage. */
function sanitizeCalculator(c: unknown): CalculatorPayload | null {
  if (!c || typeof c !== 'object' || Array.isArray(c)) return null;
  const cc = c as Record<string, unknown>;
  if (typeof cc.type !== 'string' || !(cc.type in TYPE_LABEL)) return null;
  if (
    !isFiniteNumber(cc.area) ||
    !isFiniteNumber(cc.daysPerWeek) ||
    !isFiniteNumber(cc.weeklyHours) ||
    !isFiniteNumber(cc.rate) ||
    !isFiniteNumber(cc.monthly)
  ) {
    return null;
  }
  const clampMonthly = (v: unknown): number => {
    const n = isFiniteNumber(v) ? v : (cc.monthly as number);
    return Math.max(0, Math.min(1_000_000, Math.round(n)));
  };
  return {
    type: cc.type as CalcType,
    area: Math.max(0, Math.min(100_000, Math.round(cc.area))),
    daysPerWeek: Math.max(0, Math.min(7, Math.round(cc.daysPerWeek))),
    selectedDays: Array.isArray(cc.selectedDays)
      ? (cc.selectedDays as unknown[])
          .filter((x): x is number => typeof x === 'number' && x >= 0 && x <= 6)
          .slice(0, 7)
      : [],
    weeklyHours: Math.round((cc.weeklyHours as number) * 10) / 10,
    rate: Math.max(0, Math.min(1000, Math.round(cc.rate as number))),
    monthly: clampMonthly(cc.monthly),
    monthlyLow: clampMonthly(cc.monthlyLow),
    monthlyHigh: clampMonthly(cc.monthlyHigh),
    isAtMinimum: cc.isAtMinimum === true,
  };
}

function buildTitle(p: Payload, calc: CalculatorPayload | null): string {
  const variantLabel = p.variant === 'callback' ? 'Oddzwoń' : 'Zapytanie';
  if (calc) {
    return `${variantLabel} · ${TYPE_LABEL[calc.type]} ${calc.area}m² · ${p.phone ?? ''}`.trim();
  }
  return `${variantLabel} · ${p.phone ?? 'reefa.pl'}`;
}

function buildDescription(p: Payload, calc: CalculatorPayload | null): string {
  const parts: string[] = [];
  if (p.message) parts.push(p.message);
  if (calc) {
    const days = calc.selectedDays.length > 0 ? ` (dni: ${calc.selectedDays.join(',')})` : '';
    parts.push(
      `Kalkulator: ${TYPE_LABEL[calc.type]}, ${calc.area} m², ${calc.daysPerWeek} dni/tydz${days}, ` +
        `${calc.weeklyHours} godz/tydz @ ${calc.rate} zł/h → ${calc.monthlyLow}–${calc.monthlyHigh} zł/mies` +
        (calc.isAtMinimum ? ' (minimum)' : '')
    );
  }
  if (p.pageUrl) parts.push(`Strona: ${p.pageUrl}`);
  if (p.referrer) parts.push(`Skąd: ${p.referrer}`);
  return parts.join('\n');
}

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

  // Honeypot — silently swallow spam
  if (payload.hp && payload.hp.trim() !== '') {
    return json(200, { ok: true, id: 'spam-discarded' }, cors);
  }

  // Phone validation (reefa.pl form requires it)
  const phoneDigits = (payload.phone ?? '').replace(/\D/g, '');
  if (phoneDigits.length < 6 || phoneDigits.length > 20) {
    return json(400, { error: 'Validation failed', fields: ['phone'] }, cors);
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

  const calc = sanitizeCalculator(payload.calculator);
  const variant: Variant = payload.variant === 'callback' ? 'callback' : 'inquiry';

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
  const userAgent = req.headers.get('user-agent') ?? null;

  const insertBody = {
    title: buildTitle(payload, calc),
    status: 'new',
    value: calc ? calc.monthly : 0,
    contact_info: {
      name: '',
      phone: (payload.phone ?? '').slice(0, 30),
      email: (payload.email ?? '').slice(0, 120),
      role: '',
    },
    description: buildDescription(payload, calc),
    source: 'reefa.pl',
    metadata: {
      variant,
      message: (payload.message ?? '').slice(0, 1000),
      page_url: (payload.pageUrl ?? '').slice(0, 500),
      referrer: (payload.referrer ?? '').slice(0, 500),
      form_source: (payload.source ?? '').slice(0, 120),
      locale: (payload.locale ?? 'pl').slice(0, 5),
      calculator: calc,
      ip,
      user_agent: userAgent,
      submitted_at: new Date().toISOString(),
    },
  };

  const { data: lead, error } = await supabase
    .from('crm_leads')
    .insert(insertBody)
    .select('id')
    .single();

  if (error) {
    console.error('Insert into crm_leads failed:', error);
    return json(500, { error: 'Database insert failed' }, cors);
  }

  return json(200, { ok: true, id: lead.id }, cors);
});

import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { Eye, Users, TrendingUp, Globe, ExternalLink, RefreshCw, Bot, Clock, MousePointer2, UserPlus, UserCheck, Smartphone, Monitor, Tablet } from 'lucide-react';

// ─────────────────────────────────────────────
// TYPES (mirror the Postgres RPC shapes)
// ─────────────────────────────────────────────

interface ViewSummary {
    total_views: number;
    unique_sessions: number;
    unique_visitors: number;
    returning_visitors: number;
    views_today: number;
    views_last_7d: number;
    views_last_30d: number;
    bot_views: number;
    countries_count: number;
    avg_time_on_page: number | null;
    avg_scroll_pct: number | null;
}

interface PerArticle {
    slug: string;
    title: string;
    status: string;
    total_views: number;
    unique_sessions: number;
    unique_visitors: number;
    avg_daily: number;
    avg_time_seconds: number | null;
    avg_scroll_pct: number | null;
}

interface UtmRow {
    utm_source: string;
    utm_medium: string;
    utm_campaign: string;
    views: number;
    unique_visitors: number;
}

interface DeviceRow {
    device_type: string;
    views: number;
    unique_sessions: number;
}

interface NewVsReturningRow {
    cohort: string;
    visitors: number;
    views: number;
}

interface DailyView {
    day: string;
    views: number;
    unique_sessions: number;
}

interface ReferrerRow {
    referrer_domain: string;
    views: number;
    unique_sessions: number;
}

interface CountryRow {
    country: string;
    views: number;
    unique_sessions: number;
}

interface LocaleRow {
    locale: string;
    views: number;
    unique_sessions: number;
}

// ─────────────────────────────────────────────
// 2-char ISO country → flag emoji
// ─────────────────────────────────────────────
function flag(code: string): string {
    if (!code || code.length !== 2) return '🏳️';
    const A = 0x1F1E6;
    const a = 'A'.charCodeAt(0);
    const upper = code.toUpperCase();
    return String.fromCodePoint(A + upper.charCodeAt(0) - a, A + upper.charCodeAt(1) - a);
}

const COUNTRY_NAMES: Record<string, string> = {
    PL: 'Polska', DE: 'Niemcy', UA: 'Ukraina', RU: 'Rosja', BY: 'Białoruś',
    GB: 'UK', US: 'USA', CZ: 'Czechy', SK: 'Słowacja', AT: 'Austria',
    NL: 'Holandia', FR: 'Francja', IT: 'Włochy', ES: 'Hiszpania', LT: 'Litwa',
    LV: 'Łotwa', EE: 'Estonia', NO: 'Norwegia', SE: 'Szwecja', FI: 'Finlandia',
};

// ─────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────

export default function BlogStatsTab() {
    const [days, setDays] = useState<7 | 30 | 90>(30);
    const [summary, setSummary] = useState<ViewSummary | null>(null);
    const [perArticle, setPerArticle] = useState<PerArticle[]>([]);
    const [daily, setDaily] = useState<DailyView[]>([]);
    const [referrers, setReferrers] = useState<ReferrerRow[]>([]);
    const [countries, setCountries] = useState<CountryRow[]>([]);
    const [locales, setLocales] = useState<LocaleRow[]>([]);
    const [utm, setUtm] = useState<UtmRow[]>([]);
    const [devices, setDevices] = useState<DeviceRow[]>([]);
    const [nvr, setNvr] = useState<NewVsReturningRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    async function load(showSpinner = true) {
        if (showSpinner) setLoading(true);
        else setRefreshing(true);
        try {
            const [s, pa, d, r, c, l, u, dev, n] = await Promise.all([
                supabase.rpc('blog_b2b_view_summary', { p_days: days }),
                supabase.rpc('blog_b2b_views_per_article', { p_days: days }),
                supabase.rpc('blog_b2b_daily_views', { p_days: days }),
                supabase.rpc('blog_b2b_top_referrers', { p_days: days, p_limit: 15 }),
                supabase.rpc('blog_b2b_top_countries', { p_days: days, p_limit: 15 }),
                supabase.rpc('blog_b2b_views_by_locale', { p_days: days }),
                supabase.rpc('blog_b2b_utm_sources', { p_days: days, p_limit: 20 }),
                supabase.rpc('blog_b2b_device_split', { p_days: days }),
                supabase.rpc('blog_b2b_new_vs_returning', { p_days: days }),
            ]);
            if (s.data && s.data.length > 0) setSummary(s.data[0] as ViewSummary);
            else setSummary(null);
            if (pa.data) setPerArticle(pa.data as PerArticle[]);
            if (d.data) setDaily(d.data as DailyView[]);
            if (r.data) setReferrers(r.data as ReferrerRow[]);
            if (c.data) setCountries(c.data as CountryRow[]);
            if (l.data) setLocales(l.data as LocaleRow[]);
            if (u.data) setUtm(u.data as UtmRow[]);
            if (dev.data) setDevices(dev.data as DeviceRow[]);
            if (n.data) setNvr(n.data as NewVsReturningRow[]);
        } catch (e) {
            console.error('[stats] load failed:', e);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }

    useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [days]);

    const maxDaily = useMemo(() => Math.max(1, ...daily.map((d) => d.views)), [daily]);

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20">
                <RefreshCw className="animate-spin text-muted" size={28} />
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Range selector */}
            <div className="bg-card border border-border rounded-xl p-4 flex flex-wrap items-center justify-between gap-3 shadow-sm">
                <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-main">Okres:</span>
                    {([7, 30, 90] as const).map((d) => (
                        <button
                            key={d}
                            onClick={() => setDays(d)}
                            className={`text-xs px-3 py-1.5 rounded-md border font-semibold transition-colors ${
                                days === d
                                    ? 'bg-primary text-white border-primary'
                                    : 'border-border text-muted hover:text-main hover:bg-subtle'
                            }`}
                        >
                            {d} dni
                        </button>
                    ))}
                </div>
                <button
                    onClick={() => load(false)}
                    disabled={refreshing}
                    className="text-xs flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border hover:bg-subtle text-muted hover:text-main"
                >
                    <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
                    Odśwież
                </button>
            </div>

            {/* Summary cards row 1: traffic */}
            {summary && (
                <>
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
                        <SummaryCard icon={<Eye size={16} />} label={`Wyświetleń ${days}d`} value={summary.total_views} highlight />
                        <SummaryCard icon={<Users size={16} />} label="Sesji" value={summary.unique_sessions} />
                        <SummaryCard icon={<UserCheck size={16} />} label="Unikalnych osób" value={summary.unique_visitors} />
                        <SummaryCard icon={<UserPlus size={16} />} label="Powracających" value={summary.returning_visitors} />
                        <SummaryCard icon={<TrendingUp size={16} />} label="Dziś" value={summary.views_today} />
                        <SummaryCard icon={<Globe size={16} />} label="Krajów" value={summary.countries_count} />
                        <SummaryCard icon={<Bot size={16} />} label="Boty" value={summary.bot_views} subdued />
                    </div>
                    {/* Engagement row */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <SummaryCard
                            icon={<Clock size={16} />}
                            label="Avg czas na stronie"
                            value={summary.avg_time_on_page ? formatDuration(summary.avg_time_on_page) : '—'}
                        />
                        <SummaryCard
                            icon={<MousePointer2 size={16} />}
                            label="Avg głębokość scrolla"
                            value={summary.avg_scroll_pct ? `${Math.round(summary.avg_scroll_pct)}%` : '—'}
                        />
                        <SummaryCard
                            icon={<TrendingUp size={16} />}
                            label="7 dni"
                            value={summary.views_last_7d}
                        />
                        <SummaryCard
                            icon={<TrendingUp size={16} />}
                            label="30 dni"
                            value={summary.views_last_30d}
                        />
                    </div>
                </>
            )}

            {/* Daily chart */}
            <div className="bg-card border border-border rounded-xl p-4 lg:p-5 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="font-bold text-main">Wyświetlenia dziennie</h3>
                    <span className="text-xs text-muted">ostatnie {days} dni</span>
                </div>
                <DailyChart daily={daily} maxValue={maxDaily} />
            </div>

            {/* Per-article ranking */}
            <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
                <div className="p-4 border-b border-border flex items-center justify-between">
                    <h3 className="font-bold text-main">Wyświetlenia per artykuł</h3>
                    <span className="text-xs text-muted">{perArticle.length} artykułów</span>
                </div>
                {perArticle.length === 0 ? (
                    <div className="p-8 text-center text-muted text-sm">Brak danych</div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-subtle/40 text-xs text-muted uppercase tracking-wider">
                                <tr>
                                    <th className="text-left px-4 py-2">Artykuł</th>
                                    <th className="text-right px-4 py-2">Status</th>
                                    <th className="text-right px-4 py-2">Wyświetleń</th>
                                    <th className="text-right px-4 py-2">Unikalnych</th>
                                    <th className="text-right px-4 py-2">Avg / dzień</th>
                                    <th className="text-right px-4 py-2">Avg czas</th>
                                    <th className="text-right px-4 py-2">Avg scroll</th>
                                    <th className="px-2 py-2"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {perArticle.slice(0, 30).map((a) => (
                                    <tr key={a.slug} className="border-t border-border hover:bg-subtle/30">
                                        <td className="px-4 py-2.5">
                                            <div className="font-medium text-main truncate max-w-[460px]">{a.title}</div>
                                            <div className="text-[10px] text-muted font-mono">{a.slug}</div>
                                        </td>
                                        <td className="px-4 py-2.5 text-right">
                                            <span className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded border ${
                                                a.status === 'published'
                                                    ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30'
                                                    : 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30'
                                            }`}>{a.status}</span>
                                        </td>
                                        <td className="px-4 py-2.5 text-right font-bold tabular-nums text-main">{a.total_views}</td>
                                        <td className="px-4 py-2.5 text-right tabular-nums text-muted">{a.unique_sessions}</td>
                                        <td className="px-4 py-2.5 text-right tabular-nums text-muted">{a.avg_daily}</td>
                                        <td className="px-4 py-2.5 text-right tabular-nums text-muted">{a.avg_time_seconds ? formatDuration(a.avg_time_seconds) : '—'}</td>
                                        <td className="px-4 py-2.5 text-right tabular-nums text-muted">{a.avg_scroll_pct ? `${Math.round(a.avg_scroll_pct)}%` : '—'}</td>
                                        <td className="px-2 py-2.5 text-right">
                                            {a.status === 'published' && (
                                                <a
                                                    href={`https://reefa.pl/blog/${a.slug}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-muted hover:text-blue-600 inline-flex"
                                                >
                                                    <ExternalLink size={13} />
                                                </a>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* 3-column: referrers, countries, locales */}
            <div className="grid md:grid-cols-3 gap-4">
                {/* Referrers */}
                <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
                    <h3 className="font-bold text-main mb-3 text-sm">Skąd przyszli</h3>
                    {referrers.length === 0 ? (
                        <div className="text-xs text-muted">Brak danych</div>
                    ) : (
                        <div className="space-y-1.5">
                            {referrers.map((r) => (
                                <div key={r.referrer_domain} className="flex items-baseline justify-between text-sm">
                                    <span className="text-main font-medium truncate max-w-[60%]" title={r.referrer_domain}>
                                        {r.referrer_domain === '(direct)' ? <em className="text-muted not-italic">(bezpośrednio)</em> : r.referrer_domain}
                                    </span>
                                    <div className="text-xs text-muted tabular-nums">
                                        <span className="font-bold text-main">{r.views}</span>
                                        <span className="ml-1 opacity-60">/ {r.unique_sessions}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Countries */}
                <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
                    <h3 className="font-bold text-main mb-3 text-sm">Kraje</h3>
                    {countries.length === 0 ? (
                        <div className="text-xs text-muted">Brak danych</div>
                    ) : (
                        <div className="space-y-1.5">
                            {countries.map((c) => (
                                <div key={c.country} className="flex items-baseline justify-between text-sm">
                                    <span className="text-main font-medium flex items-center gap-2">
                                        <span className="text-base">{flag(c.country)}</span>
                                        {COUNTRY_NAMES[c.country.toUpperCase()] ?? c.country.toUpperCase()}
                                    </span>
                                    <div className="text-xs text-muted tabular-nums">
                                        <span className="font-bold text-main">{c.views}</span>
                                        <span className="ml-1 opacity-60">/ {c.unique_sessions}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Locales */}
                <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
                    <h3 className="font-bold text-main mb-3 text-sm">Wersje językowe</h3>
                    {locales.length === 0 ? (
                        <div className="text-xs text-muted">Brak danych</div>
                    ) : (
                        <div className="space-y-1.5">
                            {locales.map((l) => (
                                <div key={l.locale} className="flex items-baseline justify-between text-sm">
                                    <span className="text-main font-medium">
                                        {l.locale === 'pl' ? '🇵🇱 Polski' : l.locale === 'en' ? '🇬🇧 English' : l.locale === 'ru' ? '🇷🇺 Русский' : l.locale.toUpperCase()}
                                    </span>
                                    <div className="text-xs text-muted tabular-nums">
                                        <span className="font-bold text-main">{l.views}</span>
                                        <span className="ml-1 opacity-60">/ {l.unique_sessions}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* UTM + Devices + New/Returning row */}
            <div className="grid md:grid-cols-3 gap-4">
                {/* UTM sources */}
                <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
                    <h3 className="font-bold text-main mb-3 text-sm">Kampanie (UTM)</h3>
                    {utm.length === 0 ? (
                        <div className="text-xs text-muted">
                            Brak ruchu z kampanii UTM.
                            <p className="mt-1 opacity-70">
                                Dodaj parametry typu <code className="bg-subtle px-1 rounded">?utm_source=newsletter&utm_medium=email</code> do linków marketingowych żeby śledzić źródła.
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-1.5 max-h-64 overflow-y-auto">
                            {utm.map((u, i) => (
                                <div key={i} className="text-sm pb-1.5 border-b border-border/40 last:border-0">
                                    <div className="flex items-baseline justify-between">
                                        <span className="font-bold text-main truncate" title={`${u.utm_source} / ${u.utm_medium} / ${u.utm_campaign}`}>
                                            {u.utm_source}
                                        </span>
                                        <span className="text-xs text-muted tabular-nums">
                                            <span className="font-bold text-main">{u.views}</span> / {u.unique_visitors}
                                        </span>
                                    </div>
                                    {u.utm_medium && (
                                        <div className="text-[10px] text-muted truncate">
                                            {u.utm_medium}{u.utm_campaign ? ` · ${u.utm_campaign}` : ''}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Devices */}
                <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
                    <h3 className="font-bold text-main mb-3 text-sm">Urządzenia</h3>
                    {devices.length === 0 ? (
                        <div className="text-xs text-muted">Brak danych</div>
                    ) : (
                        <div className="space-y-1.5">
                            {devices.map((d) => (
                                <div key={d.device_type} className="flex items-baseline justify-between text-sm">
                                    <span className="text-main font-medium flex items-center gap-2">
                                        {d.device_type === 'mobile' ? <Smartphone size={14} className="text-blue-500" /> :
                                         d.device_type === 'tablet' ? <Tablet size={14} className="text-purple-500" /> :
                                         d.device_type === 'desktop' ? <Monitor size={14} className="text-emerald-500" /> :
                                         <Globe size={14} className="text-muted" />}
                                        {d.device_type === 'mobile' ? 'Mobile' :
                                         d.device_type === 'tablet' ? 'Tablet' :
                                         d.device_type === 'desktop' ? 'Desktop' : '?'}
                                    </span>
                                    <div className="text-xs text-muted tabular-nums">
                                        <span className="font-bold text-main">{d.views}</span>
                                        <span className="ml-1 opacity-60">/ {d.unique_sessions}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* New vs returning */}
                <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
                    <h3 className="font-bold text-main mb-3 text-sm">Nowi vs powracający</h3>
                    {nvr.length === 0 ? (
                        <div className="text-xs text-muted">
                            Brak danych z cookies (potrzeba zgody analitycznej od użytkowników)
                        </div>
                    ) : (
                        <div className="space-y-2.5">
                            {nvr.map((n) => {
                                const totalVisitors = nvr.reduce((s, x) => s + x.visitors, 0);
                                const pct = totalVisitors > 0 ? Math.round((n.visitors / totalVisitors) * 100) : 0;
                                return (
                                    <div key={n.cohort}>
                                        <div className="flex items-baseline justify-between text-sm mb-1">
                                            <span className="text-main font-medium">
                                                {n.cohort === 'new' ? '🆕 Nowi' : '🔁 Powracający'}
                                            </span>
                                            <div className="text-xs text-muted tabular-nums">
                                                <span className="font-bold text-main">{n.visitors}</span> osób / <span className="font-bold text-main">{n.views}</span> wyśw.
                                            </div>
                                        </div>
                                        <div className="h-2 bg-subtle rounded-full overflow-hidden">
                                            <div
                                                className={`h-full ${n.cohort === 'returning' ? 'bg-emerald-500' : 'bg-blue-500'}`}
                                                style={{ width: `${pct}%` }}
                                            />
                                        </div>
                                        <div className="text-[10px] text-muted text-right mt-0.5">{pct}%</div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            <p className="text-[10px] text-muted text-center pt-2">
                Liczby pokazują: <strong>łączne wyświetlenia</strong> / <strong>unikalne sesje</strong>. Bot views są wyłączone z agregacji.
                <br />
                Anonimowy tracking (zawsze): SHA-256 hash z IP+UA+date. Rozszerzony tracking (visitor_id, czas, scroll, UTM) tylko po zgodzie analitycznej z banera cookies.
            </p>
        </div>
    );
}

function formatDuration(seconds: number): string {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    const min = Math.floor(seconds / 60);
    const sec = Math.round(seconds % 60);
    return `${min}m ${sec}s`;
}

// ─────────────────────────────────────────────
// SUB-COMPONENTS
// ─────────────────────────────────────────────

function SummaryCard({
    icon,
    label,
    value,
    highlight,
    subdued,
}: {
    icon: React.ReactNode;
    label: string;
    value: number | string;
    highlight?: boolean;
    subdued?: boolean;
}) {
    return (
        <div className={`px-3 py-3 rounded-xl border shadow-sm ${
            highlight
                ? 'border-blue-500/40 bg-gradient-to-br from-blue-500/15 to-blue-500/5'
                : subdued
                    ? 'border-border bg-subtle/30 opacity-70'
                    : 'border-border bg-card'
        }`}>
            <div className="flex items-center gap-2 text-muted text-[10px] uppercase font-semibold tracking-wider">
                {icon}
                <span>{label}</span>
            </div>
            <div className={`text-xl lg:text-2xl font-bold tabular-nums mt-1 ${highlight ? 'text-blue-600 dark:text-blue-300' : 'text-main'}`}>
                {typeof value === 'number' ? value.toLocaleString('pl-PL') : value}
            </div>
        </div>
    );
}

function DailyChart({ daily, maxValue }: { daily: DailyView[]; maxValue: number }) {
    if (daily.length === 0) {
        return <div className="text-xs text-muted py-8 text-center">Brak danych</div>;
    }
    return (
        <div className="flex items-end gap-1 h-32">
            {daily.map((d) => {
                const heightPct = (d.views / maxValue) * 100;
                const dateLabel = new Date(d.day).toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit' });
                return (
                    <div
                        key={d.day}
                        className="flex-1 flex flex-col justify-end items-center group relative"
                        style={{ minWidth: '6px' }}
                    >
                        <div
                            className="w-full bg-blue-500/80 hover:bg-blue-500 rounded-t-sm transition-colors min-h-[2px]"
                            style={{ height: `${heightPct}%` }}
                            title={`${dateLabel}: ${d.views} wyświetleń (${d.unique_sessions} unikalnych)`}
                        />
                        {/* Tooltip on hover */}
                        <div className="absolute bottom-full mb-1 hidden group-hover:block bg-card border border-border rounded-md px-2 py-1 text-[10px] whitespace-nowrap shadow-lg z-10">
                            <div className="font-bold text-main">{dateLabel}</div>
                            <div className="text-muted">{d.views} wyśw. / {d.unique_sessions} unik.</div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

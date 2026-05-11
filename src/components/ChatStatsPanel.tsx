import { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import {
    MessageSquare, RefreshCw, AlertTriangle, Bot, Phone, Coins, Users, TrendingUp,
    ChevronRight, ArrowLeft, Sparkles, Globe, Calendar, Inbox,
} from 'lucide-react'

/**
 * ChatStatsPanel — analytics + transcripts for the on-site AI chat bot.
 *
 * Two-pane layout (similar to ProceduresPanel):
 *  - Left: KPI cards + filters + conversation list
 *  - Right: full transcript when a conversation is selected
 *
 * Operations:
 *  - "Summarise" runs Claude over un-summarised conversations to extract
 *    topic + 1-2 sentence Polish summary + lead-intent flag (background job
 *    delegated to /api/chat-summarize on reefa.pl).
 *
 * Data privacy: IPs are stored hashed (chat_conversations.ip_hash). Full
 * conversations expire after 90 days via the chat_purge_expired() function.
 */

interface ConversationRow {
    id: string
    session_id: string
    locale: string
    origin_path: string | null
    message_count: number
    total_input_tokens: number
    total_output_tokens: number
    total_cache_read_tokens: number
    escalated: boolean
    escalation_reason: string | null
    has_lead_intent: boolean
    ai_summary: string | null
    ai_topic: string | null
    created_at: string
    last_message_at: string
}

interface MessageRow {
    id: string
    conversation_id: string
    role: 'user' | 'assistant' | 'tool'
    content: string
    model: string | null
    input_tokens: number | null
    output_tokens: number | null
    cache_read_tokens: number | null
    tool_use: any
    created_at: string
}

interface Summary {
    total_conversations: number
    total_messages: number
    conversations_today: number
    conversations_last_7d: number
    escalated_count: number
    lead_intent_count: number
    total_input_tokens: number
    total_output_tokens: number
    total_cache_read_tokens: number
    unique_visitors: number
    avg_messages_per_conv: number
}

interface DailyRow {
    day: string
    conversations: number
    messages: number
    escalated: number
    leads: number
}

interface LocaleRow {
    locale: string
    conversations: number
    messages: number
}

interface TopicRow {
    topic: string
    conversations: number
}

type Filter = 'all' | 'leads' | 'escalated' | 'unsummarised'

const LOCALE_FLAG: Record<string, string> = { pl: '🇵🇱', en: '🇬🇧', ru: '🇷🇺' }

// Pricing for Claude Sonnet 4.5 (USD per million tokens) — used for the
// "estimated cost" widget. If we ever switch model defaults the constants
// here need to follow.
const PRICE_SONNET_45 = {
    input: 3.0,
    output: 15.0,
    cache_read: 0.30,
}

function fmt(n: number | null | undefined): string {
    if (n == null) return '0'
    return n.toLocaleString('pl-PL')
}

function relTime(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime()
    const m = Math.floor(diff / 60_000)
    if (m < 1) return 'теперь'
    if (m < 60) return `${m} мин назад`
    const h = Math.floor(m / 60)
    if (h < 24) return `${h} ч назад`
    const d = Math.floor(h / 24)
    return `${d} д назад`
}

function estimateCost(s: Summary): number {
    const input = (s.total_input_tokens / 1_000_000) * PRICE_SONNET_45.input
    const output = (s.total_output_tokens / 1_000_000) * PRICE_SONNET_45.output
    const cache = (s.total_cache_read_tokens / 1_000_000) * PRICE_SONNET_45.cache_read
    return input + output + cache
}

export default function ChatStatsPanel() {
    const [days, setDays] = useState(30)
    const [summary, setSummary] = useState<Summary | null>(null)
    const [daily, setDaily] = useState<DailyRow[]>([])
    const [byLocale, setByLocale] = useState<LocaleRow[]>([])
    const [topics, setTopics] = useState<TopicRow[]>([])
    const [conversations, setConversations] = useState<ConversationRow[]>([])
    const [filter, setFilter] = useState<Filter>('all')
    const [loading, setLoading] = useState(true)
    const [activeId, setActiveId] = useState<string | null>(null)
    const [activeMessages, setActiveMessages] = useState<MessageRow[]>([])
    const [summarising, setSummarising] = useState(false)
    const [summariseStatus, setSummariseStatus] = useState<string | null>(null)

    const loadAll = useCallback(async () => {
        setLoading(true)
        const [s, d, l, t, c] = await Promise.all([
            supabase.rpc('chat_stats_summary', { p_days: days }),
            supabase.rpc('chat_stats_daily', { p_days: days }),
            supabase.rpc('chat_stats_by_locale', { p_days: days }),
            supabase.rpc('chat_stats_top_topics', { p_days: days, p_limit: 12 }),
            supabase.from('chat_conversations')
                .select('*')
                .gte('created_at', new Date(Date.now() - days * 86_400_000).toISOString())
                .order('last_message_at', { ascending: false })
                .limit(200),
        ])
        if (s.data && s.data.length > 0) setSummary(s.data[0] as Summary)
        if (d.data) setDaily(d.data as DailyRow[])
        if (l.data) setByLocale(l.data as LocaleRow[])
        if (t.data) setTopics(t.data as TopicRow[])
        if (c.data) setConversations(c.data as ConversationRow[])
        setLoading(false)
    }, [days])

    useEffect(() => { loadAll() }, [loadAll])

    const filtered = useMemo(() => {
        return conversations.filter((c) => {
            if (filter === 'leads') return c.has_lead_intent
            if (filter === 'escalated') return c.escalated
            if (filter === 'unsummarised') return !c.ai_summary
            return true
        })
    }, [conversations, filter])

    useEffect(() => {
        if (!activeId) {
            setActiveMessages([])
            return
        }
        ;(async () => {
            const { data } = await supabase.from('chat_messages')
                .select('*')
                .eq('conversation_id', activeId)
                .order('created_at', { ascending: true })
            setActiveMessages((data || []) as MessageRow[])
        })()
    }, [activeId])

    const active = activeId ? conversations.find((c) => c.id === activeId) : null

    const handleSummarise = async () => {
        setSummarising(true)
        setSummariseStatus(null)
        try {
            const token = (import.meta.env.VITE_CHAT_ADMIN_TOKEN as string | undefined) || ''
            if (!token) {
                setSummariseStatus('Не задан VITE_CHAT_ADMIN_TOKEN в env админки.')
                setSummarising(false)
                return
            }
            const res = await fetch('https://reefa.pl/api/chat-summarize', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ limit: 30 }),
            })
            const data = await res.json()
            if (res.ok) {
                setSummariseStatus(`Готово: проанализировано ${data.summarised} (всего ${data.total}, ошибок ${data.failed || 0}).`)
                await loadAll()
            } else {
                setSummariseStatus(`Ошибка: ${data.error || res.status}`)
            }
        } catch (e: any) {
            setSummariseStatus(`Сбой: ${e.message}`)
        }
        setSummarising(false)
    }

    if (loading && !summary) {
        return (
            <div className="flex justify-center items-center h-64">
                <div className="w-8 h-8 border-4 border-zinc-300 dark:border-zinc-700 border-t-blue-500 rounded-full animate-spin" />
            </div>
        )
    }

    const cost = summary ? estimateCost(summary) : 0
    const maxDaily = Math.max(1, ...daily.map((d) => d.conversations))

    return (
        <div className="animate-fadeIn">
            {/* Header */}
            <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
                <div>
                    <h2 className="text-2xl font-bold text-main flex items-center gap-2">
                        <MessageSquare className="w-6 h-6 text-blue-500" />
                        Чат-бот · аналитика
                    </h2>
                    <p className="text-sm text-muted mt-1">Диалоги с AI-ассистентом reefa.pl, темы, лиды, эскалации, токены</p>
                </div>
                <div className="flex items-center gap-2">
                    <select
                        value={days}
                        onChange={(e) => setDays(parseInt(e.target.value))}
                        className="input"
                    >
                        <option value={7}>7 дней</option>
                        <option value={30}>30 дней</option>
                        <option value={90}>90 дней</option>
                    </select>
                    <button onClick={loadAll} className="btn-secondary flex items-center gap-1.5" disabled={loading}>
                        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                        Обновить
                    </button>
                    <button
                        onClick={handleSummarise}
                        disabled={summarising}
                        className="btn-primary flex items-center gap-1.5 disabled:opacity-50"
                    >
                        <Sparkles className={`w-4 h-4 ${summarising ? 'animate-pulse' : ''}`} />
                        {summarising ? 'Анализ…' : 'Анализ AI'}
                    </button>
                </div>
            </div>

            {summariseStatus && (
                <div className="mb-4 p-3 bg-blue-500/10 text-blue-700 dark:text-blue-300 rounded-lg text-sm">
                    {summariseStatus}
                </div>
            )}

            {/* KPI cards */}
            {summary && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                    <KpiCard icon={MessageSquare} label="Диалогов" value={fmt(summary.total_conversations)} hint={`${summary.conversations_today} сегодня · ${summary.conversations_last_7d} за 7д`} />
                    <KpiCard icon={Users} label="Уникальных" value={fmt(summary.unique_visitors)} hint={`в среднем ${summary.avg_messages_per_conv ?? '—'} сообщений`} />
                    <KpiCard icon={Inbox} label="Лиды" value={fmt(summary.lead_intent_count)} hint={`${summary.total_conversations > 0 ? Math.round(summary.lead_intent_count * 100 / summary.total_conversations) : 0}% от диалогов`} accent="green" />
                    <KpiCard icon={Phone} label="Эскалаций" value={fmt(summary.escalated_count)} hint={`${summary.total_conversations > 0 ? Math.round(summary.escalated_count * 100 / summary.total_conversations) : 0}% перешли к человеку`} accent="amber" />
                    <KpiCard icon={Coins} label="≈ Стоимость" value={`$${cost.toFixed(2)}`} hint={`${fmt(summary.total_input_tokens + summary.total_output_tokens)} токенов`} />
                    <KpiCard icon={TrendingUp} label="Cache hit" value={summary.total_input_tokens > 0 ? `${Math.round(summary.total_cache_read_tokens * 100 / (summary.total_input_tokens + summary.total_cache_read_tokens))}%` : '—'} hint={`${fmt(summary.total_cache_read_tokens)} cache · ${fmt(summary.total_input_tokens)} live`} />
                    <KpiCard icon={MessageSquare} label="Сообщений" value={fmt(summary.total_messages)} hint="user + assistant" />
                    <KpiCard icon={Bot} label="Конверсия лидов" value={`${summary.escalated_count > 0 ? Math.round(summary.escalated_count * 100 / Math.max(1, summary.lead_intent_count)) : 0}%`} hint="эскалаций / лидов" accent="blue" />
                </div>
            )}

            {/* Charts row */}
            <div className="grid lg:grid-cols-3 gap-4 mb-6">
                {/* Daily bars */}
                <div className="card p-4 lg:col-span-2">
                    <h3 className="font-semibold text-main text-sm mb-3 flex items-center gap-1.5"><Calendar size={14} /> Диалоги по дням</h3>
                    {daily.length === 0 ? (
                        <p className="text-sm text-muted">Нет данных за период</p>
                    ) : (
                        <div className="flex items-end gap-1 h-32">
                            {daily.slice().reverse().map((d) => (
                                <div key={d.day} className="flex-1 flex flex-col items-center gap-1 group" title={`${d.day}\n${d.conversations} диалогов · ${d.leads} лидов · ${d.escalated} эскалаций`}>
                                    <div className="w-full flex flex-col items-stretch gap-0.5" style={{ height: '100%' }}>
                                        <div
                                            className="bg-blue-500/80 rounded-t group-hover:bg-blue-500 transition"
                                            style={{ height: `${(d.conversations / maxDaily) * 100}%`, minHeight: d.conversations > 0 ? 2 : 0 }}
                                        />
                                    </div>
                                    <span className="text-[9px] text-muted">{d.day.slice(5)}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* By locale */}
                <div className="card p-4">
                    <h3 className="font-semibold text-main text-sm mb-3 flex items-center gap-1.5"><Globe size={14} /> По языку</h3>
                    {byLocale.length === 0 ? (
                        <p className="text-sm text-muted">Нет данных</p>
                    ) : (
                        <ul className="space-y-2">
                            {byLocale.map((l) => (
                                <li key={l.locale} className="flex items-center justify-between text-sm">
                                    <span className="text-main">{LOCALE_FLAG[l.locale] || ''} {l.locale.toUpperCase()}</span>
                                    <span className="text-muted">{fmt(l.conversations)} ({fmt(l.messages)} сообщ.)</span>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>

            {/* Top topics */}
            <div className="card p-4 mb-6">
                <h3 className="font-semibold text-main text-sm mb-3 flex items-center gap-1.5"><Sparkles size={14} /> Топ-темы</h3>
                {topics.length === 0 ? (
                    <p className="text-sm text-muted">Нет тем — нажми «Анализ AI» сверху</p>
                ) : (
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                        {topics.map((t) => (
                            <div key={t.topic} className="flex items-center justify-between bg-subtle rounded-lg px-3 py-2">
                                <span className="text-sm text-main truncate" title={t.topic}>{t.topic}</span>
                                <span className="text-xs text-muted ml-2 shrink-0">{fmt(t.conversations)}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Two-pane: list + detail */}
            <div className="grid lg:grid-cols-[400px_1fr] gap-4">
                <div className={`${active ? 'hidden lg:block' : ''}`}>
                    <div className="flex gap-1.5 mb-3 overflow-x-auto">
                        {(['all', 'leads', 'escalated', 'unsummarised'] as Filter[]).map((f) => (
                            <button
                                key={f}
                                onClick={() => setFilter(f)}
                                className={`px-3 py-1.5 rounded-full text-xs font-semibold transition shrink-0 ${
                                    filter === f
                                        ? 'bg-blue-500 text-white'
                                        : 'bg-subtle text-muted hover:text-main'
                                }`}
                            >
                                {f === 'all' ? 'Все' : f === 'leads' ? 'Лиды' : f === 'escalated' ? 'Эскалации' : 'Без анализа'}
                                <span className="ml-1.5 opacity-70">
                                    ({f === 'all' ? conversations.length : f === 'leads' ? conversations.filter((c) => c.has_lead_intent).length : f === 'escalated' ? conversations.filter((c) => c.escalated).length : conversations.filter((c) => !c.ai_summary).length})
                                </span>
                            </button>
                        ))}
                    </div>
                    {filtered.length === 0 ? (
                        <div className="card p-6 text-center text-muted">
                            <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-50" />
                            <p className="text-sm">Нет диалогов в этом фильтре</p>
                        </div>
                    ) : (
                        <ul className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
                            {filtered.map((c) => (
                                <li key={c.id}>
                                    <button
                                        onClick={() => setActiveId(c.id)}
                                        className={`w-full text-left p-3 rounded-lg border transition ${
                                            activeId === c.id
                                                ? 'bg-blue-500/10 border-blue-500/50'
                                                : 'bg-card border-border hover:border-blue-500/30'
                                        }`}
                                    >
                                        <div className="flex items-center justify-between gap-2 mb-1">
                                            <div className="flex items-center gap-1.5 min-w-0">
                                                <span className="text-xs">{LOCALE_FLAG[c.locale] || ''}</span>
                                                <span className="font-semibold text-sm text-main truncate">{c.ai_topic || 'Без анализа'}</span>
                                            </div>
                                            <ChevronRight className="w-4 h-4 text-muted shrink-0" />
                                        </div>
                                        <p className="text-xs text-muted line-clamp-2 mb-1">{c.ai_summary || '—'}</p>
                                        <div className="flex items-center gap-2 text-[10px] text-muted">
                                            <span>{relTime(c.last_message_at)}</span>
                                            <span>·</span>
                                            <span>{c.message_count} сообщ.</span>
                                            {c.has_lead_intent && <span className="px-1.5 py-0.5 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 rounded">лид</span>}
                                            {c.escalated && <span className="px-1.5 py-0.5 bg-amber-500/15 text-amber-700 dark:text-amber-300 rounded">эск.</span>}
                                        </div>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                <div className={`${active ? '' : 'hidden lg:block'}`}>
                    {!active ? (
                        <div className="card p-12 text-center text-muted">
                            <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-30" />
                            <p>Выберите диалог слева</p>
                        </div>
                    ) : (
                        <div className="card p-5">
                            <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
                                <div className="flex items-start gap-2 min-w-0">
                                    <button onClick={() => setActiveId(null)} className="lg:hidden p-1 -ml-1 text-muted">
                                        <ArrowLeft className="w-5 h-5" />
                                    </button>
                                    <div className="min-w-0">
                                        <h3 className="font-bold text-main">{active.ai_topic || 'Без AI-анализа'}</h3>
                                        <p className="text-xs text-muted mt-0.5">
                                            {LOCALE_FLAG[active.locale] || ''} {active.locale.toUpperCase()} · {new Date(active.created_at).toLocaleString('pl-PL')} · {active.message_count} сообщ.
                                            {active.origin_path && <> · <span className="text-blue-600 dark:text-blue-400">{active.origin_path}</span></>}
                                        </p>
                                        {active.ai_summary && (
                                            <p className="text-sm text-muted mt-2 italic">«{active.ai_summary}»</p>
                                        )}
                                        {active.escalated && active.escalation_reason && (
                                            <div className="mt-2 inline-flex items-center gap-1.5 px-2 py-1 bg-amber-500/15 text-amber-700 dark:text-amber-300 rounded text-xs">
                                                <AlertTriangle className="w-3.5 h-3.5" />
                                                Эскалация: {active.escalation_reason}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2">
                                {activeMessages.map((m) => (
                                    <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                        <div
                                            className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm whitespace-pre-wrap ${
                                                m.role === 'user'
                                                    ? 'bg-blue-500 text-white rounded-br-sm'
                                                    : m.role === 'assistant'
                                                        ? 'bg-subtle text-main rounded-bl-sm'
                                                        : 'bg-amber-500/15 text-amber-700 dark:text-amber-300 rounded-bl-sm border border-amber-500/30'
                                            }`}
                                        >
                                            {m.role === 'tool' && m.tool_use && (
                                                <div className="text-[10px] font-mono uppercase tracking-wider opacity-70 mb-1">
                                                    🛠 {(m.tool_use as any).name || 'tool'}
                                                </div>
                                            )}
                                            {m.content || (m.tool_use ? JSON.stringify((m.tool_use as any).input, null, 2) : '')}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

function KpiCard({ icon: Icon, label, value, hint, accent }: { icon: any; label: string; value: string; hint?: string; accent?: 'green' | 'amber' | 'blue' }) {
    const accentCls =
        accent === 'green' ? 'text-emerald-600 dark:text-emerald-400' :
        accent === 'amber' ? 'text-amber-600 dark:text-amber-400' :
        accent === 'blue' ? 'text-blue-600 dark:text-blue-400' :
        'text-main'
    return (
        <div className="card p-3">
            <div className="flex items-center gap-2 mb-1">
                <Icon className="w-3.5 h-3.5 text-muted" />
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">{label}</span>
            </div>
            <div className={`text-xl font-bold ${accentCls}`}>{value}</div>
            {hint && <div className="text-[11px] text-muted mt-0.5">{hint}</div>}
        </div>
    )
}

import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import {
    Phone, Mail, Globe, RefreshCw, Search, ChevronDown, ChevronUp,
    Calculator as CalcIcon, MessageSquare, ExternalLink, X, Trash2
} from 'lucide-react';

type LeadStatus = 'new' | 'contacted' | 'proposal' | 'negotiation' | 'won' | 'lost';

interface ContactInfo {
    name?: string;
    phone?: string;
    email?: string;
    role?: string;
}

interface CalculatorSnapshot {
    type: 'office' | 'medical' | 'school' | 'residential';
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

interface LeadMetadata {
    variant?: 'callback' | 'inquiry';
    message?: string;
    page_url?: string;
    referrer?: string;
    form_source?: string;
    locale?: string;
    calculator?: CalculatorSnapshot | null;
    ip?: string;
    user_agent?: string;
    submitted_at?: string;
    // home.reefa.pl shape (kept for compatibility)
    kind?: string;
    service?: string;
    service_label?: string;
    address?: string;
    note?: string;
    frequency?: string;
    date?: string;
    time?: string;
}

interface Lead {
    id: string;
    title: string;
    status: LeadStatus;
    value: number;
    contact_info: ContactInfo | null;
    description: string | null;
    source: string | null;
    metadata: LeadMetadata | null;
    created_at: string;
    updated_at: string;
}

const STATUS_OPTIONS: { value: LeadStatus; label: string; color: string }[] = [
    { value: 'new', label: 'Новый', color: 'bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30' },
    { value: 'contacted', label: 'Связались', color: 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border-indigo-500/30' },
    { value: 'proposal', label: 'КП', color: 'bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/30' },
    { value: 'negotiation', label: 'Переговоры', color: 'bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/30' },
    { value: 'won', label: 'Выиграно', color: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30' },
    { value: 'lost', label: 'Проиграно', color: 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30' },
];

const TYPE_LABEL: Record<CalculatorSnapshot['type'], string> = {
    office: 'Biuro',
    medical: 'Med. placówka',
    school: 'Placówka eduk.',
    residential: 'Klatka schodowa',
};

const DAY_NAMES = ['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'Sb', 'Nd'];

function formatDateTime(iso: string): string {
    return new Date(iso).toLocaleString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function formatRelative(iso: string): string {
    const diffMs = Date.now() - new Date(iso).getTime();
    const min = Math.floor(diffMs / 60000);
    if (min < 1) return 'только что';
    if (min < 60) return `${min} мин назад`;
    const h = Math.floor(min / 60);
    if (h < 24) return `${h} ч назад`;
    const d = Math.floor(h / 24);
    if (d < 7) return `${d} д назад`;
    return formatDateTime(iso).split(',')[0];
}

function StatusBadge({ status, onChange, disabled }: { status: LeadStatus; onChange: (s: LeadStatus) => void; disabled?: boolean }) {
    const opt = STATUS_OPTIONS.find((o) => o.value === status) ?? STATUS_OPTIONS[0];
    return (
        <select
            value={status}
            onChange={(e) => onChange(e.target.value as LeadStatus)}
            disabled={disabled}
            onClick={(e) => e.stopPropagation()}
            className={`text-xs font-semibold px-2 py-1 rounded-full border cursor-pointer ${opt.color} appearance-none pr-6 bg-no-repeat`}
            style={{
                backgroundImage:
                    'url("data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'10\' height=\'10\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'currentColor\' stroke-width=\'3\'><polyline points=\'6 9 12 15 18 9\'/></svg>")',
                backgroundPosition: 'right 0.4rem center',
                backgroundSize: '0.65rem',
            }}
        >
            {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                    {o.label}
                </option>
            ))}
        </select>
    );
}

function SourceBadge({ source }: { source: string | null }) {
    const s = source || 'unknown';
    const styles: Record<string, string> = {
        'reefa.pl': 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border-cyan-500/30',
        'home.reefa.pl': 'bg-pink-500/15 text-pink-700 dark:text-pink-300 border-pink-500/30',
        manual: 'bg-gray-500/15 text-gray-700 dark:text-gray-300 border-gray-500/30',
    };
    return (
        <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${styles[s] || styles.manual}`}>
            <Globe size={10} /> {s}
        </span>
    );
}

function CalculatorSummary({ calc }: { calc: CalculatorSnapshot }) {
    const days = calc.selectedDays.length > 0
        ? calc.selectedDays.map((i) => DAY_NAMES[i] || '?').join(',')
        : '';
    const priceStr = calc.monthlyLow === calc.monthlyHigh
        ? `${calc.monthlyLow.toLocaleString('pl-PL')} zł${calc.isAtMinimum ? ' (min)' : ''}`
        : `${calc.monthlyLow.toLocaleString('pl-PL')}–${calc.monthlyHigh.toLocaleString('pl-PL')} zł`;
    return (
        <div className="text-xs space-y-0.5 text-muted">
            <div>
                <span className="font-semibold text-main">{TYPE_LABEL[calc.type]}</span> · {calc.area} m² · {calc.daysPerWeek} дн{days ? ` (${days})` : ''}
            </div>
            <div>
                {calc.weeklyHours.toFixed(1)} ч/нед × {calc.rate} zł/h = <span className="font-bold text-emerald-600 dark:text-emerald-400">{priceStr}/мес</span>
            </div>
        </div>
    );
}

export default function LeadsPanel({ searchTerm = '' }: { searchTerm?: string }) {
    const { adminUser } = useAuth();
    const [leads, setLeads] = useState<Lead[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [sourceFilter, setSourceFilter] = useState<string>('all');
    const [statusFilter, setStatusFilter] = useState<'all' | LeadStatus | 'open'>('open');
    const [expanded, setExpanded] = useState<Record<string, boolean>>({});
    const [updating, setUpdating] = useState<Record<string, boolean>>({});
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

    const isSuperAdmin = adminUser?.role === 'super_admin';

    const loadLeads = async (showSpinner = true) => {
        if (showSpinner) setLoading(true);
        else setRefreshing(true);
        try {
            const { data, error } = await supabase
                .from('crm_leads')
                .select('id, title, status, value, contact_info, description, source, metadata, created_at, updated_at')
                .order('created_at', { ascending: false })
                .limit(200);
            if (error) throw error;
            setLeads((data as Lead[]) || []);
        } catch (e) {
            console.error('Error loading leads:', e);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useEffect(() => {
        loadLeads();
        // Auto-refresh every 30s while panel is mounted (cheap query, indexed by created_at)
        const t = setInterval(() => loadLeads(false), 30000);
        return () => clearInterval(t);
    }, []);

    const sources = useMemo(() => {
        const set = new Set<string>();
        leads.forEach((l) => l.source && set.add(l.source));
        return Array.from(set).sort();
    }, [leads]);

    const filtered = useMemo(() => {
        const q = searchTerm.trim().toLowerCase();
        return leads.filter((l) => {
            if (sourceFilter !== 'all' && (l.source || 'unknown') !== sourceFilter) return false;
            if (statusFilter === 'open' && (l.status === 'won' || l.status === 'lost')) return false;
            if (statusFilter !== 'all' && statusFilter !== 'open' && l.status !== statusFilter) return false;
            if (!q) return true;
            const hay = [
                l.title,
                l.description ?? '',
                l.contact_info?.phone ?? '',
                l.contact_info?.email ?? '',
                l.contact_info?.name ?? '',
                l.metadata?.message ?? '',
                l.metadata?.page_url ?? '',
            ]
                .join(' ')
                .toLowerCase();
            return hay.includes(q);
        });
    }, [leads, sourceFilter, statusFilter, searchTerm]);

    const stats = useMemo(() => {
        const total = leads.length;
        const newCount = leads.filter((l) => l.status === 'new').length;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayCount = leads.filter((l) => new Date(l.created_at) >= today).length;
        const wonValue = leads.filter((l) => l.status === 'won').reduce((s, l) => s + (l.value || 0), 0);
        return { total, newCount, todayCount, wonValue };
    }, [leads]);

    const updateStatus = async (lead: Lead, status: LeadStatus) => {
        setUpdating((u) => ({ ...u, [lead.id]: true }));
        // optimistic
        setLeads((prev) => prev.map((l) => (l.id === lead.id ? { ...l, status } : l)));
        try {
            const { error } = await supabase.from('crm_leads').update({ status }).eq('id', lead.id);
            if (error) throw error;
        } catch (e) {
            console.error('Error updating status:', e);
            // revert
            setLeads((prev) => prev.map((l) => (l.id === lead.id ? { ...l, status: lead.status } : l)));
            alert('Не удалось обновить статус');
        } finally {
            setUpdating((u) => ({ ...u, [lead.id]: false }));
        }
    };

    const deleteLead = async (id: string) => {
        const prev = leads;
        setLeads((ls) => ls.filter((l) => l.id !== id));
        setConfirmDeleteId(null);
        try {
            const { error } = await supabase.from('crm_leads').delete().eq('id', id);
            if (error) throw error;
        } catch (e) {
            console.error('Error deleting lead:', e);
            setLeads(prev);
            alert('Не удалось удалить лид');
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20">
                <RefreshCw className="animate-spin text-muted" size={28} />
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Header / Stats */}
            <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <h2 className="text-xl font-bold text-main">Лиды</h2>
                        <p className="text-sm text-muted">Заявки с reefa.pl и других источников</p>
                    </div>
                    <div className="flex flex-wrap gap-3 text-sm">
                        <Stat label="Всего" value={stats.total} />
                        <Stat label="Новых" value={stats.newCount} highlight={stats.newCount > 0} />
                        <Stat label="Сегодня" value={stats.todayCount} />
                        <Stat label="Выиграно" value={`${stats.wonValue.toLocaleString('pl-PL')} zł`} />
                    </div>
                </div>

                {/* Filters */}
                <div className="mt-4 flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs text-muted font-semibold uppercase tracking-wider mr-1">Источник:</span>
                        <FilterPill active={sourceFilter === 'all'} onClick={() => setSourceFilter('all')}>
                            Все
                        </FilterPill>
                        {sources.map((s) => (
                            <FilterPill key={s} active={sourceFilter === s} onClick={() => setSourceFilter(s)}>
                                {s}
                            </FilterPill>
                        ))}
                    </div>
                    <div className="hidden md:block w-px h-6 bg-border" />
                    <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs text-muted font-semibold uppercase tracking-wider mr-1">Статус:</span>
                        <FilterPill active={statusFilter === 'open'} onClick={() => setStatusFilter('open')}>
                            Открытые
                        </FilterPill>
                        <FilterPill active={statusFilter === 'all'} onClick={() => setStatusFilter('all')}>
                            Все
                        </FilterPill>
                        {STATUS_OPTIONS.map((o) => (
                            <FilterPill key={o.value} active={statusFilter === o.value} onClick={() => setStatusFilter(o.value)}>
                                {o.label}
                            </FilterPill>
                        ))}
                    </div>
                    <div className="ml-auto">
                        <button
                            onClick={() => loadLeads(false)}
                            disabled={refreshing}
                            className="flex items-center gap-1.5 text-xs text-muted hover:text-main transition-colors px-2 py-1 rounded-md hover:bg-subtle"
                            title="Обновить"
                        >
                            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
                            Обновить
                        </button>
                    </div>
                </div>
            </div>

            {/* List */}
            {filtered.length === 0 ? (
                <div className="bg-card border border-border rounded-xl p-12 text-center text-muted">
                    <Search size={32} className="mx-auto mb-3 opacity-40" />
                    <p>Лидов не найдено</p>
                    <p className="text-xs mt-1">Попробуйте изменить фильтры или подождите новых заявок.</p>
                </div>
            ) : (
                <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
                    {filtered.map((lead, idx) => {
                        const isOpen = expanded[lead.id] === true;
                        const calc = lead.metadata?.calculator;
                        const variant = lead.metadata?.variant;
                        const message = lead.metadata?.message || lead.metadata?.note || '';
                        return (
                            <div
                                key={lead.id}
                                className={`border-border transition-colors ${idx > 0 ? 'border-t' : ''} ${lead.status === 'new' ? 'bg-blue-500/[0.03]' : ''}`}
                            >
                                <div
                                    className="p-4 hover:bg-subtle/40 cursor-pointer"
                                    onClick={() => setExpanded((m) => ({ ...m, [lead.id]: !isOpen }))}
                                >
                                    <div className="flex items-start gap-3">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex flex-wrap items-center gap-2 mb-1">
                                                <SourceBadge source={lead.source} />
                                                {variant === 'callback' && (
                                                    <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase px-2 py-0.5 rounded border bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30">
                                                        Перезвонить
                                                    </span>
                                                )}
                                                <span className="text-xs text-muted" title={formatDateTime(lead.created_at)}>
                                                    {formatRelative(lead.created_at)}
                                                </span>
                                            </div>
                                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                                                {lead.contact_info?.phone && (
                                                    <a
                                                        href={`tel:${lead.contact_info.phone}`}
                                                        onClick={(e) => e.stopPropagation()}
                                                        className="inline-flex items-center gap-1.5 font-semibold text-main hover:text-primary"
                                                    >
                                                        <Phone size={14} /> {lead.contact_info.phone}
                                                    </a>
                                                )}
                                                {lead.contact_info?.email && (
                                                    <a
                                                        href={`mailto:${lead.contact_info.email}`}
                                                        onClick={(e) => e.stopPropagation()}
                                                        className="inline-flex items-center gap-1.5 text-muted hover:text-primary truncate max-w-[260px]"
                                                    >
                                                        <Mail size={14} /> {lead.contact_info.email}
                                                    </a>
                                                )}
                                                {lead.contact_info?.name && (
                                                    <span className="text-muted">{lead.contact_info.name}</span>
                                                )}
                                            </div>
                                            {calc && (
                                                <div className="mt-2">
                                                    <CalculatorSummary calc={calc} />
                                                </div>
                                            )}
                                            {message && !calc && (
                                                <p className="mt-1.5 text-xs text-muted line-clamp-2">
                                                    <MessageSquare size={11} className="inline mr-1 opacity-60" />
                                                    {message}
                                                </p>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0">
                                            <StatusBadge
                                                status={lead.status}
                                                onChange={(s) => updateStatus(lead, s)}
                                                disabled={updating[lead.id]}
                                            />
                                            {isOpen ? (
                                                <ChevronUp size={16} className="text-muted" />
                                            ) : (
                                                <ChevronDown size={16} className="text-muted" />
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Expanded details */}
                                {isOpen && (
                                    <div className="px-4 pb-4 -mt-1 text-sm bg-subtle/20 border-t border-border/50">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3">
                                            <div>
                                                <h4 className="text-xs font-bold uppercase tracking-wider text-muted mb-1.5">
                                                    Контакт
                                                </h4>
                                                <dl className="text-xs space-y-1">
                                                    <DetailRow label="Имя" value={lead.contact_info?.name || '—'} />
                                                    <DetailRow label="Телефон" value={lead.contact_info?.phone || '—'} mono />
                                                    <DetailRow label="Email" value={lead.contact_info?.email || '—'} mono />
                                                    {lead.metadata?.address && <DetailRow label="Адрес" value={lead.metadata.address} />}
                                                </dl>
                                            </div>
                                            <div>
                                                <h4 className="text-xs font-bold uppercase tracking-wider text-muted mb-1.5">
                                                    Контекст
                                                </h4>
                                                <dl className="text-xs space-y-1">
                                                    <DetailRow label="Создан" value={formatDateTime(lead.created_at)} />
                                                    <DetailRow label="Источник" value={lead.source || '—'} />
                                                    {lead.metadata?.form_source && (
                                                        <DetailRow label="Форма" value={lead.metadata.form_source} mono />
                                                    )}
                                                    {lead.metadata?.locale && (
                                                        <DetailRow label="Язык" value={lead.metadata.locale.toUpperCase()} />
                                                    )}
                                                    {lead.metadata?.page_url && (
                                                        <DetailRow
                                                            label="Страница"
                                                            value={
                                                                <a
                                                                    href={lead.metadata.page_url}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    className="text-primary hover:underline inline-flex items-center gap-1 break-all"
                                                                >
                                                                    {lead.metadata.page_url}
                                                                    <ExternalLink size={10} />
                                                                </a>
                                                            }
                                                        />
                                                    )}
                                                    {lead.metadata?.referrer && (
                                                        <DetailRow label="Откуда" value={lead.metadata.referrer} />
                                                    )}
                                                    {lead.metadata?.ip && <DetailRow label="IP" value={lead.metadata.ip} mono />}
                                                </dl>
                                            </div>
                                        </div>

                                        {message && (
                                            <div className="mt-4">
                                                <h4 className="text-xs font-bold uppercase tracking-wider text-muted mb-1.5 flex items-center gap-1.5">
                                                    <MessageSquare size={12} /> Сообщение
                                                </h4>
                                                <p className="text-sm text-main whitespace-pre-wrap bg-card rounded-lg p-3 border border-border">
                                                    {message}
                                                </p>
                                            </div>
                                        )}

                                        {calc && (
                                            <div className="mt-4">
                                                <h4 className="text-xs font-bold uppercase tracking-wider text-muted mb-1.5 flex items-center gap-1.5">
                                                    <CalcIcon size={12} /> Калькулятор
                                                </h4>
                                                <div className="bg-card rounded-lg p-3 border border-border">
                                                    <dl className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-1.5 text-xs">
                                                        <DetailRow label="Тип" value={TYPE_LABEL[calc.type]} />
                                                        <DetailRow label="Площадь" value={`${calc.area} m²`} />
                                                        <DetailRow label="Дни/нед" value={String(calc.daysPerWeek)} />
                                                        <DetailRow
                                                            label="Дни"
                                                            value={
                                                                calc.selectedDays.length > 0
                                                                    ? calc.selectedDays.map((i) => DAY_NAMES[i] || '?').join(', ')
                                                                    : '—'
                                                            }
                                                        />
                                                        <DetailRow label="Часов/нед" value={calc.weeklyHours.toFixed(1)} />
                                                        <DetailRow label="Ставка" value={`${calc.rate} zł/h`} />
                                                        <DetailRow
                                                            label="Цена"
                                                            value={
                                                                <span className="font-bold text-emerald-600 dark:text-emerald-400">
                                                                    {calc.monthlyLow === calc.monthlyHigh
                                                                        ? `${calc.monthlyLow.toLocaleString('pl-PL')} zł${calc.isAtMinimum ? ' (min)' : ''}`
                                                                        : `${calc.monthlyLow.toLocaleString('pl-PL')}–${calc.monthlyHigh.toLocaleString('pl-PL')} zł`}
                                                                </span>
                                                            }
                                                        />
                                                        <DetailRow
                                                            label="Среднее"
                                                            value={`${calc.monthly.toLocaleString('pl-PL')} zł`}
                                                        />
                                                    </dl>
                                                </div>
                                            </div>
                                        )}

                                        {lead.metadata?.user_agent && (
                                            <p className="mt-3 text-[10px] text-muted/70 font-mono break-all">
                                                UA: {lead.metadata.user_agent}
                                            </p>
                                        )}

                                        {/* Actions */}
                                        <div className="mt-4 flex justify-end gap-2">
                                            {isSuperAdmin && (
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setConfirmDeleteId(lead.id);
                                                    }}
                                                    className="text-xs flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rose-500/30 text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 transition-colors"
                                                >
                                                    <Trash2 size={12} /> Удалить
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Delete confirm */}
            {confirmDeleteId && (
                <div
                    className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
                    onClick={() => setConfirmDeleteId(null)}
                >
                    <div
                        className="bg-card rounded-xl border border-border p-6 max-w-sm w-full shadow-xl"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex justify-between items-start mb-3">
                            <h3 className="text-lg font-bold text-main">Удалить лид?</h3>
                            <button onClick={() => setConfirmDeleteId(null)} className="text-muted hover:text-main">
                                <X size={18} />
                            </button>
                        </div>
                        <p className="text-sm text-muted mb-4">Действие нельзя отменить.</p>
                        <div className="flex justify-end gap-2">
                            <button
                                onClick={() => setConfirmDeleteId(null)}
                                className="px-4 py-2 rounded-lg border border-border text-sm hover:bg-subtle"
                            >
                                Отмена
                            </button>
                            <button
                                onClick={() => deleteLead(confirmDeleteId)}
                                className="px-4 py-2 rounded-lg bg-rose-600 text-white text-sm hover:bg-rose-700 font-semibold"
                            >
                                Удалить
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function Stat({ label, value, highlight }: { label: string; value: string | number; highlight?: boolean }) {
    return (
        <div className={`px-3 py-1.5 rounded-lg border ${highlight ? 'border-blue-500/40 bg-blue-500/10' : 'border-border bg-subtle/40'}`}>
            <div className="text-[10px] text-muted uppercase tracking-wider font-semibold">{label}</div>
            <div className={`text-base font-bold ${highlight ? 'text-blue-600 dark:text-blue-300' : 'text-main'}`}>{value}</div>
        </div>
    );
}

function FilterPill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
    return (
        <button
            onClick={onClick}
            className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                active
                    ? 'bg-primary text-white border-primary'
                    : 'bg-subtle/40 text-muted border-border hover:text-main hover:border-border'
            }`}
        >
            {children}
        </button>
    );
}

function DetailRow({
    label,
    value,
    mono,
}: {
    label: string;
    value: React.ReactNode;
    mono?: boolean;
}) {
    return (
        <div className="flex items-baseline gap-2">
            <dt className="text-muted shrink-0">{label}:</dt>
            <dd className={`text-main ${mono ? 'font-mono text-[11px]' : ''}`}>{value}</dd>
        </div>
    );
}

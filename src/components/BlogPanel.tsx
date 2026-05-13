import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import {
    Edit2, Eye, Trash2, RefreshCw, X, Save, ExternalLink,
    Search, FileText, Filter, AlertCircle, CheckCircle2, Clock,
    Sparkles, Wand2, ChevronDown, ChevronUp, Settings, Zap,
    Image as ImageIcon, Hash, Type, Calendar, ImagePlus, BarChart3
} from 'lucide-react';
import BlogStatsTab from './BlogStatsTab';

// ─────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────

type BlogStatus = 'draft' | 'published' | 'archived';
type TopicStatus = 'pending' | 'generating' | 'generated' | 'published' | 'skipped' | 'failed';

interface BlogArticle {
    id: string;
    slug: string;
    title: string;
    excerpt: string | null;
    cover_image_url: string | null;
    body_markdown: string;
    category: string | null;
    tags: string[] | null;
    reading_time_minutes: number | null;
    status: BlogStatus;
    published_at: string | null;
    /** When set on a draft, it will be auto-promoted to published once this
     *  timestamp passes. Cleared when promotion happens or admin cancels. */
    scheduled_publish_at: string | null;
    author_name: string | null;
    meta_title: string | null;
    meta_description: string | null;
    primary_keyword: string | null;
    pillar_no: number | null;
    spoke_no: string | null;
    word_count: number | null;
    regeneration_count: number;
    last_regeneration_feedback: string | null;
    created_at: string;
    updated_at: string;
}

interface TopicRow {
    id: string;
    pillar_no: number | null;
    spoke_no: string | null;
    proposed_title: string;
    primary_keyword: string;
    content_type: string | null;
    status: TopicStatus;
    priority_order: number;
    word_count_target: number | null;
    estimated_volume: number | null;
    seo_grade: string | null;
    source: string | null;
    generated_article_id: string | null;
    error_message: string | null;
    created_at: string;
}

interface BlogSettings {
    id: number;
    auto_publish: boolean;
    auto_topup_enabled: boolean;
    auto_topup_threshold: number;
    notify_telegram: boolean;
    paused_until: string | null;
}

interface BlogStats {
    total_articles: number;
    drafts: number;
    published: number;
    archived: number;
    pending_topics: number;
    generated_today: number;
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
// AUTOPUBLISH_SECRET is intentionally NOT bundled in the React app — instead
// the panel uses the user's authenticated Supabase session to invoke functions
// via the supabase.functions.invoke() helper which forwards the user's JWT.
// However our edge functions check AUTOPUBLISH_SECRET, not user JWT.
// SOLUTION: a thin RPC/proxy isn't worth it; we'll have the user paste the
// secret once into a localStorage entry. Simpler than building a settings UI
// for one secret. The secret value is the same one set in Supabase secrets.
function getAutopublishSecret(): string | null {
    try {
        return localStorage.getItem('reefa.autopublishSecret');
    } catch {
        return null;
    }
}

function callEdgeFunction(name: string, body: Record<string, unknown> = {}): Promise<Response> {
    const secret = getAutopublishSecret();
    if (!secret) {
        throw new Error('Brak AUTOPUBLISH_SECRET. Wprowadź klucz w Ustawieniach (kliknij ikonę koła zębatego).');
    }
    return fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${secret}`,
        },
        body: JSON.stringify(body),
    });
}

// ─────────────────────────────────────────────
// MAIN PANEL
// ─────────────────────────────────────────────

export default function BlogPanel({ searchTerm = '' }: { searchTerm?: string }) {
    const { adminUser } = useAuth();
    const isSuperAdmin = adminUser?.role === 'super_admin';

    const [articles, setArticles] = useState<BlogArticle[]>([]);
    const [topics, setTopics] = useState<TopicRow[]>([]);
    const [settings, setSettings] = useState<BlogSettings | null>(null);
    const [stats, setStats] = useState<BlogStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [statusFilter, setStatusFilter] = useState<'all' | BlogStatus>('all');
    const [activeTab, setActiveTab] = useState<'articles' | 'queue' | 'stats'>('articles');
    const [editingArticle, setEditingArticle] = useState<BlogArticle | null>(null);
    const [showSettings, setShowSettings] = useState(false);
    const [busy, setBusy] = useState<Record<string, boolean>>({});

    const loadAll = useCallback(async (showSpinner = true) => {
        if (showSpinner) setLoading(true);
        else setRefreshing(true);
        try {
            const [articlesRes, topicsRes, settingsRes, statsRes] = await Promise.all([
                supabase
                    .from('blog_b2b_articles')
                    .select('*')
                    .order('created_at', { ascending: false })
                    .limit(200),
                supabase
                    .from('blog_b2b_topic_queue')
                    .select('id, pillar_no, spoke_no, proposed_title, primary_keyword, content_type, status, priority_order, word_count_target, estimated_volume, seo_grade, source, generated_article_id, error_message, created_at')
                    .order('priority_order', { ascending: true })
                    .limit(200),
                supabase.from('blog_b2b_settings').select('*').eq('id', 1).maybeSingle(),
                supabase.rpc('blog_b2b_stats'),
            ]);
            if (articlesRes.data) setArticles(articlesRes.data as BlogArticle[]);
            if (topicsRes.data) setTopics(topicsRes.data as TopicRow[]);
            if (settingsRes.data) setSettings(settingsRes.data as BlogSettings);
            if (statsRes.data && statsRes.data.length > 0) setStats(statsRes.data[0] as BlogStats);
        } catch (e) {
            console.error('[BlogPanel] load failed:', e);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => {
        loadAll();
    }, [loadAll]);

    const filteredArticles = useMemo(() => {
        const q = searchTerm.trim().toLowerCase();
        return articles.filter((a) => {
            if (statusFilter !== 'all' && a.status !== statusFilter) return false;
            if (!q) return true;
            return (
                a.title.toLowerCase().includes(q) ||
                a.slug.toLowerCase().includes(q) ||
                a.primary_keyword?.toLowerCase().includes(q) ||
                a.category?.toLowerCase().includes(q)
            );
        });
    }, [articles, searchTerm, statusFilter]);

    const filteredTopics = useMemo(() => {
        const q = searchTerm.trim().toLowerCase();
        if (!q) return topics;
        return topics.filter(
            (t) =>
                t.proposed_title.toLowerCase().includes(q) ||
                t.primary_keyword.toLowerCase().includes(q)
        );
    }, [topics, searchTerm]);

    // ─── Actions ───

    /**
     * Hits reefa.pl /api/blog-revalidate to bust the ISR cache for /blog list,
     * /blog/[slug], and /sitemap.xml. Without this, status changes from CMS
     * take up to 10 minutes to appear on the public site (revalidate=600).
     * Fire-and-forget — failures are logged but don't block the UI flow.
     */
    async function bustBlogCache(slug?: string) {
        const secret = getAutopublishSecret();
        if (!secret) return; // CMS settings not yet configured
        try {
            await fetch('https://reefa.pl/api/blog-revalidate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${secret}`,
                },
                body: JSON.stringify({ slug }),
            });
        } catch (e) {
            console.warn('[BlogPanel] revalidate failed:', e);
        }
    }

    async function changeArticleStatus(article: BlogArticle, status: BlogStatus) {
        const prev = articles;
        setArticles((arr) => arr.map((a) => (a.id === article.id ? { ...a, status } : a)));
        const update: Record<string, unknown> = { status };
        if (status === 'published' && !article.published_at) {
            update.published_at = new Date().toISOString();
        }
        const { error } = await supabase.from('blog_b2b_articles').update(update).eq('id', article.id);
        if (error) {
            alert('Błąd: ' + error.message);
            setArticles(prev);
            return;
        }
        // Immediately purge ISR cache so the change shows up on reefa.pl now
        bustBlogCache(article.slug);
    }

    async function cancelScheduledPublish(article: BlogArticle) {
        if (!confirm(`Anulować zaplanowaną automatyczną publikację? Artykuł pozostanie jako draft.`)) return;
        const prev = articles;
        setArticles((arr) => arr.map((a) => (a.id === article.id ? { ...a, scheduled_publish_at: null } : a)));
        const { error } = await supabase
            .from('blog_b2b_articles')
            .update({ scheduled_publish_at: null })
            .eq('id', article.id);
        if (error) {
            alert('Błąd: ' + error.message);
            setArticles(prev);
        }
    }

    async function deleteArticle(article: BlogArticle) {
        if (!confirm(`Usunąć artykuł "${article.title}"? Tej akcji nie można cofnąć.`)) return;
        const { error } = await supabase.from('blog_b2b_articles').delete().eq('id', article.id);
        if (error) {
            alert('Błąd: ' + error.message);
            return;
        }
        setArticles((arr) => arr.filter((a) => a.id !== article.id));
        bustBlogCache(article.slug);
    }

    async function regenerateArticle(article: BlogArticle, feedback: string) {
        setBusy((b) => ({ ...b, [article.id]: true }));
        try {
            const res = await callEdgeFunction('blog-regenerate', {
                article_id: article.id,
                feedback,
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || data.details || 'Regeneracja nie powiodła się');
            await loadAll(false);
            // Bust ISR if this article is published — content has changed
            if (article.status === 'published') bustBlogCache(article.slug);
            alert(`Wygenerowano nową wersję (${data.new_word_count} słów, regeneracja #${data.regeneration_count})`);
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            alert('Błąd regeneracji: ' + msg);
        } finally {
            setBusy((b) => ({ ...b, [article.id]: false }));
        }
    }

    async function pickNewCover(article: BlogArticle) {
        const customKw = prompt(
            'Słowa kluczowe (po angielsku) do wyszukania w Pixabay. Zostaw puste żeby użyć kategoryjnych fallbacków:',
            ''
        );
        if (customKw === null) return; // cancelled
        const key = `cover_${article.id}`;
        setBusy((b) => ({ ...b, [key]: true }));
        try {
            const res = await callEdgeFunction('blog-pick-cover', {
                article_id: article.id,
                keywords: customKw.trim() || undefined,
            });
            const data = await res.json();
            if (!data.ok) {
                const reasoning = data.reasoning || data.attempts?.[0]?.reasoning || 'Nie udało się znaleźć dopasowania';
                alert(`Nie znaleziono pasującej okładki.\n\nPowód:\n${reasoning.slice(0, 400)}`);
                return;
            }
            await loadAll(false);
            // Bust ISR if published — cover image is part of the rendered list/article
            if (article.status === 'published') bustBlogCache(article.slug);
            alert(`Okładka zaktualizowana!\n\nQuery: "${data.winning_query}"\n\nPowód wyboru:\n${(data.reasoning || '').slice(0, 300)}`);
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            alert('Błąd: ' + msg);
        } finally {
            setBusy((b) => ({ ...b, [key]: false }));
        }
    }

    async function triggerAutopublishNow() {
        if (!confirm('Wygenerować od razu kolejny artykuł z queue?')) return;
        setBusy((b) => ({ ...b, autopublish: true }));
        try {
            const res = await callEdgeFunction('blog-autopublish', { force: true, trigger: 'manual' });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || data.details || 'Błąd');
            await loadAll(false);
            alert(`Wygenerowano: "${data.title || 'OK'}" (${data.word_count || '?'} słów)`);
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            alert('Błąd: ' + msg);
        } finally {
            setBusy((b) => ({ ...b, autopublish: false }));
        }
    }

    async function generateMoreTopics() {
        if (!confirm('Wygenerować 25 nowych tematów do queue?')) return;
        setBusy((b) => ({ ...b, topgen: true }));
        try {
            const res = await callEdgeFunction('blog-topic-generator', { count: 25 });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || data.details || 'Błąd');
            await loadAll(false);
            alert(`Dodano ${data.inserted || 0} tematów (pominięto ${data.skipped || 0} duplikatów)`);
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            alert('Błąd: ' + msg);
        } finally {
            setBusy((b) => ({ ...b, topgen: false }));
        }
    }

    async function updateSettings(patch: Partial<BlogSettings>) {
        if (!settings) return;
        const newSettings = { ...settings, ...patch };
        setSettings(newSettings);
        const { error } = await supabase
            .from('blog_b2b_settings')
            .update({ ...patch, updated_by: adminUser?.id })
            .eq('id', 1);
        if (error) {
            alert('Błąd zapisywania ustawień: ' + error.message);
            setSettings(settings);
        }
    }

    async function changeTopicStatus(topic: TopicRow, status: TopicStatus) {
        const { error } = await supabase
            .from('blog_b2b_topic_queue')
            .update({ status, error_message: null, attempt_count: 0 })
            .eq('id', topic.id);
        if (error) alert('Błąd: ' + error.message);
        else loadAll(false);
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20">
                <RefreshCw className="animate-spin text-muted" size={28} />
            </div>
        );
    }

    if (!isSuperAdmin) {
        return (
            <div className="bg-card border border-border rounded-xl p-12 text-center">
                <AlertCircle size={32} className="mx-auto mb-3 text-muted" />
                <p className="text-muted">Tylko super admin może zarządzać blogiem.</p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Header / Stats / Settings toggle */}
            <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <h2 className="text-xl font-bold text-main">CMS</h2>
                        <p className="text-sm text-muted">AI-generowane artykuły dla reefa.pl</p>
                    </div>
                    <div className="flex flex-wrap gap-3 text-sm items-center">
                        {stats && (
                            <>
                                <Stat label="Wszystkich" value={stats.total_articles} />
                                <Stat label="Drafty" value={stats.drafts} highlight={stats.drafts > 0} />
                                <Stat label="Opublikowane" value={stats.published} />
                                <Stat label="Pending" value={stats.pending_topics} />
                                <Stat label="Dziś" value={stats.generated_today} />
                            </>
                        )}
                        <button
                            onClick={() => setShowSettings(!showSettings)}
                            className="p-2 rounded-lg border border-border hover:bg-subtle text-muted hover:text-main transition-colors"
                            title="Ustawienia"
                        >
                            <Settings size={16} />
                        </button>
                    </div>
                </div>

                {/* Settings drawer */}
                {showSettings && settings && (
                    <SettingsDrawer
                        settings={settings}
                        onChange={updateSettings}
                        onClose={() => setShowSettings(false)}
                    />
                )}

                {/* Action buttons */}
                <div className="mt-4 flex flex-wrap gap-2">
                    <button
                        onClick={triggerAutopublishNow}
                        disabled={busy.autopublish}
                        className="btn-primary text-xs flex items-center gap-1.5 disabled:opacity-50"
                    >
                        <Zap size={14} />
                        {busy.autopublish ? 'Generuję…' : 'Wygeneruj teraz'}
                    </button>
                    <button
                        onClick={generateMoreTopics}
                        disabled={busy.topgen}
                        className="btn-secondary text-xs flex items-center gap-1.5 disabled:opacity-50"
                    >
                        <Sparkles size={14} />
                        {busy.topgen ? 'Generuję tematy…' : '+25 tematów'}
                    </button>
                    <button
                        onClick={() => loadAll(false)}
                        disabled={refreshing}
                        className="text-xs flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border hover:bg-subtle text-muted hover:text-main transition-colors"
                    >
                        <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
                        Odśwież
                    </button>
                </div>

                {/* Tabs */}
                <div className="mt-4 flex gap-2 border-b border-border">
                    <TabButton active={activeTab === 'articles'} onClick={() => setActiveTab('articles')}>
                        <FileText size={14} /> Artykuły ({articles.length})
                    </TabButton>
                    <TabButton active={activeTab === 'queue'} onClick={() => setActiveTab('queue')}>
                        <Filter size={14} /> Queue ({topics.length})
                    </TabButton>
                    <TabButton active={activeTab === 'stats'} onClick={() => setActiveTab('stats')}>
                        <BarChart3 size={14} /> Statystyki
                    </TabButton>
                </div>

                {/* Status filter (articles tab only) */}
                {activeTab === 'articles' && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                        {(['all', 'draft', 'published', 'archived'] as const).map((s) => (
                            <FilterPill
                                key={s}
                                active={statusFilter === s}
                                onClick={() => setStatusFilter(s)}
                            >
                                {s === 'all' ? 'Wszystkie' : s === 'draft' ? 'Drafty' : s === 'published' ? 'Opublikowane' : 'Archiwum'}
                            </FilterPill>
                        ))}
                    </div>
                )}
            </div>

            {/* CONTENT */}
            {activeTab === 'articles' && (
                <ArticleList
                    articles={filteredArticles}
                    onEdit={setEditingArticle}
                    onChangeStatus={changeArticleStatus}
                    onDelete={deleteArticle}
                    onRegenerate={(art) => {
                        const feedback = prompt('Feedback do regeneracji (opcjonalnie):', '') ?? '';
                        regenerateArticle(art, feedback);
                    }}
                    onPickCover={pickNewCover}
                    onCancelScheduled={cancelScheduledPublish}
                    busy={busy}
                />
            )}
            {activeTab === 'queue' && (
                <TopicQueue topics={filteredTopics} onStatusChange={changeTopicStatus} />
            )}
            {activeTab === 'stats' && <BlogStatsTab />}

            {/* Article editor modal */}
            {editingArticle && (
                <ArticleEditor
                    article={editingArticle}
                    onClose={() => setEditingArticle(null)}
                    onSaved={(updated) => {
                        setArticles((arr) => arr.map((a) => (a.id === updated.id ? updated : a)));
                        setEditingArticle(updated);
                    }}
                />
            )}
        </div>
    );
}

// ─────────────────────────────────────────────
// SUB-COMPONENTS
// ─────────────────────────────────────────────

function SettingsDrawer({
    settings,
    onChange,
    onClose,
}: {
    settings: BlogSettings;
    onChange: (patch: Partial<BlogSettings>) => void;
    onClose: () => void;
}) {
    const [secretInput, setSecretInput] = useState(() => {
        try {
            return localStorage.getItem('reefa.autopublishSecret') ?? '';
        } catch {
            return '';
        }
    });
    const [secretSaved, setSecretSaved] = useState(false);

    function saveSecret() {
        try {
            localStorage.setItem('reefa.autopublishSecret', secretInput.trim());
            setSecretSaved(true);
            setTimeout(() => setSecretSaved(false), 2000);
        } catch {
            alert('Nie udało się zapisać klucza w localStorage');
        }
    }

    return (
        <div className="mt-4 bg-subtle/30 border border-border rounded-lg p-4 space-y-4 relative">
            <button onClick={onClose} className="absolute top-3 right-3 text-muted hover:text-main">
                <X size={16} />
            </button>
            <div>
                <h3 className="font-bold text-main mb-3 flex items-center gap-2">
                    <Settings size={16} /> Ustawienia
                </h3>
                <div className="space-y-3">
                    <SettingRow
                        label="Auto-publikacja"
                        description="Gdy włączone, wygenerowane artykuły publikują się od razu (bez draftu). Włącz, gdy zaufasz jakości AI."
                        checked={settings.auto_publish}
                        onChange={(v) => onChange({ auto_publish: v })}
                    />
                    <SettingRow
                        label="Auto-uzupełnianie tematów"
                        description="Gdy queue ma <X tematów pending, generator automatycznie dodaje 25 nowych."
                        checked={settings.auto_topup_enabled}
                        onChange={(v) => onChange({ auto_topup_enabled: v })}
                    />
                    <div className="flex items-center gap-3 text-xs">
                        <label className="text-muted">Próg auto-uzupełniania:</label>
                        <input
                            type="number"
                            min="1"
                            max="50"
                            value={settings.auto_topup_threshold}
                            onChange={(e) => onChange({ auto_topup_threshold: parseInt(e.target.value, 10) || 7 })}
                            className="input w-20 text-sm"
                        />
                        <span className="text-muted">tematów pending</span>
                    </div>
                    <SettingRow
                        label="Powiadomienia Telegram"
                        description="Wysyłaj notyfikacje o każdej generacji do bota Telegram."
                        checked={settings.notify_telegram}
                        onChange={(v) => onChange({ notify_telegram: v })}
                    />
                </div>
            </div>

            <div className="border-t border-border pt-4">
                <h3 className="font-bold text-main mb-2 flex items-center gap-2">
                    <Hash size={16} /> AUTOPUBLISH_SECRET
                </h3>
                <p className="text-xs text-muted mb-2">
                    Klucz potrzebny do wywoływania edge functions z panelu (regeneracja, generowanie tematów). Zapisany w localStorage przeglądarki.
                </p>
                <div className="flex gap-2">
                    <input
                        type="password"
                        value={secretInput}
                        onChange={(e) => setSecretInput(e.target.value)}
                        placeholder="hex 64 znaki…"
                        className="input flex-1 text-sm font-mono"
                    />
                    <button onClick={saveSecret} className="btn-primary text-xs">
                        {secretSaved ? '✓ Zapisano' : 'Zapisz'}
                    </button>
                </div>
            </div>
        </div>
    );
}

function SettingRow({
    label,
    description,
    checked,
    onChange,
}: {
    label: string;
    description: string;
    checked: boolean;
    onChange: (v: boolean) => void;
}) {
    return (
        <label className="flex items-start gap-3 cursor-pointer group">
            <input
                type="checkbox"
                checked={checked}
                onChange={(e) => onChange(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded border-border text-blue-600 focus:ring-blue-500 cursor-pointer"
            />
            <div className="flex-1">
                <div className="text-sm font-medium text-main group-hover:text-blue-600 transition-colors">{label}</div>
                <div className="text-xs text-muted mt-0.5">{description}</div>
            </div>
        </label>
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
                active ? 'bg-primary text-white border-primary' : 'bg-subtle/40 text-muted border-border hover:text-main'
            }`}
        >
            {children}
        </button>
    );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
    return (
        <button
            onClick={onClick}
            className={`tab ${active ? 'is-active' : ''}`}
            aria-selected={active}
        >
            {children}
        </button>
    );
}

function StatusBadge({ status }: { status: BlogStatus | TopicStatus }) {
    const styles: Record<string, string> = {
        draft: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30',
        published: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
        archived: 'bg-gray-500/15 text-main border-gray-500/30',
        pending: 'bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30',
        generating: 'bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/30',
        generated: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
        skipped: 'bg-gray-500/15 text-main border-gray-500/30',
        failed: 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30',
    };
    return (
        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${styles[status] || styles.draft}`}>
            {status}
        </span>
    );
}

/**
 * Badge for scheduled drafts — shows countdown until auto-publication and a
 * cancel button. The countdown updates every 30s while the article is on
 * screen.
 */
function ScheduledBadge({
    scheduledAt,
    onCancel,
    disabled,
}: {
    scheduledAt: string;
    onCancel: () => void;
    disabled?: boolean;
}) {
    const [now, setNow] = useState(Date.now());
    useEffect(() => {
        const t = setInterval(() => setNow(Date.now()), 30_000);
        return () => clearInterval(t);
    }, []);

    const target = new Date(scheduledAt).getTime();
    const remainingMs = target - now;
    const passed = remainingMs <= 0;

    let label = '';
    if (passed) {
        label = 'publikacja wkrótce';
    } else if (remainingMs < 60_000) {
        label = '< 1 min';
    } else {
        const min = Math.round(remainingMs / 60_000);
        label = `za ${min} min`;
    }

    const localTime = new Date(scheduledAt).toLocaleTimeString('pl-PL', {
        timeZone: 'Europe/Warsaw',
        hour: '2-digit',
        minute: '2-digit',
    });

    return (
        <span
            className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30"
            title={`Auto-publikacja zaplanowana na ${localTime}`}
        >
            ⏰ {label}
            <button
                onClick={(e) => {
                    e.stopPropagation();
                    onCancel();
                }}
                disabled={disabled}
                className="ml-1 hover:text-rose-600 disabled:opacity-30 transition-colors"
                title="Anuluj zaplanowaną publikację"
                aria-label="Cancel scheduled publication"
            >
                ✕
            </button>
        </span>
    );
}

function ArticleList({
    articles,
    onEdit,
    onChangeStatus,
    onDelete,
    onRegenerate,
    onPickCover,
    onCancelScheduled,
    busy,
}: {
    articles: BlogArticle[];
    onEdit: (a: BlogArticle) => void;
    onChangeStatus: (a: BlogArticle, s: BlogStatus) => void;
    onDelete: (a: BlogArticle) => void;
    onRegenerate: (a: BlogArticle) => void;
    onPickCover: (a: BlogArticle) => void;
    onCancelScheduled: (a: BlogArticle) => void;
    busy: Record<string, boolean>;
}) {
    if (articles.length === 0) {
        return (
            <div className="bg-card border border-border rounded-xl p-12 text-center text-muted">
                <Search size={32} className="mx-auto mb-3 opacity-40" />
                <p>Brak artykułów</p>
            </div>
        );
    }
    return (
        <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
            {articles.map((a, idx) => (
                <div
                    key={a.id}
                    className={`p-4 hover:bg-subtle/40 transition-colors ${idx > 0 ? 'border-t border-border' : ''} ${a.status === 'draft' ? 'bg-amber-500/[0.03]' : ''}`}
                >
                    <div className="flex items-start gap-4">
                        {/* Cover thumbnail */}
                        {a.cover_image_url ? (
                            <img
                                src={a.cover_image_url}
                                alt={a.title}
                                className="w-20 h-14 rounded-md object-cover flex-shrink-0 border border-border"
                            />
                        ) : (
                            <div className="w-20 h-14 rounded-md bg-subtle border border-border flex items-center justify-center flex-shrink-0">
                                <ImageIcon size={20} className="text-muted/40" />
                            </div>
                        )}
                        <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2 mb-1">
                                <StatusBadge status={a.status} />
                                {a.scheduled_publish_at && a.status === 'draft' && (
                                    <ScheduledBadge scheduledAt={a.scheduled_publish_at} onCancel={() => onCancelScheduled(a)} disabled={!!busy[a.id]} />
                                )}
                                {a.category && <span className="text-[10px] text-blue-600 dark:text-blue-300 font-bold uppercase tracking-wider">{a.category}</span>}
                                {a.regeneration_count > 0 && (
                                    <span className="text-[10px] text-purple-600 dark:text-purple-300 font-semibold">↻ regen #{a.regeneration_count}</span>
                                )}
                            </div>
                            <h3 className="font-semibold text-main text-sm leading-tight mb-1 line-clamp-2">{a.title}</h3>
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                                <span className="flex items-center gap-1"><Type size={11} />{a.word_count ?? '?'} słów</span>
                                <span className="flex items-center gap-1"><Clock size={11} />{a.reading_time_minutes ?? '?'} min</span>
                                <span className="flex items-center gap-1"><Calendar size={11} />{new Date(a.created_at).toLocaleDateString('pl-PL')}</span>
                                {a.primary_keyword && <span className="font-mono text-[10px]">kw: {a.primary_keyword}</span>}
                            </div>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                            {a.status === 'published' && (
                                <a
                                    href={`https://reefa.pl/blog/${a.slug}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="p-2 rounded-md text-muted hover:text-blue-600 hover:bg-subtle"
                                    title="Otwórz publicznie"
                                >
                                    <ExternalLink size={14} />
                                </a>
                            )}
                            <button
                                onClick={() => onEdit(a)}
                                className="p-2 rounded-md text-muted hover:text-main hover:bg-subtle"
                                title="Edytuj"
                            >
                                <Edit2 size={14} />
                            </button>
                            <button
                                onClick={() => onRegenerate(a)}
                                disabled={busy[a.id]}
                                className="p-2 rounded-md text-muted hover:text-purple-600 hover:bg-subtle disabled:opacity-30"
                                title="Wygeneruj ponownie"
                            >
                                {busy[a.id] ? <RefreshCw size={14} className="animate-spin" /> : <Wand2 size={14} />}
                            </button>
                            <button
                                onClick={() => onPickCover(a)}
                                disabled={busy[`cover_${a.id}`]}
                                className="p-2 rounded-md text-muted hover:text-cyan-600 hover:bg-subtle disabled:opacity-30"
                                title="Wybierz nową okładkę (AI)"
                            >
                                {busy[`cover_${a.id}`] ? <RefreshCw size={14} className="animate-spin" /> : <ImagePlus size={14} />}
                            </button>
                            {a.status === 'draft' && (
                                <button
                                    onClick={() => onChangeStatus(a, 'published')}
                                    className="px-3 py-1.5 rounded-md bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700"
                                    title="Opublikuj"
                                >
                                    <CheckCircle2 size={14} />
                                </button>
                            )}
                            {a.status === 'published' && (
                                <button
                                    onClick={() => onChangeStatus(a, 'draft')}
                                    className="px-2 py-1.5 rounded-md text-xs text-amber-700 hover:bg-amber-500/10"
                                    title="Wycofaj do draftu"
                                >
                                    <Eye size={14} />
                                </button>
                            )}
                            <button
                                onClick={() => onDelete(a)}
                                className="p-2 rounded-md text-muted hover:text-rose-600 hover:bg-rose-500/10"
                                title="Usuń"
                            >
                                <Trash2 size={14} />
                            </button>
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
}

function TopicQueue({
    topics,
    onStatusChange,
}: {
    topics: TopicRow[];
    onStatusChange: (t: TopicRow, s: TopicStatus) => void;
}) {
    if (topics.length === 0) {
        return (
            <div className="bg-card border border-border rounded-xl p-12 text-center text-muted">
                <p>Queue jest pusta</p>
                <p className="text-xs mt-1">Kliknij "+25 tematów" aby wygenerować nowe.</p>
            </div>
        );
    }
    return (
        <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
            {topics.map((t, idx) => (
                <div
                    key={t.id}
                    className={`p-3 hover:bg-subtle/40 transition-colors ${idx > 0 ? 'border-t border-border' : ''}`}
                >
                    <div className="flex items-start gap-3">
                        <div className="text-xs font-mono text-muted bg-subtle px-2 py-0.5 rounded shrink-0 mt-0.5">
                            #{t.priority_order}
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2 mb-1">
                                <StatusBadge status={t.status} />
                                <span className="text-[10px] text-blue-600 font-bold">P{t.pillar_no}/{t.spoke_no}</span>
                                {t.content_type && <span className="text-[10px] text-purple-600 dark:text-purple-300">{t.content_type}</span>}
                                {t.seo_grade && <span className="text-[10px] text-emerald-600">SEO: {t.seo_grade}</span>}
                                {t.source === 'ai-generated' && <span className="text-[10px] text-amber-600 dark:text-amber-300">🤖 AI</span>}
                            </div>
                            <p className="text-sm text-main leading-tight">{t.proposed_title}</p>
                            <p className="text-xs text-muted mt-0.5">
                                kw: <span className="font-mono">{t.primary_keyword}</span>
                                {' · '}{t.word_count_target} słów
                                {t.estimated_volume ? ` · ~${t.estimated_volume}/mies` : ''}
                            </p>
                            {t.error_message && (
                                <p className="text-xs text-rose-600 mt-1 font-mono">⚠️ {t.error_message.slice(0, 200)}</p>
                            )}
                        </div>
                        <div className="flex gap-1 flex-shrink-0">
                            {t.status === 'failed' && (
                                <button
                                    onClick={() => onStatusChange(t, 'pending')}
                                    className="text-xs px-2 py-1 rounded border border-border hover:bg-subtle"
                                    title="Ponów"
                                >
                                    Reset
                                </button>
                            )}
                            {t.status === 'pending' && (
                                <button
                                    onClick={() => onStatusChange(t, 'skipped')}
                                    className="text-xs px-2 py-1 rounded border border-border hover:bg-subtle text-muted"
                                    title="Pomiń"
                                >
                                    Skip
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
}

function ArticleEditor({
    article,
    onClose,
    onSaved,
}: {
    article: BlogArticle;
    onClose: () => void;
    onSaved: (a: BlogArticle) => void;
}) {
    const [form, setForm] = useState({ ...article });
    const [saving, setSaving] = useState(false);
    const [showMeta, setShowMeta] = useState(false);

    async function save() {
        setSaving(true);
        try {
            const { data, error } = await supabase
                .from('blog_b2b_articles')
                .update({
                    title: form.title,
                    slug: form.slug,
                    excerpt: form.excerpt,
                    body_markdown: form.body_markdown,
                    category: form.category,
                    tags: form.tags,
                    cover_image_url: form.cover_image_url,
                    meta_title: form.meta_title,
                    meta_description: form.meta_description,
                    reading_time_minutes: form.reading_time_minutes,
                })
                .eq('id', article.id)
                .select('*')
                .single();
            if (error) throw error;
            onSaved(data as BlogArticle);
            // Bust ISR if this is a published article — content/slug/cover changed
            if (article.status === 'published') {
                const secret = (() => { try { return localStorage.getItem('reefa.autopublishSecret') } catch { return null } })()
                if (secret) {
                    fetch('https://reefa.pl/api/blog-revalidate', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` },
                        body: JSON.stringify({ slug: form.slug }),
                    }).catch(() => {});
                    // Also bust the OLD slug if user renamed it
                    if (form.slug !== article.slug) {
                        fetch('https://reefa.pl/api/blog-revalidate', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` },
                            body: JSON.stringify({ slug: article.slug }),
                        }).catch(() => {});
                    }
                }
            }
            alert('Zapisano');
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            alert('Błąd: ' + msg);
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="fixed inset-0 z-[9999] flex items-stretch md:items-center justify-center md:p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-card w-full max-w-5xl md:max-h-[90vh] flex flex-col rounded-none md:rounded-xl shadow-xl border border-border overflow-hidden" onClick={(e) => e.stopPropagation()}>
                <div className="p-4 border-b border-border bg-subtle flex items-center justify-between shrink-0">
                    <h3 className="font-bold text-main flex items-center gap-2">
                        <Edit2 size={16} /> Edycja: {article.title.slice(0, 50)}{article.title.length > 50 ? '…' : ''}
                    </h3>
                    <button onClick={onClose} className="p-1 hover:bg-card rounded text-muted hover:text-main">
                        <X size={20} />
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto p-4 lg:p-6 space-y-4">
                    <div>
                        <label className="block text-xs font-bold uppercase tracking-wider text-muted mb-1">Tytuł</label>
                        <input
                            type="text"
                            value={form.title}
                            onChange={(e) => setForm({ ...form, title: e.target.value })}
                            className="input w-full text-base font-medium"
                        />
                    </div>
                    <div className="grid md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold uppercase tracking-wider text-muted mb-1">Slug</label>
                            <input
                                type="text"
                                value={form.slug}
                                onChange={(e) => setForm({ ...form, slug: e.target.value })}
                                className="input w-full font-mono text-sm"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold uppercase tracking-wider text-muted mb-1">Kategoria</label>
                            <input
                                type="text"
                                value={form.category ?? ''}
                                onChange={(e) => setForm({ ...form, category: e.target.value })}
                                className="input w-full text-sm"
                            />
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-bold uppercase tracking-wider text-muted mb-1">Excerpt</label>
                        <textarea
                            value={form.excerpt ?? ''}
                            onChange={(e) => setForm({ ...form, excerpt: e.target.value })}
                            rows={2}
                            className="input w-full text-sm"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold uppercase tracking-wider text-muted mb-1">Cover URL</label>
                        <input
                            type="text"
                            value={form.cover_image_url ?? ''}
                            onChange={(e) => setForm({ ...form, cover_image_url: e.target.value })}
                            className="input w-full text-sm font-mono"
                        />
                        {form.cover_image_url && (
                            <img src={form.cover_image_url} alt="cover" className="mt-2 max-h-32 rounded border border-border" />
                        )}
                    </div>
                    <div>
                        <button
                            onClick={() => setShowMeta(!showMeta)}
                            className="text-xs font-semibold text-main flex items-center gap-1.5 mb-2"
                        >
                            {showMeta ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                            SEO Meta
                        </button>
                        {showMeta && (
                            <div className="space-y-3 bg-subtle/30 p-3 rounded-lg border border-border">
                                <div>
                                    <label className="block text-xs text-muted mb-1">Meta title (50-60 znaków)</label>
                                    <input
                                        type="text"
                                        value={form.meta_title ?? ''}
                                        onChange={(e) => setForm({ ...form, meta_title: e.target.value })}
                                        className="input w-full text-sm"
                                    />
                                    <span className="text-[10px] text-muted">{(form.meta_title ?? '').length} znaków</span>
                                </div>
                                <div>
                                    <label className="block text-xs text-muted mb-1">Meta description (150-160 znaków)</label>
                                    <textarea
                                        value={form.meta_description ?? ''}
                                        onChange={(e) => setForm({ ...form, meta_description: e.target.value })}
                                        rows={2}
                                        className="input w-full text-sm"
                                    />
                                    <span className="text-[10px] text-muted">{(form.meta_description ?? '').length} znaków</span>
                                </div>
                                <div>
                                    <label className="block text-xs text-muted mb-1">Tagi (przecinek)</label>
                                    <input
                                        type="text"
                                        value={(form.tags ?? []).join(', ')}
                                        onChange={(e) => setForm({ ...form, tags: e.target.value.split(',').map((t) => t.trim()).filter(Boolean) })}
                                        className="input w-full text-sm"
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                    <div>
                        <label className="block text-xs font-bold uppercase tracking-wider text-muted mb-1">Body (Markdown)</label>
                        <textarea
                            value={form.body_markdown}
                            onChange={(e) => setForm({ ...form, body_markdown: e.target.value })}
                            rows={20}
                            className="input w-full font-mono text-xs leading-relaxed"
                        />
                        <span className="text-[10px] text-muted">
                            {form.body_markdown.split(/\s+/).filter(Boolean).length} słów
                        </span>
                    </div>
                </div>
                <div className="p-4 border-t border-border bg-subtle flex justify-end gap-3 shrink-0">
                    <button onClick={onClose} className="btn-secondary text-sm">Anuluj</button>
                    <button onClick={save} disabled={saving} className="btn-primary text-sm flex items-center gap-1.5">
                        {saving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
                        {saving ? 'Zapisuję…' : 'Zapisz'}
                    </button>
                </div>
            </div>
        </div>
    );
}

import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import imageCompression from 'browser-image-compression';
import {
    BookOpen, Plus, Edit2, Trash2, X, Save, ArrowLeft, ArrowUp, ArrowDown,
    Image as ImageIcon, Upload, Lightbulb, AlertTriangle, Info, ListOrdered,
    Link2, Search, FileText, ChevronRight,
} from 'lucide-react';

/**
 * Procedury — internal SOP library.
 *
 * Displays the founder's recurring "how we do this" recipes (find a worker,
 * handle a missed shift, onboard a client, …) in a readable, structured form.
 *
 * Roles:
 *   • super_admin → full CRUD: create/edit/delete procedures, upload images.
 *   • any admin with `procedures_view` → read-only.
 *
 * Layout:
 *   • Left list of procedure cards grouped by category
 *   • Click → detail view with steps, attachments, cross-references
 *   • Edit modal (super-admin only) for the procedure being viewed
 */

type StepType = 'step' | 'note' | 'warning' | 'tip';

interface ProcedureStep {
    type: StepType;
    title?: string;
    body: string;
}

interface ProcedureAttachment {
    id: string;
    procedure_id: string;
    file_url: string;
    file_name: string | null;
    caption: string | null;
    display_order: number;
    created_at: string;
}

interface Procedure {
    id: string;
    slug: string;
    title: string;
    category: string;
    short_description: string | null;
    steps: ProcedureStep[];
    related_procedure_slugs: string[];
    display_order: number;
    created_at: string;
    updated_at: string;
}

const CATEGORIES: { key: string; label: string }[] = [
    { key: 'hr', label: 'HR / Персонал' },
    { key: 'operations', label: 'Операции' },
    { key: 'sales', label: 'Продажи / Клиенты' },
    { key: 'quality', label: 'Качество' },
    { key: 'finance', label: 'Финансы' },
    { key: 'general', label: 'Общее' },
];

const STEP_TYPE_META: Record<StepType, { label: string; icon: any; cls: string }> = {
    step: { label: 'Шаг', icon: ListOrdered, cls: 'border-blue-500/40 bg-blue-500/5 text-blue-700 dark:text-blue-300' },
    note: { label: 'Примечание', icon: Info, cls: 'border-zinc-400/40 bg-zinc-500/5 text-zinc-700 dark:text-zinc-300' },
    warning: { label: 'Внимание', icon: AlertTriangle, cls: 'border-red-500/40 bg-red-500/5 text-red-700 dark:text-red-300' },
    tip: { label: 'Совет', icon: Lightbulb, cls: 'border-amber-500/40 bg-amber-500/5 text-amber-700 dark:text-amber-300' },
};

export default function ProceduresPanel({ searchTerm = '' }: { searchTerm?: string }) {
    const { adminUser } = useAuth();
    const isSuperAdmin = adminUser?.role === 'super_admin';

    const [procedures, setProcedures] = useState<Procedure[]>([]);
    const [attachments, setAttachments] = useState<Record<string, ProcedureAttachment[]>>({});
    const [loading, setLoading] = useState(true);
    const [activeSlug, setActiveSlug] = useState<string | null>(null);
    const [showEditor, setShowEditor] = useState(false);
    const [editing, setEditing] = useState<Procedure | null>(null);

    // ── Data load ──
    const load = async () => {
        setLoading(true);
        const [procRes, attachRes] = await Promise.all([
            supabase.from('procedures').select('*').order('category').order('display_order'),
            supabase.from('procedure_attachments').select('*').order('display_order'),
        ]);
        if (procRes.data) setProcedures(procRes.data as Procedure[]);
        if (attachRes.data) {
            const grouped: Record<string, ProcedureAttachment[]> = {};
            for (const a of attachRes.data as ProcedureAttachment[]) {
                if (!grouped[a.procedure_id]) grouped[a.procedure_id] = [];
                grouped[a.procedure_id].push(a);
            }
            setAttachments(grouped);
        }
        setLoading(false);
    };

    useEffect(() => { load(); }, []);

    // ── Filtering ──
    const filtered = useMemo(() => {
        if (!searchTerm.trim()) return procedures;
        const q = searchTerm.toLowerCase();
        return procedures.filter((p) => {
            if (p.title.toLowerCase().includes(q)) return true;
            if (p.short_description?.toLowerCase().includes(q)) return true;
            if (p.steps.some((s) => (s.title?.toLowerCase().includes(q) || s.body.toLowerCase().includes(q)))) return true;
            return false;
        });
    }, [searchTerm, procedures]);

    const grouped = useMemo(() => {
        const map: Record<string, Procedure[]> = {};
        for (const p of filtered) {
            if (!map[p.category]) map[p.category] = [];
            map[p.category].push(p);
        }
        return map;
    }, [filtered]);

    const active = activeSlug ? procedures.find((p) => p.slug === activeSlug) : null;

    // ── Handlers ──
    const startCreate = () => {
        setEditing({
            id: '',
            slug: '',
            title: '',
            category: 'general',
            short_description: '',
            steps: [{ type: 'step', title: '', body: '' }],
            related_procedure_slugs: [],
            display_order: (procedures.reduce((m, p) => Math.max(m, p.display_order), 0) || 0) + 10,
            created_at: '',
            updated_at: '',
        });
        setShowEditor(true);
    };

    const startEdit = (p: Procedure) => {
        setEditing({ ...p });
        setShowEditor(true);
    };

    const handleDelete = async (p: Procedure) => {
        if (!confirm(`Удалить процедуру «${p.title}»? Это удалит и все прикреплённые файлы.`)) return;
        const { error } = await supabase.from('procedures').delete().eq('id', p.id);
        if (error) {
            alert('Ошибка удаления: ' + error.message);
            return;
        }
        if (activeSlug === p.slug) setActiveSlug(null);
        await load();
    };

    if (loading) {
        return (
            <div className="flex justify-center items-center h-64">
                <div className="w-8 h-8 border-4 border-zinc-300 dark:border-zinc-700 border-t-blue-500 rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <div className="animate-fadeIn">
            {/* Header */}
            <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
                <div>
                    <h2 className="text-2xl font-bold text-main flex items-center gap-2">
                        <BookOpen className="w-6 h-6 text-blue-500" />
                        Процедуры
                    </h2>
                    <p className="text-sm text-muted mt-1">Внутренняя библиотека SOP — как мы делаем то, что делаем</p>
                </div>
                {isSuperAdmin && (
                    <button onClick={startCreate} className="btn-primary flex items-center gap-2">
                        <Plus className="w-4 h-4" />
                        Новая процедура
                    </button>
                )}
            </div>

            {/* Two-pane layout */}
            <div className="grid lg:grid-cols-[360px_1fr] gap-6">
                {/* List pane */}
                <aside className={`${active ? 'hidden lg:block' : 'block'}`}>
                    {procedures.length === 0 ? (
                        <div className="card p-6 text-center text-muted">
                            <FileText className="w-8 h-8 mx-auto mb-2 opacity-50" />
                            <p className="text-sm">Процедур пока нет.</p>
                            {isSuperAdmin && (
                                <button onClick={startCreate} className="mt-3 text-sm text-blue-600 dark:text-blue-400 hover:underline">
                                    Создать первую
                                </button>
                            )}
                        </div>
                    ) : Object.keys(grouped).length === 0 ? (
                        <div className="card p-6 text-center text-muted">
                            <Search className="w-8 h-8 mx-auto mb-2 opacity-50" />
                            <p className="text-sm">Ничего не найдено по запросу «{searchTerm}»</p>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            {CATEGORIES.filter((c) => grouped[c.key]?.length).map((cat) => (
                                <div key={cat.key}>
                                    <div className="text-xs font-semibold uppercase tracking-wider text-muted mb-2 px-1">{cat.label}</div>
                                    <div className="space-y-2">
                                        {grouped[cat.key].map((p) => (
                                            <button
                                                key={p.id}
                                                onClick={() => setActiveSlug(p.slug)}
                                                className={`w-full text-left p-3 rounded-lg border transition ${
                                                    activeSlug === p.slug
                                                        ? 'bg-blue-500/10 border-blue-500/50 text-main'
                                                        : 'bg-card border-border hover:border-blue-500/30 text-main'
                                                }`}
                                            >
                                                <div className="flex items-start justify-between gap-2">
                                                    <div className="font-semibold text-sm">{p.title}</div>
                                                    <ChevronRight className="w-4 h-4 mt-0.5 text-muted shrink-0" />
                                                </div>
                                                {p.short_description && (
                                                    <div className="text-xs text-muted mt-1 line-clamp-2">{p.short_description}</div>
                                                )}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </aside>

                {/* Detail pane */}
                <div className={`${active ? 'block' : 'hidden lg:block'}`}>
                    {!active ? (
                        <div className="card p-12 text-center text-muted">
                            <BookOpen className="w-12 h-12 mx-auto mb-3 opacity-30" />
                            <p>Выберите процедуру слева, чтобы посмотреть подробности.</p>
                        </div>
                    ) : (
                        <ProcedureDetail
                            procedure={active}
                            attachments={attachments[active.id] || []}
                            allProcedures={procedures}
                            isSuperAdmin={isSuperAdmin}
                            onBack={() => setActiveSlug(null)}
                            onEdit={() => startEdit(active)}
                            onDelete={() => handleDelete(active)}
                            onJump={(slug) => setActiveSlug(slug)}
                        />
                    )}
                </div>
            </div>

            {/* Editor modal */}
            {showEditor && editing && isSuperAdmin && (
                <ProcedureEditor
                    initial={editing}
                    allProcedures={procedures}
                    initialAttachments={editing.id ? attachments[editing.id] || [] : []}
                    onClose={() => { setShowEditor(false); setEditing(null); }}
                    onSaved={async (slug) => {
                        setShowEditor(false);
                        setEditing(null);
                        await load();
                        setActiveSlug(slug);
                    }}
                />
            )}
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────
// Procedure detail (read view)
// ─────────────────────────────────────────────────────────────────
function ProcedureDetail({
    procedure, attachments, allProcedures, isSuperAdmin, onBack, onEdit, onDelete, onJump,
}: {
    procedure: Procedure;
    attachments: ProcedureAttachment[];
    allProcedures: Procedure[];
    isSuperAdmin: boolean;
    onBack: () => void;
    onEdit: () => void;
    onDelete: () => void;
    onJump: (slug: string) => void;
}) {
    const relatedProcs = procedure.related_procedure_slugs
        .map((slug) => allProcedures.find((p) => p.slug === slug))
        .filter(Boolean) as Procedure[];

    return (
        <article className="card p-6 lg:p-8">
            <div className="flex items-start justify-between gap-4 mb-4 flex-wrap">
                <div className="flex items-start gap-2 min-w-0">
                    <button onClick={onBack} className="lg:hidden p-2 -ml-2 text-muted hover:text-main">
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div className="min-w-0">
                        <div className="text-xs font-semibold uppercase tracking-wider text-muted mb-1">
                            {CATEGORIES.find((c) => c.key === procedure.category)?.label || procedure.category}
                        </div>
                        <h1 className="text-2xl font-bold text-main">{procedure.title}</h1>
                        {procedure.short_description && (
                            <p className="text-sm text-muted mt-2 leading-relaxed">{procedure.short_description}</p>
                        )}
                    </div>
                </div>
                {isSuperAdmin && (
                    <div className="flex gap-2 shrink-0">
                        <button onClick={onEdit} className="btn-secondary flex items-center gap-1.5 text-sm">
                            <Edit2 className="w-4 h-4" />
                            Редактировать
                        </button>
                        <button onClick={onDelete} className="p-2 text-red-500 hover:bg-red-500/10 rounded-md" title="Удалить">
                            <Trash2 className="w-4 h-4" />
                        </button>
                    </div>
                )}
            </div>

            {/* Steps */}
            <div className="space-y-4 mt-6">
                {procedure.steps.map((step, idx) => {
                    const meta = STEP_TYPE_META[step.type];
                    const Icon = meta.icon;
                    return (
                        <div key={idx} className={`border-l-4 pl-4 py-2 rounded-r-md ${meta.cls}`}>
                            <div className="flex items-center gap-2 mb-1">
                                <Icon className="w-4 h-4 shrink-0" />
                                <span className="text-xs font-semibold uppercase tracking-wider opacity-75">{meta.label}</span>
                            </div>
                            {step.title && <div className="font-semibold text-main mb-1">{step.title}</div>}
                            <div className="text-sm text-main whitespace-pre-wrap leading-relaxed">{step.body}</div>
                        </div>
                    );
                })}
            </div>

            {/* Attachments */}
            {attachments.length > 0 && (
                <div className="mt-8 pt-6 border-t border-border">
                    <div className="flex items-center gap-2 mb-4">
                        <ImageIcon className="w-4 h-4 text-muted" />
                        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted">Файлы</h3>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                        {attachments.map((a) => (
                            <a
                                key={a.id}
                                href={a.file_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                download={a.file_name || true}
                                className="group block bg-subtle rounded-lg overflow-hidden border border-border hover:border-blue-500/50 transition"
                            >
                                <div className="aspect-square bg-zinc-100 dark:bg-zinc-900 relative">
                                    {/^image\//i.test(a.file_url) || /\.(jpe?g|png|webp|gif|svg)$/i.test(a.file_url) ? (
                                        <img src={a.file_url} alt={a.caption || a.file_name || ''} className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-muted">
                                            <FileText className="w-10 h-10" />
                                        </div>
                                    )}
                                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition flex items-center justify-center opacity-0 group-hover:opacity-100">
                                        <Upload className="w-6 h-6 text-white rotate-180" />
                                    </div>
                                </div>
                                {a.caption && <div className="p-2 text-xs text-muted line-clamp-2">{a.caption}</div>}
                            </a>
                        ))}
                    </div>
                </div>
            )}

            {/* Related procedures */}
            {relatedProcs.length > 0 && (
                <div className="mt-8 pt-6 border-t border-border">
                    <div className="flex items-center gap-2 mb-3">
                        <Link2 className="w-4 h-4 text-muted" />
                        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted">Связанные процедуры</h3>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {relatedProcs.map((rp) => (
                            <button
                                key={rp.id}
                                onClick={() => onJump(rp.slug)}
                                className="px-3 py-1.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-700 dark:text-blue-300 rounded-md text-sm transition"
                            >
                                {rp.title} →
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </article>
    );
}

// ─────────────────────────────────────────────────────────────────
// Procedure editor modal (super-admin only)
// ─────────────────────────────────────────────────────────────────
function ProcedureEditor({
    initial, allProcedures, initialAttachments, onClose, onSaved,
}: {
    initial: Procedure;
    allProcedures: Procedure[];
    initialAttachments: ProcedureAttachment[];
    onClose: () => void;
    onSaved: (slug: string) => void;
}) {
    const isNew = !initial.id;
    const [title, setTitle] = useState(initial.title);
    const [slug, setSlug] = useState(initial.slug);
    const [category, setCategory] = useState(initial.category);
    const [shortDesc, setShortDesc] = useState(initial.short_description || '');
    const [steps, setSteps] = useState<ProcedureStep[]>(initial.steps.length ? initial.steps : [{ type: 'step', title: '', body: '' }]);
    const [related, setRelated] = useState<string[]>(initial.related_procedure_slugs);
    const [order, setOrder] = useState(initial.display_order);
    const [attachments, setAttachments] = useState<ProcedureAttachment[]>(initialAttachments);
    const [saving, setSaving] = useState(false);
    const [uploading, setUploading] = useState(false);

    // Auto-derive slug from title on creation only.
    useEffect(() => {
        if (!isNew) return;
        const auto = title
            .toLowerCase()
            .replace(/[а-яё]/g, (ch) => {
                const map: Record<string, string> = {
                    а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z',
                    и: 'i', й: 'i', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r',
                    с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch',
                    ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
                };
                return map[ch] || ch;
            })
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '');
        setSlug(auto);
    }, [title, isNew]);

    const addStep = (type: StepType = 'step') => {
        setSteps([...steps, { type, title: '', body: '' }]);
    };

    const updateStep = (idx: number, patch: Partial<ProcedureStep>) => {
        setSteps(steps.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
    };

    const removeStep = (idx: number) => {
        setSteps(steps.filter((_, i) => i !== idx));
    };

    const moveStep = (idx: number, dir: -1 | 1) => {
        const next = [...steps];
        const target = idx + dir;
        if (target < 0 || target >= next.length) return;
        [next[idx], next[target]] = [next[target], next[idx]];
        setSteps(next);
    };

    // ── Image upload (super-admin) ──
    const handleFileUpload = async (files: FileList) => {
        if (!files.length) return;
        // For new procedures, save first to get an id.
        let procId = initial.id;
        if (!procId) {
            alert('Сначала сохраните процедуру (нужен ID для прикрепления файлов), затем откройте её снова и добавьте файлы.');
            return;
        }
        setUploading(true);
        try {
            const newOnes: ProcedureAttachment[] = [];
            for (const file of Array.from(files)) {
                const isImg = file.type.startsWith('image/');
                let toUpload: Blob = file;
                if (isImg) {
                    toUpload = await imageCompression(file, { maxSizeMB: 0.8, maxWidthOrHeight: 1600, useWebWorker: true });
                }
                const ext = (file.name.split('.').pop() || 'bin').toLowerCase();
                const path = `${procId}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
                const { error: upErr } = await supabase.storage.from('procedures').upload(path, toUpload, {
                    contentType: file.type || 'application/octet-stream',
                });
                if (upErr) throw upErr;
                const { data: urlData } = supabase.storage.from('procedures').getPublicUrl(path);
                const { data: row, error: insErr } = await supabase
                    .from('procedure_attachments')
                    .insert({
                        procedure_id: procId,
                        file_url: urlData.publicUrl,
                        file_name: file.name,
                        display_order: attachments.length + newOnes.length,
                    })
                    .select()
                    .single();
                if (insErr) throw insErr;
                newOnes.push(row as ProcedureAttachment);
            }
            setAttachments([...attachments, ...newOnes]);
        } catch (e: any) {
            alert('Ошибка загрузки: ' + e.message);
        }
        setUploading(false);
    };

    const removeAttachment = async (a: ProcedureAttachment) => {
        if (!confirm('Удалить этот файл?')) return;
        const { error } = await supabase.from('procedure_attachments').delete().eq('id', a.id);
        if (error) {
            alert('Ошибка: ' + error.message);
            return;
        }
        // Also try to remove from storage (best-effort).
        try {
            const path = a.file_url.split('/procedures/').slice(-1)[0];
            if (path) await supabase.storage.from('procedures').remove([path]);
        } catch {}
        setAttachments(attachments.filter((x) => x.id !== a.id));
    };

    const updateCaption = async (a: ProcedureAttachment, caption: string) => {
        await supabase.from('procedure_attachments').update({ caption }).eq('id', a.id);
        setAttachments(attachments.map((x) => (x.id === a.id ? { ...x, caption } : x)));
    };

    // ── Save procedure ──
    const handleSave = async () => {
        if (!title.trim() || !slug.trim()) {
            alert('Заполните название и slug.');
            return;
        }
        // Drop steps with empty body (a common authoring slip — better to clean than to silently store).
        const cleanSteps = steps.filter((s) => s.body.trim() || s.title?.trim());
        if (!cleanSteps.length) {
            alert('Добавьте хотя бы один шаг.');
            return;
        }
        setSaving(true);
        try {
            const payload = {
                slug: slug.trim(),
                title: title.trim(),
                category,
                short_description: shortDesc.trim() || null,
                steps: cleanSteps,
                related_procedure_slugs: related,
                display_order: order,
            };
            if (isNew) {
                const { error } = await supabase.from('procedures').insert(payload);
                if (error) throw error;
            } else {
                const { error } = await supabase.from('procedures').update(payload).eq('id', initial.id);
                if (error) throw error;
            }
            onSaved(slug.trim());
        } catch (e: any) {
            alert('Ошибка сохранения: ' + e.message);
        }
        setSaving(false);
    };

    return (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
            <div className="bg-card rounded-xl border border-border w-full max-w-3xl my-8 max-h-[90vh] overflow-hidden flex flex-col">
                <div className="flex items-center justify-between px-6 py-4 border-b border-border">
                    <h3 className="text-lg font-semibold text-main">{isNew ? 'Новая процедура' : 'Редактировать процедуру'}</h3>
                    <button onClick={onClose} className="p-1.5 text-muted hover:text-main rounded-md">
                        <X className="w-5 h-5" />
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto p-6 space-y-5">
                    <div className="grid sm:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-semibold text-muted mb-1.5 uppercase tracking-wider">Название</label>
                            <input className="input w-full" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Поиск нового сотрудника" />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-muted mb-1.5 uppercase tracking-wider">Slug (для ссылок)</label>
                            <input className="input w-full" value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="poisk-novogo-sotrudnika" />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-muted mb-1.5 uppercase tracking-wider">Категория</label>
                            <select className="input w-full" value={category} onChange={(e) => setCategory(e.target.value)}>
                                {CATEGORIES.map((c) => (<option key={c.key} value={c.key}>{c.label}</option>))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-muted mb-1.5 uppercase tracking-wider">Порядок отображения</label>
                            <input type="number" className="input w-full" value={order} onChange={(e) => setOrder(parseInt(e.target.value) || 0)} />
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-muted mb-1.5 uppercase tracking-wider">Короткое описание (1 строка)</label>
                        <input className="input w-full" value={shortDesc} onChange={(e) => setShortDesc(e.target.value)} placeholder="Что и зачем — одной фразой" />
                    </div>

                    {/* Steps editor */}
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <label className="text-xs font-semibold text-muted uppercase tracking-wider">Шаги</label>
                            <div className="flex gap-1.5">
                                {(['step', 'note', 'tip', 'warning'] as StepType[]).map((t) => {
                                    const meta = STEP_TYPE_META[t];
                                    const Icon = meta.icon;
                                    return (
                                        <button key={t} type="button" onClick={() => addStep(t)} className={`text-xs px-2 py-1 rounded border ${meta.cls} hover:opacity-80 flex items-center gap-1`}>
                                            <Icon className="w-3 h-3" />
                                            +{meta.label}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                        <div className="space-y-3">
                            {steps.map((step, idx) => {
                                const meta = STEP_TYPE_META[step.type];
                                const Icon = meta.icon;
                                return (
                                    <div key={idx} className={`border-l-4 pl-3 pr-3 py-2 rounded-r-md ${meta.cls}`}>
                                        <div className="flex items-center justify-between gap-2 mb-2">
                                            <div className="flex items-center gap-2 min-w-0 flex-1">
                                                <Icon className="w-4 h-4 shrink-0" />
                                                <select
                                                    value={step.type}
                                                    onChange={(e) => updateStep(idx, { type: e.target.value as StepType })}
                                                    className="text-xs bg-transparent border-0 font-semibold uppercase tracking-wider cursor-pointer outline-none"
                                                >
                                                    {(['step', 'note', 'tip', 'warning'] as StepType[]).map((t) => (
                                                        <option key={t} value={t} className="bg-card text-main">{STEP_TYPE_META[t].label}</option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div className="flex gap-1 shrink-0">
                                                <button type="button" onClick={() => moveStep(idx, -1)} disabled={idx === 0} className="p-1 disabled:opacity-30 hover:bg-black/10 dark:hover:bg-white/10 rounded">
                                                    <ArrowUp className="w-3 h-3" />
                                                </button>
                                                <button type="button" onClick={() => moveStep(idx, 1)} disabled={idx === steps.length - 1} className="p-1 disabled:opacity-30 hover:bg-black/10 dark:hover:bg-white/10 rounded">
                                                    <ArrowDown className="w-3 h-3" />
                                                </button>
                                                <button type="button" onClick={() => removeStep(idx)} className="p-1 text-red-500 hover:bg-red-500/10 rounded">
                                                    <Trash2 className="w-3 h-3" />
                                                </button>
                                            </div>
                                        </div>
                                        <input
                                            className="w-full bg-transparent border-0 px-0 py-1 text-sm font-semibold text-main outline-none placeholder:text-muted"
                                            placeholder="Заголовок шага (опционально)"
                                            value={step.title || ''}
                                            onChange={(e) => updateStep(idx, { title: e.target.value })}
                                        />
                                        <textarea
                                            className="w-full bg-transparent border-0 px-0 py-1 text-sm text-main outline-none resize-y min-h-[60px] placeholder:text-muted"
                                            placeholder="Текст шага…"
                                            value={step.body}
                                            onChange={(e) => updateStep(idx, { body: e.target.value })}
                                        />
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Related procedures */}
                    <div>
                        <label className="block text-xs font-semibold text-muted mb-1.5 uppercase tracking-wider">Связанные процедуры</label>
                        <div className="flex flex-wrap gap-2 mb-2">
                            {related.map((rs) => {
                                const rp = allProcedures.find((p) => p.slug === rs);
                                return (
                                    <span key={rs} className="inline-flex items-center gap-1 px-2 py-1 bg-blue-500/10 text-blue-700 dark:text-blue-300 rounded text-xs">
                                        {rp?.title || rs}
                                        <button type="button" onClick={() => setRelated(related.filter((x) => x !== rs))} className="hover:text-red-500">
                                            <X className="w-3 h-3" />
                                        </button>
                                    </span>
                                );
                            })}
                        </div>
                        <select
                            className="input w-full"
                            value=""
                            onChange={(e) => {
                                if (e.target.value && !related.includes(e.target.value)) {
                                    setRelated([...related, e.target.value]);
                                }
                            }}
                        >
                            <option value="">+ добавить связанную процедуру…</option>
                            {allProcedures.filter((p) => p.slug !== slug && !related.includes(p.slug)).map((p) => (
                                <option key={p.id} value={p.slug}>{p.title}</option>
                            ))}
                        </select>
                    </div>

                    {/* Attachments */}
                    <div>
                        <label className="block text-xs font-semibold text-muted mb-1.5 uppercase tracking-wider">Файлы (картинки для процедуры)</label>
                        {!initial.id ? (
                            <div className="text-sm text-muted bg-subtle rounded-md p-3">
                                Сначала сохраните процедуру — после этого откройте её снова и добавьте файлы.
                            </div>
                        ) : (
                            <>
                                <label className={`flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-border rounded-md cursor-pointer hover:bg-subtle transition ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
                                    <Upload className="w-4 h-4 text-muted" />
                                    <span className="text-sm text-muted">{uploading ? 'Загружаю…' : 'Перетащи или кликни — добавить картинки'}</span>
                                    <input
                                        type="file"
                                        accept="image/*"
                                        multiple
                                        className="hidden"
                                        onChange={(e) => e.target.files && handleFileUpload(e.target.files)}
                                    />
                                </label>
                                {attachments.length > 0 && (
                                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-3">
                                        {attachments.map((a) => (
                                            <div key={a.id} className="bg-subtle rounded-md overflow-hidden border border-border">
                                                <div className="aspect-square">
                                                    <img src={a.file_url} alt="" className="w-full h-full object-cover" />
                                                </div>
                                                <div className="p-2 space-y-1">
                                                    <input
                                                        className="w-full bg-transparent border-0 text-xs outline-none placeholder:text-muted"
                                                        placeholder="Подпись (необязательно)"
                                                        defaultValue={a.caption || ''}
                                                        onBlur={(e) => updateCaption(a, e.target.value)}
                                                    />
                                                    <button onClick={() => removeAttachment(a)} className="text-xs text-red-500 hover:underline">
                                                        Удалить
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div className="flex justify-end gap-2 px-6 py-4 border-t border-border">
                    <button onClick={onClose} className="btn-secondary">Отмена</button>
                    <button onClick={handleSave} disabled={saving} className="btn-primary flex items-center gap-2 disabled:opacity-50">
                        <Save className="w-4 h-4" />
                        {saving ? 'Сохраняю…' : 'Сохранить'}
                    </button>
                </div>
            </div>
        </div>
    );
}

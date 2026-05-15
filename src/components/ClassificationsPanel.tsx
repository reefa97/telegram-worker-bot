import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import {
    X, Save, Plus, Trash2, GripVertical, Loader2, AlertCircle, ChevronRight,
} from 'lucide-react';

interface StandardSection {
    section: string;
    items: string[];
}

interface Classification {
    id: string;
    category: string;
    slug: string;
    name: string;
    icon: string | null;
    description: string | null;
    cleaning_standard: StandardSection[];
    sort_order: number;
    is_active: boolean;
}

const CATEGORY_LABELS: Record<string, string> = {
    office:       'Офисы и коммерческая',
    residential:  'Жилые',
    specialist:   'Специализированные',
    post_work:    'После работ',
    event:        'Мероприятия',
};

const CATEGORY_ORDER = ['office', 'residential', 'specialist', 'post_work', 'event'];

export default function ClassificationsPanel() {
    const { adminUser } = useAuth();
    const isSuperAdmin = adminUser?.role === 'super_admin';

    const [items, setItems] = useState<Classification[]>([]);
    const [loading, setLoading] = useState(true);
    const [editing, setEditing] = useState<Classification | null>(null);

    useEffect(() => { load(); }, []);

    const load = async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from('object_classifications')
            .select('*')
            .order('sort_order');
        if (!error && data) setItems(data as Classification[]);
        setLoading(false);
    };

    if (loading) {
        return (
            <div className="flex justify-center items-center h-64">
                <Loader2 className="w-6 h-6 text-muted animate-spin" />
            </div>
        );
    }

    const grouped = CATEGORY_ORDER
        .map(cat => ({ cat, items: items.filter(i => i.category === cat) }))
        .filter(g => g.items.length > 0);

    return (
        <div className="space-y-6">
            {!isSuperAdmin && (
                <div
                    role="alert"
                    className="flex items-start gap-2.5 p-3 rounded-md text-sm"
                    style={{ background: 'var(--warning-soft)', color: 'var(--warning-fg)' }}
                >
                    <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                    <span>Редактировать классификации может только Super Admin. Вы видите их в режиме чтения.</span>
                </div>
            )}

            {grouped.map(({ cat, items }) => (
                <section key={cat}>
                    <div className="text-eyebrow mb-2">{CATEGORY_LABELS[cat]}</div>
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                        {items.map(c => (
                            <button
                                key={c.id}
                                onClick={() => setEditing(c)}
                                className="card text-left p-4 hover:bg-subtle transition-colors group"
                            >
                                <div className="flex items-start gap-3">
                                    <div className="text-2xl leading-none shrink-0">{c.icon}</div>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2 mb-1">
                                            <h3 className="text-sm font-semibold text-main truncate">{c.name}</h3>
                                            <ChevronRight size={14} className="text-muted opacity-0 group-hover:opacity-100 transition-opacity" />
                                        </div>
                                        {c.description && (
                                            <p className="text-xs text-muted line-clamp-2">{c.description}</p>
                                        )}
                                        <div className="text-[11px] text-faint mt-2">
                                            {c.cleaning_standard?.length || 0} разделов ·{' '}
                                            {(c.cleaning_standard || []).reduce((a, s) => a + (s.items?.length || 0), 0)} пунктов
                                        </div>
                                    </div>
                                </div>
                            </button>
                        ))}
                    </div>
                </section>
            ))}

            {editing && (
                <ClassificationEditor
                    initial={editing}
                    canEdit={!!isSuperAdmin}
                    onClose={() => setEditing(null)}
                    onSaved={() => { setEditing(null); load(); }}
                />
            )}
        </div>
    );
}

// ============================================================
// Editor modal
// ============================================================

function ClassificationEditor({
    initial, canEdit, onClose, onSaved,
}: {
    initial: Classification;
    canEdit: boolean;
    onClose: () => void;
    onSaved: () => void;
}) {
    const [name, setName] = useState(initial.name);
    const [icon, setIcon] = useState(initial.icon || '');
    const [description, setDescription] = useState(initial.description || '');
    const [sections, setSections] = useState<StandardSection[]>(
        // Deep-clone to avoid mutating prop
        JSON.parse(JSON.stringify(initial.cleaning_standard || []))
    );
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const updateSection = (idx: number, patch: Partial<StandardSection>) => {
        setSections(s => s.map((x, i) => (i === idx ? { ...x, ...patch } : x)));
    };
    const updateItem = (sIdx: number, iIdx: number, val: string) => {
        setSections(s => s.map((sec, i) =>
            i === sIdx ? { ...sec, items: sec.items.map((it, j) => j === iIdx ? val : it) } : sec
        ));
    };
    const addItem = (sIdx: number) => {
        setSections(s => s.map((sec, i) =>
            i === sIdx ? { ...sec, items: [...sec.items, ''] } : sec
        ));
    };
    const removeItem = (sIdx: number, iIdx: number) => {
        setSections(s => s.map((sec, i) =>
            i === sIdx ? { ...sec, items: sec.items.filter((_, j) => j !== iIdx) } : sec
        ));
    };
    const addSection = () => {
        setSections(s => [...s, { section: 'Новый раздел', items: [''] }]);
    };
    const removeSection = (idx: number) => {
        if (!confirm('Удалить весь раздел и все его пункты?')) return;
        setSections(s => s.filter((_, i) => i !== idx));
    };
    const moveSection = (idx: number, dir: -1 | 1) => {
        const next = idx + dir;
        if (next < 0 || next >= sections.length) return;
        setSections(s => {
            const copy = [...s];
            [copy[idx], copy[next]] = [copy[next], copy[idx]];
            return copy;
        });
    };

    const save = async () => {
        setSaving(true);
        setError('');
        try {
            const clean: StandardSection[] = sections
                .map(s => ({
                    section: s.section.trim(),
                    items: s.items.map(i => i.trim()).filter(Boolean),
                }))
                .filter(s => s.section && s.items.length > 0);

            const { error: dbErr } = await supabase
                .from('object_classifications')
                .update({
                    name: name.trim(),
                    icon: icon.trim() || null,
                    description: description.trim() || null,
                    cleaning_standard: clean,
                    updated_at: new Date().toISOString(),
                })
                .eq('id', initial.id);
            if (dbErr) throw dbErr;
            onSaved();
        } catch (e: any) {
            setError(e?.message || 'Не удалось сохранить');
        } finally {
            setSaving(false);
        }
    };

    return createPortal(
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content sm:max-w-2xl flex flex-col" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <div className="flex items-center gap-3 min-w-0">
                        <span className="text-xl leading-none">{icon || '🏷'}</span>
                        <div className="min-w-0">
                            <h3 className="text-base font-semibold text-main truncate">{name || 'Без названия'}</h3>
                            <p className="text-xs text-muted">{CATEGORY_LABELS[initial.category]}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="btn-icon" aria-label="Закрыть">
                        <X size={18} />
                    </button>
                </div>

                <div className="modal-body space-y-5">
                    {/* Meta */}
                    <div className="grid sm:grid-cols-[80px_1fr] gap-3">
                        <div>
                            <label className="label">Иконка</label>
                            <input
                                type="text"
                                value={icon}
                                onChange={(e) => setIcon(e.target.value)}
                                className="input text-center"
                                maxLength={4}
                                disabled={!canEdit}
                                placeholder="🏢"
                            />
                        </div>
                        <div>
                            <label className="label">Название</label>
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                className="input"
                                disabled={!canEdit}
                            />
                        </div>
                    </div>
                    <div>
                        <label className="label">Описание</label>
                        <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            className="textarea"
                            rows={2}
                            disabled={!canEdit}
                            placeholder="Краткое описание объектов этого типа"
                        />
                    </div>

                    {/* Standard sections */}
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <div className="text-eyebrow">Стандарт уборки</div>
                            {canEdit && (
                                <button onClick={addSection} className="btn-ghost btn-sm">
                                    <Plus size={14} /> Добавить раздел
                                </button>
                            )}
                        </div>

                        <div className="space-y-3">
                            {sections.length === 0 && (
                                <div className="empty-state">
                                    <div className="empty-state-title">Стандарт пуст</div>
                                    <div className="empty-state-desc">
                                        {canEdit
                                            ? 'Нажмите «Добавить раздел», чтобы описать чек-лист.'
                                            : 'Администратор ещё не описал чек-лист для этого типа.'}
                                    </div>
                                </div>
                            )}

                            {sections.map((sec, sIdx) => (
                                <div key={sIdx} className="rounded-md border border-border bg-card">
                                    <div className="flex items-center gap-2 p-2.5 border-b border-border bg-subtle">
                                        {canEdit && (
                                            <div className="flex flex-col gap-0.5">
                                                <button
                                                    onClick={() => moveSection(sIdx, -1)}
                                                    className="text-muted hover:text-main disabled:opacity-30"
                                                    disabled={sIdx === 0}
                                                    title="Выше"
                                                >▲</button>
                                                <button
                                                    onClick={() => moveSection(sIdx, 1)}
                                                    className="text-muted hover:text-main disabled:opacity-30"
                                                    disabled={sIdx === sections.length - 1}
                                                    title="Ниже"
                                                >▼</button>
                                            </div>
                                        )}
                                        <input
                                            type="text"
                                            value={sec.section}
                                            onChange={(e) => updateSection(sIdx, { section: e.target.value })}
                                            className="input flex-1 font-medium"
                                            style={{ height: 32 }}
                                            disabled={!canEdit}
                                        />
                                        {canEdit && (
                                            <button
                                                onClick={() => removeSection(sIdx)}
                                                className="btn-icon"
                                                style={{ color: 'var(--danger-fg)', width: 32, height: 32 }}
                                                aria-label="Удалить раздел"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        )}
                                    </div>
                                    <ul className="p-2 space-y-1.5">
                                        {sec.items.map((it, iIdx) => (
                                            <li key={iIdx} className="flex items-start gap-2">
                                                <GripVertical size={14} className="text-faint shrink-0 mt-2" />
                                                <textarea
                                                    value={it}
                                                    onChange={(e) => updateItem(sIdx, iIdx, e.target.value)}
                                                    className="textarea flex-1 text-sm"
                                                    rows={1}
                                                    style={{ minHeight: 32, padding: '6px 10px' }}
                                                    disabled={!canEdit}
                                                    placeholder="Пункт чек-листа"
                                                />
                                                {canEdit && (
                                                    <button
                                                        onClick={() => removeItem(sIdx, iIdx)}
                                                        className="btn-icon shrink-0"
                                                        style={{ width: 32, height: 32, color: 'var(--text-muted)' }}
                                                        aria-label="Удалить пункт"
                                                    >
                                                        <X size={14} />
                                                    </button>
                                                )}
                                            </li>
                                        ))}
                                        {canEdit && (
                                            <li>
                                                <button
                                                    onClick={() => addItem(sIdx)}
                                                    className="btn-ghost btn-sm"
                                                >
                                                    <Plus size={12} /> Добавить пункт
                                                </button>
                                            </li>
                                        )}
                                    </ul>
                                </div>
                            ))}
                        </div>
                    </div>

                    {error && (
                        <div
                            role="alert"
                            className="flex items-start gap-2 p-3 rounded-md text-sm"
                            style={{ background: 'var(--danger-soft)', color: 'var(--danger-fg)' }}
                        >
                            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                            <span>{error}</span>
                        </div>
                    )}
                </div>

                {canEdit && (
                    <div className="modal-footer">
                        <button onClick={onClose} className="btn-ghost">Отменить</button>
                        <button onClick={save} disabled={saving} className="btn-primary">
                            {saving
                                ? <><Loader2 className="w-4 h-4 animate-spin" /> Сохранение...</>
                                : <><Save className="w-4 h-4" /> Сохранить</>}
                        </button>
                    </div>
                )}
            </div>
        </div>,
        document.body
    );
}

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import {
    X, Calendar, Phone, User, Shield, MessageCircle, Coins, ChevronDown,
    TrendingUp, Plus, Minus, Save, Unlink, Edit2, Building2, Search,
} from 'lucide-react';

interface Worker {
    id: string;
    first_name: string;
    last_name: string;
    telegram_username: string;
    telegram_user_id?: string;
    phone_number: string;
    is_active: boolean;
    role: string;
    worker_roles?: { name: string };
    created_at: string;
    created_by?: string;
    total_points?: number;
    deleted_at?: string | null;
}

interface PointsLogEntry {
    id: string;
    points_change: number;
    reason: string | null;
    created_at: string;
    check_id: string | null;
}

interface ObjectRow { id: string; name: string; address: string; }

interface WorkerDetailsModalProps {
    worker: Worker;
    onClose: () => void;
    onEdit?: () => void;   // optional — opens the worker edit form in WorkersPanel
}

export default function WorkerDetailsModal({ worker, onClose, onEdit }: WorkerDetailsModalProps) {
    const { adminUser } = useAuth();
    const isSuperAdmin = adminUser?.role === 'super_admin';
    const isDeleted = !!worker.deleted_at;

    const [assignedObjects, setAssignedObjects] = useState<ObjectRow[]>([]);
    const [allObjects, setAllObjects] = useState<ObjectRow[]>([]);
    const [creatorName, setCreatorName] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [pointsLog, setPointsLog] = useState<PointsLogEntry[]>([]);
    const [showPointsHistory, setShowPointsHistory] = useState(false);
    const [showAdjustPoints, setShowAdjustPoints] = useState(false);
    const [adjustMode, setAdjustMode] = useState<'add' | 'deduct'>('add');
    const [pointsChange, setPointsChange] = useState<number | ''>('');
    const [adjustReason, setAdjustReason] = useState('');
    const [isAdjusting, setIsAdjusting] = useState(false);
    const [unlinkingId, setUnlinkingId] = useState<string | null>(null);
    const [showAddObject, setShowAddObject] = useState(false);
    const [addSearch, setAddSearch] = useState('');
    const [addingId, setAddingId] = useState<string | null>(null);

    const initials = `${worker.first_name?.[0] || ''}${worker.last_name?.[0] || ''}`.toUpperCase();

    const fetchDetails = async () => {
        setLoading(true);
        const [linkRes, allRes, pointsRes] = await Promise.all([
            supabase
                .from('worker_objects')
                .select(`object_id, cleaning_objects(id, name, address)`)
                .eq('worker_id', worker.id),
            supabase
                .from('cleaning_objects')
                .select('id, name, address')
                .eq('is_active', true)
                .order('name'),
            supabase
                .from('worker_points_log')
                .select('id, points_change, reason, created_at, check_id')
                .eq('worker_id', worker.id)
                .order('created_at', { ascending: false })
                .limit(5),
        ]);
        if (linkRes.data) {
            setAssignedObjects(linkRes.data
                .map((row: any) => row.cleaning_objects)
                .filter(Boolean));
        }
        if (allRes.data) setAllObjects(allRes.data);
        if (pointsRes.data) setPointsLog(pointsRes.data);

        if (worker.created_by) {
            const { data: a } = await supabase.from('admin_users').select('name').eq('id', worker.created_by).maybeSingle();
            if (a) setCreatorName(a.name);
        }
        setLoading(false);
    };

    useEffect(() => { fetchDetails(); /* eslint-disable-next-line */ }, [worker.id]);

    const handleUnlink = async (objectId: string) => {
        if (!confirm('Открепить объект от работника?')) return;
        setUnlinkingId(objectId);
        try {
            const { error } = await supabase
                .from('worker_objects').delete()
                .eq('worker_id', worker.id).eq('object_id', objectId);
            if (error) throw error;
            setAssignedObjects(prev => prev.filter(o => o.id !== objectId));
        } catch (e: any) {
            alert('Ошибка: ' + e.message);
        } finally {
            setUnlinkingId(null);
        }
    };

    const handleAttach = async (objectId: string) => {
        setAddingId(objectId);
        try {
            const { error } = await supabase
                .from('worker_objects').insert({ worker_id: worker.id, object_id: objectId });
            if (error) throw error;
            const obj = allObjects.find(o => o.id === objectId);
            if (obj) setAssignedObjects(prev => [...prev, obj]);
        } catch (e: any) {
            alert('Ошибка: ' + e.message);
        } finally {
            setAddingId(null);
        }
    };

    const handleAdjust = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!pointsChange || typeof pointsChange !== 'number' || pointsChange <= 0) return alert('Введите число баллов');
        if (!adjustReason.trim()) return alert('Укажите причину');
        setIsAdjusting(true);
        const delta = adjustMode === 'add' ? pointsChange : -pointsChange;
        try {
            const { error } = await supabase.rpc('manual_adjust_points', {
                p_worker_id: worker.id,
                p_points_change: delta,
                p_reason: adjustReason.trim(),
            });
            if (error) throw error;
            setPointsChange(''); setAdjustReason(''); setShowAdjustPoints(false);
            worker.total_points = (worker.total_points || 0) + delta;
            await fetchDetails();
        } catch (err: any) {
            alert('Ошибка: ' + err.message);
        } finally {
            setIsAdjusting(false);
        }
    };

    const formatDate = (iso: string) =>
        new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });

    const assignedIds = new Set(assignedObjects.map(o => o.id));
    const availableObjects = allObjects
        .filter(o => !assignedIds.has(o.id))
        .filter(o => !addSearch.trim()
            || o.name.toLowerCase().includes(addSearch.toLowerCase())
            || o.address.toLowerCase().includes(addSearch.toLowerCase()));

    return createPortal(
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content sm:max-w-xl" onClick={e => e.stopPropagation()}>

                <div className="modal-header">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-full bg-subtle border border-border flex items-center justify-center text-sm font-semibold text-main shrink-0">
                            {initials || <User className="w-4 h-4 text-muted" />}
                        </div>
                        <div className="min-w-0">
                            <h3 className="text-base font-semibold text-main truncate">{worker.first_name} {worker.last_name}</h3>
                            <p className="text-xs text-muted truncate">{worker.worker_roles?.name || worker.role || 'Без роли'}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="btn-icon" aria-label="Закрыть">
                        <X size={18} />
                    </button>
                </div>

                <div className="modal-body space-y-5">

                    {/* Quick actions row */}
                    <div className="flex flex-wrap items-center gap-2">
                        {!worker.telegram_user_id ? (
                            <span className="badge-danger"><span className="badge-dot" style={{ background: 'var(--danger-fg)' }} />Не активен</span>
                        ) : worker.is_active ? (
                            <span className="badge-success"><span className="badge-dot" style={{ background: 'var(--success-fg)' }} />Активен</span>
                        ) : (
                            <span className="badge-neutral"><span className="badge-dot" />Off</span>
                        )}
                        <span className="badge-accent">
                            <Coins className="w-3 h-3" />{worker.total_points || 0} баллов
                        </span>
                        <div className="flex-1" />
                        {worker.telegram_username && (
                            <a
                                href={`https://t.me/${worker.telegram_username}`}
                                target="_blank" rel="noopener noreferrer"
                                className="btn-secondary btn-sm"
                            >
                                <MessageCircle size={14} /> @{worker.telegram_username}
                            </a>
                        )}
                        {worker.phone_number && (
                            <a href={`tel:${worker.phone_number}`} className="btn-secondary btn-sm">
                                <Phone size={14} /> {worker.phone_number}
                            </a>
                        )}
                    </div>

                    {/* Meta grid */}
                    <div className="grid grid-cols-2 gap-2 text-sm">
                        <div className="rounded-md border border-border p-3">
                            <div className="text-eyebrow mb-1">Опекун</div>
                            <div className="flex items-center gap-1.5 text-main truncate">
                                <Shield className="w-3.5 h-3.5 text-muted shrink-0" />
                                {loading ? '...' : creatorName || '—'}
                            </div>
                        </div>
                        <div className="rounded-md border border-border p-3">
                            <div className="text-eyebrow mb-1">Добавлен</div>
                            <div className="flex items-center gap-1.5 text-main truncate">
                                <Calendar className="w-3.5 h-3.5 text-muted shrink-0" />
                                {formatDate(worker.created_at)}
                            </div>
                        </div>
                    </div>

                    {/* Assigned objects */}
                    <section>
                        <div className="flex items-center justify-between mb-2">
                            <div className="text-eyebrow flex items-center gap-1.5">
                                <Building2 className="w-3.5 h-3.5" />
                                Закреплённые объекты ({assignedObjects.length})
                            </div>
                            {!isDeleted && !showAddObject && (
                                <button
                                    onClick={() => setShowAddObject(true)}
                                    className="btn-ghost btn-sm"
                                >
                                    <Plus size={12} /> Добавить
                                </button>
                            )}
                        </div>

                        {loading ? (
                            <div className="text-sm text-muted py-3">Загрузка...</div>
                        ) : assignedObjects.length === 0 && !showAddObject ? (
                            <div className="empty-state py-6">
                                <Building2 className="empty-state-icon" />
                                <div className="empty-state-desc">Ни одного объекта пока не закреплено</div>
                            </div>
                        ) : (
                            <div className="space-y-1.5">
                                {assignedObjects.map((obj) => (
                                    <div key={obj.id} className="flex items-center justify-between gap-2 p-2.5 rounded-md border border-border bg-card">
                                        <div className="min-w-0">
                                            <div className="text-sm font-medium text-main truncate">{obj.name}</div>
                                            <div className="text-xs text-muted truncate">{obj.address}</div>
                                        </div>
                                        <button
                                            onClick={() => handleUnlink(obj.id)}
                                            disabled={unlinkingId === obj.id}
                                            className="btn-icon shrink-0"
                                            style={{ color: 'var(--danger-fg)', width: 32, height: 32 }}
                                            aria-label="Открепить объект"
                                            title="Открепить"
                                        >
                                            <Unlink className="w-4 h-4" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Add-object picker */}
                        {showAddObject && (
                            <div className="mt-3 rounded-md border border-border bg-subtle p-2.5">
                                <div className="flex items-center justify-between gap-2 mb-2">
                                    <div className="relative flex-1">
                                        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
                                        <input
                                            type="text"
                                            value={addSearch}
                                            onChange={(e) => setAddSearch(e.target.value)}
                                            placeholder="Поиск по названию или адресу"
                                            className="input pl-8"
                                            style={{ height: 32 }}
                                            autoFocus
                                        />
                                    </div>
                                    <button onClick={() => { setShowAddObject(false); setAddSearch(''); }} className="btn-ghost btn-sm">
                                        Готово
                                    </button>
                                </div>
                                <div className="max-h-48 overflow-y-auto rounded-md bg-card border border-border divide-y divide-border">
                                    {availableObjects.length === 0 ? (
                                        <div className="px-3 py-4 text-sm text-muted text-center">
                                            {addSearch.trim() ? 'Ничего не найдено' : 'Все объекты уже прикреплены'}
                                        </div>
                                    ) : availableObjects.map(obj => (
                                        <button
                                            key={obj.id}
                                            onClick={() => handleAttach(obj.id)}
                                            disabled={addingId === obj.id}
                                            className="w-full text-left px-3 py-2 hover:bg-subtle transition-colors flex items-center gap-2"
                                        >
                                            <div className="min-w-0 flex-1">
                                                <div className="text-sm text-main truncate">{obj.name}</div>
                                                <div className="text-xs text-muted truncate">{obj.address}</div>
                                            </div>
                                            {addingId === obj.id ? (
                                                <span className="text-xs text-muted shrink-0">...</span>
                                            ) : (
                                                <Plus size={14} className="text-muted shrink-0" />
                                            )}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </section>

                    {/* Points history (collapsed) */}
                    <section>
                        <button
                            onClick={() => setShowPointsHistory(!showPointsHistory)}
                            className="flex items-center gap-2 text-sm font-medium text-main hover:text-primary transition-colors"
                        >
                            <TrendingUp className="w-4 h-4 text-muted" />
                            История начислений
                            <ChevronDown className={`w-4 h-4 text-muted transition-transform ${showPointsHistory ? 'rotate-180' : ''}`} />
                        </button>

                        {showPointsHistory && (
                            <div className="mt-3 space-y-1.5">
                                {pointsLog.length === 0 ? (
                                    <div className="text-sm text-muted py-2">Нет записей</div>
                                ) : pointsLog.map(e => (
                                    <div key={e.id} className="flex items-center justify-between p-2.5 rounded-md border border-border">
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm text-main truncate">{e.reason || 'Контроль качества'}</p>
                                            <p className="text-xs text-muted">{formatDate(e.created_at)}</p>
                                        </div>
                                        <span
                                            className="text-sm font-semibold ml-3 shrink-0"
                                            style={{ color: e.points_change > 0 ? 'var(--success-fg)' : 'var(--danger-fg)' }}
                                        >
                                            {e.points_change > 0 ? `+${e.points_change}` : e.points_change}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </section>

                    {/* Adjust points (super_admin only) */}
                    {isSuperAdmin && (
                        <section>
                            {!showAdjustPoints ? (
                                <button onClick={() => setShowAdjustPoints(true)} className="btn-secondary w-full">
                                    <Coins className="w-4 h-4" /> Начислить / списать баллы
                                </button>
                            ) : (
                                <form onSubmit={handleAdjust} className="p-3 rounded-md border border-border bg-subtle space-y-2.5">
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm font-medium text-main">Изменение баллов</span>
                                        <button type="button" onClick={() => setShowAdjustPoints(false)} className="btn-icon" style={{ width: 28, height: 28 }} aria-label="Отмена">
                                            <X size={14} />
                                        </button>
                                    </div>
                                    <div className="flex gap-1.5">
                                        <button
                                            type="button"
                                            onClick={() => setAdjustMode('add')}
                                            className={`flex-1 py-1.5 rounded-md text-sm font-medium border transition-colors flex items-center justify-center gap-1
                                                ${adjustMode === 'add' ? 'bg-card text-main border-border' : 'border-transparent text-muted hover:bg-card'}`}
                                        >
                                            <Plus size={14} /> Начислить
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setAdjustMode('deduct')}
                                            className={`flex-1 py-1.5 rounded-md text-sm font-medium border transition-colors flex items-center justify-center gap-1
                                                ${adjustMode === 'deduct' ? 'bg-card text-main border-border' : 'border-transparent text-muted hover:bg-card'}`}
                                        >
                                            <Minus size={14} /> Списать
                                        </button>
                                    </div>
                                    <div className="grid grid-cols-3 gap-2">
                                        <input
                                            type="number" min="1"
                                            value={pointsChange}
                                            onChange={(e) => setPointsChange(e.target.value ? Number(e.target.value) : '')}
                                            className="input col-span-1"
                                            placeholder="10"
                                            required
                                        />
                                        <input
                                            type="text"
                                            value={adjustReason}
                                            onChange={(e) => setAdjustReason(e.target.value)}
                                            className="input col-span-2"
                                            placeholder={adjustMode === 'add' ? 'Бонус за отличную работу' : 'Штраф за опоздание'}
                                            required
                                        />
                                    </div>
                                    <button type="submit" disabled={isAdjusting} className="btn-primary w-full">
                                        {isAdjusting ? 'Сохранение...' : <><Save className="w-4 h-4" /> Сохранить</>}
                                    </button>
                                </form>
                            )}
                        </section>
                    )}
                </div>

                <div className="modal-footer">
                    <button onClick={onClose} className="btn-ghost">Закрыть</button>
                    {onEdit && !isDeleted && (
                        <button onClick={onEdit} className="btn-primary">
                            <Edit2 className="w-4 h-4" /> Редактировать
                        </button>
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
}

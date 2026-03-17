import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../lib/supabase';
import {
    MessageSquare, Trash2, User, Building2, ChevronDown,
    Check, X, StickyNote, UserCheck, RefreshCw
} from 'lucide-react';

interface ClientRequest {
    id: string;
    message: string;
    status: 'new' | 'in_progress' | 'done';
    admin_note: string | null;
    created_at: string;
    resolved_at: string | null;
    object_id: string;
    client_id: string;
    assigned_worker_id: string | null;
    worker_task_status: string | null;
    // enriched
    client_name: string;
    client_email: string;
    object_name: string;
    worker_name: string | null;
}

interface Worker {
    id: string;
    first_name: string;
    last_name: string;
}

const STATUS_LABELS: Record<string, string> = {
    new: 'Новая',
    in_progress: 'В работе',
    done: 'Выполнено',
};

const STATUS_CLASS: Record<string, string> = {
    new: 'badge-danger',
    in_progress: 'badge-neutral',
    done: 'badge-success',
};

const WORKER_TASK_LABELS: Record<string, string> = {
    pending: 'Ожидает',
    confirmed: 'Подтверждено',
    failed: 'Не выполнено',
};

export default function ClientRequestsTab() {
    const [requests, setRequests] = useState<ClientRequest[]>([]);
    const [workers, setWorkers] = useState<Worker[]>([]);
    const [loading, setLoading] = useState(true);
    const [filterStatus, setFilterStatus] = useState<'all' | 'new' | 'in_progress' | 'done'>('all');
    const [editingNote, setEditingNote] = useState<string | null>(null);
    const [noteValue, setNoteValue] = useState('');
    const [assigningWorker, setAssigningWorker] = useState<string | null>(null);

    useEffect(() => {
        loadAll();
    }, []);

    const loadAll = async () => {
        setLoading(true);
        await Promise.all([loadRequests(), loadWorkers()]);
        setLoading(false);
    };

    const loadRequests = async () => {
        const { data: reqs } = await supabase
            .from('client_requests')
            .select('id, message, status, admin_note, created_at, resolved_at, object_id, client_id, assigned_worker_id, worker_task_status')
            .order('created_at', { ascending: false });

        if (!reqs) return;

        // Collect unique IDs for enrichment
        const clientIds = [...new Set((reqs as any[]).map((r: any) => r.client_id).filter(Boolean))];
        const objectIds = [...new Set((reqs as any[]).map((r: any) => r.object_id).filter(Boolean))];
        const workerIds = [...new Set((reqs as any[]).map((r: any) => r.assigned_worker_id).filter(Boolean))];

        const [clientsRes, objectsRes, workersRes] = await Promise.all([
            clientIds.length ? supabase.from('admin_users').select('id, name, email').in('id', clientIds) : { data: [] },
            objectIds.length ? supabase.from('cleaning_objects').select('id, name').in('id', objectIds) : { data: [] },
            workerIds.length ? supabase.from('workers').select('id, first_name, last_name').in('id', workerIds) : { data: [] },
        ]);

        const clientMap: Record<string, { name: string; email: string }> = {};
        (clientsRes.data || []).forEach((c: any) => { clientMap[c.id] = { name: c.name || c.email, email: c.email }; });

        const objectMap: Record<string, string> = {};
        (objectsRes.data || []).forEach((o: any) => { objectMap[o.id] = o.name; });

        const workerMap: Record<string, string> = {};
        (workersRes.data || []).forEach((w: any) => { workerMap[w.id] = `${w.first_name} ${w.last_name}`; });

        setRequests((reqs as any[]).map((r: any) => ({
            ...r,
            client_name: clientMap[r.client_id]?.name || '—',
            client_email: clientMap[r.client_id]?.email || '',
            object_name: objectMap[r.object_id] || '—',
            worker_name: r.assigned_worker_id ? (workerMap[r.assigned_worker_id] || '—') : null,
        })));
    };

    const loadWorkers = async () => {
        const { data } = await supabase
            .from('workers')
            .select('id, first_name, last_name')
            .eq('is_active', true)
            .order('first_name');
        if (data) setWorkers(data);
    };

    const updateStatus = async (id: string, status: string) => {
        const update: Record<string, any> = { status };
        if (status === 'done') update.resolved_at = new Date().toISOString();
        await supabase.from('client_requests').update(update).eq('id', id);
        setRequests(prev => prev.map(r => r.id === id ? { ...r, status: status as any, resolved_at: update.resolved_at || r.resolved_at } : r));
    };

    const assignWorker = async (requestId: string, workerId: string | null) => {
        await supabase.from('client_requests').update({
            assigned_worker_id: workerId,
            worker_task_status: workerId ? 'pending' : null,
            status: workerId ? 'in_progress' : 'new',
        }).eq('id', requestId);
        const worker = workerId ? workers.find(w => w.id === workerId) : null;
        setRequests(prev => prev.map(r => r.id === requestId ? {
            ...r,
            assigned_worker_id: workerId,
            worker_task_status: workerId ? 'pending' : null,
            worker_name: worker ? `${worker.first_name} ${worker.last_name}` : null,
            status: workerId ? 'in_progress' : 'new',
        } : r));
        setAssigningWorker(null);
    };

    const saveNote = async (id: string) => {
        await supabase.from('client_requests').update({ admin_note: noteValue || null }).eq('id', id);
        setRequests(prev => prev.map(r => r.id === id ? { ...r, admin_note: noteValue || null } : r));
        setEditingNote(null);
    };

    const deleteRequest = async (id: string) => {
        if (!confirm('Удалить просьбу?')) return;
        await supabase.from('client_requests').delete().eq('id', id);
        setRequests(prev => prev.filter(r => r.id !== id));
    };

    const filtered = filterStatus === 'all' ? requests : requests.filter(r => r.status === filterStatus);
    const counts = {
        all: requests.length,
        new: requests.filter(r => r.status === 'new').length,
        in_progress: requests.filter(r => r.status === 'in_progress').length,
        done: requests.filter(r => r.status === 'done').length,
    };

    if (loading) return (
        <div className="flex justify-center items-center h-64">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
    );

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <p className="text-sm text-muted">{requests.length} просьб всего</p>
                <button onClick={loadAll} className="btn-icon" title="Обновить">
                    <RefreshCw size={16} />
                </button>
            </div>

            {/* Filter tabs */}
            <div className="flex gap-1 p-1 bg-subtle rounded-xl overflow-x-auto">
                {(['all', 'new', 'in_progress', 'done'] as const).map(s => (
                    <button
                        key={s}
                        onClick={() => setFilterStatus(s)}
                        className={`flex-1 min-w-max px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center justify-center gap-1.5 ${
                            filterStatus === s
                                ? 'bg-card text-main shadow-sm'
                                : 'text-muted hover:text-main'
                        }`}
                    >
                        {s === 'all' ? 'Все' : STATUS_LABELS[s]}
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${
                            filterStatus === s ? 'bg-primary/10 text-primary' : 'bg-subtle text-muted'
                        }`}>
                            {counts[s]}
                        </span>
                    </button>
                ))}
            </div>

            {/* Requests list */}
            {filtered.length === 0 ? (
                <div className="card p-12 text-center text-muted flex flex-col items-center">
                    <MessageSquare className="w-10 h-10 mb-2 opacity-20" />
                    <p>Просьб нет</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {filtered.map(req => (
                        <div key={req.id} className="card p-4 space-y-3">
                            {/* Top row: status + client + date + delete */}
                            <div className="flex items-start justify-between gap-2">
                                <div className="flex items-center gap-2 flex-wrap min-w-0">
                                    {/* Status dropdown */}
                                    <div className="relative group">
                                        <button className={`text-[11px] ${STATUS_CLASS[req.status]} flex items-center gap-1 pr-2`}>
                                            <span className="badge-dot" />
                                            {STATUS_LABELS[req.status]}
                                            <ChevronDown size={10} />
                                        </button>
                                        <div className="absolute left-0 top-full mt-1 z-20 bg-card border border-border rounded-xl shadow-xl overflow-hidden hidden group-hover:block min-w-[130px]">
                                            {Object.entries(STATUS_LABELS).map(([val, label]) => (
                                                <button
                                                    key={val}
                                                    onClick={() => updateStatus(req.id, val)}
                                                    className={`w-full text-left px-3 py-2 text-sm hover:bg-subtle transition-colors flex items-center gap-2 ${req.status === val ? 'text-primary font-medium' : 'text-main'}`}
                                                >
                                                    {req.status === val && <Check size={12} />}
                                                    {label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    <span className="text-xs font-medium text-main truncate">
                                        <User size={11} className="inline mr-1 text-muted" />
                                        {req.client_name}
                                    </span>
                                    <span className="text-xs text-muted truncate">
                                        <Building2 size={11} className="inline mr-1" />
                                        {req.object_name}
                                    </span>
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                    <span className="text-[10px] text-muted">
                                        {new Date(req.created_at).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                                    </span>
                                    <button
                                        onClick={() => deleteRequest(req.id)}
                                        className="text-muted hover:text-danger p-1 rounded transition-colors"
                                        title="Удалить"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            </div>

                            {/* Message */}
                            <p className="text-sm text-main bg-subtle/50 rounded-lg px-3 py-2">{req.message}</p>

                            {/* Bottom row: worker + note */}
                            <div className="flex items-center gap-2 flex-wrap">
                                {/* Assign worker */}
                                <div className="relative">
                                    <button
                                        onClick={() => setAssigningWorker(assigningWorker === req.id ? null : req.id)}
                                        className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${
                                            req.assigned_worker_id
                                                ? 'border-primary/30 bg-primary/5 text-primary'
                                                : 'border-border text-muted hover:text-main hover:border-primary/30'
                                        }`}
                                    >
                                        <UserCheck size={13} />
                                        {req.worker_name || 'Назначить работника'}
                                        {req.worker_task_status && (
                                            <span className={`text-[9px] px-1.5 py-0.5 rounded-full ml-1 ${
                                                req.worker_task_status === 'confirmed' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                                                req.worker_task_status === 'failed' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                                                'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                                            }`}>
                                                {WORKER_TASK_LABELS[req.worker_task_status]}
                                            </span>
                                        )}
                                        <ChevronDown size={10} />
                                    </button>

                                    {assigningWorker === req.id && (
                                        <div className="absolute left-0 top-full mt-1 z-20 bg-card border border-border rounded-xl shadow-xl overflow-hidden min-w-[200px] max-h-52 overflow-y-auto">
                                            {req.assigned_worker_id && (
                                                <button
                                                    onClick={() => assignWorker(req.id, null)}
                                                    className="w-full text-left px-3 py-2 text-sm text-danger hover:bg-subtle transition-colors flex items-center gap-2"
                                                >
                                                    <X size={12} /> Снять работника
                                                </button>
                                            )}
                                            {workers.map(w => (
                                                <button
                                                    key={w.id}
                                                    onClick={() => assignWorker(req.id, w.id)}
                                                    className={`w-full text-left px-3 py-2 text-sm hover:bg-subtle transition-colors flex items-center gap-2 ${
                                                        req.assigned_worker_id === w.id ? 'text-primary font-medium' : 'text-main'
                                                    }`}
                                                >
                                                    {req.assigned_worker_id === w.id && <Check size={12} />}
                                                    {w.first_name} {w.last_name}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* Note button */}
                                <button
                                    onClick={() => { setEditingNote(req.id); setNoteValue(req.admin_note || ''); }}
                                    className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${
                                        req.admin_note
                                            ? 'border-amber-300 bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-700'
                                            : 'border-border text-muted hover:text-main hover:border-primary/30'
                                    }`}
                                    title={req.admin_note || 'Добавить заметку'}
                                >
                                    <StickyNote size={13} />
                                    {req.admin_note ? 'Заметка' : 'Добавить заметку'}
                                </button>

                                {/* Show admin note if exists */}
                                {req.admin_note && (
                                    <span className="text-xs text-amber-600 dark:text-amber-400 italic truncate max-w-[200px]">
                                        {req.admin_note}
                                    </span>
                                )}

                                {/* resolved date */}
                                {req.status === 'done' && req.resolved_at && (
                                    <span className="text-[10px] text-muted ml-auto flex items-center gap-1">
                                        <Check size={10} className="text-success" />
                                        {new Date(req.resolved_at).toLocaleDateString('ru-RU')}
                                    </span>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Note edit modal */}
            {editingNote && createPortal(
                <div className="modal-overlay animate-fadeIn" onClick={() => setEditingNote(null)}>
                    <div className="modal-content animate-scaleIn" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3 className="text-lg font-bold text-main flex items-center gap-2">
                                <StickyNote size={18} className="text-amber-500" /> Заметка администратора
                            </h3>
                            <button onClick={() => setEditingNote(null)} className="btn-icon"><X size={20} /></button>
                        </div>
                        <div className="modal-body space-y-4">
                            <textarea
                                value={noteValue}
                                onChange={e => setNoteValue(e.target.value)}
                                className="input resize-none h-28"
                                placeholder="Введите заметку..."
                                autoFocus
                            />
                        </div>
                        <div className="modal-footer">
                            <button onClick={() => setEditingNote(null)} className="btn-secondary">Отмена</button>
                            <button onClick={() => saveNote(editingNote)} className="btn-primary">Сохранить</button>
                        </div>
                    </div>
                </div>
            , document.body)}

            {/* Click outside to close dropdowns */}
            {assigningWorker && (
                <div className="fixed inset-0 z-10" onClick={() => setAssigningWorker(null)} />
            )}
        </div>
    );
}

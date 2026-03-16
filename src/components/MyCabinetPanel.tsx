import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import {
    Plus, Clock,
    CheckCircle2, User, Trash2, X, Briefcase, MessageSquare, Building2, Loader2, UserCheck, ClipboardCopy
} from 'lucide-react';
import CrmPipeline from './crm/CrmPipeline';

interface Task {
    id: string;
    title: string;
    description: string;
    due_date: string;
    is_completed: boolean;
    assigned_to: string;
    created_by: string;
    created_at: string;
    assigned_to_user?: { name: string; email: string };
    created_by_user?: { name: string; email: string };
    lead_id?: string;
    lead?: { title: string };
}

interface AdminUser {
    id: string;
    name: string;
    email: string;
}

export default function MyCabinetPanel() {
    const { adminUser } = useAuth();
    const [tasks, setTasks] = useState<Task[]>([]);
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [time, setTime] = useState('12:00');
    const [assignedTo, setAssignedTo] = useState('');

    // Add missing state for admins
    const [admins, setAdmins] = useState<AdminUser[]>([]);

    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<'all' | 'pending' | 'completed'>('pending');
    const [showModal, setShowModal] = useState(false);
    const [leads, setLeads] = useState<{ id: string; title: string }[]>([]);
    const [selectedLeadId, setSelectedLeadId] = useState('');
    const [clientRequests, setClientRequests] = useState<any[]>([]);
    const [assignModal, setAssignModal] = useState<{ req: any } | null>(null);
    const [assignWorkers, setAssignWorkers] = useState<any[]>([]);
    const [assignWorkerId, setAssignWorkerId] = useState('');
    const [assignMessage, setAssignMessage] = useState('');
    const [assignSubmitting, setAssignSubmitting] = useState(false);

    useEffect(() => {
        if (adminUser) {
            loadTasks();
            loadLeads();
            loadClientRequests();
            if (adminUser.role === 'super_admin') {
                loadAdmins();
                setAssignedTo(adminUser.id);
            } else {
                setAssignedTo(adminUser.id);
            }
        }
    }, [adminUser]);

    const loadLeads = async () => {
        const { data } = await supabase.from('crm_leads').select('id, title').order('created_at', { ascending: false });
        if (data) setLeads(data);
    };

    // Add function to load admins
    const loadAdmins = async () => {
        const { data } = await supabase.from('admin_users').select('id, name, email');
        if (data) setAdmins(data);
    };

    const loadClientRequests = async () => {
        if (!adminUser) return;
        try {
            const { data } = await supabase
                .from('client_requests')
                .select('*, cleaning_objects(name), client:admin_users!client_id(email), assigned_worker:workers!assigned_worker_id(id, first_name, last_name)')
                .order('created_at', { ascending: false });
            if (data) setClientRequests(data);
        } catch (err) {
            console.error('Error loading client requests:', err);
        }
    };

    const openAssignModal = async (req: any) => {
        setAssignModal({ req });
        setAssignMessage(req.worker_message || req.message);
        setAssignWorkerId(req.assigned_worker_id || '');
        // Load workers for this object
        const { data } = await supabase
            .from('worker_objects')
            .select('worker_id, workers(id, first_name, last_name, telegram_chat_id)')
            .eq('object_id', req.object_id);
        if (data) setAssignWorkers(data.map((wo: any) => wo.workers).filter(Boolean));
    };

    const submitAssignment = async () => {
        if (!assignModal || !assignWorkerId || !assignMessage.trim()) return;
        setAssignSubmitting(true);
        try {
            const { error } = await supabase.from('client_requests').update({
                assigned_worker_id: assignWorkerId,
                worker_message: assignMessage.trim(),
                worker_task_status: 'pending',
                status: 'in_progress'
            }).eq('id', assignModal.req.id);

            if (error) throw error;

            // Send Telegram notification to worker
            const worker = assignWorkers.find(w => w.id === assignWorkerId);
            if (worker?.telegram_chat_id) {
                const objectName = assignModal.req.cleaning_objects?.name || 'Obiekt';
                await supabase.functions.invoke('send-telegram-notification', {
                    body: {
                        chat_id: worker.telegram_chat_id,
                        message: `📋 <b>Nowe zadanie od klienta</b>\n\n📍 Obiekt: <b>${objectName}</b>\n💬 ${assignMessage.trim()}\n\n⚠️ Pamiętaj o wykonaniu tego zadania podczas następnej zmiany!`
                    }
                });
            }

            setAssignModal(null);
            loadClientRequests();
        } catch (err) {
            console.error('Error assigning worker:', err);
            alert('Ошибка при назначении работника');
        } finally {
            setAssignSubmitting(false);
        }
    };

    const updateRequestStatus = async (requestId: string, status: string, adminNote?: string) => {
        try {
            const updateData: any = { status };
            if (status === 'done') updateData.resolved_at = new Date().toISOString();
            if (status === 'done') updateData.resolved_by = adminUser?.id;
            if (adminNote) updateData.admin_note = adminNote;
            await supabase.from('client_requests').update(updateData).eq('id', requestId);
            loadClientRequests();
        } catch (err) {
            console.error('Error updating request:', err);
        }
    };

    const loadTasks = async () => {
        setLoading(true);
        if (!adminUser) return;

        let query = supabase
            .from('admin_tasks')
            .select(`
                *,
                assigned_to_user:admin_users!assigned_to(name, email),
                created_by_user:admin_users!created_by(name, email),
                lead:crm_leads(title)
            `)
            .order('due_date', { ascending: true });

        if (adminUser.role !== 'super_admin') {
            query = query.or(`assigned_to.eq.${adminUser.id},created_by.eq.${adminUser.id}`);
        }

        const { data, error } = await query;
        if (error) {
            console.error('Error loading tasks:', error);
        } else {
            setTasks(data || []);
        }
        setLoading(false);
    };

    const handleCreateTask = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const due_date = new Date(`${date}T${time}:00`).toISOString();

            const { error } = await supabase.from('admin_tasks').insert({
                title,
                description,
                due_date,
                assigned_to: assignedTo,
                created_by: adminUser?.id,
                is_completed: false,
                created_notification_sent: false,
                reminder_sent: false,
                lead_id: selectedLeadId || null
            });

            if (error) throw error;

            setShowModal(false);
            setTitle('');
            setDescription('');
            setDate(new Date().toISOString().split('T')[0]);
            setTime('12:00');
            setSelectedLeadId('');
            loadTasks();
        } catch (e) {
            console.error(e);
            alert('Ошибка при создании задачи');
        }
    };


    const toggleTaskStatus = async (taskId: string, currentStatus: boolean, e?: React.MouseEvent) => {
        e?.stopPropagation(); // Stop propagation
        const newStatus = !currentStatus;
        const oldTasks = [...tasks];

        // Optimistic
        setTasks(tasks.map(t => t.id === taskId ? { ...t, is_completed: newStatus } : t));

        const { error } = await supabase
            .from('admin_tasks')
            .update({ is_completed: newStatus })
            .eq('id', taskId);

        if (error) {
            console.error(error);
            setTasks(oldTasks);
            alert('Ошибка обновления статуса');
        }
    };

    const handleDeleteTask = async (id: string, e?: React.MouseEvent) => {
        e?.stopPropagation();
        if (!confirm('Удалить задачу?')) return;
        const { error } = await supabase.from('admin_tasks').delete().eq('id', id);
        if (error) console.error(error);
        else loadTasks();
    };

    const filteredTasks = tasks.filter(t => {
        if (filter === 'pending') return !t.is_completed;
        if (filter === 'completed') return t.is_completed;
        return true;
    });

    const overdueCount = tasks.filter(t => !t.is_completed && new Date(t.due_date) < new Date()).length;

    if (loading && tasks.length === 0) {
        return (
            <div className="flex justify-center items-center h-64">
                <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-8">
            {/* Header */}
            <div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Мой кабинет</h2>
                <p className="text-muted text-sm mt-1">Управление задачами и сделками</p>
            </div>

            {/* CRM Pipeline Section */}
            <div className="space-y-4">
                <CrmPipeline />
            </div>

            <div className="border-t border-border mx-2"></div>

            {/* Client Requests Section */}
            {clientRequests.length > 0 && (
                <div className="space-y-4">
                    <div className="flex items-center gap-3">
                        <h3 className="text-xl font-bold text-main flex items-center gap-2">
                            <MessageSquare className="w-5 h-5 text-primary" />
                            Просьбы клиентов
                        </h3>
                        <span className="badge-warning text-xs">
                            {clientRequests.filter((r: any) => r.status === 'new').length} новых
                        </span>
                    </div>

                    <div className="space-y-2">
                        {clientRequests.filter((r: any) => r.status !== 'done').map((req: any) => (
                            <div key={req.id} className="card p-4">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                                            <span className="flex items-center gap-1 text-xs text-muted">
                                                <Building2 size={11} />
                                                {req.cleaning_objects?.name || 'Объект'}
                                            </span>
                                            <span className="text-xs text-muted">•</span>
                                            <span className="text-xs text-muted">{req.client?.email}</span>
                                            <span className="text-xs text-muted">•</span>
                                            <span className="text-xs text-muted">
                                                {new Date(req.created_at).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                            {req.status === 'new' && <span className="badge-warning text-[10px]">Новая</span>}
                                            {req.status === 'in_progress' && <span className="badge-info text-[10px] flex items-center gap-1"><Loader2 size={10} className="animate-spin" />В работе</span>}
                                        </div>
                                        <p className="text-main font-medium text-sm">{req.message}</p>
                                        {req.assigned_worker && (
                                            <div className="mt-1.5 flex items-center gap-1.5 text-xs">
                                                <UserCheck size={11} className="text-emerald-500" />
                                                <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                                                    Назначен: {req.assigned_worker.first_name} {req.assigned_worker.last_name}
                                                </span>
                                                {req.worker_task_status === 'pending' && <span className="badge-warning text-[10px]">Ожидает</span>}
                                                {req.worker_task_status === 'confirmed' && <span className="badge-success text-[10px]">Выполнено ✅</span>}
                                                {req.worker_task_status === 'failed' && <span className="badge-error text-[10px]">Не выполнено ❌</span>}
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex gap-1 flex-shrink-0 flex-wrap justify-end">
                                        <button
                                            onClick={() => openAssignModal(req)}
                                            className="btn-secondary text-xs px-2 py-1 flex items-center gap-1"
                                            title="Назначить работнику"
                                        >
                                            <UserCheck size={12} />
                                            {req.assigned_worker_id ? 'Переназначить' : 'Назначить'}
                                        </button>
                                        <button
                                            onClick={() => updateRequestStatus(req.id, 'done')}
                                            className="btn-primary text-xs px-2 py-1 flex items-center gap-1"
                                            title="Выполнено"
                                        >
                                            <CheckCircle2 size={12} />
                                            Готово
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Assign to Worker Modal */}
            {assignModal && createPortal(
                <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <div className="bg-card border border-border rounded-2xl shadow-xl w-full max-w-md">
                        <div className="flex items-center justify-between p-5 border-b border-border">
                            <h3 className="font-bold text-main flex items-center gap-2">
                                <UserCheck className="w-5 h-5 text-primary" />
                                Назначить работнику
                            </h3>
                            <button onClick={() => setAssignModal(null)} className="text-muted hover:text-main">
                                <X size={20} />
                            </button>
                        </div>
                        <div className="p-5 space-y-4">
                            <div className="p-3 bg-subtle rounded-xl text-sm text-muted">
                                <span className="font-semibold text-main">Просьба клиента:</span>
                                <p className="mt-1">{assignModal.req.message}</p>
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1.5">Работник</label>
                                <select
                                    value={assignWorkerId}
                                    onChange={e => setAssignWorkerId(e.target.value)}
                                    className="input"
                                >
                                    <option value="">Выберите работника...</option>
                                    {assignWorkers.map(w => (
                                        <option key={w.id} value={w.id}>
                                            {w.first_name} {w.last_name}{!w.telegram_chat_id ? ' (нет Telegram)' : ''}
                                        </option>
                                    ))}
                                </select>
                                {assignWorkers.length === 0 && (
                                    <p className="text-xs text-muted mt-1">Нет работников, привязанных к этому объекту</p>
                                )}
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1.5">Сообщение для работника</label>
                                <div className="relative">
                                    <textarea
                                        value={assignMessage}
                                        onChange={e => setAssignMessage(e.target.value)}
                                        className="input min-h-[100px] resize-y pr-10"
                                        placeholder="Опишите задание..."
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setAssignMessage(assignModal.req.message)}
                                        className="absolute top-2 right-2 p-1.5 rounded-lg text-muted hover:text-primary hover:bg-subtle transition-colors"
                                        title="Использовать сообщение клиента"
                                    >
                                        <ClipboardCopy size={14} />
                                    </button>
                                </div>
                                <p className="text-xs text-muted mt-1 flex items-center gap-1">
                                    <ClipboardCopy size={10} /> — вставить сообщение клиента
                                </p>
                            </div>
                        </div>
                        <div className="flex gap-3 p-5 pt-0 justify-end">
                            <button onClick={() => setAssignModal(null)} className="btn-secondary">Отмена</button>
                            <button
                                onClick={submitAssignment}
                                disabled={assignSubmitting || !assignWorkerId || !assignMessage.trim()}
                                className="btn-primary flex items-center gap-2"
                            >
                                {assignSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserCheck size={16} />}
                                Назначить и уведомить
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            <div className="border-t border-border mx-2"></div>

            {/* Tasks Section Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div className="flex items-center gap-4">
                    <h3 className="text-xl font-bold text-main">Ваши задачи</h3>
                    {/* Stats Badges */}
                    <div className="flex gap-2">
                        <span className="badge-neutral text-xs">Всего: {tasks.length}</span>
                        {overdueCount > 0 && <span className="badge-error text-xs">Просрочено: {overdueCount}</span>}
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
                    {/* Filters */}
                    <div className="flex bg-gray-100 dark:bg-gray-800 p-1 rounded-lg border border-gray-200 dark:border-gray-700">
                        {(['pending', 'all', 'completed'] as const).map((f) => (
                            <button
                                key={f}
                                onClick={() => setFilter(f)}
                                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${filter === f ? 'bg-white dark:bg-gray-700 shadow-sm text-primary-600 dark:text-primary-400' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}
                            >
                                {f === 'pending' && 'Активные'}
                                {f === 'all' && 'Все'}
                                {f === 'completed' && 'Готово'}
                            </button>
                        ))}
                    </div>

                    <button onClick={() => setShowModal(true)} className="btn-primary flex items-center gap-2 whitespace-nowrap">
                        <Plus size={16} />
                        <span className="hidden sm:inline">Новая задача</span>
                    </button>
                </div>
            </div>

            {/* Tasks Grid */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 animate-fadeIn pb-10">
                {filteredTasks.map(task => {
                    const isOverdue = !task.is_completed && new Date(task.due_date) < new Date();

                    return (
                        <div
                            key={task.id}
                            className={`card-interactive relative group p-5 flex flex-col gap-4 ${task.is_completed ? 'opacity-60 bg-gray-50 dark:bg-gray-800/50' : ''}`}
                        >
                            {/* Header: Title & Menu */}
                            <div className="flex justify-between items-start">
                                <div className="pr-8">
                                    <h4 className={`font-medium text-main text-base line-clamp-2 ${task.is_completed ? 'line-through text-muted' : ''}`}>
                                        {task.title}
                                    </h4>
                                    {task.lead && (
                                        <div className="mt-2 flex">
                                            <span className="flex items-center gap-1 text-xs text-blue-600 bg-blue-50 dark:bg-blue-900/20 px-1.5 py-0.5 rounded border border-blue-100 dark:border-blue-900/30">
                                                <Briefcase size={10} />
                                                {task.lead.title}
                                            </span>
                                        </div>
                                    )}
                                </div>

                                {/* Quick Complete Action */}
                                <button
                                    onClick={(e) => toggleTaskStatus(task.id, task.is_completed, e)}
                                    className={`flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${task.is_completed ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-gray-300 hover:border-primary text-transparent'}`}
                                    title={task.is_completed ? "Вернуть в работу" : "Завершить"}
                                >
                                    <CheckCircle2 size={14} fill="currentColor" className={task.is_completed ? "text-white" : "opacity-0"} />
                                </button>
                            </div>

                            {/* Body: Description */}
                            {task.description && (
                                <p className="text-sm text-muted line-clamp-3 mb-auto">
                                    {task.description}
                                </p>
                            )}

                            {/* Footer: Date & Users */}
                            <div className="mt-auto pt-3 border-t border-border flex items-end justify-between gap-2">
                                <div className="flex flex-col gap-1.5">
                                    <div className={`flex items-center gap-1.5 text-xs ${isOverdue ? 'text-rose-500 font-bold' : 'text-muted'}`}>
                                        <Clock size={12} />
                                        {new Date(task.due_date).toLocaleString()}
                                    </div>

                                    <div className="flex items-center gap-2">
                                        {task.assigned_to_user && (
                                            <div className="flex items-center gap-1 text-[10px] text-muted" title={`Исполнитель: ${task.assigned_to_user.name}`}>
                                                <User size={10} />
                                                <span className="max-w-[100px] truncate">{task.assigned_to_user.name || task.assigned_to_user.email}</span>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {(adminUser?.role === 'super_admin' || task.created_by === adminUser?.id) && (
                                    <button
                                        onClick={(e) => handleDeleteTask(task.id, e)}
                                        className="text-muted hover:text-rose-500 p-1 md:opacity-0 md:group-hover:opacity-100 transition-opacity"
                                        title="Удалить"
                                    >
                                        <Trash2 size={15} />
                                    </button>
                                )}
                            </div>
                        </div>
                    );
                })}
                {filteredTasks.length === 0 && (
                    <div className="col-span-full py-12 text-center text-muted italic border-2 border-dashed border-border/50 rounded-xl">
                        Задач не найдено
                    </div>
                )}
            </div>

            {/* Modal */}
            {showModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fadeIn">
                    <div className="bg-white dark:bg-gray-900 w-full max-w-md rounded-xl shadow-xl border border-gray-200 dark:border-gray-800 overflow-hidden animate-scaleIn">
                        <div className="p-4 border-b border-border flex justify-between items-center bg-subtle">
                            <h3 className="font-bold text-lg text-main">Новая задача</h3>
                            <button onClick={() => setShowModal(false)} className="text-muted hover:text-main"><X size={20} /></button>
                        </div>
                        <form onSubmit={handleCreateTask} className="p-6 space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-muted uppercase tracking-wider mb-1.5">Заголовок</label>
                                <input
                                    type="text" required
                                    className="input w-full"
                                    placeholder="Что сделать?"
                                    value={title}
                                    onChange={e => setTitle(e.target.value)}
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-muted uppercase tracking-wider mb-1.5">Описание</label>
                                <textarea
                                    className="input w-full min-h-[80px]"
                                    placeholder="Подробности..."
                                    value={description}
                                    onChange={e => setDescription(e.target.value)}
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-muted uppercase tracking-wider mb-1.5">Дата</label>
                                    <input
                                        type="date" required
                                        className="input w-full"
                                        value={date}
                                        onChange={e => setDate(e.target.value)}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-muted uppercase tracking-wider mb-1.5">Время</label>
                                    <input
                                        type="time" required
                                        className="input w-full"
                                        value={time}
                                        onChange={e => setTime(e.target.value)}
                                    />
                                </div>
                            </div>

                            {adminUser?.role === 'super_admin' && (
                                <div>
                                    <label className="block text-xs font-bold text-muted uppercase tracking-wider mb-1.5">Исполнитель</label>
                                    <select
                                        className="input w-full"
                                        value={assignedTo}
                                        onChange={e => setAssignedTo(e.target.value)}
                                    >
                                        <option value={adminUser.id}>Себе</option>
                                        {admins.map(a => (
                                            <option key={a.id} value={a.id}>{a.name || a.email}</option>
                                        ))}
                                    </select>
                                </div>
                            )}
                            {/* CRM Lead Selector */}
                            <div>
                                <label className="block text-xs font-bold text-muted uppercase tracking-wider mb-1.5">Привязать к сделке (CRM)</label>
                                <select
                                    className="input w-full"
                                    value={selectedLeadId}
                                    onChange={e => setSelectedLeadId(e.target.value)}
                                >
                                    <option value="">-- Без привязки --</option>
                                    {leads.map(lead => (
                                        <option key={lead.id} value={lead.id}>{lead.title}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="flex justify-end gap-3 pt-2">
                                <button type="button" onClick={() => setShowModal(false)} className="btn-secondary">Отмена</button>
                                <button type="submit" className="btn-primary">Создать</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}

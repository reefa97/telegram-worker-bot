import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useUndo } from '../contexts/UndoContext';
import { Plus, Edit2, Trash2, Send, Copy, Check, Users, History, Search, RefreshCw, MessageSquare, X } from 'lucide-react';
import WorkSessionsModal from './WorkSessionsModal';
import WorkerDetailsModal from './WorkerDetailsModal';
import SalariesTab from './SalariesTab';

interface Worker {
    id: string;
    first_name: string;
    last_name: string;
    telegram_username: string;
    telegram_user_id: string;
    telegram_chat_id: number;
    phone_number: string;
    is_active: boolean;
    role: string;
    role_id?: string;
    worker_roles?: { name: string };
    invitation_token: string;
    created_at: string;
    created_by?: string;
}

interface WorkerRole {
    id: string;
    name: string;
}

interface CleaningObject {
    id: string;
    name: string;
    address: string;
}

export default function WorkersPanel({ searchTerm = '' }: { searchTerm?: string }) {
    const { adminUser } = useAuth();
    const { pushUndo } = useUndo();
    const [workers, setWorkers] = useState<Worker[]>([]);
    const [objects, setObjects] = useState<CleaningObject[]>([]);
    const [roles, setRoles] = useState<WorkerRole[]>([]);
    const [creators, setCreators] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingWorker, setEditingWorker] = useState<Worker | null>(null);
    const [viewingWorker, setViewingWorker] = useState<Worker | null>(null); // State for viewing details
    const [copiedToken, setCopiedToken] = useState<string | null>(null);
    const [historyWorker, setHistoryWorker] = useState<Worker | null>(null);

    // Bulk messaging state
    const [selectedWorkers, setSelectedWorkers] = useState<Set<string>>(new Set());
    const [showBulkModal, setShowBulkModal] = useState(false);
    const [bulkMessage, setBulkMessage] = useState('');
    const [sendingBulk, setSendingBulk] = useState(false);

    // Standalone message modal
    const [showMessageModal, setShowMessageModal] = useState(false);
    const [messageRecipients, setMessageRecipients] = useState<Set<string>>(new Set());
    const [messageText, setMessageText] = useState('');
    const [messageSearch, setMessageSearch] = useState('');
    const [sendingMessage, setSendingMessage] = useState(false);

    // Form state
    const [formData, setFormData] = useState({
        first_name: '',
        last_name: '',
        phone_number: '',
        role_id: '',
        created_by: '',
        selectedObjects: [] as string[],
    });

    const [activeTab, setActiveTab] = useState<'list' | 'salaries'>('list');
    const searchQuery = searchTerm;
    const [isAddingRole, setIsAddingRole] = useState(false);
    const [newRoleName, setNewRoleName] = useState('');
    const [isSavingRole, setIsSavingRole] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const isSubmittingRef = useRef(false);

    useEffect(() => {
        loadWorkers();
        loadObjects();
        loadRoles();
        loadCreators();
    }, []);

    const loadCreators = async () => {
        const { data } = await supabase.from('admin_users').select('id, name').neq('role', 'client');
        if (data) {
            const lookup: Record<string, string> = {};
            data.forEach((user: any) => {
                if (user.id && user.name) {
                    lookup[user.id] = user.name;
                }
            });
            setCreators(lookup);
        }
    };

    const loadRoles = async () => {
        const { data } = await supabase.from('worker_roles').select('*').order('name');
        if (data) setRoles(data);
    };

    const loadWorkers = async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from('workers')
            .select('*, worker_roles(name)')
            .order('created_at', { ascending: false });

        if (data) setWorkers(data);
        if (error) console.error('Error loading workers:', error);
        setLoading(false);
    };

    const loadObjects = async () => {
        const { data } = await supabase
            .from('cleaning_objects')
            .select('*')
            .eq('is_active', true)
            .order('name');

        if (data) setObjects(data);
    };

    const generateToken = () => {
        return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (isSubmittingRef.current) return;
        isSubmittingRef.current = true;
        setIsSubmitting(true);

        try {
            if (editingWorker) {
                const { error } = await supabase
                    .from('workers')
                    .update({
                        first_name: formData.first_name,
                        last_name: formData.last_name,
                        phone_number: formData.phone_number,
                        role_id: formData.role_id || null,
                        created_by: formData.created_by || null,
                    })
                    .eq('id', editingWorker.id);

                if (error) throw error;

                await supabase.from('worker_objects').delete().eq('worker_id', editingWorker.id);

                if (formData.selectedObjects.length > 0) {
                    console.log('Sending selected objects for EDIT:', formData.selectedObjects);
                    const uniqueObjectIds = Array.from(new Set(formData.selectedObjects.filter(Boolean)));
                    const workerObjects = uniqueObjectIds.map(objId => ({
                        worker_id: editingWorker.id,
                        object_id: objId,
                    }));

                    const { error: woError } = await supabase.from('worker_objects').insert(workerObjects);
                    if (woError) throw new Error('Ошибка при привязке объектов к работнику: ' + woError.message);
                }
            } else {
                const token = generateToken();
                const { data: newWorker, error } = await supabase
                    .from('workers')
                    .insert({
                        first_name: formData.first_name,
                        last_name: formData.last_name,
                        phone_number: formData.phone_number,
                        role_id: formData.role_id || null,
                        created_by: formData.created_by || adminUser?.id,
                        invitation_token: token,
                    })
                    .select()
                    .single();

                if (error) throw error;

                if (formData.selectedObjects.length > 0 && newWorker) {
                    console.log('Sending selected objects for NEW:', formData.selectedObjects);
                    const uniqueObjectIds = Array.from(new Set(formData.selectedObjects.filter(Boolean)));
                    const workerObjects = uniqueObjectIds.map(objId => ({
                        worker_id: newWorker.id,
                        object_id: objId,
                    }));
                    console.log('Final workerObjects array:', workerObjects);

                    const { error: woError } = await supabase.from('worker_objects').insert(workerObjects);
                    if (woError) {
                        alert('Работник создан, но произошла ошибка при привязке объектов: ' + woError.message);
                    }
                }
            }

            loadWorkers();
            closeModal();
        } catch (error) {
            console.error('Error saving worker:', error);
            const errorMessage = error instanceof Error ? error.message : JSON.stringify(error);
            alert(`Ошибка при сохранении работника: ${errorMessage}`);
        } finally {
            isSubmittingRef.current = false;
            setIsSubmitting(false);
        }
    };

    const handleQuickAddRole = async () => {
        if (!newRoleName.trim()) return;
        setIsSavingRole(true);
        try {
            const { data, error } = await supabase
                .from('worker_roles')
                .insert([{ name: newRoleName.trim() }])
                .select()
                .single();

            if (error) throw error;

            if (data) {
                setRoles(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
                setFormData(prev => ({ ...prev, role_id: data.id }));
                setIsAddingRole(false);
                setNewRoleName('');
            }
        } catch (error) {
            console.error('Error adding role:', error);
            alert('Ошибка при создании роли');
        } finally {
            setIsSavingRole(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Переместить работника в корзину?')) return;

        const deletedWorker = workers.find(w => w.id === id);
        const { error } = await supabase.rpc('soft_delete_worker', { p_worker_id: id });

        if (error) {
            console.error('Error deleting worker:', error);
            alert('Ошибка при удалении');
        } else {
            loadWorkers();
            if (selectedWorkers.has(id)) {
                const newSelected = new Set(selectedWorkers);
                newSelected.delete(id);
                setSelectedWorkers(newSelected);
            }
            pushUndo(`Работник «${deletedWorker?.first_name || ''} ${deletedWorker?.last_name || ''}» удалён`, async () => {
                await supabase.rpc('restore_from_trash', { item_type: 'workers', item_id: id });
                loadWorkers();
            });
        }
    };

    const handleBulkSendMessage = async () => {
        if (!bulkMessage.trim()) {
            alert('Введите сообщение');
            return;
        }

        setSendingBulk(true);
        let successCount = 0;
        let failCount = 0;

        try {
            // Send in parallel chunks of 5 (avoid hammering edge function with 50+ calls)
            const ids = Array.from(selectedWorkers);
            const CHUNK = 5;
            for (let i = 0; i < ids.length; i += CHUNK) {
                const chunk = ids.slice(i, i + CHUNK);
                const results = await Promise.allSettled(
                    chunk.map(workerId =>
                        supabase.functions.invoke('send-message', { body: { workerId, message: bulkMessage } })
                    )
                );
                results.forEach((r, idx) => {
                    if (r.status === 'fulfilled' && !r.value.error) successCount++;
                    else {
                        failCount++;
                        console.error(`Error sending to worker ${chunk[idx]}:`,
                            r.status === 'fulfilled' ? r.value.error : r.reason);
                    }
                });
            }

            // Log the action
            const { error: logError } = await supabase.from('system_logs').insert({
                level: 'info',
                category: 'bulk_message',
                message: `Рассылка сообщения ${selectedWorkers.size} работникам. Успешно: ${successCount}, Ошибок: ${failCount}. Текст: "${bulkMessage.substring(0, 50)}${bulkMessage.length > 50 ? '...' : ''}"`,
                metadata: {
                    total: selectedWorkers.size,
                    success: successCount,
                    failed: failCount,
                    message_preview: bulkMessage
                },
                admin_id: adminUser?.id
            });

            if (logError) {
                console.error('Failed to write log:', logError);
                alert('Сообщения отправлены, но не удалось сохранить лог! \nСкорее всего, вы не выполнили SQL скрипт "ENABLE_LOGS_INSERT.sql".');
            }

            alert(`Рассылка завершена.\nУспешно: ${successCount}\nОшибок: ${failCount}`);
            setBulkMessage('');
            setShowBulkModal(false);
            setSelectedWorkers(new Set());
        } catch (error) {
            console.error('Error in bulk sending:', error);

            // Log error
            await supabase.from('system_logs').insert({
                level: 'error',
                category: 'bulk_message',
                message: `Ошибка при рассылке сообщений: ${error instanceof Error ? error.message : 'Unknown error'}`,
                metadata: { error },
                admin_id: adminUser?.id
            });

            alert('Ошибка при рассылке');
        } finally {
            setSendingBulk(false);
        }
    };

    const handleSendMessage = async () => {
        if (!messageText.trim()) {
            alert('Введите сообщение');
            return;
        }
        if (messageRecipients.size === 0) {
            alert('Выберите хотя бы одного работника');
            return;
        }

        setSendingMessage(true);
        let successCount = 0;
        let failCount = 0;

        try {
            const ids = Array.from(messageRecipients);
            const CHUNK = 5;
            for (let i = 0; i < ids.length; i += CHUNK) {
                const chunk = ids.slice(i, i + CHUNK);
                const results = await Promise.allSettled(
                    chunk.map(workerId =>
                        supabase.functions.invoke('send-message', { body: { workerId, message: messageText } })
                    )
                );
                results.forEach((r, idx) => {
                    if (r.status === 'fulfilled' && !r.value.error) successCount++;
                    else {
                        failCount++;
                        console.error(`Error sending to worker ${chunk[idx]}:`,
                            r.status === 'fulfilled' ? r.value.error : r.reason);
                    }
                });
            }

            await supabase.from('system_logs').insert({
                level: 'info',
                category: 'bulk_message',
                message: `Сообщение ${messageRecipients.size} работникам. Успешно: ${successCount}, Ошибок: ${failCount}`,
                metadata: { total: messageRecipients.size, success: successCount, failed: failCount, message_preview: messageText },
                admin_id: adminUser?.id
            });

            alert(`Отправлено.\nУспешно: ${successCount}\nОшибок: ${failCount}`);
            setMessageText('');
            setShowMessageModal(false);
            setMessageRecipients(new Set());
            setMessageSearch('');
        } catch (error) {
            console.error('Error sending messages:', error);
            alert('Ошибка при отправке');
        } finally {
            setSendingMessage(false);
        }
    };

    const activeWorkers = workers.filter(w => w.telegram_chat_id && w.is_active);

    const filteredMessageWorkers = activeWorkers.filter(w => {
        if (!messageSearch.trim()) return true;
        const q = messageSearch.toLowerCase();
        return `${w.first_name} ${w.last_name}`.toLowerCase().includes(q);
    });

    const toggleMessageRecipient = (id: string) => {
        const next = new Set(messageRecipients);
        if (next.has(id)) next.delete(id); else next.add(id);
        setMessageRecipients(next);
    };

    const toggleAllMessageRecipients = () => {
        if (messageRecipients.size === activeWorkers.length) {
            setMessageRecipients(new Set());
        } else {
            setMessageRecipients(new Set(activeWorkers.map(w => w.id)));
        }
    };

    const copyInvitationLink = (token: string) => {
        const botUsername = 'reefa_worktime_bot';
        const link = `https://t.me/${botUsername}?start=${token}`;
        navigator.clipboard.writeText(link);
        setCopiedToken(token);
        setTimeout(() => setCopiedToken(null), 2000);
    };

    const regenerateToken = async (worker: Worker) => {
        if (!confirm(`Сгенерировать новую ссылку активации для ${worker.first_name} ${worker.last_name}?\n\nЭто сбросит текущее подключение к Telegram (если есть).`)) return;
        const newToken = generateToken();
        const { error } = await supabase
            .from('workers')
            .update({
                invitation_token: newToken,
                telegram_user_id: null,
                telegram_chat_id: null,
                telegram_username: null,
                is_active: false,
            })
            .eq('id', worker.id);

        if (error) {
            console.error('Error regenerating token:', error);
            alert('Ошибка при генерации новой ссылки: ' + error.message);
            return;
        }

        copyInvitationLink(newToken);
        alert('✅ Новая ссылка сгенерирована и скопирована в буфер обмена!');
        loadWorkers();
    };

    const openModal = (worker?: Worker) => {
        if (worker) {
            setEditingWorker(worker);
            setFormData({
                first_name: worker.first_name,
                last_name: worker.last_name,
                phone_number: worker.phone_number,
                role_id: worker.role_id || '',
                created_by: worker.created_by || '',
                selectedObjects: [],
            });

            supabase
                .from('worker_objects')
                .select('object_id')
                .eq('worker_id', worker.id)
                .then(({ data }: any) => {
                    if (data) {
                        setFormData(prev => ({
                            ...prev,
                            selectedObjects: data.map((wo: any) => wo.object_id),
                        }));
                    }
                });
        } else {
            setEditingWorker(null);
            setFormData({
                first_name: '',
                last_name: '',
                phone_number: '',
                role_id: '',
                created_by: '',
                selectedObjects: [],
            });
        }
        setShowModal(true);
    };

    const closeModal = () => {
        setShowModal(false);
        setEditingWorker(null);
    };

    const toggleSelectAll = () => {
        if (selectedWorkers.size === workers.length) {
            setSelectedWorkers(new Set());
        } else {
            setSelectedWorkers(new Set(workers.map(w => w.id)));
        }
    };

    const toggleSelectWorker = (id: string) => {
        const newSelected = new Set(selectedWorkers);
        if (newSelected.has(id)) {
            newSelected.delete(id);
        } else {
            newSelected.add(id);
        }
        setSelectedWorkers(newSelected);
    };

    const filteredWorkers = workers.filter(worker => {
        const query = searchQuery.toLowerCase().trim();
        if (!query) return true;

        const fullName = `${worker.first_name} ${worker.last_name}`.toLowerCase();
        const role = (worker.worker_roles?.name || worker.role || '').toLowerCase();
        const phone = (worker.phone_number || '').toLowerCase();
        const telegram = (worker.telegram_username || '').toLowerCase();

        return fullName.includes(query) || role.includes(query) || phone.includes(query) || telegram.includes(query);
    });

    if (loading) {
        return (
            <div className="flex justify-center items-center h-64">
                <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    const canWrite = adminUser?.role === 'super_admin' || adminUser?.permissions?.workers_write;

    return (
        <div>
            {/* ---- Row 1: tabs ---- */}
            <div className="tabs mb-4">
                <button
                    onClick={() => setActiveTab('list')}
                    className={`tab ${activeTab === 'list' ? 'is-active' : ''}`}
                    aria-selected={activeTab === 'list'}
                >
                    Список
                    <span className="badge-neutral">{workers.length}</span>
                </button>
                <button
                    onClick={() => setActiveTab('salaries')}
                    className={`tab ${activeTab === 'salaries' ? 'is-active' : ''}`}
                    aria-selected={activeTab === 'salaries'}
                >
                    Зарплаты
                </button>
            </div>

            {/* ---- Row 2: action toolbar (list tab only) ---- */}
            {activeTab === 'list' && (
                <div className="flex flex-wrap items-center gap-2 mb-5">
                    {selectedWorkers.size > 0 ? (
                        <>
                            <span className="text-sm text-muted">
                                Выбрано: <span className="font-medium text-main">{selectedWorkers.size}</span>
                            </span>
                            <button
                                onClick={() => setShowBulkModal(true)}
                                className="btn-primary"
                            >
                                <MessageSquare className="w-4 h-4" />
                                Написать выбранным
                            </button>
                            <button
                                onClick={() => setSelectedWorkers(new Set())}
                                className="btn-ghost"
                            >
                                Снять выбор
                            </button>
                        </>
                    ) : (
                        <>
                            <div className="flex-1" />
                            {adminUser?.role === 'super_admin' && (
                                <button
                                    onClick={() => { setShowMessageModal(true); setMessageRecipients(new Set()); setMessageText(''); setMessageSearch(''); }}
                                    className="btn-secondary"
                                >
                                    <MessageSquare className="w-4 h-4" />
                                    <span className="hidden sm:inline">Написать</span>
                                </button>
                            )}
                            {(adminUser?.role === 'super_admin' || adminUser?.permissions?.workers_create) && (
                                <button onClick={() => openModal()} className="btn-primary">
                                    <Plus className="w-4 h-4" />
                                    <span className="hidden sm:inline">Добавить работника</span>
                                    <span className="sm:hidden">Добавить</span>
                                </button>
                            )}
                        </>
                    )}
                </div>
            )}

            {activeTab === 'salaries' && <SalariesTab />}

            {activeTab === 'list' && <>
                {/* Mobile cards */}
                <div className="flex flex-col gap-2 sm:hidden">
                    {filteredWorkers.map((worker) => {
                        const initials = `${worker.first_name?.[0] || ''}${worker.last_name?.[0] || ''}`.toUpperCase();
                        const isSelected = selectedWorkers.has(worker.id);
                        return (
                            <div
                                key={worker.id}
                                className={`p-3 rounded-lg border transition-colors ${
                                    isSelected
                                        ? 'bg-primary/5 border-primary/40'
                                        : 'border-border bg-card'
                                }`}
                            >
                                <div className="flex items-stretch gap-3">
                                    {/* Checkbox — own click zone */}
                                    <label
                                        className="flex items-center pl-0.5 pr-1 cursor-pointer"
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={isSelected}
                                            onChange={() => toggleSelectWorker(worker.id)}
                                            className="rounded border-border accent-primary"
                                            style={{ width: 20, height: 20 }}
                                        />
                                    </label>

                                    {/* Body — single click target opens details */}
                                    <button
                                        type="button"
                                        onClick={() => setViewingWorker(worker)}
                                        className="flex items-center gap-3 min-w-0 flex-1 py-1 text-left focus-ring rounded-md"
                                    >
                                        <div className="w-10 h-10 rounded-full bg-subtle border border-border flex items-center justify-center text-xs font-semibold text-main shrink-0">
                                            {initials || '·'}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <div className="font-medium text-main truncate">{worker.first_name} {worker.last_name}</div>
                                            <div className="text-xs text-muted truncate">
                                                {worker.worker_roles?.name || worker.role || '—'}
                                                {worker.phone_number && <span className="text-faint"> · {worker.phone_number}</span>}
                                            </div>
                                            <div className="mt-1.5">
                                                {!worker.telegram_user_id ? (
                                                    <span className="badge-danger"><span className="badge-dot" style={{ background: 'var(--danger-fg)' }} />Не активен</span>
                                                ) : worker.is_active ? (
                                                    <span className="badge-success"><span className="badge-dot" style={{ background: 'var(--success-fg)' }} />Активен</span>
                                                ) : (
                                                    <span className="badge-neutral"><span className="badge-dot" />Off</span>
                                                )}
                                            </div>
                                        </div>
                                    </button>

                                    {/* Action stack — own click zone */}
                                    <div className="flex flex-col gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                                        <button
                                            onClick={() => setHistoryWorker(worker)}
                                            className="btn-icon"
                                            aria-label="История смен"
                                            title="История смен"
                                            style={{ width: 36, height: 36 }}
                                        >
                                            <History size={16} />
                                        </button>
                                        {canWrite && (adminUser?.role === 'super_admin' || adminUser?.permissions?.workers_edit) && (
                                            <button
                                                onClick={() => openModal(worker)}
                                                className="btn-icon"
                                                aria-label="Редактировать"
                                                title="Редактировать"
                                                style={{ width: 36, height: 36 }}
                                            >
                                                <Edit2 size={16} />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                    {filteredWorkers.length === 0 && (
                        <div className="empty-state">
                            <Users className="empty-state-icon" />
                            <div className="empty-state-title">Работники не найдены</div>
                            <div className="empty-state-desc">Попробуйте изменить фильтр или добавьте первого работника.</div>
                        </div>
                    )}
                </div>
                {/* Desktop table */}
                <div className="table-container hidden sm:block">
                <table className="table">
                    <thead>
                        <tr>
                            <th className="w-10">
                                <input
                                    type="checkbox"
                                    checked={workers.length > 0 && selectedWorkers.size === workers.length}
                                    onChange={toggleSelectAll}
                                    className="rounded border-border text-main focus:ring-1 focus:ring-main"
                                />
                            </th>
                            <th>Имя</th>
                            <th>Роль</th>
                            <th className="hidden sm:table-cell">Телефон</th>
                            <th className="hidden sm:table-cell">Telegram</th>
                            <th className="hidden md:table-cell">Опекун</th>
                            <th>Статус</th>
                            <th className="text-right">Действия</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredWorkers.map((worker) => (
                            <tr
                                key={worker.id}
                                className={`group cursor-pointer ${selectedWorkers.has(worker.id) ? 'bg-primary/5' : ''}`}
                                onClick={() => setViewingWorker(worker)}
                            >
                                <td onClick={(e) => e.stopPropagation()}>
                                    <input
                                        type="checkbox"
                                        checked={selectedWorkers.has(worker.id)}
                                        onChange={() => toggleSelectWorker(worker.id)}
                                        className="rounded border-border accent-primary"
                                        style={{ width: 16, height: 16 }}
                                    />
                                </td>
                                <td className="font-medium text-main">
                                    {worker.first_name} {worker.last_name}
                                </td>
                                <td className="text-muted">
                                    {worker.worker_roles?.name || worker.role || '—'}
                                </td>
                                <td className="text-muted font-mono text-xs hidden sm:table-cell">{worker.phone_number}</td>
                                <td className="text-muted hidden sm:table-cell" onClick={(e) => e.stopPropagation()}>
                                    {worker.telegram_username ? (
                                        <a
                                            href={`https://t.me/${worker.telegram_username}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="hover:underline"
                                            style={{ color: 'var(--accent)' }}
                                        >
                                            @{worker.telegram_username}
                                        </a>
                                    ) : (
                                        <span className="text-faint">Не активирован</span>
                                    )}
                                </td>
                                <td className="text-muted hidden md:table-cell">
                                    {(worker as any).created_by && creators[(worker as any).created_by] ? creators[(worker as any).created_by] : '—'}
                                </td>
                                <td>
                                    {!worker.telegram_user_id ? (
                                        <span className="badge-danger">
                                            <span className="badge-dot" style={{ background: 'var(--danger-fg)' }} />
                                            Не активен
                                        </span>
                                    ) : worker.is_active ? (
                                        <span className="badge-success">
                                            <span className="badge-dot" style={{ background: 'var(--success-fg)' }} />
                                            Активен
                                        </span>
                                    ) : (
                                        <span className="badge-neutral">
                                            <span className="badge-dot" />
                                            Off
                                        </span>
                                    )}
                                </td>
                                <td className="text-right" onClick={(e) => e.stopPropagation()}>
                                    <div className="flex items-center justify-end gap-0.5 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                                        <button
                                            onClick={() => setHistoryWorker(worker)}
                                            className="btn-icon"
                                            title="История работы"
                                        >
                                            <History size={16} />
                                        </button>
                                        {canWrite && (
                                            <>
                                                {(adminUser?.role === 'super_admin' || adminUser?.permissions?.workers_edit) && (
                                                    <button
                                                        onClick={() => openModal(worker)}
                                                        className="btn-icon"
                                                        title="Редактировать"
                                                    >
                                                        <Edit2 size={16} />
                                                    </button>
                                                )}
                                                {(!worker.telegram_user_id || !worker.is_active) && worker.invitation_token && (
                                                    <button
                                                        onClick={() => copyInvitationLink(worker.invitation_token)}
                                                        className="btn-icon"
                                                        title="Скопировать ссылку активации"
                                                    >
                                                        {copiedToken === worker.invitation_token ? (
                                                            <Check size={16} style={{ color: 'var(--success-fg)' }} />
                                                        ) : (
                                                            <Copy size={16} />
                                                        )}
                                                    </button>
                                                )}
                                                <button
                                                    onClick={() => regenerateToken(worker)}
                                                    className="btn-icon"
                                                    title="Сгенерировать новую ссылку активации"
                                                >
                                                    <RefreshCw size={16} />
                                                </button>
                                                {(adminUser?.role === 'super_admin' || adminUser?.permissions?.workers_delete) && (
                                                    <button
                                                        onClick={() => handleDelete(worker.id)}
                                                        className="btn-icon"
                                                        title="Удалить"
                                                        style={{ color: 'var(--danger-fg)' }}
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>
                                                )}
                                            </>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        ))}
                        {filteredWorkers.length === 0 && (
                            <tr>
                                <td colSpan={8}>
                                    <div className="empty-state">
                                        <Users className="empty-state-icon" />
                                        <div className="empty-state-title">Работники не найдены</div>
                                        <div className="empty-state-desc">Попробуйте изменить фильтр или добавьте первого работника.</div>
                                    </div>
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
                </div>
            </>}

            {/* Modal */}
            {showModal && createPortal(
                <div className="modal-overlay" onClick={closeModal}>
                    <div className="modal-content" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3 className="text-xl font-bold text-main">
                                {editingWorker ? 'Редактировать работника' : 'Новый работник'}
                            </h3>
                            <button onClick={closeModal} className="btn-icon">
                                <span className="text-2xl leading-none">&times;</span>
                            </button>
                        </div>

                        <form onSubmit={handleSubmit}>
                            <div className="modal-body space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-main mb-1">Имя</label>
                                        <input
                                            type="text"
                                            value={formData.first_name}
                                            onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                                            className="input"
                                            required
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-main mb-1">Фамилия</label>
                                        <input
                                            type="text"
                                            value={formData.last_name}
                                            onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                                            className="input"
                                            required
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-main mb-1">Телефон</label>
                                    <input
                                        type="tel"
                                        value={formData.phone_number}
                                        onChange={(e) => setFormData({ ...formData, phone_number: e.target.value })}
                                        className="input"
                                    />
                                </div>

                                <div>
                                    <div className="flex justify-between items-center mb-1">
                                        <label className="block text-sm font-medium text-main">Роль</label>
                                        {!isAddingRole && (
                                            <button
                                                type="button"
                                                onClick={() => setIsAddingRole(true)}
                                                className="text-xs text-primary hover:text-primary font-medium"
                                            >
                                                + Добавить новую
                                            </button>
                                        )}
                                    </div>

                                    {isAddingRole ? (
                                        <div className="flex gap-2">
                                            <input
                                                type="text"
                                                value={newRoleName}
                                                onChange={(e) => setNewRoleName(e.target.value)}
                                                placeholder="Название роли..."
                                                className="input flex-1"
                                                autoFocus
                                            />
                                            <button
                                                type="button"
                                                onClick={handleQuickAddRole}
                                                disabled={isSavingRole || !newRoleName.trim()}
                                                className="btn-primary px-3"
                                            >
                                                {isSavingRole ? '...' : <Check size={18} />}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => { setIsAddingRole(false); setNewRoleName(''); }}
                                                className="btn-secondary px-3"
                                            >
                                                &times;
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="relative">
                                            <select
                                                value={formData.role_id}
                                                onChange={(e) => setFormData({ ...formData, role_id: e.target.value })}
                                                className="input appearance-none"
                                            >
                                                <option value="">Выберите роль</option>
                                                {roles.map(role => (
                                                    <option key={role.id} value={role.id}>{role.name}</option>
                                                ))}
                                            </select>
                                        </div>
                                    )}
                                </div>

                                {adminUser?.role === 'super_admin' && (
                                    <div>
                                        <label className="block text-sm font-medium text-main mb-1">Опекун (кто видит работника)</label>
                                        <div className="relative">
                                            <select
                                                value={formData.created_by}
                                                onChange={(e) => setFormData({ ...formData, created_by: e.target.value })}
                                                className="input appearance-none"
                                            >
                                                <option value="">Без опекуна (Виден всем супер-админам)</option>
                                                {Object.entries(creators).map(([id, name]) => (
                                                    <option key={id} value={id}>{name}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>
                                )}

                                <div>
                                    <label className="block text-sm font-medium text-main mb-2">Объекты работы</label>
                                    <div className="bg-subtle/50 rounded-lg p-3 max-h-40 overflow-y-auto border border-border">
                                        {objects.map((obj) => (
                                            <label key={obj.id} className="flex items-center gap-2 p-2 hover:bg-white dark:hover:bg-gray-800 rounded cursor-pointer transition-colors">
                                                <input
                                                    type="checkbox"
                                                    checked={formData.selectedObjects.includes(obj.id)}
                                                    onChange={(e) => {
                                                        if (e.target.checked) {
                                                            setFormData(prev => ({
                                                                ...prev,
                                                                selectedObjects: Array.from(new Set([...prev.selectedObjects, obj.id])),
                                                            }));
                                                        } else {
                                                            setFormData(prev => ({
                                                                ...prev,
                                                                selectedObjects: prev.selectedObjects.filter(id => id !== obj.id),
                                                            }));
                                                        }
                                                    }}
                                                    className="rounded border-gray-300 dark:border-gray-600 text-primary focus:ring-primary-500"
                                                />
                                                <span className="text-main">{obj.name}</span>
                                                <span className="text-gray-500 text-xs ml-auto">{obj.address}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            <div className="modal-footer">
                                <button type="button" onClick={closeModal} className="btn-secondary flex-1" disabled={isSubmitting}>
                                    Отмена
                                </button>
                                <button type="submit" className="btn-primary flex-1 whitespace-nowrap" disabled={isSubmitting}>
                                    {isSubmitting ? 'Сохранение...' : (editingWorker ? 'Сохранить' : 'Создать')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            , document.body)}

            {/* Bulk Message Modal */}
            {showBulkModal && createPortal(
                <div className="modal-overlay" onClick={() => setShowBulkModal(false)}>
                    <div className="modal-content max-w-md" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3 className="text-xl font-bold text-main">
                                Написать {selectedWorkers.size} работникам
                            </h3>
                            <button onClick={() => setShowBulkModal(false)} className="btn-icon">
                                <span className="text-2xl leading-none">&times;</span>
                            </button>
                        </div>

                        <div className="modal-body space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-main mb-2">Сообщение</label>
                                <textarea
                                    value={bulkMessage}
                                    onChange={(e) => setBulkMessage(e.target.value)}
                                    className="input min-h-[100px]"
                                    placeholder="Введите текст рассылки..."
                                />
                            </div>
                        </div>

                        <div className="modal-footer">
                            <button
                                onClick={() => setShowBulkModal(false)}
                                disabled={sendingBulk}
                                className="btn-secondary flex-1"
                            >
                                Отмена
                            </button>
                            <button
                                onClick={handleBulkSendMessage}
                                disabled={sendingBulk || !bulkMessage.trim()}
                                className="btn-primary flex-1 flex items-center justify-center gap-2"
                            >
                                {sendingBulk ? 'Отправка...' : 'Отправить'}
                                <Send className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                </div>
            , document.body)}

            {/* Send Message Modal */}
            {showMessageModal && createPortal(
                <div className="modal-overlay" onClick={() => setShowMessageModal(false)}>
                    <div className="modal-content sm:max-w-lg" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3 className="text-xl font-bold text-main">Написать работникам</h3>
                            <button onClick={() => setShowMessageModal(false)} className="btn-icon">
                                <X className="w-6 h-6" />
                            </button>
                        </div>
                        <div className="modal-body space-y-4">
                            {/* Select recipients */}
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <label className="text-sm font-medium text-main">
                                        Получатели ({messageRecipients.size} из {activeWorkers.length})
                                    </label>
                                    <button
                                        type="button"
                                        onClick={toggleAllMessageRecipients}
                                        className="text-xs text-primary hover:underline"
                                    >
                                        {messageRecipients.size === activeWorkers.length ? 'Снять всех' : 'Выбрать всех'}
                                    </button>
                                </div>
                                <div className="relative mb-2">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
                                    <input
                                        type="text"
                                        value={messageSearch}
                                        onChange={(e) => setMessageSearch(e.target.value)}
                                        placeholder="Поиск..."
                                        className="input pl-10 h-9 w-full text-sm"
                                    />
                                </div>
                                <div className="max-h-48 overflow-y-auto border border-border rounded-lg divide-y divide-border">
                                    {filteredMessageWorkers.map(w => (
                                        <label key={w.id} className="flex items-center gap-3 px-3 py-2 hover:bg-subtle cursor-pointer transition-colors">
                                            <input
                                                type="checkbox"
                                                checked={messageRecipients.has(w.id)}
                                                onChange={() => toggleMessageRecipient(w.id)}
                                                className="rounded border-border text-primary focus:ring-1 focus:ring-primary"
                                            />
                                            <span className="text-sm text-main">{w.first_name} {w.last_name}</span>
                                            {w.telegram_username && (
                                                <span className="text-xs text-muted ml-auto">@{w.telegram_username}</span>
                                            )}
                                        </label>
                                    ))}
                                    {filteredMessageWorkers.length === 0 && (
                                        <div className="text-center text-muted text-sm py-4">Не найдено</div>
                                    )}
                                </div>
                            </div>

                            {/* Message text */}
                            <div>
                                <label className="block text-sm font-medium text-main mb-1">Сообщение</label>
                                <textarea
                                    value={messageText}
                                    onChange={(e) => setMessageText(e.target.value)}
                                    className="input min-h-[100px]"
                                    placeholder="Введите текст сообщения..."
                                />
                            </div>
                        </div>
                        <div className="modal-footer flex gap-3">
                            <button
                                onClick={() => setShowMessageModal(false)}
                                className="btn-secondary flex-1"
                            >
                                Отмена
                            </button>
                            <button
                                onClick={handleSendMessage}
                                disabled={sendingMessage || !messageText.trim() || messageRecipients.size === 0}
                                className="btn-primary flex-1 flex items-center justify-center gap-2"
                            >
                                {sendingMessage ? 'Отправка...' : `Отправить (${messageRecipients.size})`}
                                <Send className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                </div>
            , document.body)}

            {historyWorker && (
                <WorkSessionsModal
                    workerId={historyWorker.id}
                    workerName={`${historyWorker.first_name} ${historyWorker.last_name}`}
                    onClose={() => setHistoryWorker(null)}
                />
            )}

            {viewingWorker && (
                <WorkerDetailsModal
                    worker={viewingWorker}
                    onClose={() => setViewingWorker(null)}
                    onEdit={
                        (adminUser?.role === 'super_admin' || adminUser?.permissions?.workers_edit)
                            ? () => {
                                const w = viewingWorker;
                                setViewingWorker(null);
                                openModal(w);
                            }
                            : undefined
                    }
                />
            )}
        </div>
    );
}

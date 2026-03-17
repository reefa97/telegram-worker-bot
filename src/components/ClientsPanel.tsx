
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import {
    User, Plus, Trash2, Building2, Search, ChevronDown, ChevronUp,
    X, Check, Mail, Eye, EyeOff, MessageSquare, Save, Loader2
} from 'lucide-react';

interface ClientUser {
    id: string;
    email: string;
    name?: string | null;
    role: string;
    created_at: string;
    plain_password?: string | null;
    objects?: { object_id: string; object_name: string }[];
}

interface ClientRequest {
    id: string;
    message: string;
    status: string;
    created_at: string;
    object_id: string;
    cleaning_objects?: { name: string } | null;
}

interface CleaningObject {
    id: string;
    name: string;
}

export default function ClientsPanel() {
    const { adminUser } = useAuth();
    const [clients, setClients] = useState<ClientUser[]>([]);
    const [allObjects, setAllObjects] = useState<CleaningObject[]>([]);
    const [loading, setLoading] = useState(true);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [expandedClient, setExpandedClient] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');

    const [formData, setFormData] = useState({
        name: '',
        email: '',
        password: '',
        selectedObjects: [] as string[],
    });

    // Detail modal
    const [detailClient, setDetailClient] = useState<ClientUser | null>(null);
    const [detailTab, setDetailTab] = useState<'account' | 'requests'>('account');
    const [requests, setRequests] = useState<ClientRequest[]>([]);
    const [requestsLoading, setRequestsLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [editForm, setEditForm] = useState({ name: '', email: '', password: '' });
    const [editSaving, setEditSaving] = useState(false);

    const canManageClients = adminUser?.role === 'super_admin';

    const openDetail = (client: ClientUser) => {
        setDetailClient(client);
        setDetailTab('account');
        setShowPassword(false);
        setEditForm({ name: client.name || '', email: client.email, password: '' });
        setRequests([]);
    };

    const loadRequests = async (clientId: string) => {
        setRequestsLoading(true);
        const { data: reqData } = await supabase
            .from('client_requests')
            .select('id, message, status, created_at, object_id')
            .eq('client_id', clientId)
            .order('created_at', { ascending: false });

        if (!reqData) { setRequestsLoading(false); return; }

        // Enrich with object names
        const objectIds = [...new Set(reqData.map(r => r.object_id).filter(Boolean))];
        let objectNames: Record<string, string> = {};
        if (objectIds.length > 0) {
            const { data: objs } = await supabase
                .from('cleaning_objects')
                .select('id, name')
                .in('id', objectIds);
            (objs || []).forEach((o: any) => { objectNames[o.id] = o.name; });
        }

        setRequests(reqData.map(r => ({
            ...r,
            cleaning_objects: r.object_id ? { name: objectNames[r.object_id] || '—' } : null
        })));
        setRequestsLoading(false);
    };

    useEffect(() => {
        if (detailClient && detailTab === 'requests') {
            loadRequests(detailClient.id);
        }
    }, [detailClient, detailTab]);

    const handleEditSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!detailClient) return;
        setEditSaving(true);
        try {
            const body: Record<string, string> = { clientId: detailClient.id, name: editForm.name };
            if (editForm.email && editForm.email !== detailClient.email) body.email = editForm.email;
            if (editForm.password) body.password = editForm.password;

            const response = await supabase.functions.invoke('update-client-credentials', { body });
            if (response.error) throw new Error(response.error.message);
            if (response.data?.error) throw new Error(response.data.error);

            // Refresh list and update detailClient
            await loadClients(true);
            setEditForm(prev => ({ ...prev, password: '' }));
            alert('Сохранено');
        } catch (err: any) {
            alert(`Ошибка: ${err.message}`);
        } finally {
            setEditSaving(false);
        }
    };

    const handleDeleteRequest = async (requestId: string) => {
        if (!confirm('Удалить эту просьбу?')) return;
        await supabase.from('client_requests').delete().eq('id', requestId);
        setRequests(prev => prev.filter(r => r.id !== requestId));
    };

    useEffect(() => {
        if (canManageClients) {
            loadClients();
            loadObjects();
        }
    }, [canManageClients]);

    const loadObjects = async () => {
        const { data } = await supabase
            .from('cleaning_objects')
            .select('id, name')
            .eq('is_active', true)
            .order('name');
        if (data) setAllObjects(data);
    };

    const loadClients = async (silent = false) => {
        if (!silent) setLoading(true);
        const { data: clientsData, error } = await supabase
            .from('admin_users')
            .select('*')
            .eq('role', 'client')
            .order('created_at', { ascending: false });

        if (error) { if (!silent) setLoading(false); return; }

        const { data: links } = await supabase
            .from('client_objects')
            .select('client_id, object_id, cleaning_objects(id, name)');

        const enrichedClients = (clientsData || []).map((c: any) => ({
            ...c,
            objects: (links || [])
                .filter((l: any) => l.client_id === c.id)
                .map((l: any) => ({ object_id: l.object_id, object_name: l.cleaning_objects?.name || 'Obiekt' }))
        }));

        setClients(enrichedClients);
        // Sync detailClient if open (use functional update to get fresh state)
        setDetailClient(prev => {
            if (!prev) return prev;
            const updated = enrichedClients.find(c => c.id === prev.id);
            return updated || prev;
        });
        if (!silent) setLoading(false);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const response = await supabase.functions.invoke('create-admin', {
                body: {
                    name: formData.name.trim(),
                    email: formData.email.trim(),
                    password: formData.password,
                    role: 'client',
                    createdBy: adminUser?.id,
                },
            });

            if (response.error) {
                let errorMsg = 'Unknown error';
                try {
                    const ctx = response.error.context;
                    if (ctx instanceof Response) {
                        const body = await ctx.json();
                        errorMsg = body?.error || JSON.stringify(body);
                    } else if (ctx && typeof ctx === 'object') {
                        errorMsg = ctx.error || JSON.stringify(ctx);
                    } else {
                        errorMsg = response.error.message || String(response.error);
                    }
                } catch { errorMsg = response.error.message || String(response.error); }
                throw new Error(errorMsg);
            }
            if (response.data?.error) throw new Error(response.data.error);

            const { data: newClient } = await supabase
                .from('admin_users').select('id').eq('email', formData.email.trim()).maybeSingle();

            if (newClient && formData.selectedObjects.length > 0) {
                await supabase.from('client_objects').insert(
                    formData.selectedObjects.map(objectId => ({ client_id: newClient.id, object_id: objectId }))
                );
            }

            loadClients(true);
            setShowCreateModal(false);
            setFormData({ name: '', email: '', password: '', selectedObjects: [] });
            alert('Клиент создан успешно');
        } catch (error: any) {
            alert(`Ошибка: ${error?.message || error}`);
        }
    };

    const handleDelete = async (id: string, nameOrEmail: string) => {
        if (!confirm(`Удалить клиента ${nameOrEmail}?`)) return;
        try {
            await supabase.from('client_objects').delete().eq('client_id', id);
            const response = await supabase.functions.invoke('delete-super-admin', {
                body: { adminId: id, requesterId: adminUser?.id },
            });
            if (response.error) throw response.error;
            if (detailClient?.id === id) setDetailClient(null);
            loadClients(true);
        } catch (error) {
            alert('Ошибка при удалении');
        }
    };

    const handleUpdateObjects = async (clientId: string, newObjects: string[]) => {
        try {
            await supabase.from('client_objects').delete().eq('client_id', clientId);
            if (newObjects.length > 0) {
                await supabase.from('client_objects').insert(
                    newObjects.map(objectId => ({ client_id: clientId, object_id: objectId }))
                );
            }
            loadClients(true);
        } catch { alert('Ошибка при обновлении объектов'); }
    };

    const toggleObjectSelection = (objectId: string) => {
        setFormData(prev => ({
            ...prev,
            selectedObjects: prev.selectedObjects.includes(objectId)
                ? prev.selectedObjects.filter(id => id !== objectId)
                : [...prev.selectedObjects, objectId]
        }));
    };

    const filteredClients = clients.filter(c =>
        c.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (c.name && c.name.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    const statusLabel: Record<string, string> = {
        new: 'Новая',
        in_progress: 'В работе',
        done: 'Выполнено',
    };
    const statusClass: Record<string, string> = {
        new: 'badge-danger',
        in_progress: 'badge-neutral',
        done: 'badge-success',
    };

    if (!canManageClients) {
        return (
            <div className="card flex flex-col items-center justify-center py-16 text-center">
                <div className="w-16 h-16 bg-subtle rounded-full flex items-center justify-center mb-4">
                    <User className="w-8 h-8 text-muted" />
                </div>
                <h3 className="text-lg font-medium text-main mb-2">Доступ запрещен</h3>
                <p className="text-muted max-w-sm">Только Super Admin может управлять клиентами</p>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="flex justify-center items-center h-64">
                <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-main">Клиенты</h2>
                    <p className="text-sm text-muted">Управление учетными записями клиентов ({clients.length})</p>
                </div>
                <button onClick={() => setShowCreateModal(true)} className="btn-primary flex items-center gap-2">
                    <Plus className="w-4 h-4" />
                    Добавить клиента
                </button>
            </div>

            {/* Search */}
            {clients.length > 0 && (
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
                    <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Поиск по имени или email..."
                        className="input pl-10"
                    />
                </div>
            )}

            {/* Clients Grid */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {filteredClients.map((client) => (
                    <div
                        key={client.id}
                        className="card p-5 hover:border-primary/30 transition-colors cursor-pointer"
                        onClick={() => openDetail(client)}
                    >
                        <div className="flex items-start justify-between mb-3">
                            <div className="flex items-center gap-3 min-w-0">
                                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold shrink-0">
                                    {(client.name || client.email)[0].toUpperCase()}
                                </div>
                                <div className="min-w-0">
                                    <div className="font-bold text-main truncate" title={client.name || client.email}>
                                        {client.name || 'Без имени'}
                                    </div>
                                    <div className="text-sm text-muted flex items-center gap-1.5 truncate">
                                        <Mail className="w-3 h-3 shrink-0" />
                                        <span className="truncate" title={client.email}>{client.email}</span>
                                    </div>
                                </div>
                            </div>
                            <button
                                onClick={(e) => { e.stopPropagation(); handleDelete(client.id, client.name || client.email); }}
                                className="text-muted hover:text-danger p-1 rounded-md transition-colors shrink-0"
                                title="Удалить клиента"
                            >
                                <Trash2 size={16} />
                            </button>
                        </div>

                        <div className="flex items-center gap-2 text-xs text-muted">
                            <Building2 size={12} className="shrink-0" />
                            <span>{client.objects?.length || 0} объект{(() => { const n = client.objects?.length || 0; if (n === 1) return ''; if (n >= 2 && n <= 4) return 'а'; return 'ов'; })()}</span>
                            <span className="ml-auto text-primary/70">Нажмите для подробностей →</span>
                        </div>
                    </div>
                ))}
            </div>

            {filteredClients.length === 0 && (
                <div className="card p-12 text-center text-muted flex flex-col items-center">
                    <User className="w-12 h-12 mb-3 opacity-20" />
                    {searchTerm ? (
                        <p>Ничего не найдено по запросу "{searchTerm}"</p>
                    ) : (
                        <>
                            <p>Клиентов пока нет</p>
                            <p className="text-sm mt-1">Добавьте первого клиента, чтобы предоставить доступ к кабинету</p>
                        </>
                    )}
                </div>
            )}

            {/* ── Client Detail Modal ── */}
            {detailClient && createPortal(
                <div className="modal-overlay animate-fadeIn" onClick={() => setDetailClient(null)}>
                    <div
                        className="modal-content animate-scaleIn max-h-[90vh] flex flex-col w-full max-w-lg"
                        onClick={e => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="modal-header">
                            <div className="flex items-center gap-3 min-w-0">
                                <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold shrink-0">
                                    {(detailClient.name || detailClient.email)[0].toUpperCase()}
                                </div>
                                <div className="min-w-0">
                                    <div className="font-bold text-main truncate">{detailClient.name || 'Без имени'}</div>
                                    <div className="text-xs text-muted truncate">{detailClient.email}</div>
                                </div>
                            </div>
                            <button onClick={() => setDetailClient(null)} className="btn-icon shrink-0"><X size={20} /></button>
                        </div>

                        {/* Tabs */}
                        <div className="flex border-b border-border px-4 shrink-0">
                            <button
                                onClick={() => setDetailTab('account')}
                                className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors flex items-center gap-1.5 ${detailTab === 'account' ? 'border-primary text-primary' : 'border-transparent text-muted hover:text-main'}`}
                            >
                                <User size={14} /> Аккаунт
                            </button>
                            <button
                                onClick={() => setDetailTab('requests')}
                                className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors flex items-center gap-1.5 ${detailTab === 'requests' ? 'border-primary text-primary' : 'border-transparent text-muted hover:text-main'}`}
                            >
                                <MessageSquare size={14} /> Просьбы
                            </button>
                        </div>

                        <div className="modal-body overflow-y-auto flex-1">
                            {/* ── Account Tab ── */}
                            {detailTab === 'account' && (
                                <form onSubmit={handleEditSubmit} className="space-y-4">
                                    <div>
                                        <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1.5">Имя / Название компании</label>
                                        <input
                                            type="text"
                                            value={editForm.name}
                                            onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                                            className="input"
                                            placeholder="Название компании"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1.5">Email (логин)</label>
                                        <input
                                            type="email"
                                            value={editForm.email}
                                            onChange={e => setEditForm({ ...editForm, email: e.target.value })}
                                            className="input"
                                            required
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1.5">
                                            Пароль
                                        </label>
                                        <div className="relative">
                                            <input
                                                type={showPassword ? 'text' : 'password'}
                                                value={showPassword && !editForm.password ? (detailClient.plain_password || '') : editForm.password}
                                                onChange={e => setEditForm({ ...editForm, password: e.target.value })}
                                                onFocus={() => { if (!editForm.password) setEditForm(f => ({ ...f, password: '' })); }}
                                                className="input pr-10 font-mono"
                                                placeholder={detailClient.plain_password ? '••••••••  (текущий)' : 'Новый пароль (мин. 6 символов)'}
                                                minLength={editForm.password ? 6 : undefined}
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowPassword(p => !p)}
                                                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-main"
                                            >
                                                {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                                            </button>
                                        </div>
                                        {detailClient.plain_password && !editForm.password && (
                                            <p className="text-xs text-muted mt-1">Оставьте пустым, чтобы не менять пароль</p>
                                        )}
                                    </div>

                                    {/* Objects */}
                                    <div>
                                        <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-2">
                                            <Building2 size={12} className="inline mr-1" />
                                            Привязанные объекты
                                        </label>
                                        <div className="grid gap-1.5 border border-border rounded-xl p-2 bg-subtle/30 max-h-40 overflow-y-auto">
                                            {allObjects.map(obj => {
                                                const isLinked = detailClient.objects?.some(o => o.object_id === obj.id);
                                                return (
                                                    <button
                                                        key={obj.id}
                                                        type="button"
                                                        onClick={() => {
                                                            const cur = detailClient.objects?.map(o => o.object_id) || [];
                                                            handleUpdateObjects(detailClient.id, isLinked ? cur.filter(id => id !== obj.id) : [...cur, obj.id]);
                                                        }}
                                                        className={`flex items-center gap-2 p-2 rounded-lg text-sm text-left transition-all ${isLinked ? 'bg-primary/10 text-primary font-medium' : 'bg-transparent text-muted hover:bg-subtle'}`}
                                                    >
                                                        <div className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 ${isLinked ? 'bg-primary text-white' : 'border border-border'}`}>
                                                            {isLinked && <Check size={10} />}
                                                        </div>
                                                        <span className="truncate">{obj.name}</span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    <button type="submit" className="btn-primary w-full flex items-center justify-center gap-2" disabled={editSaving}>
                                        {editSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                                        {editSaving ? 'Сохранение...' : 'Сохранить изменения'}
                                    </button>
                                </form>
                            )}

                            {/* ── Requests Tab ── */}
                            {detailTab === 'requests' && (
                                <div>
                                    {requestsLoading ? (
                                        <div className="flex justify-center py-10">
                                            <div className="w-7 h-7 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                                        </div>
                                    ) : requests.length === 0 ? (
                                        <div className="text-center py-10 text-muted">
                                            <MessageSquare className="w-10 h-10 mx-auto mb-2 opacity-20" />
                                            <p>Просьб нет</p>
                                        </div>
                                    ) : (
                                        <div className="space-y-3">
                                            {requests.map(req => (
                                                <div key={req.id} className="p-3 rounded-xl border border-border bg-subtle/30">
                                                    <div className="flex items-start justify-between gap-2">
                                                        <div className="min-w-0 flex-1">
                                                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                                                                <span className={`text-[10px] ${statusClass[req.status] || 'badge-neutral'}`}>
                                                                    <span className="badge-dot" />{statusLabel[req.status] || req.status}
                                                                </span>
                                                                <span className="text-xs text-muted">
                                                                    {req.cleaning_objects?.name || '—'}
                                                                </span>
                                                            </div>
                                                            <p className="text-sm text-main">{req.message}</p>
                                                            <p className="text-xs text-muted mt-1">
                                                                {new Date(req.created_at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                                            </p>
                                                        </div>
                                                        <button
                                                            onClick={() => handleDeleteRequest(req.id)}
                                                            className="text-muted hover:text-danger p-1 rounded-md transition-colors shrink-0"
                                                            title="Удалить"
                                                        >
                                                            <Trash2 size={15} />
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            , document.body)}

            {/* ── Create Client Modal ── */}
            {showCreateModal && createPortal(
                <div className="modal-overlay animate-fadeIn">
                    <div className="modal-content animate-scaleIn max-h-[90vh] flex flex-col">
                        <div className="modal-header">
                            <h3 className="text-xl font-bold text-main">Новый Клиент</h3>
                            <button onClick={() => setShowCreateModal(false)} className="btn-icon">
                                <X size={20} />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="flex flex-col min-h-0">
                            <div className="modal-body space-y-4">
                                <div>
                                    <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1.5">
                                        Имя (Название компании)
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.name}
                                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                        className="input"
                                        placeholder="Например: ООО Ромашка"
                                        required
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1.5">
                                        Email клиента
                                    </label>
                                    <input
                                        type="email"
                                        value={formData.email}
                                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                        className="input"
                                        placeholder="client@company.com"
                                        required
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1.5">
                                        Пароль
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.password}
                                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                        className="input font-mono"
                                        placeholder="Минимум 6 символов"
                                        required
                                        minLength={6}
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-2">
                                        Доступ к объектам
                                    </label>
                                    <div className="grid gap-2 border border-border rounded-xl p-2 bg-subtle/30 overflow-y-auto max-h-48">
                                        {allObjects.map(obj => {
                                            const isSelected = formData.selectedObjects.includes(obj.id);
                                            return (
                                                <button
                                                    key={obj.id}
                                                    type="button"
                                                    onClick={() => toggleObjectSelection(obj.id)}
                                                    className={`flex items-center gap-2 p-2.5 rounded-lg text-sm text-left transition-all ${isSelected ? 'bg-primary/10 text-primary font-medium' : 'bg-card text-muted hover:border-primary/30'}`}
                                                >
                                                    <div className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 ${isSelected ? 'bg-primary text-white' : 'border border-border'}`}>
                                                        {isSelected && <Check size={10} />}
                                                    </div>
                                                    <span className="truncate">{obj.name}</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                    {formData.selectedObjects.length > 0 && (
                                        <p className="text-xs text-primary mt-2 flex justify-end">
                                            Выбрано объектов: {formData.selectedObjects.length}
                                        </p>
                                    )}
                                </div>
                            </div>

                            <div className="modal-footer mt-auto">
                                <button type="button" onClick={() => setShowCreateModal(false)} className="btn-secondary">
                                    Отмена
                                </button>
                                <button type="submit" className="btn-primary">
                                    Создать клиента
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            , document.body)}
        </div>
    );
}

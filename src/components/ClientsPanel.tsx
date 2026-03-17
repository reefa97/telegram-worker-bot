
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { User, Plus, Trash2, Building2, Search, ChevronDown, ChevronUp, X, Check, Mail, Eye, EyeOff, Edit2 } from 'lucide-react';

interface ClientUser {
    id: string;
    email: string;
    name?: string | null;
    role: string;
    created_at: string;
    plain_password?: string | null;
    objects?: { object_id: string; object_name: string }[];
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
    const [showModal, setShowModal] = useState(false);
    const [expandedClient, setExpandedClient] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');

    const [formData, setFormData] = useState({
        name: '',
        email: '',
        password: '',
        selectedObjects: [] as string[],
    });

    const canManageClients = adminUser?.role === 'super_admin';

    const [editingClient, setEditingClient] = useState<ClientUser | null>(null);
    const [editForm, setEditForm] = useState({ name: '', email: '', password: '' });
    const [editSaving, setEditSaving] = useState(false);
    const [visiblePasswords, setVisiblePasswords] = useState<Set<string>>(new Set());

    const togglePasswordVisible = (clientId: string) => {
        setVisiblePasswords(prev => {
            const next = new Set(prev);
            next.has(clientId) ? next.delete(clientId) : next.add(clientId);
            return next;
        });
    };

    const openEditModal = (client: ClientUser) => {
        setEditingClient(client);
        setEditForm({ name: client.name || '', email: client.email, password: '' });
    };

    const handleEditSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingClient) return;
        setEditSaving(true);
        try {
            const body: Record<string, string> = { clientId: editingClient.id, name: editForm.name };
            if (editForm.email && editForm.email !== editingClient.email) body.email = editForm.email;
            if (editForm.password) body.password = editForm.password;

            const response = await supabase.functions.invoke('update-client-credentials', { body });
            if (response.error) throw new Error(response.error.message);
            if (response.data?.error) throw new Error(response.data.error);

            setEditingClient(null);
            loadClients();
        } catch (err: any) {
            alert(`Ошибка: ${err.message}`);
        } finally {
            setEditSaving(false);
        }
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

    const loadClients = async () => {
        setLoading(true);
        // Load clients
        const { data: clientsData, error } = await supabase
            .from('admin_users')
            .select('*')
            .eq('role', 'client')
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error loading clients:', error);
            setLoading(false);
            return;
        }

        // Load client-object links
        const { data: links } = await supabase
            .from('client_objects')
            .select('client_id, object_id, cleaning_objects(id, name)');

        const enrichedClients = (clientsData || []).map((c: any) => {
            const clientLinks = (links || []).filter((l: any) => l.client_id === c.id);
            return {
                ...c,
                objects: clientLinks.map((l: any) => ({
                    object_id: l.object_id,
                    object_name: l.cleaning_objects?.name || 'Obiekt'
                }))
            };
        });

        setClients(enrichedClients);
        setLoading(false);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        try {
            // Create client via edge function
            const response = await supabase.functions.invoke('create-admin', {
                body: {
                    name: formData.name.trim(),
                    email: formData.email.trim(),
                    password: formData.password,
                    role: 'client',
                    createdBy: adminUser?.id,
                },
            });

            // FunctionsHttpError stores response body in error.context
            if (response.error) {
                let errorMsg = 'Unknown error';
                try {
                    const ctx = response.error.context;
                    if (ctx && typeof ctx === 'object') {
                        if (ctx instanceof Response) {
                            const body = await ctx.json();
                            errorMsg = body?.error || JSON.stringify(body);
                        } else {
                            errorMsg = ctx.error || JSON.stringify(ctx);
                        }
                    } else {
                        errorMsg = response.error.message || String(response.error);
                    }
                } catch {
                    errorMsg = response.error.message || String(response.error);
                }
                throw new Error(errorMsg);
            }

            if (response.data?.error) {
                throw new Error(response.data.error);
            }

            // Get the new client ID
            const { data: newClient } = await supabase
                .from('admin_users')
                .select('id')
                .eq('email', formData.email.trim())
                .maybeSingle();

            if (newClient && formData.selectedObjects.length > 0) {
                const links = formData.selectedObjects.map(objectId => ({
                    client_id: newClient.id,
                    object_id: objectId
                }));
                await supabase.from('client_objects').insert(links);
            }

            loadClients();
            setShowModal(false);
            setFormData({ name: '', email: '', password: '', selectedObjects: [] });
            alert('Клиент создан успешно');
        } catch (error: any) {
            console.error('Error creating client:', error);
            alert(`Ошибка: ${error?.message || error}`);
        }
    };

    const handleDelete = async (id: string, nameOrEmail: string) => {
        if (!confirm(`Удалить клиента ${nameOrEmail}?`)) return;

        try {
            // Delete client_objects links first
            await supabase.from('client_objects').delete().eq('client_id', id);

            const response = await supabase.functions.invoke('delete-super-admin', {
                body: {
                    adminId: id,
                    requesterId: adminUser?.id,
                },
            });

            if (response.error) throw response.error;
            loadClients();
        } catch (error) {
            console.error('Error deleting client:', error);
            alert('Ошибка при удалении');
        }
    };

    const handleUpdateObjects = async (clientId: string, newObjects: string[]) => {
        try {
            await supabase.from('client_objects').delete().eq('client_id', clientId);

            if (newObjects.length > 0) {
                const links = newObjects.map(objectId => ({
                    client_id: clientId,
                    object_id: objectId
                }));
                await supabase.from('client_objects').insert(links);
            }

            loadClients();
        } catch (error) {
            console.error('Error updating objects:', error);
            alert('Ошибка при обновлении объектов');
        }
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
                <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
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
                <button onClick={() => setShowModal(true)} className="btn-primary flex items-center gap-2">
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

            {/* Clients List */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {filteredClients.map((client) => (
                    <div key={client.id} className="card p-5 hover:border-primary/30 transition-colors">
                        <div className="flex items-start justify-between mb-4">
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
                            <div className="flex items-center gap-1 shrink-0">
                                <button
                                    onClick={() => openEditModal(client)}
                                    className="text-muted hover:text-primary p-1 rounded-md transition-colors"
                                    title="Редактировать"
                                >
                                    <Edit2 size={16} />
                                </button>
                                <button
                                    onClick={() => handleDelete(client.id, client.name || client.email)}
                                    className="text-muted hover:text-danger p-1 rounded-md transition-colors"
                                    title="Удалить клиента"
                                >
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        </div>

                        {/* Login/password row */}
                        <div className="flex items-center gap-2 mb-4 p-2.5 rounded-lg bg-subtle/50 border border-border text-xs">
                            <span className="text-muted shrink-0">Пароль:</span>
                            <span className="font-mono text-main flex-1 truncate">
                                {visiblePasswords.has(client.id)
                                    ? (client.plain_password || '—')
                                    : (client.plain_password ? '••••••••' : '—')}
                            </span>
                            {client.plain_password && (
                                <button
                                    onClick={() => togglePasswordVisible(client.id)}
                                    className="text-muted hover:text-main transition-colors shrink-0"
                                >
                                    {visiblePasswords.has(client.id) ? <EyeOff size={14} /> : <Eye size={14} />}
                                </button>
                            )}
                        </div>

                        <div className="pt-4 border-t border-border">
                            <button
                                onClick={() => setExpandedClient(expandedClient === client.id ? null : client.id)}
                                className="w-full flex items-center justify-between text-sm font-semibold text-main hover:text-primary transition-colors mb-2"
                            >
                                <span className="flex items-center gap-2">
                                    <Building2 size={16} className="text-primary" />
                                    Привязанные объекты ({client.objects?.length || 0})
                                </span>
                                {expandedClient === client.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                            </button>

                            {expandedClient === client.id && (
                                <div className="mt-3 space-y-1 max-h-48 overflow-y-auto pr-1">
                                    {allObjects.map(obj => {
                                        const isLinked = client.objects?.some(o => o.object_id === obj.id);
                                        return (
                                            <button
                                                key={obj.id}
                                                onClick={() => {
                                                    const currentObjectIds = client.objects?.map(o => o.object_id) || [];
                                                    const newObjectIds = isLinked
                                                        ? currentObjectIds.filter(id => id !== obj.id)
                                                        : [...currentObjectIds, obj.id];
                                                    handleUpdateObjects(client.id, newObjectIds);
                                                }}
                                                className={`w-full flex items-center gap-2 p-2 rounded-lg text-sm text-left transition-all ${isLinked
                                                    ? 'bg-primary/10 text-primary font-medium'
                                                    : 'bg-transparent text-muted hover:bg-subtle'
                                                    }`}
                                            >
                                                <div className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 ${isLinked ? 'bg-primary text-white' : 'border border-border'
                                                    }`}>
                                                    {isLinked && <Check size={10} />}
                                                </div>
                                                <span className="truncate">{obj.name}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
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

            {/* Edit Client Modal */}
            {editingClient && createPortal(
                <div className="modal-overlay animate-fadeIn">
                    <div className="modal-content animate-scaleIn">
                        <div className="modal-header">
                            <h3 className="text-xl font-bold text-main">Редактировать клиента</h3>
                            <button onClick={() => setEditingClient(null)} className="btn-icon"><X size={20} /></button>
                        </div>
                        <form onSubmit={handleEditSubmit}>
                            <div className="modal-body space-y-4">
                                <div>
                                    <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1.5">Имя</label>
                                    <input
                                        type="text"
                                        value={editForm.name}
                                        onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                                        className="input"
                                        placeholder="Название компании"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1.5">Email (логин)</label>
                                    <input
                                        type="email"
                                        value={editForm.email}
                                        onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                                        className="input"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1.5">
                                        Новый пароль <span className="normal-case font-normal text-muted">(оставьте пустым, чтобы не менять)</span>
                                    </label>
                                    <input
                                        type="text"
                                        value={editForm.password}
                                        onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
                                        className="input font-mono"
                                        placeholder="Минимум 6 символов"
                                        minLength={editForm.password ? 6 : undefined}
                                    />
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" onClick={() => setEditingClient(null)} className="btn-secondary">Отмена</button>
                                <button type="submit" className="btn-primary" disabled={editSaving}>
                                    {editSaving ? 'Сохранение...' : 'Сохранить'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            , document.body)}

            {/* Create Client Modal */}
            {showModal && createPortal(
                <div className="modal-overlay animate-fadeIn">
                    <div className="modal-content animate-scaleIn max-h-[90vh] flex flex-col">
                        <div className="modal-header">
                            <h3 className="text-xl font-bold text-main">Новый Клиент</h3>
                            <button onClick={() => setShowModal(false)} className="btn-icon">
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
                                        type="password"
                                        value={formData.password}
                                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                        className="input"
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
                                                    className={`flex items-center gap-2 p-2.5 rounded-lg text-sm text-left transition-all ${isSelected
                                                        ? 'bg-primary/10 text-primary font-medium'
                                                        : 'bg-card text-muted hover:border-primary/30'
                                                        }`}
                                                >
                                                    <div className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 ${isSelected ? 'bg-primary text-white' : 'border border-border'
                                                        }`}>
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
                                <button type="button" onClick={() => setShowModal(false)} className="btn-secondary">
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

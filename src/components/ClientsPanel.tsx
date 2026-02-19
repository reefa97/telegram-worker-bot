
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { User, Plus, Trash2, Building2, Search, ChevronDown, ChevronUp, X, Check } from 'lucide-react';

interface ClientUser {
    id: string;
    email: string;
    role: string;
    created_at: string;
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
        email: '',
        password: '',
        selectedObjects: [] as string[],
    });

    const canManageClients = adminUser?.role === 'super_admin';

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
                    email: formData.email,
                    password: formData.password,
                    role: 'client',
                    createdBy: adminUser?.id,
                },
            });

            if (response.error) throw response.error;

            // Get the new client ID
            const { data: newClient } = await supabase
                .from('admin_users')
                .select('id')
                .eq('email', formData.email)
                .maybeSingle();

            if (newClient && formData.selectedObjects.length > 0) {
                // Insert client_objects links
                const links = formData.selectedObjects.map(objectId => ({
                    client_id: newClient.id,
                    object_id: objectId
                }));
                await supabase.from('client_objects').insert(links);
            }

            loadClients();
            setShowModal(false);
            setFormData({ email: '', password: '', selectedObjects: [] });
            alert('Клиент создан успешно');
        } catch (error) {
            console.error('Error creating client:', error);
            alert('Ошибка при создании клиента');
        }
    };

    const handleDelete = async (id: string, email: string) => {
        if (!confirm(`Удалить клиента ${email}?`)) return;

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
            // Delete all existing links
            await supabase.from('client_objects').delete().eq('client_id', clientId);

            // Insert new links
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
        c.email.toLowerCase().includes(searchTerm.toLowerCase())
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
                        placeholder="Поиск по email..."
                        className="input pl-10"
                    />
                </div>
            )}

            {/* Clients List */}
            <div className="space-y-3">
                {filteredClients.map((client) => (
                    <div key={client.id} className="card overflow-hidden">
                        <div
                            className="flex items-center justify-between p-4 cursor-pointer hover:bg-subtle/50 transition-colors"
                            onClick={() => setExpandedClient(expandedClient === client.id ? null : client.id)}
                        >
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                                    {client.email[0].toUpperCase()}
                                </div>
                                <div>
                                    <div className="font-medium text-main">{client.email}</div>
                                    <div className="text-xs text-muted flex items-center gap-2 mt-0.5">
                                        <span>Создан: {new Date(client.created_at).toLocaleDateString('ru-RU')}</span>
                                        {client.objects && client.objects.length > 0 && (
                                            <>
                                                <span>•</span>
                                                <span className="flex items-center gap-1">
                                                    <Building2 size={11} />
                                                    {client.objects.length} объект{client.objects.length === 1 ? '' : client.objects.length < 5 ? 'а' : 'ов'}
                                                </span>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center gap-2">
                                <button
                                    onClick={(e) => { e.stopPropagation(); handleDelete(client.id, client.email); }}
                                    className="btn-icon text-muted hover:text-danger"
                                    title="Удалить"
                                >
                                    <Trash2 size={16} />
                                </button>
                                {expandedClient === client.id ? <ChevronUp size={16} className="text-muted" /> : <ChevronDown size={16} className="text-muted" />}
                            </div>
                        </div>

                        {/* Expanded: Object Assignment */}
                        {expandedClient === client.id && (
                            <div className="border-t border-border p-4 bg-subtle/30 animate-fadeIn">
                                <h4 className="text-sm font-bold text-main mb-3 flex items-center gap-2">
                                    <Building2 size={14} />
                                    Привязанные объекты
                                </h4>
                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
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
                                                className={`flex items-center gap-2 p-3 rounded-xl border text-sm text-left transition-all ${isLinked
                                                    ? 'border-primary/50 bg-primary/10 text-primary font-medium'
                                                    : 'border-border bg-card text-muted hover:border-primary/30 hover:bg-primary/5'
                                                    }`}
                                            >
                                                <div className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 ${isLinked ? 'bg-primary text-white' : 'border border-border'
                                                    }`}>
                                                    {isLinked && <Check size={12} />}
                                                </div>
                                                <span className="truncate">{obj.name}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                                {allObjects.length === 0 && (
                                    <p className="text-sm text-muted italic">Нет доступных объектов</p>
                                )}
                            </div>
                        )}
                    </div>
                ))}

                {filteredClients.length === 0 && (
                    <div className="card p-12 text-center text-muted flex flex-col items-center">
                        <User className="w-12 h-12 mb-3 opacity-20" />
                        {searchTerm ? (
                            <p>Ничего не найдено по запросу "{searchTerm}"</p>
                        ) : (
                            <>
                                <p>Клиентов пока нет</p>
                                <p className="text-sm mt-1">Создайте первого клиента, чтобы предоставить доступ к кабинету</p>
                            </>
                        )}
                    </div>
                )}
            </div>

            {/* Create Client Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fadeIn">
                    <div className="bg-card rounded-2xl shadow-xl max-w-lg w-full overflow-hidden animate-scaleIn max-h-[90vh] flex flex-col">
                        <div className="p-6 border-b border-border flex items-center justify-between">
                            <h3 className="text-xl font-bold text-main">Новый Клиент</h3>
                            <button onClick={() => setShowModal(false)} className="btn-icon text-muted">
                                <X size={20} />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto flex-1">
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
                                    Привязать объекты
                                </label>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[200px] overflow-y-auto pr-1">
                                    {allObjects.map(obj => {
                                        const isSelected = formData.selectedObjects.includes(obj.id);
                                        return (
                                            <button
                                                key={obj.id}
                                                type="button"
                                                onClick={() => toggleObjectSelection(obj.id)}
                                                className={`flex items-center gap-2 p-3 rounded-xl border text-sm text-left transition-all ${isSelected
                                                    ? 'border-primary/50 bg-primary/10 text-primary font-medium'
                                                    : 'border-border bg-subtle text-muted hover:border-primary/30'
                                                    }`}
                                            >
                                                <div className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 ${isSelected ? 'bg-primary text-white' : 'border border-border'
                                                    }`}>
                                                    {isSelected && <Check size={12} />}
                                                </div>
                                                <span className="truncate">{obj.name}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                                {formData.selectedObjects.length > 0 && (
                                    <p className="text-xs text-primary mt-2">
                                        Выбрано: {formData.selectedObjects.length}
                                    </p>
                                )}
                            </div>

                            <div className="flex gap-3 pt-2">
                                <button type="button" onClick={() => setShowModal(false)} className="btn-secondary flex-1">
                                    Отмена
                                </button>
                                <button type="submit" className="btn-primary flex-1">
                                    Создать
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}

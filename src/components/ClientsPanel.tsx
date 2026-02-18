
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { User, Plus, Trash2, Mail } from 'lucide-react';

interface AdminUser {
    id: string;
    email: string;
    role: string;
    created_at: string;
}

export default function ClientsPanel() {
    const { adminUser } = useAuth();
    const [clients, setClients] = useState<AdminUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);

    const [formData, setFormData] = useState({
        email: '',
        password: '',
    });

    const canManageClients = adminUser?.role === 'super_admin';

    useEffect(() => {
        if (canManageClients) {
            loadClients();
        }
    }, [canManageClients]);

    const loadClients = async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from('admin_users')
            .select('*')
            .eq('role', 'client')
            .order('created_at', { ascending: false });

        if (data) setClients(data);
        if (error) console.error('Error loading clients:', error);
        setLoading(false);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        try {
            // Re-using create-admin function but specifying role='client'
            // Ensure your Edge Function 'create-admin' allows 'client' role creation
            const response = await supabase.functions.invoke('create-admin', {
                body: {
                    email: formData.email,
                    password: formData.password,
                    role: 'client',
                    createdBy: adminUser?.id,
                },
            });

            if (response.error) throw response.error;

            loadClients();
            setShowModal(false);
            setFormData({ email: '', password: '' });
            alert('Клиент создан успешно');
        } catch (error) {
            console.error('Error creating client:', error);
            alert('Ошибка при создании клиента');
        }
    };

    const handleDelete = async (id: string, email: string) => {
        if (!confirm(`Удалить клиента ${email}?`)) return;

        try {
            // Re-using delete-super-admin logic or creating a new function if needed.
            // Assuming 'delete-super-admin' deletes from auth.users and admin_users table for any role if permitted.
            // If strict, we might need a separate 'delete-user' function.
            // Let's try to use the existing one or supabase.auth.admin if we had a backend.
            // Since we use Edge Functions, let's assume 'delete-super-admin' is actually 'delete-admin-user' generic.

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

    if (!canManageClients) {
        return (
            <div className="card flex flex-col items-center justify-center py-16 text-center">
                <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mb-4">
                    <User className="w-8 h-8 text-gray-400" />
                </div>
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">Доступ запрещен</h3>
                <p className="text-gray-500 dark:text-gray-400 max-w-sm">Только Super Admin может управлять клиентами</p>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="flex justify-center items-center h-64">
                <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    return (
        <div>
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Клиенты</h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Управление учетными записями клиентов</p>
                </div>
                <button onClick={() => setShowModal(true)} className="btn-primary flex items-center gap-2">
                    <Plus className="w-4 h-4" />
                    Добавить клиента
                </button>
            </div>

            <div className="card overflow-hidden p-0">
                <div className="divide-y divide-gray-100 dark:divide-gray-800">
                    {clients.map((client) => (
                        <div
                            key={client.id}
                            className="flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                        >
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center text-blue-600 dark:text-blue-400">
                                    <User size={20} />
                                </div>
                                <div>
                                    <div className="text-gray-900 dark:text-white font-medium">{client.email}</div>
                                    <div className="text-sm text-gray-500 dark:text-gray-400 mt-1 flex items-center gap-1">
                                        <Mail size={12} />
                                        <span>Создан: {new Date(client.created_at).toLocaleDateString('ru-RU')}</span>
                                    </div>
                                </div>
                            </div>

                            <button
                                onClick={() => handleDelete(client.id, client.email)}
                                className="p-2 hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-500 dark:hover:text-red-400 rounded-lg transition-colors"
                                title="Удалить"
                            >
                                <Trash2 className="w-5 h-5" />
                            </button>
                        </div>
                    ))}
                    {clients.length === 0 && (
                        <div className="p-12 text-center text-gray-500 dark:text-gray-400 flex flex-col items-center">
                            <User className="w-12 h-12 mb-3 opacity-20" />
                            <p>Клиентов пока нет</p>
                            <p className="text-sm mt-1">Создайте первого клиента, чтобы предоставить доступ к кабинету</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fadeIn">
                    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-md w-full overflow-hidden animate-scaleIn">
                        <div className="p-6">
                            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Новый Клиент</h3>

                            <form onSubmit={handleSubmit} className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Email клиента</label>
                                    <input
                                        type="email"
                                        value={formData.email}
                                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                        className="input"
                                        placeholder="client@company.com"
                                        required
                                    />
                                    <p className="text-xs text-muted mt-1">Этот email должен быть указан в объекте</p>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Пароль</label>
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

                                <div className="flex gap-3 pt-4">
                                    <button type="button" onClick={() => setShowModal(false)} className="btn-ghost flex-1">
                                        Отмена
                                    </button>
                                    <button type="submit" className="btn-primary flex-1">
                                        Создать
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

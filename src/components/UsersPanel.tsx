import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { UserCog, Plus, Trash2 } from 'lucide-react';

interface AdminUser {
    id: string;
    email: string;
    role: string;
    created_at: string;
}

export default function UsersPanel() {
    const { adminUser } = useAuth();
    const [admins, setAdmins] = useState<AdminUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);

    const [formData, setFormData] = useState({
        email: '',
        password: '',
    });

    const isSuperAdmin = adminUser?.role === 'super_admin';

    useEffect(() => {
        if (isSuperAdmin) {
            loadAdmins();
        }
    }, [isSuperAdmin]);

    const loadAdmins = async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from('admin_users')
            .select('*')
            .eq('role', 'super_admin')
            .order('created_at', { ascending: false });

        if (data) setAdmins(data);
        if (error) console.error('Error loading admins:', error);
        setLoading(false);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        try {
            const response = await supabase.functions.invoke('create-admin', {
                body: {
                    email: formData.email,
                    password: formData.password,
                    role: 'super_admin',
                    createdBy: adminUser?.id,
                },
            });

            if (response.error) throw response.error;

            loadAdmins();
            closeModal();
            alert('Super Admin создан успешно');
        } catch (error) {
            console.error('Error creating admin:', error);
            alert('Ошибка при создании администратора');
        }
    };

    const handleDelete = async (id: string) => {
        if (id === adminUser?.id) {
            alert('Вы не можете удалить свой собственный аккаунт');
            return;
        }

        if (!confirm('Удалить Super Admin?')) return;

        try {
            const response = await supabase.functions.invoke('delete-super-admin', {
                body: {
                    adminId: id,
                    requesterId: adminUser?.id,
                },
            });

            if (response.error) throw response.error;

            loadAdmins();
        } catch (error) {
            console.error('Error deleting admin:', error);
            alert('Ошибка при удалении');
        }
    };

    const closeModal = () => {
        setShowModal(false);
        setFormData({ email: '', password: '' });
    };

    if (!isSuperAdmin) {
        return (
            <div className="card flex flex-col items-center justify-center py-16 text-center">
                <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mb-4">
                    <UserCog className="w-8 h-8 text-gray-400" />
                </div>
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">Доступ запрещен</h3>
                <p className="text-gray-500 dark:text-gray-400 max-w-sm">Только Super Admin может управлять администраторами</p>
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
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Super Admins</h2>
                <button onClick={() => setShowModal(true)} className="btn-primary flex items-center gap-2">
                    <Plus className="w-4 h-4" />
                    Добавить Super Admin
                </button>
            </div>

            <div className="card overflow-hidden p-0">
                <div className="divide-y divide-gray-100 dark:divide-gray-800">
                    {admins.map((admin) => (
                        <div
                            key={admin.id}
                            className="flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                        >
                            <div>
                                <div className="text-gray-900 dark:text-white font-medium">{admin.email}</div>
                                <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                    Создан: {new Date(admin.created_at).toLocaleDateString('ru-RU')}
                                </div>
                            </div>

                            {admin.id !== adminUser?.id && (
                                <button
                                    onClick={() => handleDelete(admin.id)}
                                    className="p-2 hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-500 dark:hover:text-red-400 rounded-lg transition-colors"
                                    title="Удалить"
                                >
                                    <Trash2 className="w-5 h-5" />
                                </button>
                            )}
                            {admin.id === adminUser?.id && (
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400 border border-green-200 dark:border-green-800">
                                    Это вы
                                </span>
                            )}
                        </div>
                    ))}
                    {admins.length === 0 && (
                        <div className="p-8 text-center text-gray-500 dark:text-gray-400">
                            Нет администраторов
                        </div>
                    )}
                </div>
            </div>

            {/* Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fadeIn">
                    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-md w-full overflow-hidden animate-scaleIn">
                        <div className="p-6">
                            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Новый Super Admin</h3>

                            <form onSubmit={handleSubmit} className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Email</label>
                                    <input
                                        type="email"
                                        value={formData.email}
                                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                        className="input"
                                        placeholder="admin@example.com"
                                        required
                                    />
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
                                    <button type="button" onClick={closeModal} className="btn-ghost flex-1">
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

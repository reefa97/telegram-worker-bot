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
            <div className="card text-center py-12">
                <UserCog className="w-16 h-16 mx-auto text-gray-400 mb-4" />
                <p className="text-gray-400">Только Super Admin может управлять администраторами</p>
            </div>
        );
    }

    if (loading) {
        return <div className="text-white">Загрузка...</div>;
    }

    return (
        <div>
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-white">Super Admins</h2>
                <button onClick={() => setShowModal(true)} className="btn-primary flex items-center gap-2">
                    <Plus className="w-4 h-4" />
                    Добавить Super Admin
                </button>
            </div>

            <div className="card">
                <div className="space-y-3">
                    {admins.map((admin) => (
                        <div
                            key={admin.id}
                            className="flex items-center justify-between p-4 bg-gray-700 rounded-lg"
                        >
                            <div>
                                <div className="text-white font-medium">{admin.email}</div>
                                <div className="text-sm text-gray-400 mt-1">
                                    Создан: {new Date(admin.created_at).toLocaleDateString('ru-RU')}
                                </div>
                            </div>

                            {admin.id !== adminUser?.id && (
                                <button
                                    onClick={() => handleDelete(admin.id)}
                                    className="p-2 hover:bg-gray-600 rounded transition-colors"
                                    title="Удалить"
                                >
                                    <Trash2 className="w-4 h-4 text-red-400" />
                                </button>
                            )}
                            {admin.id === adminUser?.id && (
                                <span className="text-xs text-green-400 px-2 py-1 bg-green-500/20 rounded">
                                    Это вы
                                </span>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            {/* Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
                    <div className="bg-gray-800 rounded-lg max-w-md w-full">
                        <div className="p-6">
                            <h3 className="text-xl font-bold text-white mb-4">Новый Super Admin</h3>

                            <form onSubmit={handleSubmit} className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-2">Email</label>
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
                                    <label className="block text-sm font-medium text-gray-300 mb-2">Пароль</label>
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

                                <div className="flex gap-2 pt-4">
                                    <button type="submit" className="btn-primary flex-1">
                                        Создать
                                    </button>
                                    <button type="button" onClick={closeModal} className="btn-secondary flex-1">
                                        Отмена
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

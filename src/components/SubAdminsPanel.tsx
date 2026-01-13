import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { UserPlus2, Plus, Trash2, Edit2, Shield, User, Smartphone, Layout } from 'lucide-react';

interface AdminUser {
    id: string;
    email: string;
    role: string;
    created_at: string;
    created_by: string | null;
    permissions: any;
    name?: string;
    phone?: string;
    telegram_chat_id?: string;
    telegram_username?: string;
    invitation_token?: string;
    is_active?: boolean;
}

export default function SubAdminsPanel() {
    const { adminUser } = useAuth();
    const [subAdmins, setSubAdmins] = useState<AdminUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingAdmin, setEditingAdmin] = useState<AdminUser | null>(null);

    const [formData, setFormData] = useState({
        email: '',
        password: '',
        name: '',
        phone: '',
        telegram_chat_id: '',
        role: 'sub_admin', // 'sub_admin' | 'manager'
        permissions: {
            // Объекты
            objects_view: true,
            objects_create: false,
            objects_edit: false,
            objects_delete: false,
            // Работники
            workers_view: true,
            workers_create: false,
            workers_edit: false,
            workers_delete: false,
            // Отчёты
            reports_view: true,
            reports_export: false,
            // Смены
            shifts_view: true,
            shifts_plan: false,
            shifts_edit: false,
            // Задачи
            tasks_view: true,
            tasks_create: false,
            tasks_edit: false,
            tasks_delete: false,
            // Роли
            roles_view: true,
            roles_manage: false,
        }
    });

    useEffect(() => {
        loadSubAdmins();
    }, []);

    const loadSubAdmins = async () => {
        setLoading(true);
        // Fetch ALL admin_users except super_admin (or include them?)
        const { data, error } = await supabase
            .from('admin_users')
            .select('*')
            .neq('role', 'super_admin')
            .order('created_at', { ascending: false });

        if (data) setSubAdmins(data);
        if (error) console.error('Error loading sub-admins:', error);
        setLoading(false);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        try {
            if (editingAdmin) {
                // Update existing
                const response = await supabase.functions.invoke('update-admin', {
                    body: {
                        adminId: editingAdmin.id,
                        password: formData.password || undefined,
                        permissions: formData.permissions,
                        name: formData.name,
                        phone: formData.phone,
                        telegram_chat_id: formData.telegram_chat_id || null
                    },
                });

                if (response.error) throw response.error;
                alert('Данные обновлены');
            } else {
                // Create new
                const response = await supabase.functions.invoke('create-admin', {
                    body: {
                        email: formData.email,
                        password: formData.password,
                        role: formData.role,
                        createdBy: adminUser?.id,
                        permissions: formData.permissions,
                        name: formData.name,
                        phone: formData.phone,
                        telegram_chat_id: formData.telegram_chat_id || null
                    },
                });

                if (response.error) throw response.error;
                alert('Пользователь создан успешно');
            }

            loadSubAdmins();
            closeModal();
        } catch (error) {
            console.error('Error saving:', error);
            alert('Ошибка при сохранении');
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Удалить пользователя?')) return;

        try {
            const response = await supabase.functions.invoke('delete-sub-admin', {
                body: { adminId: id },
            });

            if (response.error) throw response.error;
            loadSubAdmins();
        } catch (error) {
            console.error('Error deleting:', error);
            alert('Ошибка при удалении');
        }
    };

    const openModal = (admin?: AdminUser) => {
        if (admin) {
            setEditingAdmin(admin);
            setFormData({
                email: admin.email,
                password: '',
                name: admin.name || '',
                phone: admin.phone || '',
                telegram_chat_id: admin.telegram_chat_id || '',
                role: admin.role,
                permissions: admin.permissions || formData.permissions
            });
        } else {
            setEditingAdmin(null);
            setFormData({
                email: '',
                password: '',
                name: '',
                phone: '',
                telegram_chat_id: '',
                role: 'sub_admin',
                permissions: {
                    objects_view: true,
                    objects_create: false,
                    objects_edit: false,
                    objects_delete: false,
                    workers_view: true,
                    workers_create: false,
                    workers_edit: false,
                    workers_delete: false,
                    reports_view: true,
                    reports_export: false,
                    shifts_view: true,
                    shifts_plan: false,
                    shifts_edit: false,
                    tasks_view: true,
                    tasks_create: false,
                    tasks_edit: false,
                    tasks_delete: false,
                    roles_view: true,
                    roles_manage: false,
                }
            });
        }
        setShowModal(true);
    };

    const renderPermissionsGroup = (title: string, permissions: Array<{ key: string, label: string }>) => {
        return (
            <div key={title} className="mb-4 bg-gray-50 dark:bg-gray-700/30 p-3 rounded-lg">
                <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wider">{title}</div>
                <div className="grid grid-cols-1 gap-2">
                    {permissions.map(({ key, label }) => (
                        <label key={key} className="flex items-center gap-3 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700/50 p-1.5 rounded-md transition-colors">
                            <input
                                type="checkbox"
                                checked={(formData.permissions as any)[key] || false}
                                onChange={(e) => setFormData({
                                    ...formData,
                                    permissions: {
                                        ...formData.permissions,
                                        [key]: e.target.checked
                                    }
                                })}
                                className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-primary-600 focus:ring-primary-500"
                            />
                            <span className="text-gray-700 dark:text-gray-300 text-sm">{label}</span>
                        </label>
                    ))}
                </div>
            </div>
        );
    };

    const closeModal = () => {
        setShowModal(false);
        setEditingAdmin(null);
    };

    if (loading) return (
        <div className="flex justify-center items-center h-64">
            <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin"></div>
        </div>
    );

    const canManage = adminUser?.role === 'super_admin' || adminUser?.role === 'sub_admin';

    return (
        <div>
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Администраторы и Менеджеры</h2>
                {canManage && (
                    <button onClick={() => openModal()} className="btn-primary flex items-center gap-2">
                        <Plus className="w-4 h-4" />
                        Добавить
                    </button>
                )}
            </div>

            <div className="card overflow-hidden p-0">
                <div className="overflow-x-auto">
                    <table className="table w-full">
                        <thead>
                            <tr>
                                <th>Имя</th>
                                <th>Роль</th>
                                <th>Telegram ID</th>
                                <th>Телефон</th>
                                <th className="text-right">Действия</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                            {subAdmins.map((admin) => {
                                const canEditThis = adminUser?.role === 'super_admin' || admin.created_by === adminUser?.id;

                                return (
                                    <tr key={admin.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                                        <td className="font-medium text-gray-900 dark:text-white">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-full bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 flex items-center justify-center">
                                                    <User className="w-4 h-4" />
                                                </div>
                                                <div>
                                                    <div className="font-medium">{admin.name || 'Без имени'}</div>
                                                    <div className="text-xs text-gray-500 dark:text-gray-400">{admin.email}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td>
                                            <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium border ${admin.role === 'manager'
                                                ? 'bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400 border-purple-200 dark:border-purple-800'
                                                : 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800'
                                                }`}>
                                                {admin.role === 'manager' ? (
                                                    <Layout className="w-3 h-3" />
                                                ) : (
                                                    <Shield className="w-3 h-3" />
                                                )}
                                                {admin.role === 'manager' ? 'Менеджер' : 'Sub Admin'}
                                            </span>
                                        </td>
                                        <td className="text-gray-600 dark:text-gray-300 font-mono text-sm">
                                            {admin.telegram_chat_id || <span className="text-gray-400 dark:text-gray-500">-</span>}
                                        </td>
                                        <td className="text-gray-600 dark:text-gray-300">
                                            {admin.phone ? (
                                                <div className="flex items-center gap-1.5">
                                                    <Smartphone className="w-3.5 h-3.5 text-gray-400" />
                                                    {admin.phone}
                                                </div>
                                            ) : '-'}
                                        </td>
                                        <td className="text-right">
                                            {canEditThis && (
                                                <div className="flex justify-end gap-2">
                                                    <button
                                                        onClick={() => openModal(admin)}
                                                        className="p-1.5 hover:bg-blue-50 dark:hover:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-lg transition-colors"
                                                        title="Редактировать"
                                                    >
                                                        <Edit2 className="w-4 h-4" />
                                                    </button>
                                                    <button
                                                        onClick={() => handleDelete(admin.id)}
                                                        className="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg transition-colors"
                                                        title="Удалить"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>

                    {subAdmins.length === 0 && (
                        <div className="text-center text-gray-500 dark:text-gray-400 py-12">
                            <UserPlus2 className="w-12 h-12 mx-auto mb-4 opacity-20" />
                            <p>Нет пользователей. Создайте первого.</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fadeIn">
                    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto animate-scaleIn">
                        <div className="p-6">
                            <div className="flex justify-between items-center mb-6">
                                <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                                    {editingAdmin ? 'Редактировать' : 'Новый пользователь'}
                                </h3>
                                <button onClick={closeModal} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                                    <span className="sr-only">Закрыть</span>
                                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>

                            <form onSubmit={handleSubmit} className="space-y-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="space-y-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Роль</label>
                                            <select
                                                value={formData.role}
                                                onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                                                className="input"
                                                disabled={!!editingAdmin}
                                            >
                                                <option value="sub_admin">Sub Admin (Администратор)</option>
                                                <option value="manager">Manager (Менеджер)</option>
                                            </select>
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Имя</label>
                                            <input
                                                type="text"
                                                value={formData.name}
                                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                                className="input"
                                                placeholder="Иван Иванов"
                                                required
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Email (Логин)</label>
                                            <input
                                                type="email"
                                                value={formData.email}
                                                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                                className="input"
                                                placeholder="user@example.com"
                                                required
                                                disabled={!!editingAdmin}
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Telegram Chat ID</label>
                                            <input
                                                type="text"
                                                inputMode="numeric"
                                                value={formData.telegram_chat_id}
                                                onChange={(e) => setFormData({ ...formData, telegram_chat_id: e.target.value })}
                                                className="input"
                                                placeholder="123456789"
                                            />
                                            <p className="text-xs text-gray-500 mt-1">
                                                Необязательно. Можно использовать для привязки уведомлений вручную.
                                            </p>
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Телефон</label>
                                            <input
                                                type="tel"
                                                value={formData.phone}
                                                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                                className="input"
                                                placeholder="+7..."
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                                                {editingAdmin ? 'Новый пароль (оставьте пустым чтобы не менять)' : 'Пароль'}
                                            </label>
                                            <input
                                                type="password"
                                                value={formData.password}
                                                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                                className="input"
                                                placeholder={editingAdmin ? "..." : "******"}
                                                required={!editingAdmin}
                                                minLength={6}
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Права доступа</label>
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-h-80 overflow-y-auto pr-2 custom-scrollbar">
                                        {renderPermissionsGroup('Объекты', [
                                            { key: 'objects_view', label: 'Просмотр объектов' },
                                            { key: 'objects_create', label: 'Добавление объектов' },
                                            { key: 'objects_edit', label: 'Изменение объектов' },
                                            { key: 'objects_delete', label: 'Удаление объектов' },
                                        ])}
                                        {renderPermissionsGroup('Работники', [
                                            { key: 'workers_view', label: 'Просмотр работников' },
                                            { key: 'workers_create', label: 'Добавление работников' },
                                            { key: 'workers_edit', label: 'Изменение работников' },
                                            { key: 'workers_delete', label: 'Удаление работников' },
                                        ])}
                                        {renderPermissionsGroup('Отчёты', [
                                            { key: 'reports_view', label: 'Просмотр отчётов' },
                                            { key: 'reports_export', label: 'Экспорт отчётов' },
                                        ])}
                                        {renderPermissionsGroup('Смены', [
                                            { key: 'shifts_view', label: 'Просмотр смен' },
                                            { key: 'shifts_plan', label: 'Планирование смен' },
                                            { key: 'shifts_edit', label: 'Изменение смен' },
                                        ])}
                                        {renderPermissionsGroup('Задачи', [
                                            { key: 'tasks_view', label: 'Просмотр задач' },
                                            { key: 'tasks_create', label: 'Создание задач' },
                                            { key: 'tasks_edit', label: 'Изменение задач' },
                                            { key: 'tasks_delete', label: 'Удаление задач' },
                                        ])}
                                        {renderPermissionsGroup('Роли', [
                                            { key: 'roles_view', label: 'Просмотр ролей' },
                                            { key: 'roles_manage', label: 'Управление ролями' },
                                        ])}
                                    </div>
                                </div>

                                <div className="flex gap-3 pt-4 border-t border-gray-100 dark:border-gray-800">
                                    <button type="button" onClick={closeModal} className="btn-ghost flex-1">
                                        Отмена
                                    </button>
                                    <button type="submit" className="btn-primary flex-1">
                                        {editingAdmin ? 'Сохранить' : 'Создать'}
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

import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { UserPlus2, Plus, Trash2, Edit2 } from 'lucide-react';

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
            <div key={title} className="mb-3">
                <div className="text-xs font-semibold text-gray-400 mb-2 uppercase">{title}</div>
                <div className="space-y-1">
                    {permissions.map(({ key, label }) => (
                        <label key={key} className="flex items-center gap-2 cursor-pointer hover:bg-gray-700/50 p-1.5 rounded">
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
                                className="rounded border-gray-600 bg-gray-700 text-primary-500"
                            />
                            <span className="text-gray-300 text-sm">{label}</span>
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

    if (loading) return <div className="text-white">Загрузка...</div>;

    const canManage = adminUser?.role === 'super_admin' || adminUser?.role === 'sub_admin';

    return (
        <div>
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-white">Администраторы и Менеджеры</h2>
                {canManage && (
                    <button onClick={() => openModal()} className="btn-primary flex items-center gap-2">
                        <Plus className="w-4 h-4" />
                        Добавить
                    </button>
                )}
            </div>

            <div className="card overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-gray-700/50 text-gray-400 text-sm uppercase">
                                <th className="p-4">Имя</th>
                                <th className="p-4">Роль</th>
                                <th className="p-4">Telegram ID</th>
                                <th className="p-4">Телефон</th>
                                <th className="p-4 text-right">Действия</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-700">
                            {subAdmins.map((admin) => {
                                const canEditThis = adminUser?.role === 'super_admin' || admin.created_by === adminUser?.id;

                                return (
                                    <tr key={admin.id} className="hover:bg-gray-700/30 transition-colors">
                                        <td className="p-4">
                                            <div className="font-medium text-white">{admin.name || 'Без имени'}</div>
                                            <div className="text-sm text-gray-500">{admin.email}</div>
                                        </td>
                                        <td className="p-4">
                                            <span className={`px-2 py-1 rounded text-xs ${admin.role === 'manager'
                                                ? 'bg-purple-500/20 text-purple-400'
                                                : 'bg-blue-500/20 text-blue-400'
                                                }`}>
                                                {admin.role === 'manager' ? 'Менеджер' : 'Sub Admin'}
                                            </span>
                                        </td>
                                        <td className="p-4 text-gray-300 font-mono text-sm">
                                            {admin.telegram_chat_id || <span className="text-gray-600">-</span>}
                                        </td>
                                        <td className="p-4 text-gray-300">
                                            {admin.phone || '-'}
                                        </td>
                                        <td className="p-4 text-right">
                                            {canEditThis && (
                                                <div className="flex justify-end gap-2">
                                                    <button
                                                        onClick={() => openModal(admin)}
                                                        className="p-2 hover:bg-gray-600 rounded transition-colors text-blue-400"
                                                    >
                                                        <Edit2 className="w-4 h-4" />
                                                    </button>
                                                    <button
                                                        onClick={() => handleDelete(admin.id)}
                                                        className="p-2 hover:bg-gray-600 rounded transition-colors text-red-400"
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
                        <div className="text-center text-gray-400 py-12">
                            <UserPlus2 className="w-12 h-12 mx-auto mb-4 opacity-50" />
                            <p>Нет пользователей. Создайте первого.</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
                    <div className="bg-gray-800 rounded-lg max-w-md w-full max-h-[90vh] overflow-y-auto">
                        <div className="p-6">
                            <h3 className="text-xl font-bold text-white mb-4">
                                {editingAdmin ? 'Редактировать' : 'Новый пользователь'}
                            </h3>

                            <form onSubmit={handleSubmit} className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-2">Роль</label>
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
                                    <label className="block text-sm font-medium text-gray-300 mb-2">Имя</label>
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
                                    <label className="block text-sm font-medium text-gray-300 mb-2">Telegram Chat ID</label>
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
                                    <label className="block text-sm font-medium text-gray-300 mb-2">Email (Логин)</label>
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

                                <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-2">Телефон</label>
                                    <input
                                        type="tel"
                                        value={formData.phone}
                                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                        className="input"
                                        placeholder="+7..."
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-2">
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

                                <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-2">Права доступа</label>
                                    <div className="space-y-3 max-h-96 overflow-y-auto border border-gray-700 rounded p-3 text-sm">
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

                                <div className="flex gap-2 pt-4">
                                    <button type="submit" className="btn-primary flex-1">
                                        {editingAdmin ? 'Сохранить' : 'Создать'}
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

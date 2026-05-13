import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { UserPlus2, Plus, Trash2, Edit2, Shield, User, Smartphone, Layout, X, Eye, EyeOff, Copy } from 'lucide-react';
import PasswordGenerator from './PasswordGenerator';

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
    plain_password?: string | null;
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
            objects_view_client_rates: false,
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
            // Email Search
            email_search_view: false,
            // Процедуры (SOP library) — на просмотр включено по умолчанию,
            // super-admin может выключить если нужно скрыть от конкретного админа.
            procedures_view: true,
        }
    });

    useEffect(() => {
        loadSubAdmins();
    }, []);

    const loadSubAdmins = async () => {
        setLoading(true);
        // Fetch only sub_admins and managers
        const { data, error } = await supabase
            .from('admin_users')
            .select('*')
            .in('role', ['sub_admin', 'manager'])
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
                    objects_view_client_rates: false,
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
                    email_search_view: false,
                    procedures_view: true,
                }
            });
        }
        setShowModal(true);
    };

    const renderPermissionsGroup = (title: string, permissions: Array<{ key: string, label: string }>) => {
        return (
            <div key={title} className="mb-4 bg-zinc-50 dark:bg-zinc-900 p-3 rounded-lg border border-zinc-200 dark:border-zinc-800">
                <div className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 mb-2 uppercase tracking-wider">{title}</div>
                <div className="grid grid-cols-1 gap-2">
                    {permissions.map(({ key, label }) => (
                        <label key={key} className="flex items-center gap-3 cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800 p-1.5 rounded-md transition-colors">
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
                                className="w-4 h-4 rounded border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:ring-zinc-500"
                            />
                            <span className="text-zinc-700 dark:text-zinc-300 text-sm">{label}</span>
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
                <h2 className="text-2xl font-bold text-main">Администраторы и Менеджеры</h2>
                {canManage && (
                    <button onClick={() => openModal()} className="btn-primary flex items-center gap-2">
                        <Plus className="w-4 h-4" />
                        Добавить
                    </button>
                )}
            </div>

            <div className="card overflow-hidden p-0">
                {/* Mobile cards */}
                <div className="flex flex-col gap-3 p-4 sm:hidden">
                    {subAdmins.map((admin) => {
                        const canEditThis = adminUser?.role === 'super_admin' || admin.created_by === adminUser?.id;
                        return (
                            <div key={admin.id} className="flex items-center justify-between p-3 bg-subtle/30 rounded-xl border border-border">
                                <div className="flex items-center gap-3 min-w-0">
                                    <div className="w-9 h-9 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500 flex items-center justify-center shrink-0">
                                        <User className="w-4 h-4" />
                                    </div>
                                    <div className="min-w-0">
                                        <div className="font-medium text-main text-sm truncate">{admin.name || 'Без имени'}</div>
                                        <div className="text-xs text-muted truncate">{admin.email}</div>
                                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium mt-1 ${admin.role === 'manager' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300' : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'}`}>
                                            {admin.role === 'manager' ? 'Менеджер' : 'Sub Admin'}
                                        </span>
                                    </div>
                                </div>
                                {canEditThis && (
                                    <div className="flex gap-1 ml-2 shrink-0">
                                        <button onClick={() => openModal(admin)} className="p-1.5 text-muted hover:text-primary rounded-lg"><Edit2 className="w-4 h-4" /></button>
                                        <button onClick={() => handleDelete(admin.id)} className="p-1.5 text-muted hover:text-red-600 rounded-lg"><Trash2 className="w-4 h-4" /></button>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                    {subAdmins.length === 0 && (
                        <div className="text-center text-muted py-8">
                            <UserPlus2 className="w-10 h-10 mx-auto mb-3 opacity-20" />
                            <p>Нет пользователей</p>
                        </div>
                    )}
                </div>
                {/* Desktop table */}
                <div className="hidden sm:block overflow-x-auto">
                    <table className="table w-full">
                        <thead>
                            <tr>
                                <th>Имя</th>
                                <th>Роль</th>
                                <th>Telegram ID</th>
                                <th>Телефон</th>
                                <th>Пароль</th>
                                <th className="text-right">Действия</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                            {subAdmins.map((admin) => {
                                const canEditThis = adminUser?.role === 'super_admin' || admin.created_by === adminUser?.id;

                                return (
                                    <tr key={admin.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors">
                                        <td className="font-medium text-zinc-900 dark:text-white">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 flex items-center justify-center">
                                                    <User className="w-4 h-4" />
                                                </div>
                                                <div>
                                                    <div className="font-medium">{admin.name || 'Без имени'}</div>
                                                    <div className="text-xs text-zinc-500 dark:text-zinc-400">{admin.email}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td>
                                            <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium border ${admin.role === 'manager'
                                                ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800'
                                                : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700'
                                                }`}>
                                                {admin.role === 'manager' ? (
                                                    <Layout className="w-3 h-3" />
                                                ) : (
                                                    <Shield className="w-3 h-3" />
                                                )}
                                                {admin.role === 'manager' ? 'Менеджер' : 'Sub Admin'}
                                            </span>
                                        </td>
                                        <td className="text-zinc-600 dark:text-zinc-300 font-mono text-sm">
                                            {admin.telegram_chat_id || <span className="text-zinc-400 dark:text-zinc-500">-</span>}
                                        </td>
                                        <td className="text-zinc-600 dark:text-zinc-300">
                                            {admin.phone ? (
                                                <div className="flex items-center gap-1.5">
                                                    <Smartphone className="w-3.5 h-3.5 text-zinc-400" />
                                                    {admin.phone}
                                                </div>
                                            ) : '-'}
                                        </td>
                                        <td className="text-zinc-600 dark:text-zinc-300">
                                            {admin.plain_password ? (
                                                <PasswordCell password={admin.plain_password} />
                                            ) : <span className="text-zinc-400 dark:text-zinc-500">—</span>}
                                        </td>
                                        <td className="text-right">
                                            {canEditThis && (
                                                <div className="flex justify-end gap-2">
                                                    <button
                                                        onClick={() => openModal(admin)}
                                                        className="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400 rounded-lg transition-colors"
                                                        title="Редактировать"
                                                    >
                                                        <Edit2 className="w-4 h-4" />
                                                    </button>
                                                    <button
                                                        onClick={() => handleDelete(admin.id)}
                                                        className="p-1.5 hover:bg-danger/10 text-red-600 dark:text-red-400 rounded-lg transition-colors"
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
                        <div className="text-center text-muted py-12">
                            <UserPlus2 className="w-12 h-12 mx-auto mb-4 opacity-20" />
                            <p>Нет пользователей. Создайте первого.</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Modal */}
            {showModal && createPortal(
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-[9999] animate-fadeIn">
                    <div className="bg-white dark:bg-zinc-950 rounded-2xl shadow-xl border border-zinc-200 dark:border-zinc-800 max-w-2xl w-full max-h-[90vh] overflow-y-auto animate-scaleIn">
                        <div className="p-6">
                            <div className="flex justify-between items-center mb-6">
                                <h3 className="text-xl font-bold text-zinc-900 dark:text-white">
                                    {editingAdmin ? 'Редактировать' : 'Новый пользователь'}
                                </h3>
                                <button onClick={closeModal} className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200">
                                    <span className="sr-only">Закрыть</span>
                                    <X className="w-6 h-6" />
                                </button>
                            </div>

                            <form onSubmit={handleSubmit} className="space-y-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="space-y-4">
                                        <div>
                                            <label className="block text-sm font-medium text-main mb-1.5">Роль</label>
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
                                            <label className="block text-sm font-medium text-main mb-1.5">Имя</label>
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
                                            <label className="block text-sm font-medium text-main mb-1.5">Email (Логин)</label>
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
                                            <label className="block text-sm font-medium text-main mb-1.5">Telegram Chat ID</label>
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
                                            <label className="block text-sm font-medium text-main mb-1.5">Телефон</label>
                                            <input
                                                type="tel"
                                                value={formData.phone}
                                                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                                className="input"
                                                placeholder="+7..."
                                            />
                                        </div>

                                        <PasswordGenerator
                                            value={formData.password}
                                            onChange={(v) => setFormData({ ...formData, password: v })}
                                            label={editingAdmin ? 'Новый пароль (оставьте пустым чтобы не менять)' : 'Пароль'}
                                            placeholder={editingAdmin ? "..." : "******"}
                                            required={!editingAdmin}
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-main mb-3">Права доступа</label>
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-h-80 overflow-y-auto pr-2 custom-scrollbar">
                                        {renderPermissionsGroup('Объекты', [
                                            { key: 'objects_view', label: 'Просмотр объектов' },
                                            { key: 'objects_create', label: 'Добавление объектов' },
                                            { key: 'objects_edit', label: 'Изменение объектов' },
                                            { key: 'objects_delete', label: 'Удаление объектов' },
                                            { key: 'objects_view_client_rates', label: 'Просмотр выплат (клиентских)' },
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
                                        {renderPermissionsGroup('Email Search', [
                                            { key: 'email_search_view', label: 'Доступ к поиску Email' },
                                        ])}
                                        {renderPermissionsGroup('Процедуры', [
                                            { key: 'procedures_view', label: 'Просмотр процедур (SOP)' },
                                        ])}
                                    </div>
                                </div>

                                <div className="flex gap-3 pt-4 border-t border-zinc-100 dark:border-zinc-800">
                                    <button type="button" onClick={closeModal} className="btn-secondary flex-1">
                                        Отмена
                                    </button>
                                    <button type="submit" className="btn-primary flex-1">
                                        {editingAdmin ? 'Сохранить' : 'Создать'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
}

function PasswordCell({ password }: { password: string }) {
    const [visible, setVisible] = useState(false);
    const [copied, setCopied] = useState(false);

    const handleCopy = () => {
        navigator.clipboard.writeText(password);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };

    return (
        <div className="flex items-center gap-1.5">
            <span className="font-mono text-sm">
                {visible ? password : '••••••••'}
            </span>
            <button
                onClick={() => setVisible(!visible)}
                className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded transition-colors"
                title={visible ? 'Скрыть' : 'Показать'}
            >
                {visible ? <EyeOff className="w-3.5 h-3.5 text-zinc-400" /> : <Eye className="w-3.5 h-3.5 text-zinc-400" />}
            </button>
            <button
                onClick={handleCopy}
                className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded transition-colors"
                title="Копировать"
            >
                <Copy className={`w-3.5 h-3.5 ${copied ? 'text-green-500' : 'text-zinc-400'}`} />
            </button>
        </div>
    );
}

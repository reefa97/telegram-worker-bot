import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Plus, Edit2, Trash2, MapPin, DollarSign, Camera, CheckSquare, ListTodo, Clock, X } from 'lucide-react';
import TaskManagementModal from './TaskManagementModal';

interface CleaningObject {
    id: string;
    name: string;
    address: string;
    is_active: boolean;
    latitude?: number;
    longitude?: number;
    geofence_radius?: number;
    salary_type?: 'hourly' | 'monthly_fixed';
    hourly_rate?: number;
    monthly_rate?: number;
    expected_cleanings_per_month?: number;
    requires_photos?: boolean;
    requires_tasks?: boolean;
    schedule_days?: number[];
    schedule_time_start?: string;
    schedule_time_end?: string;
    created_at: string;
    created_by?: string;
}

export default function ObjectsPanel() {
    const { adminUser, user } = useAuth();
    const [objects, setObjects] = useState<CleaningObject[]>([]);
    const [creators, setCreators] = useState<Record<string, string>>({});
    const [adminsList, setAdminsList] = useState<Array<{ id: string, name: string, role: string }>>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingObject, setEditingObject] = useState<CleaningObject | null>(null);
    const [managingTasksFor, setManagingTasksFor] = useState<CleaningObject | null>(null);

    const [formData, setFormData] = useState({
        name: '',
        address: '',
        latitude: 0,
        longitude: 0,
        geofence_radius: 100,
        salary_type: 'hourly' as 'hourly' | 'monthly_fixed',
        hourly_rate: 0,
        monthly_rate: 0,
        expected_cleanings_per_month: 20,
        requires_photos: false,
        requires_tasks: false,
        schedule_days: [] as number[],
        schedule_time_start: '09:00',
        schedule_time_end: '18:00',
        owner_ids: [] as string[],
    });

    useEffect(() => {
        loadObjects();
        loadCreators();
        loadAdmins();
    }, []);

    const loadCreators = async () => {
        const { data } = await supabase.from('admin_users').select('id, name');
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

    const loadAdmins = async () => {
        const { data } = await supabase
            .from('admin_users')
            .select('id, name, role')
            .order('name');
        if (data) setAdminsList(data);
    };

    const loadObjects = async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from('cleaning_objects')
            .select('*')
            .order('created_at', { ascending: false });

        if (data) setObjects(data);
        if (error) console.error('Error loading objects:', error);
        setLoading(false);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        try {
            const objectData: any = {
                name: formData.name,
                address: formData.address,
                latitude: formData.latitude,
                longitude: formData.longitude,
                geofence_radius: formData.geofence_radius,
                salary_type: formData.salary_type,
                hourly_rate: formData.hourly_rate,
                monthly_rate: formData.monthly_rate,
                expected_cleanings_per_month: formData.expected_cleanings_per_month,
                requires_photos: formData.requires_photos,
                requires_tasks: formData.requires_tasks,
                schedule_days: formData.schedule_days,
                schedule_time_start: formData.schedule_time_start,
                schedule_time_end: formData.schedule_time_end,
            };

            // Super Admin can reassign objects, others create with their own ID
            // For audit, we set created_by to current user if new, but main logic is in object_owners
            if (!editingObject) {
                // Explicitly use the session user ID to satisfy RLS policy (created_by = auth.uid())
                objectData.created_by = user?.id;
            }

            let targetId: string;

            if (editingObject) {
                targetId = editingObject.id;
                const { error } = await supabase
                    .from('cleaning_objects')
                    .update(objectData)
                    .eq('id', editingObject.id);
                if (error) throw error;
            } else {
                // Use RPC to bypass RLS issues
                const { data, error } = await supabase
                    .rpc('create_object_secure', { payload: objectData });

                if (error) throw error;
                // RPC returns the object structure directly (as JSONB)
                // We cast it or assume it has the ID. 
                // data is the JSONB response, e.g. { id: "...", name: "..." }
                // Supabase TS types for RPC might infer 'any' or defined generic.
                // Safely accessing id:
                const createdObj = data as any;
                targetId = createdObj.id;
            }

            // Sync Owners (Only for Super Admin or on creation)
            if (adminUser?.role === 'super_admin' || !editingObject) {
                // Remove all existing
                await supabase.from('object_owners').delete().eq('object_id', targetId);

                // Add new selection
                if (formData.owner_ids && formData.owner_ids.length > 0) {
                    const ownerRows = formData.owner_ids.map(uid => ({
                        object_id: targetId,
                        admin_id: uid
                    }));
                    await supabase.from('object_owners').insert(ownerRows);
                } else if (!editingObject) {
                    // Default to creator if no owners selected during creation
                    await supabase.from('object_owners').insert({
                        object_id: targetId,
                        admin_id: adminUser?.id
                    });
                }
            }

            loadObjects();
            closeModal();
        } catch (error) {
            console.error('Error saving object:', error);
            const errorMessage = error instanceof Error ? error.message : JSON.stringify(error);
            alert(`Ошибка при сохранении объекта: ${errorMessage}`);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Переместить объект в корзину?')) return;

        const { error } = await supabase.rpc('soft_delete_object', { object_id: id });

        if (error) {
            console.error('Error deleting object:', error);
            alert('Ошибка при удалении');
        } else {
            loadObjects();
        }
    };

    const openModal = async (object?: CleaningObject) => {
        if (object) {
            setEditingObject(object);

            // Load owners
            let currentOwners: string[] = [];
            const { data: ownersData } = await supabase
                .from('object_owners')
                .select('admin_id')
                .eq('object_id', object.id);

            if (ownersData) {
                currentOwners = ownersData.map(o => o.admin_id);
            }

            setFormData({
                name: object.name,
                address: object.address,
                latitude: object.latitude || 0,
                longitude: object.longitude || 0,
                geofence_radius: object.geofence_radius || 100,
                salary_type: object.salary_type || 'hourly',
                hourly_rate: object.hourly_rate || 0,
                monthly_rate: object.monthly_rate || 0,
                expected_cleanings_per_month: object.expected_cleanings_per_month || 20,
                requires_photos: object.requires_photos || false,
                requires_tasks: object.requires_tasks || false,
                schedule_days: object.schedule_days || [],
                schedule_time_start: object.schedule_time_start || '09:00',
                schedule_time_end: object.schedule_time_end || '18:00',
                owner_ids: currentOwners,
            });
        } else {
            setEditingObject(null);
            setFormData({
                name: '',
                address: '',
                latitude: 0,
                longitude: 0,
                geofence_radius: 100,
                salary_type: 'hourly',
                hourly_rate: 0,
                monthly_rate: 0,
                expected_cleanings_per_month: 20,
                requires_photos: false,
                requires_tasks: false,
                schedule_days: [],
                schedule_time_start: '09:00',
                schedule_time_end: '18:00',
                owner_ids: [adminUser?.id || ''],
            });
        }
        setShowModal(true);
    };

    const closeModal = () => {
        setShowModal(false);
        setEditingObject(null);
    };

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
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Объекты работы</h2>
                {(adminUser?.role === 'super_admin' || adminUser?.permissions?.objects_create) && (
                    <button onClick={() => openModal()} className="btn-primary flex items-center gap-2">
                        <Plus className="w-4 h-4" />
                        Добавить объект
                    </button>
                )}
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {objects.map((object) => (
                    <div key={object.id} className="card hover:shadow-lg transition-shadow">
                        <div className="flex items-start justify-between mb-3">
                            <div className="flex-1">
                                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">{object.name}</h3>
                                <div className="flex items-start gap-2 text-sm text-gray-500 dark:text-gray-400">
                                    <MapPin className="w-4 h-4 mt-0.5 flex-shrink-0" />
                                    <span>{object.address}</span>
                                </div>
                            </div>
                            <span className={object.is_active ? 'badge-success' : 'badge-disable'}>
                                {object.is_active ? 'Активен' : 'Неактивен'}
                            </span>
                        </div>

                        {/* Creator Info (for Admins) */}
                        {(object as any).created_by && creators[(object as any).created_by] && (
                            <div className="mb-2 text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                                <span className="text-gray-600 dark:text-gray-500">Опекун:</span>
                                <span className="font-medium">{creators[(object as any).created_by]}</span>
                            </div>
                        )}

                        {/* Configuration badges */}
                        <div className="flex flex-wrap gap-1 mb-3">
                            {object.requires_photos && (
                                <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 text-xs rounded-full flex items-center gap-1 border border-blue-200 dark:border-blue-800">
                                    <Camera className="w-3 h-3" /> Фото
                                </span>
                            )}
                            {object.requires_tasks && (
                                <span className="px-2 py-0.5 bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 text-xs rounded-full flex items-center gap-1 border border-purple-200 dark:border-purple-800">
                                    <CheckSquare className="w-3 h-3" /> Задачи
                                </span>
                            )}
                            {(object.hourly_rate || object.monthly_rate) && (
                                <span className="px-2 py-0.5 bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 text-xs rounded-full flex items-center gap-1 border border-green-200 dark:border-green-800">
                                    <DollarSign className="w-3 h-3" />
                                    {object.salary_type === 'hourly' ? `${object.hourly_rate} zł/ч` : `${object.monthly_rate} zł/мес`}
                                </span>
                            )}
                        </div>

                        <div className="flex flex-col gap-2 mt-4 pt-3">
                            <button
                                onClick={() => setManagingTasksFor(object)}
                                className="w-full py-2 px-3 bg-purple-50 dark:bg-purple-900/20 hover:bg-purple-100 dark:hover:bg-purple-900/30 text-purple-600 dark:text-purple-400 font-medium text-sm rounded-lg transition-colors flex items-center justify-center gap-2"
                            >
                                <ListTodo className="w-4 h-4" />
                                Управлять задачами
                            </button>

                            <div className="grid grid-cols-2 gap-2">
                                {(adminUser?.role === 'super_admin' || adminUser?.permissions?.objects_edit) && (
                                    <button
                                        onClick={() => openModal(object)}
                                        className="py-2 px-3 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-medium text-sm rounded-lg transition-colors flex items-center justify-center gap-2"
                                    >
                                        <Edit2 className="w-4 h-4" />
                                        Изменить
                                    </button>
                                )}
                                {(adminUser?.role === 'super_admin' || adminUser?.permissions?.objects_delete) && (
                                    <button
                                        onClick={() => handleDelete(object.id)}
                                        className="py-2 px-3 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400 font-medium text-sm rounded-lg transition-colors flex items-center justify-center gap-2"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                        Удалить
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {objects.length === 0 && (
                <div className="text-center text-gray-500 dark:text-gray-400 py-12">
                    <MapPin className="w-12 h-12 mx-auto mb-4 opacity-30" />
                    <p>Нет объектов. Создайте первый объект.</p>
                </div>
            )}

            {/* Modal */}
            {showModal && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <div className="modal-header">
                            <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                                {editingObject ? 'Редактировать объект' : 'Новый объект'}
                            </h3>
                            <button onClick={closeModal} className="btn-icon">
                                <span className="text-2xl leading-none">&times;</span>
                            </button>
                        </div>

                        <form onSubmit={handleSubmit}>
                            <div className="modal-body space-y-4">
                                {/* Basic Info */}
                                <div className="space-y-4 pb-4 border-b border-gray-100 dark:border-gray-800">
                                    <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-200 flex items-center gap-2">
                                        <MapPin className="w-4 h-4 text-primary-500" /> Основная информация
                                    </h4>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Название</label>
                                        <input
                                            type="text"
                                            value={formData.name}
                                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                            className="input"
                                            placeholder="Офис, Склад и т.д."
                                            required
                                        />
                                    </div>

                                    {/* Owner Selection (Multi-select) */}
                                    {adminUser?.role === 'super_admin' && (
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Опекуны объекта (получают уведомления)</label>
                                            <div className="flex flex-wrap gap-2 mb-2">
                                                {formData.owner_ids.map(ownerId => {
                                                    const admin = adminsList.find(a => a.id === ownerId);
                                                    return admin ? (
                                                        <span key={ownerId} className="px-2 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded text-sm flex items-center gap-1 border border-purple-200 dark:border-purple-800">
                                                            {admin.name}
                                                            <button
                                                                type="button"
                                                                onClick={() => setFormData(prev => ({ ...prev, owner_ids: prev.owner_ids.filter(id => id !== ownerId) }))}
                                                                className="hover:text-purple-900 dark:hover:text-purple-100"
                                                            >
                                                                <X className="w-3 h-3" />
                                                            </button>
                                                        </span>
                                                    ) : null;
                                                })}
                                            </div>

                                            <div className="relative">
                                                <select
                                                    value=""
                                                    onChange={(e) => {
                                                        const newId = e.target.value;
                                                        if (newId && !formData.owner_ids.includes(newId)) {
                                                            setFormData(prev => ({ ...prev, owner_ids: [...prev.owner_ids, newId] }));
                                                        }
                                                    }}
                                                    className="input appearance-none"
                                                >
                                                    <option value="">+ Добавить опекуна</option>
                                                    {adminsList
                                                        .filter(a => !formData.owner_ids.includes(a.id))
                                                        .map(admin => (
                                                            <option key={admin.id} value={admin.id}>
                                                                {admin.name} ({admin.role})
                                                            </option>
                                                        ))}
                                                </select>
                                            </div>
                                        </div>
                                    )}

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Адрес</label>
                                        <textarea
                                            value={formData.address}
                                            onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                                            className="input"
                                            rows={2}
                                            placeholder="Полный адрес объекта"
                                            required
                                        />
                                    </div>

                                    <div className="grid grid-cols-3 gap-3">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Широта</label>
                                            <input
                                                type="text"
                                                inputMode="decimal"
                                                value={formData.latitude}
                                                onChange={(e) => {
                                                    const val = e.target.value.replace(',', '.');
                                                    if (val === '' || /^-?\d*\.?\d*$/.test(val)) {
                                                        setFormData({ ...formData, latitude: val as any });
                                                    }
                                                }}
                                                className="input"
                                                placeholder="51.5074"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Долгота</label>
                                            <input
                                                type="text"
                                                inputMode="decimal"
                                                value={formData.longitude}
                                                onChange={(e) => {
                                                    const val = e.target.value.replace(',', '.');
                                                    if (val === '' || /^-?\d*\.?\d*$/.test(val)) {
                                                        setFormData({ ...formData, longitude: val as any });
                                                    }
                                                }}
                                                className="input"
                                                placeholder="-0.1278"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Радиус (м)</label>
                                            <input
                                                type="number"
                                                value={formData.geofence_radius}
                                                onChange={(e) => setFormData({ ...formData, geofence_radius: parseInt(e.target.value) })}
                                                className="input"
                                                min="10"
                                                max="1000"
                                                placeholder="100"
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Salary Config */}
                                <div className="space-y-4 pb-4 border-b border-gray-100 dark:border-gray-800">
                                    <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-200 flex items-center gap-2">
                                        <DollarSign className="w-4 h-4 text-green-500" /> Зарплата
                                    </h4>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Тип оплаты</label>
                                        <div className="relative">
                                            <select
                                                value={formData.salary_type}
                                                onChange={(e) => setFormData({ ...formData, salary_type: e.target.value as 'hourly' | 'monthly_fixed' })}
                                                className="input appearance-none"
                                            >
                                                <option value="hourly">Почасовая</option>
                                                <option value="monthly_fixed">Месячная фиксированная</option>
                                            </select>
                                        </div>
                                    </div>

                                    {formData.salary_type === 'hourly' ? (
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Ставка в час (zł)</label>
                                            <input
                                                type="text"
                                                inputMode="decimal"
                                                value={formData.hourly_rate}
                                                onChange={(e) => {
                                                    const val = e.target.value.replace(',', '.');
                                                    if (val === '' || /^\d*\.?\d*$/.test(val)) {
                                                        setFormData({ ...formData, hourly_rate: val as any });
                                                    }
                                                }}
                                                className="input"
                                                placeholder="15.00"
                                            />
                                        </div>
                                    ) : (
                                        <>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Месячная ставка (zł)</label>
                                                <input
                                                    type="text"
                                                    inputMode="decimal"
                                                    value={formData.monthly_rate}
                                                    onChange={(e) => {
                                                        const val = e.target.value.replace(',', '.');
                                                        if (val === '' || /^\d*\.?\d*$/.test(val)) {
                                                            setFormData({ ...formData, monthly_rate: val as any });
                                                        }
                                                    }}
                                                    className="input"
                                                    placeholder="2000.00"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Ожидаемое кол-во уборок/месяц</label>
                                                <input
                                                    type="number"
                                                    value={formData.expected_cleanings_per_month}
                                                    onChange={(e) => setFormData({ ...formData, expected_cleanings_per_month: parseInt(e.target.value) })}
                                                    className="input"
                                                    min="1"
                                                    placeholder="20"
                                                />
                                            </div>
                                        </>
                                    )}
                                </div>

                                {/* Schedule Config */}
                                <div className="space-y-4 pb-4 border-b border-gray-100 dark:border-gray-800">
                                    <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-200 flex items-center gap-2">
                                        <Clock className="w-4 h-4 text-blue-500" /> График уборки
                                    </h4>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Дни недели</label>
                                        <div className="flex flex-wrap gap-2">
                                            <div className="flex flex-wrap gap-2">
                                                {[
                                                    { val: 1, label: 'Пн' },
                                                    { val: 2, label: 'Вт' },
                                                    { val: 3, label: 'Ср' },
                                                    { val: 4, label: 'Чт' },
                                                    { val: 5, label: 'Пт' },
                                                    { val: 6, label: 'Сб' },
                                                    { val: 0, label: 'Вс' },
                                                ].map((day) => (
                                                    <button
                                                        key={day.val}
                                                        type="button"
                                                        onClick={() => {
                                                            const current = formData.schedule_days;
                                                            const updated = current.includes(day.val)
                                                                ? current.filter(d => d !== day.val)
                                                                : [...current, day.val].sort();
                                                            setFormData({ ...formData, schedule_days: updated });
                                                        }}
                                                        className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium transition-colors ${formData.schedule_days.includes(day.val)
                                                            ? 'bg-blue-600 text-white shadow-md transform scale-105'
                                                            : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-300 dark:hover:bg-gray-600'
                                                            }`}
                                                    >
                                                        {day.label}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Начало</label>
                                            <input
                                                type="time"
                                                value={formData.schedule_time_start}
                                                onChange={(e) => setFormData({ ...formData, schedule_time_start: e.target.value })}
                                                className="input"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Конец</label>
                                            <input
                                                type="time"
                                                value={formData.schedule_time_end}
                                                onChange={(e) => setFormData({ ...formData, schedule_time_end: e.target.value })}
                                                className="input"
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Features */}
                                <div className="space-y-4">
                                    <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-200">Требования</h4>

                                    <label className="flex items-center gap-3 cursor-pointer p-3 rounded-lg border border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                                        <input
                                            type="checkbox"
                                            checked={formData.requires_photos}
                                            onChange={(e) => setFormData({ ...formData, requires_photos: e.target.checked })}
                                            className="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500"
                                        />
                                        <div className="flex items-center gap-2">
                                            <Camera className="w-4 h-4 text-blue-500" />
                                            <span className="text-sm text-gray-700 dark:text-gray-300">Требуются фото отчеты</span>
                                        </div>
                                    </label>
                                </div>
                            </div>

                            <div className="modal-footer">
                                <button type="button" onClick={closeModal} className="btn-secondary flex-1">
                                    Отмена
                                </button>
                                <button type="submit" className="btn-primary flex-1">
                                    {editingObject ? 'Сохранить' : 'Создать'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Task Management Modal */}
            {managingTasksFor && (
                <TaskManagementModal
                    objectId={managingTasksFor.id}
                    objectName={managingTasksFor.name}
                    onClose={() => setManagingTasksFor(null)}
                />
            )}
        </div>
    );
}

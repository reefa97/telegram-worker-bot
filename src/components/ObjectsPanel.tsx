import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Plus, Edit2, Trash2, MapPin, DollarSign, Camera, CheckSquare, ListTodo, Clock } from 'lucide-react';
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
    const { adminUser } = useAuth();
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
        created_by: '',
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
            const objectData = {
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
                created_by: editingObject ? undefined : adminUser?.id,
            };

            if (editingObject) {
                const { error } = await supabase
                    .from('cleaning_objects')
                    .update(objectData)
                    .eq('id', editingObject.id);
                if (error) throw error;
            } else {
                const { error } = await supabase
                    .from('cleaning_objects')
                    .insert(objectData)
                    .single();
                if (error) throw error;
            }

            loadObjects();
            closeModal();
        } catch (error) {
            console.error('Error saving object:', error);
            const errorMessage = error instanceof Error ? error.message : (typeof error === 'object' && error !== null && 'message' in error ? (error as any).message : JSON.stringify(error));
            alert(`Ошибка при сохранении объекта: ${errorMessage}`);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Удалить объект?')) return;

        const { error } = await supabase.from('cleaning_objects').delete().eq('id', id);

        if (error) {
            console.error('Error deleting object:', error);
            alert('Ошибка при удалении');
        } else {
            loadObjects();
        }
    };

    const toggleActive = async (id: string, currentStatus: boolean) => {
        const { error } = await supabase
            .from('cleaning_objects')
            .update({ is_active: !currentStatus })
            .eq('id', id);

        if (error) {
            console.error('Error toggling status:', error);
        } else {
            loadObjects();
        }
    };

    const openModal = (object?: CleaningObject) => {
        if (object) {
            setEditingObject(object);
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
                created_by: object.created_by || '',
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
                created_by: adminUser?.id || '',
            });
        }
        setShowModal(true);
    };

    const closeModal = () => {
        setShowModal(false);
        setEditingObject(null);
    };

    if (loading) {
        return <div className="text-white">Загрузка...</div>;
    }

    return (
        <div>
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-white">Объекты работы</h2>
                <button onClick={() => openModal()} className="btn-primary flex items-center gap-2">
                    <Plus className="w-4 h-4" />
                    Добавить объект
                </button>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {objects.map((object) => (
                    <div key={object.id} className="card">
                        <div className="flex items-start justify-between mb-3">
                            <div className="flex-1">
                                <h3 className="text-lg font-semibold text-white mb-1">{object.name}</h3>
                                <div className="flex items-start gap-2 text-sm text-gray-400">
                                    <MapPin className="w-4 h-4 mt-0.5 flex-shrink-0" />
                                    <span>{object.address}</span>
                                </div>
                            </div>
                            <span className={`px-2 py-1 rounded text-xs ${object.is_active ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'
                                }`}>
                                {object.is_active ? 'Активен' : 'Неактивен'}
                            </span>
                        </div>

                        {/* Creator Info (for Admins) */}
                        {(object as any).created_by && creators[(object as any).created_by] && (
                            <div className="mb-2 text-xs text-gray-500 flex items-center gap-1">
                                <span className="text-gray-600">Создал:</span>
                                <span className="text-gray-400 font-medium">{creators[(object as any).created_by]}</span>
                            </div>
                        )}

                        {/* Configuration badges */}
                        <div className="flex flex-wrap gap-1 mb-3">
                            {object.requires_photos && (
                                <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 text-xs rounded flex items-center gap-1">
                                    <Camera className="w-3 h-3" /> Фото
                                </span>
                            )}
                            {object.requires_tasks && (
                                <span className="px-2 py-0.5 bg-purple-500/20 text-purple-400 text-xs rounded flex items-center gap-1">
                                    <CheckSquare className="w-3 h-3" /> Задачи
                                </span>
                            )}
                            {(object.hourly_rate || object.monthly_rate) && (
                                <span className="px-2 py-0.5 bg-green-500/20 text-green-400 text-xs rounded flex items-center gap-1">
                                    <DollarSign className="w-3 h-3" />
                                    {object.salary_type === 'hourly' ? `${object.hourly_rate} zł/ч` : `${object.monthly_rate} zł/мес`}
                                </span>
                            )}
                        </div>

                        <div className="flex flex-col gap-2 mt-4">
                            <button
                                onClick={() => setManagingTasksFor(object)}
                                className="w-full py-1.5 px-3 bg-purple-600/20 hover:bg-purple-600/30 text-purple-400 hover:text-purple-300 text-sm rounded transition-colors flex items-center justify-center gap-2 mb-1"
                            >
                                <ListTodo className="w-4 h-4" />
                                Управлять задачами
                            </button>

                            <div className="flex gap-2">
                                <button
                                    onClick={() => openModal(object)}
                                    className="flex-1 py-1.5 px-3 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition-colors flex items-center justify-center gap-1"
                                >
                                    <Edit2 className="w-3 h-3" />
                                    Изменить
                                </button>
                                <button
                                    onClick={() => toggleActive(object.id, object.is_active)}
                                    className="flex-1 py-1.5 px-3 bg-gray-600 hover:bg-gray-700 text-white text-sm rounded transition-colors"
                                >
                                    {object.is_active ? 'Деактивировать' : 'Активировать'}
                                </button>
                                <button
                                    onClick={() => handleDelete(object.id)}
                                    className="py-1.5 px-3 bg-red-600 hover:bg-red-700 text-white text-sm rounded transition-colors"
                                >
                                    <Trash2 className="w-3 h-3" />
                                </button>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {objects.length === 0 && (
                <div className="card text-center text-gray-400 py-12">
                    <MapPin className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>Нет объектов. Создайте первый объект.</p>
                </div>
            )}

            {/* Modal */}
            {showModal && (
                <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50">
                    <div className="flex min-h-full items-center justify-center p-4">
                        <div className="w-full max-w-2xl rounded-lg bg-gray-800 my-8">
                            <div className="p-6">
                                <h3 className="text-xl font-bold text-white mb-4">
                                    {editingObject ? 'Редактировать объект' : 'Новый объект'}
                                </h3>

                                <form onSubmit={handleSubmit} className="space-y-4">
                                    {/* Basic Info */}
                                    <div className="space-y-4 pb-4 border-b border-gray-700">
                                        <h4 className="text-sm font-semibold text-gray-300 flex items-center gap-2">
                                            <MapPin className="w-4 h-4" /> Основная информация
                                        </h4>

                                        <div>
                                            <label className="block text-sm font-medium text-gray-300 mb-2">Название</label>
                                            <input
                                                type="text"
                                                value={formData.name}
                                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                                className="input"
                                                placeholder="Офис, Склад и т.д."
                                                required
                                            />
                                        </div>

                                        {/* Owner Selection */}
                                        {adminUser?.role === 'super_admin' && (
                                            <div>
                                                <label className="block text-sm font-medium text-gray-300 mb-2">Владелец объекта</label>
                                                <select
                                                    value={formData.created_by}
                                                    onChange={(e) => setFormData({ ...formData, created_by: e.target.value })}
                                                    className="input"
                                                    required={!editingObject}
                                                >
                                                    {!editingObject && <option value="">Выберите владельца...</option>}
                                                    {adminsList.map(admin => (
                                                        <option key={admin.id} value={admin.id}>
                                                            {admin.name} ({admin.role === 'super_admin' ? 'Super Admin' : admin.role === 'manager' ? 'Менеджер' : 'Sub Admin'})
                                                        </option>
                                                    ))}
                                                </select>
                                                <p className="text-xs text-gray-500 mt-1">
                                                    Владелец будет получать уведомления от работников на данном объекте
                                                </p>
                                            </div>
                                        )}

                                        <div>
                                            <label className="block text-sm font-medium text-gray-300 mb-2">Адрес</label>
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
                                                <label className="block text-sm font-medium text-gray-300 mb-2">Широта</label>
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
                                                <label className="block text-sm font-medium text-gray-300 mb-2">Долгота</label>
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
                                                <label className="block text-sm font-medium text-gray-300 mb-2">Радиус (м)</label>
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
                                        <p className="text-xs text-gray-500">Получите координаты из Google Maps</p>
                                    </div>

                                    {/* Salary Config */}
                                    <div className="space-y-4 pb-4 border-b border-gray-700">
                                        <h4 className="text-sm font-semibold text-gray-300 flex items-center gap-2">
                                            <DollarSign className="w-4 h-4" /> Зарплата
                                        </h4>

                                        <div>
                                            <label className="block text-sm font-medium text-gray-300 mb-2">Тип оплаты</label>
                                            <select
                                                value={formData.salary_type}
                                                onChange={(e) => setFormData({ ...formData, salary_type: e.target.value as 'hourly' | 'monthly_fixed' })}
                                                className="input"
                                            >
                                                <option value="hourly">Почасовая</option>
                                                <option value="monthly_fixed">Месячная фиксированная</option>
                                            </select>
                                        </div>

                                        {formData.salary_type === 'hourly' ? (
                                            <div>
                                                <label className="block text-sm font-medium text-gray-300 mb-2">Ставка в час (zł)</label>
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
                                                    <label className="block text-sm font-medium text-gray-300 mb-2">Месячная ставка (zł)</label>
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
                                                    <label className="block text-sm font-medium text-gray-300 mb-2">Ожидаемое кол-во уборок/месяц</label>
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
                                    <div className="space-y-4 pb-4 border-b border-gray-700">
                                        <h4 className="text-sm font-semibold text-gray-300 flex items-center gap-2">
                                            <Clock className="w-4 h-4" /> График уборки
                                        </h4>

                                        <div>
                                            <label className="block text-sm font-medium text-gray-300 mb-2">Дни недели</label>
                                            <div className="flex flex-wrap gap-2">
                                                {['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'].map((day, index) => (
                                                    <button
                                                        key={index}
                                                        type="button"
                                                        onClick={() => {
                                                            const current = formData.schedule_days;
                                                            const updated = current.includes(index)
                                                                ? current.filter(d => d !== index)
                                                                : [...current, index].sort();
                                                            setFormData({ ...formData, schedule_days: updated });
                                                        }}
                                                        className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium transition-colors ${formData.schedule_days.includes(index)
                                                            ? 'bg-blue-600 text-white'
                                                            : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                                                            }`}
                                                    >
                                                        {day}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-sm font-medium text-gray-300 mb-2">Начало</label>
                                                <input
                                                    type="time"
                                                    value={formData.schedule_time_start}
                                                    onChange={(e) => setFormData({ ...formData, schedule_time_start: e.target.value })}
                                                    className="input"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-300 mb-2">Конец</label>
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
                                        <h4 className="text-sm font-semibold text-gray-300">Требования</h4>

                                        <label className="flex items-center gap-3 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={formData.requires_photos}
                                                onChange={(e) => setFormData({ ...formData, requires_photos: e.target.checked })}
                                                className="rounded border-gray-600 bg-gray-700 text-blue-500 focus:ring-blue-500"
                                            />
                                            <div className="flex items-center gap-2">
                                                <Camera className="w-4 h-4 text-blue-400" />
                                                <span className="text-sm text-gray-300">Требуются фото отчеты</span>
                                            </div>
                                        </label>

                                        <label className="flex items-center gap-3 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={formData.requires_tasks}
                                                onChange={(e) => setFormData({ ...formData, requires_tasks: e.target.checked })}
                                                className="rounded border-gray-600 bg-gray-700 text-purple-500 focus:ring-purple-500"
                                            />
                                            <div className="flex items-center gap-2">
                                                <CheckSquare className="w-4 h-4 text-purple-400" />
                                                <span className="text-sm text-gray-300">Требуется чек-лист задач</span>
                                            </div>
                                        </label>
                                    </div>

                                    <div className="flex gap-2 pt-4">
                                        <button type="submit" className="btn-primary flex-1">
                                            {editingObject ? 'Сохранить' : 'Создать'}
                                        </button>
                                        <button type="button" onClick={closeModal} className="btn-secondary flex-1">
                                            Отмена
                                        </button>
                                    </div>
                                </form>
                            </div>
                        </div>
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

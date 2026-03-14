import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Plus, Edit2, Trash2, MapPin, DollarSign, Camera, CheckSquare, Clock, X, MoreVertical, Users, Search, LayoutGrid, List, Map } from 'lucide-react';
import ObjectsMap from './ObjectsMap';
import AddressAutocomplete from './AddressAutocomplete';
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
    client_rate?: number;
    client_phones?: string[];
    client_emails?: string[];
    reminder_active?: boolean;
    reminder_frequency?: 'weekly' | 'monthly' | 'quarterly';
    reminder_assignee_id?: string;
    last_reminder_at?: string;
    owner_ids?: string[];
    client_contact_names?: string[];
}

export default function ObjectsPanel() {
    const { adminUser } = useAuth();
    const [objects, setObjects] = useState<CleaningObject[]>([]);
    const [creators, setCreators] = useState<Record<string, string>>({});
    const [adminsList, setAdminsList] = useState<Array<{ id: string, name: string, role: string }>>([]);
    const [guardianRates, setGuardianRates] = useState<Record<string, Record<string, number>>>({});
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingObject, setEditingObject] = useState<CleaningObject | null>(null);
    const [viewingObject, setViewingObject] = useState<CleaningObject | null>(null);
    const [managingTasksFor, setManagingTasksFor] = useState<CleaningObject | null>(null);
    const [openMenuId, setOpenMenuId] = useState<string | null>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    // Close dropdown on outside click
    useEffect(() => {
        const handleOutsideClick = () => setOpenMenuId(null);
        document.addEventListener('click', handleOutsideClick);
        return () => document.removeEventListener('click', handleOutsideClick);
    }, []);

    // View & Search State
    const [viewMode, setViewMode] = useState<'grid' | 'list' | 'map'>(() => {
        const savedMode = localStorage.getItem('objects_view_mode') as 'grid' | 'list' | 'map';
        return (savedMode === 'list' || savedMode === 'grid' || savedMode === 'map') ? savedMode : 'grid';
    });

    useEffect(() => {
        localStorage.setItem('objects_view_mode', viewMode);
    }, [viewMode]);
    const [searchQuery, setSearchQuery] = useState('');
    const [allWorkers, setAllWorkers] = useState<any[]>([]);

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
        client_rate: 0,
        worker_ids: [] as string[],
        client_phones: ['+48'],
        client_emails: [''],
        client_contact_names: [''],
        reminder_active: false,
        reminder_frequency: 'monthly' as 'weekly' | 'monthly' | 'quarterly',
        reminder_assignee_id: '',
        owner_rates: {} as Record<string, number>,
    });

    useEffect(() => {
        loadObjects();
        loadCreators();
        loadAdmins();
        loadAllWorkers();
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

    const loadAllWorkers = async () => {
        const { data } = await supabase
            .from('workers')
            .select('id, first_name, last_name')
            .order('first_name');
        if (data) setAllWorkers(data);
    };

    const loadObjects = async () => {
        setLoading(true);
        const [objectsRes, ratesRes] = await Promise.all([
            supabase.from('cleaning_objects').select('*, object_owners(admin_id)').order('created_at', { ascending: false }),
            supabase.from('admin_object_rates').select('*')
        ]);

        if (objectsRes.data) {
            const formatted = objectsRes.data.map((obj: any) => ({
                ...obj,
                owner_ids: obj.object_owners?.map((oo: any) => oo.admin_id) || []
            }));
            setObjects(formatted);
        }

        if (ratesRes.data) {
            const ratesMap: Record<string, Record<string, number>> = {};
            ratesRes.data.forEach((r: any) => {
                if (!ratesMap[r.object_id]) ratesMap[r.object_id] = {};
                ratesMap[r.object_id][r.admin_id] = r.monthly_rate;
            });
            setGuardianRates(ratesMap);
        }

        if (objectsRes.error) console.error('Error loading objects:', objectsRes.error);
        setLoading(false);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        try {
            // Filter out empty phone numbers and their corresponding names together
            const combinedContacts = formData.client_phones.map((phone, index) => ({
                phone: phone.trim(),
                name: (formData.client_contact_names[index] || '').trim()
            })).filter(contact => contact.phone !== '');

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
                client_rate: formData.client_rate || 0,
                client_phones: combinedContacts.map(c => c.phone),
                client_contact_names: combinedContacts.map(c => c.name),
                client_emails: formData.client_emails.filter(e => e.trim() !== ''),
                reminder_active: formData.reminder_active,
                reminder_frequency: formData.reminder_frequency,
                reminder_assignee_id: formData.reminder_assignee_id || null,
            };

            if (!editingObject) {
                objectData.created_by = adminUser?.id; // Use adminUser instead of user from context to match other components
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
                const { data, error } = await supabase
                    .rpc('create_object_secure', { payload: objectData });

                if (error) throw error;
                const createdObj = data as any;
                targetId = createdObj.id;
            }

            if (adminUser?.role === 'super_admin' || !editingObject) {
                await supabase.from('object_owners').delete().eq('object_id', targetId);

                if (formData.owner_ids && formData.owner_ids.length > 0) {
                    const ownerRows = formData.owner_ids.map(uid => ({
                        object_id: targetId,
                        admin_id: uid
                    }));
                    await supabase.from('object_owners').insert(ownerRows);
                } else if (!editingObject) {
                    await supabase.from('object_owners').insert({
                        object_id: targetId,
                        admin_id: adminUser?.id
                    });
                }

                // Sync Owner Rates
                const rateRows = formData.owner_ids.map(uid => ({
                    object_id: targetId,
                    admin_id: uid,
                    monthly_rate: formData.owner_rates[uid] || 0
                }));
                // Using upsert to handle updates
                await supabase.from('admin_object_rates').delete().eq('object_id', targetId);
                if (rateRows.length > 0) {
                    await supabase.from('admin_object_rates').insert(rateRows);
                }
            }

            // Sync Workers
            await supabase.from('worker_objects').delete().eq('object_id', targetId);
            if (formData.worker_ids && formData.worker_ids.length > 0) {
                const workerRows = formData.worker_ids.map(wid => ({
                    object_id: targetId,
                    worker_id: wid
                }));
                await supabase.from('worker_objects').insert(workerRows);
            }

            loadObjects();
            closeModal();
        } catch (error) {
            console.error('Error saving object:', error);
            const errorMessage = error instanceof Error ? error.message : JSON.stringify(error);
            alert(`Ошибка при сохранении объекта: ${errorMessage}`);
        }
    };

    const handleDelete = async (id: string, e?: React.MouseEvent) => {
        e?.stopPropagation(); // Stop propagation if called from button inside row/card
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

            // Fetch both owners and workers in parallel for better performance
            const [ownersRes, workersRes] = await Promise.all([
                supabase.from('object_owners').select('admin_id').eq('object_id', object.id),
                supabase.from('worker_objects').select('worker_id').eq('object_id', object.id)
            ]);

            const ownersData = ownersRes.data;
            const workersData = workersRes.data;

            let currentOwners = ownersData ? ownersData.map((o: any) => o.admin_id) : [];

            // FALLBACK: If object_owners is empty but object.created_by exists, 
            // it means this is an old object or the creator hasn't been added to the new system yet.
            if (currentOwners.length === 0 && object.created_by) {
                currentOwners = [object.created_by];
            }

            const workerIds = workersData ? workersData.map((w: any) => w.worker_id) : [];

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
                client_rate: object.client_rate || 0,
                worker_ids: workerIds,
                client_phones: (object.client_phones && object.client_phones.length > 0) ? object.client_phones : ['+48'],
                client_contact_names: (() => {
                    const phonesCount = (object.client_phones && object.client_phones.length > 0) ? object.client_phones.length : 1;
                    const existingNames = object.client_contact_names || [];
                    // Pad with empty strings if names are fewer than phones
                    if (existingNames.length < phonesCount) {
                        return [...existingNames, ...Array(phonesCount - existingNames.length).fill('')];
                    }
                    return existingNames;
                })(),
                client_emails: (object.client_emails && object.client_emails.length > 0) ? object.client_emails : [''],
                reminder_active: object.reminder_active || false,
                reminder_frequency: object.reminder_frequency || 'monthly',
                reminder_assignee_id: object.reminder_assignee_id || '',
                owner_rates: await (async () => {
                    const { data } = await supabase.from('admin_object_rates').select('admin_id, monthly_rate').eq('object_id', object.id);
                    const rates: Record<string, number> = {};
                    data?.forEach((r: any) => rates[r.admin_id] = r.monthly_rate);
                    return rates;
                })(),
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
                client_rate: 0,
                worker_ids: [],
                client_phones: ['+48'],
                client_contact_names: [''],
                client_emails: [''],
                reminder_active: false,
                reminder_frequency: 'monthly',
                reminder_assignee_id: adminUser?.id || '',
                owner_rates: {},
            });
        }
        setShowModal(true);
    };

    const closeModal = () => {
        setShowModal(false);
        setEditingObject(null);
    };

    // Filter Logic
    const filteredObjects = objects.filter(obj => {
        if (!searchQuery) return true;
        const lowerQuery = searchQuery.toLowerCase();

        // Search in names, addresses, phones, and contact names
        return (
            obj.name.toLowerCase().includes(lowerQuery) ||
            obj.address.toLowerCase().includes(lowerQuery) ||
            (obj.client_phones && obj.client_phones.some(p => p.toLowerCase().includes(lowerQuery))) ||
            (obj.client_contact_names && obj.client_contact_names.some(n => n && n.toLowerCase().includes(lowerQuery)))
        );
    });

    // Salary Summary Calculation
    const calculateSalarySummary = () => {
        let fixedTotal = 0;
        let hourlyTotal = 0;
        let clientRatesTotal = 0;
        let guardiansTotal = 0;

        filteredObjects.forEach((obj) => {
            if (!obj.is_active) return; // Skip inactive objects for budget summary

            if (obj.client_rate) {
                clientRatesTotal += obj.client_rate;
            }

            // Worker fixed salary
            if (obj.salary_type === 'monthly_fixed' && obj.monthly_rate) {
                fixedTotal += obj.monthly_rate;
            } else if (obj.salary_type === 'hourly' && obj.hourly_rate && obj.schedule_time_start && obj.schedule_time_end) {
                // Parse times for worker hourly salary
                const [startH, startM] = obj.schedule_time_start.split(':').map(Number);
                const [endH, endM] = obj.schedule_time_end.split(':').map(Number);

                let durationHours = (endH + endM / 60) - (startH + startM / 60);
                if (durationHours < 0) durationHours += 24;

                const daysPerWeek = obj.schedule_days?.length || 0;
                const monthlyHours = durationHours * daysPerWeek * 4.33;
                hourlyTotal += monthlyHours * obj.hourly_rate;
            }

            // Guardian rates (monthly rates for all assigned owners)
            const rates = guardianRates[obj.id];
            if (rates) {
                Object.values(rates).forEach(rate => {
                    guardiansTotal += rate;
                });
            }
        });

        const totalWorkerExpenses = fixedTotal + hourlyTotal;
        const totalExpenses = totalWorkerExpenses + guardiansTotal;

        return {
            fixedTotal,
            hourlyTotal,
            clientRatesTotal,
            guardiansTotal,
            totalWorkerExpenses,
            totalExpenses,
            profit: clientRatesTotal - totalExpenses
        };
    };

    const salarySummary = calculateSalarySummary();
    const canSeeClientRates = adminUser?.role === 'super_admin' || adminUser?.permissions?.objects_view_client_rates;
    const canEditClientRates = adminUser?.role === 'super_admin';

    if (loading) {
        return (
            <div className="flex justify-center items-center h-64">
                <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    return (
        <div>
            {/* Header with Title, Search, View Toggle, Add Button */}
            <div className="flex flex-col gap-3 mb-6">
                {/* Row 1: Title + Add Button */}
                <div className="flex items-center justify-between">
                    <h2 className="text-xl sm:text-2xl font-bold text-main">Объекты работы</h2>
                    {(adminUser?.role === 'super_admin' || adminUser?.permissions?.objects_create) && (
                        <button onClick={() => openModal()} className="btn-primary flex items-center gap-2 whitespace-nowrap">
                            <Plus className="w-4 h-4" />
                            <span className="hidden sm:inline">Добавить объект</span>
                            <span className="sm:hidden">Добавить</span>
                        </button>
                    )}
                </div>

                {/* Row 2: Search + View Toggle */}
                <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                        <input
                            type="text"
                            placeholder="Поиск по названию или адресу..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-9 pr-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 transition-all shadow-sm"
                        />
                        <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    </div>

                    {/* View Toggle */}
                    <div className="flex bg-gray-100 dark:bg-gray-800 p-1 rounded-lg border border-gray-200 dark:border-gray-700 shrink-0">
                        <button
                            onClick={() => setViewMode('grid')}
                            className={`p-1.5 rounded-md transition-all ${viewMode === 'grid' ? 'bg-white dark:bg-gray-700 shadow-sm text-primary-600 dark:text-primary-400' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}
                            title="Плитка"
                        >
                            <LayoutGrid className="w-4 h-4" />
                        </button>
                        <button
                            onClick={() => setViewMode('list')}
                            className={`hidden sm:block p-1.5 rounded-md transition-all ${viewMode === 'list' ? 'bg-white dark:bg-gray-700 shadow-sm text-primary-600 dark:text-primary-400' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}
                            title="Список"
                        >
                            <List className="w-4 h-4" />
                        </button>
                        <button
                            onClick={() => setViewMode('map')}
                            className={`p-1.5 rounded-md transition-all ${viewMode === 'map' ? 'bg-white dark:bg-gray-700 shadow-sm text-primary-600 dark:text-primary-400' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}
                            title="Карта"
                        >
                            <Map className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            </div>

            {/* List View (Table) */}
            {viewMode === 'list' && (
                <div className="table-container animate-fadeIn">
                    <div className="overflow-x-auto">
                        <table className="table">
                            <thead>
                                <tr>
                                    <th className="px-6 py-4 font-semibold">Название / Адрес</th>
                                    <th className="px-6 py-4 font-semibold">Оплата (работнику)</th>
                                    {canSeeClientRates && <th className="px-6 py-4 font-semibold">Оплата (клиент)</th>}
                                    <th className="px-6 py-4 font-semibold">Требования</th>
                                    <th className="px-6 py-4 font-semibold">Опекун</th>
                                    <th className="px-6 py-4 font-semibold text-right">Действия</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredObjects.map(object => (
                                    <tr
                                        key={object.id}
                                        onClick={() => setViewingObject(object)}
                                        className="group transition-colors cursor-pointer"
                                    >
                                        <td className="px-6 py-4">
                                            <div className="font-medium text-main mb-0.5">{object.name}</div>
                                            <div className="text-muted flex items-center gap-1.5 text-xs">
                                                <MapPin className="w-3 h-3 flex-shrink-0" />
                                                <span className="line-clamp-1">{object.address}</span>
                                            </div>
                                            {(object.client_phones?.length || object.client_emails?.length) ? (
                                                <div className="mt-1 flex gap-2 overflow-hidden">
                                                    {object.client_phones?.slice(0, 1).map((p, i) => (
                                                        <span key={i} className="text-[10px] text-muted font-mono truncate max-w-[120px]">
                                                            {p}{object.client_contact_names?.[i] ? ` (${object.client_contact_names[i]})` : ''}
                                                        </span>
                                                    ))}
                                                    {object.client_emails?.slice(0, 1).map((e, i) => (
                                                        <span key={i} className="text-[10px] text-muted font-mono truncate max-w-[120px]">{e}</span>
                                                    ))}
                                                </div>
                                            ) : null}
                                        </td>
                                        <td className="px-6 py-4 text-main">
                                            {(object.hourly_rate || object.monthly_rate) ? (
                                                <span className="font-medium">
                                                    {object.salary_type === 'hourly' ? `${object.hourly_rate} zł/ч` : `${object.monthly_rate} zł/мес`}
                                                </span>
                                            ) : (
                                                <span className="text-muted italic">-</span>
                                            )}
                                        </td>
                                        {canSeeClientRates && (
                                            <td className="px-6 py-4 text-main">
                                                {object.client_rate ? (
                                                    <span className="font-semibold text-green-600 dark:text-green-400">
                                                        {object.client_rate} zł/мес
                                                    </span>
                                                ) : (
                                                    <span className="text-muted italic">-</span>
                                                )}
                                            </td>
                                        )}
                                        <td className="px-6 py-4">
                                            <div className="flex gap-2">
                                                {object.requires_photos && (
                                                    <span className="p-1.5 rounded-md bg-subtle text-muted" title="Требуются фото">
                                                        <Camera size={14} />
                                                    </span>
                                                )}
                                                {object.requires_tasks && (
                                                    <span className="p-1.5 rounded-md bg-subtle text-muted" title="Есть задачи">
                                                        <CheckSquare size={14} />
                                                    </span>
                                                )}
                                                {!object.requires_photos && !object.requires_tasks && <span className="text-muted text-xs">-</span>}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            {object.owner_ids && object.owner_ids.length > 0 ? (
                                                <div className="flex flex-col gap-1">
                                                    {object.owner_ids.map(id => (
                                                        <div key={id} className="text-sm font-medium text-main">
                                                            {creators[id] || 'Неизвестный'}
                                                            {(adminUser?.role === 'super_admin' || adminUser?.id === id) && guardianRates[object.id]?.[id] !== undefined && (
                                                                <span className="ml-2 text-[10px] font-bold text-primary bg-primary/5 px-1.5 py-0.5 rounded border border-primary/10">
                                                                    {guardianRates[object.id][id]} zł
                                                                </span>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : object.created_by && creators[object.created_by] ? (
                                                <div className="flex flex-col gap-1 text-sm font-medium text-main">
                                                    <div>
                                                        {creators[object.created_by]}
                                                        {(adminUser?.role === 'super_admin' || adminUser?.id === object.created_by) && guardianRates[object.id]?.[object.created_by] !== undefined && (
                                                            <span className="ml-2 text-[10px] font-bold text-primary bg-primary/5 px-1.5 py-0.5 rounded border border-primary/10">
                                                                {guardianRates[object.id][object.created_by]} zł
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            ) : (
                                                <span className="text-muted text-xs">-</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                                            <div className="flex justify-end gap-2 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                                                {(adminUser?.role === 'super_admin' || adminUser?.permissions?.objects_edit) && (
                                                    <>
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); setManagingTasksFor(object); }}
                                                            className="p-1.5 text-muted hover:text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded-lg transition-colors"
                                                            title="Задачи"
                                                        >
                                                            <CheckSquare size={16} />
                                                        </button>
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); openModal(object); }}
                                                            className="p-1.5 text-muted hover:text-primary hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded-lg transition-colors"
                                                            title="Редактировать"
                                                        >
                                                            <Edit2 size={16} />
                                                        </button>
                                                    </>
                                                )}
                                                {(adminUser?.role === 'super_admin' || adminUser?.permissions?.objects_delete) && (
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); handleDelete(object.id, e); }}
                                                        className="p-1.5 text-muted hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                                                        title="Удалить"
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                                {filteredObjects.length === 0 && (
                                    <tr>
                                        <td colSpan={5} className="px-6 py-12 text-center text-muted italic">
                                            Объекты не найдены
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Grid View (Existing) */}
            {viewMode === 'grid' && (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 animate-fadeIn">
                    {filteredObjects.map((object) => (
                        <div
                            key={object.id}
                            onClick={() => setViewingObject(object)}
                            className="card-interactive relative group p-5 flex flex-col gap-4"
                        >
                            {/* Header: Name & Menu */}
                            <div className="flex justify-between items-start">
                                <div className="sm:pr-8">
                                    <div className="flex items-center gap-2 mb-2">
                                        <h3 className="text-base font-medium text-main group-hover:text-primary transition-colors">
                                            {object.name}
                                        </h3>
                                    </div>
                                    <div className="flex items-center gap-1.5 text-sm text-muted">
                                        <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                                        <span className="line-clamp-1">{object.address}</span>
                                    </div>
                                    {(object.client_phones?.length || object.client_emails?.length) ? (
                                        <div className="mt-2 flex flex-wrap gap-2">
                                            {object.client_phones?.slice(0, 2).map((p, i) => (
                                                <span key={i} className="badge-neutral font-mono">
                                                    {p}{object.client_contact_names?.[i] ? ` (${object.client_contact_names[i]})` : ''}
                                                </span>
                                            ))}
                                            {(object.client_phones?.length || 0) > 2 && <span className="text-[10px] text-muted">+{object.client_phones!.length - 2}</span>}
                                        </div>
                                    ) : null}
                                </div>

                                {/* Action Menu (Stop Propagation) — desktop only */}
                                <div
                                    ref={menuRef}
                                    className="absolute top-4 right-4 hidden sm:block"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <div className="relative">
                                        <button
                                            className="btn-icon relative z-10"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setOpenMenuId(openMenuId === object.id ? null : object.id);
                                            }}
                                        >
                                            <MoreVertical size={18} />
                                        </button>
                                        {openMenuId === object.id && (
                                            <div className="absolute right-0 top-full pt-1 w-40 z-50 animate-scaleIn origin-top-right">
                                                <div className="popover-content py-1 p-0 overflow-hidden">
                                                    {(adminUser?.role === 'super_admin' || adminUser?.permissions?.objects_edit) && (
                                                        <>
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); setOpenMenuId(null); setManagingTasksFor(object); }}
                                                                className="w-full text-left px-4 py-2.5 hover:bg-subtle flex items-center gap-2 text-main transition-colors"
                                                            >
                                                                <CheckSquare size={14} className="text-muted" /> Задачи
                                                            </button>
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); setOpenMenuId(null); openModal(object); }}
                                                                className="w-full text-left px-4 py-2 text-sm text-main hover:bg-subtle flex items-center gap-2"
                                                            >
                                                                <Edit2 size={16} className="text-muted" /> Редактировать
                                                            </button>
                                                        </>
                                                    )}
                                                    {(adminUser?.role === 'super_admin' || adminUser?.permissions?.objects_delete) && (
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); setOpenMenuId(null); handleDelete(object.id, e); }}
                                                            className="w-full text-left px-4 py-2.5 hover:bg-red-500/10 flex items-center gap-2 text-danger"
                                                        >
                                                            <Trash2 size={14} /> Удалить
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Footer Row: Status, Badges & Guardian */}
                            <div className="mt-auto flex items-end justify-between gap-4">
                                <div className="flex flex-col gap-3">
                                    <div className="flex items-center gap-3 text-xs">
                                        {/* Removed: Активен status badge */}


                                        {canSeeClientRates && object.client_rate && (
                                            <span className="text-green-600 dark:text-green-400 font-semibold bg-green-50 dark:bg-green-900/20 px-2 py-1 rounded-md border border-green-100 dark:border-green-900/30">
                                                {object.client_rate} zł (К)
                                            </span>
                                        )}

                                        {/* Guardian Rate (Super-Admin or Own) */}
                                        {(adminUser?.role === 'super_admin' || (object.owner_ids && object.owner_ids.includes(adminUser?.id || ''))) && (
                                            (() => {
                                                const rates = guardianRates[object.id] || {};
                                                const ownRate = rates[adminUser?.id || ''];
                                                const allRates = Object.values(rates);

                                                if (adminUser?.role === 'super_admin' && allRates.length > 0) {
                                                    const total = allRates.reduce((a, b) => a + b, 0);
                                                    return (
                                                        <span className="text-blue-600 dark:text-blue-400 font-bold bg-blue-50 dark:bg-blue-900/20 px-2 py-1 rounded-md border border-blue-100 dark:border-blue-900/30">
                                                            {total} zł (О)
                                                        </span>
                                                    );
                                                } else if (ownRate !== undefined) {
                                                    return (
                                                        <span className="text-blue-600 dark:text-blue-400 font-bold bg-blue-50 dark:bg-blue-900/20 px-2 py-1 rounded-md border border-blue-100 dark:border-blue-900/30">
                                                            {ownRate} zł (О)
                                                        </span>
                                                    );
                                                }
                                                return null;
                                            })()
                                        )}
                                    </div>

                                    <div className="flex gap-2">
                                        {object.requires_photos && (
                                            <span className="p-1.5 rounded-md bg-subtle text-muted" title="Требуются фото">
                                                <Camera size={14} />
                                            </span>
                                        )}
                                        {object.requires_tasks && (
                                            <span className="p-1.5 rounded-md bg-subtle text-muted" title="Есть задачи">
                                                <CheckSquare size={14} />
                                            </span>
                                        )}
                                    </div>
                                </div>

                                {((object.owner_ids && object.owner_ids.length > 0) || (object.created_by && creators[object.created_by])) && (
                                    <div className="text-[10px] text-muted flex flex-col items-end gap-0.5 mb-0.5">
                                        <span className="opacity-50 uppercase tracking-wider font-semibold">Опекун</span>
                                        <span className="text-[11px] font-medium text-main text-right">
                                            {object.owner_ids && object.owner_ids.length > 0
                                                ? object.owner_ids.map(id => creators[id]).filter(Boolean).join(', ')
                                                : creators[object.created_by!]}
                                        </span>
                                    </div>
                                )}
                            </div>

                            {/* Mobile action bar — visible only on small screens */}
                            <div className="flex sm:hidden items-center gap-1 pt-3 border-t border-border" onClick={e => e.stopPropagation()}>
                                {(adminUser?.role === 'super_admin' || adminUser?.permissions?.objects_edit) && (
                                    <>
                                        <button
                                            onClick={() => setManagingTasksFor(object)}
                                            className="flex-1 flex items-center justify-center gap-1 py-2 text-xs text-muted hover:text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded-lg transition-colors"
                                        >
                                            <CheckSquare size={14} /> Задачи
                                        </button>
                                        <button
                                            onClick={() => openModal(object)}
                                            className="flex-1 flex items-center justify-center gap-1 py-2 text-xs text-muted hover:text-primary hover:bg-primary/5 rounded-lg transition-colors"
                                        >
                                            <Edit2 size={14} /> Изменить
                                        </button>
                                    </>
                                )}
                                {(adminUser?.role === 'super_admin' || adminUser?.permissions?.objects_delete) && (
                                    <button
                                        onClick={(e) => handleDelete(object.id, e)}
                                        className="flex-1 flex items-center justify-center gap-1 py-2 text-xs text-danger hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                                    >
                                        <Trash2 size={14} /> Удалить
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}
                    {filteredObjects.length === 0 && (
                        <div className="col-span-full py-12 text-center text-muted italic">
                            Объекты не найдены
                        </div>
                    )}
                </div>
            )
            }


            {/* Map View */}
            {
                viewMode === 'map' && (
                    <div className="animate-fadeIn">
                        <ObjectsMap objects={filteredObjects} />
                    </div>
                )
            }

            {/* Salary Summary Footer */}
            {adminUser?.role === 'super_admin' && (
                <div className="mt-8 mb-6 p-6 bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm animate-fadeIn">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                        <div>
                            <h3 className="text-lg font-bold text-main mb-1">Итоговый бюджет по объектам</h3>
                            <p className="text-sm text-muted">Сумма всех активных объектов в текущем списке</p>
                        </div>

                        <div className="overflow-x-auto -mx-6 sm:mx-0 px-6 sm:px-0 pb-1 sm:pb-0">
                            <div className="flex sm:grid gap-3 sm:gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 w-full">
                                <div className="min-w-[140px] sm:min-w-0 bg-subtle/50 p-4 rounded-xl border border-border">
                                    <div className="text-xs font-semibold text-muted uppercase tracking-wider mb-1">Работники (Фикс)</div>
                                    <div className="text-xl font-bold text-main">
                                        {salarySummary.fixedTotal.toLocaleString()} <span className="text-sm font-medium">zł</span>
                                    </div>
                                </div>

                                <div className="min-w-[140px] sm:min-w-0 bg-subtle/50 p-4 rounded-xl border border-border">
                                    <div className="text-xs font-semibold text-muted uppercase tracking-wider mb-1">Работники (Час)</div>
                                    <div className="text-xl font-bold text-main">
                                        {Math.round(salarySummary.hourlyTotal).toLocaleString()} <span className="text-sm font-medium">zł</span>
                                    </div>
                                </div>

                                <div className="min-w-[140px] sm:min-w-0 bg-blue-500/5 p-4 rounded-xl border border-blue-500/20 ring-1 ring-blue-500/10">
                                    <div className="text-xs font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wider mb-1">Опекуны (Мес)</div>
                                    <div className="text-xl font-bold text-blue-600 dark:text-blue-400">
                                        {Math.round(salarySummary.guardiansTotal).toLocaleString()} <span className="text-sm font-medium">zł</span>
                                    </div>
                                </div>

                                <div className="min-w-[140px] sm:min-w-0 bg-primary/5 p-4 rounded-xl border border-primary/20 ring-1 ring-primary/10">
                                    <div className="text-xs font-semibold text-primary uppercase tracking-wider mb-1">Всего расходы</div>
                                    <div className="text-2xl font-bold text-primary">
                                        {Math.round(salarySummary.totalExpenses).toLocaleString()} <span className="text-base font-medium">zł</span>
                                    </div>
                                </div>

                                {canSeeClientRates && (
                                    <div className="min-w-[140px] sm:min-w-0 bg-green-500/5 p-4 rounded-xl border border-green-500/20 ring-1 ring-green-500/10">
                                        <div className="text-xs font-semibold text-green-600 dark:text-green-400 uppercase tracking-wider mb-1">Выручка (клиент)</div>
                                        <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                                            {Math.round(salarySummary.clientRatesTotal).toLocaleString()} <span className="text-base font-medium">zł</span>
                                        </div>
                                    </div>
                                )}

                                {canSeeClientRates && (
                                    <div className="min-w-[140px] sm:min-w-0 bg-emerald-500/5 p-4 rounded-xl border border-emerald-500/20 ring-1 ring-emerald-500/10">
                                        <div className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider mb-1">Прибыль</div>
                                        <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                                            {Math.round(salarySummary.profit).toLocaleString()} <span className="text-base font-medium">zł</span>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {salarySummary.hourlyTotal > 0 && (
                        <div className="mt-4 flex items-center gap-2 text-[11px] text-zinc-400 italic">
                            <Clock size={12} />
                            <span>Расчет для почасовой оплаты является примерным (базируется на графике работы и среднем показателе 4.33 недели в месяце)</span>
                        </div>
                    )}
                </div>
            )}

            {/* Modal */}
            {
                showModal && (
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
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Название</label>
                                        <input
                                            type="text"
                                            value={formData.name}
                                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                            className="input"
                                            required
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Адрес</label>
                                        <AddressAutocomplete
                                            value={formData.address}
                                            onChange={(val, lat, lon) => {
                                                const updates: any = { address: val };
                                                if (lat !== undefined) updates.latitude = lat;
                                                if (lon !== undefined) updates.longitude = lon;
                                                setFormData({ ...formData, ...updates });
                                            }}
                                            placeholder="Начните вводить адрес (автопоиск)..."
                                        />
                                        {(formData.latitude !== 0 || formData.longitude !== 0) && (
                                            <div className="mt-1 text-[10px] text-green-600 flex items-center gap-1">
                                                <MapPin size={10} />
                                                Координаты: {formData.latitude.toFixed(6)}, {formData.longitude.toFixed(6)}
                                            </div>
                                        )}
                                    </div>

                                    {/* Owners Selection (Super Admin Only) */}
                                    {(adminUser?.role === 'super_admin') && (
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                                Владельцы (Опекуны) и их ставки
                                            </label>
                                            <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-3 max-h-56 overflow-y-auto border border-gray-200 dark:border-gray-700 space-y-2">
                                                {adminsList.map((admin) => (
                                                    <div key={admin.id} className="flex flex-col gap-2 p-2 hover:bg-white dark:hover:bg-gray-800 rounded transition-colors border border-transparent hover:border-gray-200 dark:hover:border-gray-700">
                                                        <label className="flex items-center gap-2 cursor-pointer">
                                                            <input
                                                                type="checkbox"
                                                                checked={formData.owner_ids.includes(admin.id)}
                                                                onChange={(e) => {
                                                                    if (e.target.checked) {
                                                                        setFormData({
                                                                            ...formData,
                                                                            owner_ids: [...formData.owner_ids, admin.id]
                                                                        });
                                                                    } else {
                                                                        const newRates = { ...formData.owner_rates };
                                                                        delete newRates[admin.id];
                                                                        setFormData({
                                                                            ...formData,
                                                                            owner_ids: formData.owner_ids.filter(id => id !== admin.id),
                                                                            owner_rates: newRates
                                                                        });
                                                                    }
                                                                }}
                                                                className="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500"
                                                            />
                                                            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{admin.name} ({admin.role})</span>
                                                        </label>
                                                        {formData.owner_ids.includes(admin.id) && (
                                                            <div className="flex items-center gap-2 pl-6 animate-fadeIn">
                                                                <span className="text-[10px] text-muted uppercase font-bold">Ставка:</span>
                                                                <div className="relative flex-1 max-w-[120px]">
                                                                    <input
                                                                        type="number"
                                                                        value={formData.owner_rates[admin.id] || 0}
                                                                        onChange={(e) => setFormData({
                                                                            ...formData,
                                                                            owner_rates: {
                                                                                ...formData.owner_rates,
                                                                                [admin.id]: parseFloat(e.target.value)
                                                                            }
                                                                        })}
                                                                        className="input h-7 text-xs pl-6"
                                                                        placeholder="0"
                                                                    />
                                                                    <DollarSign className="absolute left-1.5 top-1.5 w-3 h-3 text-gray-400" />
                                                                </div>
                                                                <span className="text-[10px] text-muted">zł/мес</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Worker Salary (Super Admin Only) */}
                                    {adminUser?.role === 'super_admin' ? (
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Тип оплаты</label>
                                                <select
                                                    value={formData.salary_type}
                                                    onChange={(e) => setFormData({
                                                        ...formData,
                                                        salary_type: e.target.value as any
                                                    })}
                                                    className="input appearance-none"
                                                >
                                                    <option value="hourly">Почасовая</option>
                                                    <option value="monthly_fixed">Фиксированная</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                                    {formData.salary_type === 'hourly' ? 'Ставка работника (в час)' : 'Зарплата работника (в месяц)'}
                                                </label>
                                                <div className="relative">
                                                    <input
                                                        type="number"
                                                        value={formData.salary_type === 'hourly' ? formData.hourly_rate : formData.monthly_rate}
                                                        onChange={(e) => {
                                                            const val = parseFloat(e.target.value);
                                                            if (formData.salary_type === 'hourly') {
                                                                setFormData({ ...formData, hourly_rate: val });
                                                            } else {
                                                                setFormData({ ...formData, monthly_rate: val });
                                                            }
                                                        }}
                                                        className="input pl-8"
                                                    />
                                                    <DollarSign className="absolute left-2.5 top-2.5 w-4 h-4 text-gray-400" />
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-100 dark:border-gray-800">
                                            <div className="text-[10px] text-muted uppercase font-bold mb-2">Оплата работнику</div>
                                            <div className="text-sm font-medium text-main">
                                                {formData.salary_type === 'hourly'
                                                    ? `${formData.hourly_rate} zł/ч (Почасовая)`
                                                    : `${formData.monthly_rate} zł/мес (Фикс)`}
                                            </div>
                                            <div className="text-[10px] text-muted mt-1">Редактирование доступно только супер-админу</div>
                                        </div>
                                    )}

                                    {canEditClientRates && (
                                        <div className="pt-2">
                                            <label className="block text-sm font-medium text-green-700 dark:text-green-400 mb-1">
                                                Выплата от клиента (в месяц)
                                            </label>
                                            <div className="relative">
                                                <input
                                                    type="number"
                                                    value={formData.client_rate}
                                                    onChange={(e) => setFormData({ ...formData, client_rate: parseFloat(e.target.value) })}
                                                    className="input pl-8 border-green-200 dark:border-green-900 focus:ring-green-500"
                                                    placeholder="Сколько платит клиент..."
                                                />
                                                <DollarSign className="absolute left-2.5 top-2.5 w-4 h-4 text-green-500" />
                                            </div>
                                            <p className="text-[10px] text-muted mt-1 italic">
                                                Этот параметр виден только супер-админу и доверенным суб-админам.
                                            </p>
                                        </div>
                                    )}

                                    {/* Client Contacts (Phones & Emails) */}
                                    <div className="space-y-4 pt-4 border-t border-gray-200 dark:border-gray-800">
                                        <div>
                                            <div className="flex justify-between items-center mb-2">
                                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Телефоны клиента</label>
                                                <button
                                                    type="button"
                                                    onClick={() => setFormData({
                                                        ...formData,
                                                        client_phones: [...formData.client_phones, '+48'],
                                                        client_contact_names: [...formData.client_contact_names, '']
                                                    })}
                                                    className="text-xs text-primary hover:underline flex items-center gap-1"
                                                >
                                                    <Plus size={12} /> Добавить
                                                </button>
                                            </div>
                                            <div className="space-y-2">
                                                {formData.client_phones.map((phone, index) => (
                                                    <div key={index} className="flex flex-col gap-2 p-3 bg-zinc-50 dark:bg-zinc-900/50 rounded-lg border border-zinc-200 dark:border-zinc-800">
                                                        <div className="flex gap-2">
                                                            <input
                                                                type="text"
                                                                value={phone}
                                                                onChange={(e) => {
                                                                    const newPhones = [...formData.client_phones];
                                                                    newPhones[index] = e.target.value;
                                                                    setFormData({ ...formData, client_phones: newPhones });
                                                                }}
                                                                placeholder="Номер телефона"
                                                                className="input flex-1"
                                                            />
                                                            {formData.client_phones.length > 1 && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => {
                                                                        const newPhones = formData.client_phones.filter((_, i) => i !== index);
                                                                        const newNames = formData.client_contact_names.filter((_, i) => i !== index);
                                                                        setFormData({
                                                                            ...formData,
                                                                            client_phones: newPhones,
                                                                            client_contact_names: newNames
                                                                        });
                                                                    }}
                                                                    className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded h-10 w-10 flex items-center justify-center border border-transparent"
                                                                >
                                                                    <Trash2 size={16} />
                                                                </button>
                                                            )}
                                                        </div>

                                                        {/* Show name field always if more than 1 phone, OR if it's not empty */}
                                                        {(formData.client_phones.length > 1 || (formData.client_contact_names[index] && formData.client_contact_names[index].trim() !== '')) && (
                                                            <div className="flex items-center gap-2 animate-fadeIn">
                                                                <input
                                                                    type="text"
                                                                    value={formData.client_contact_names[index] || ''}
                                                                    onChange={(e) => {
                                                                        const newNames = [...formData.client_contact_names];
                                                                        newNames[index] = e.target.value;
                                                                        setFormData({ ...formData, client_contact_names: newNames });
                                                                    }}
                                                                    placeholder="Имя контакта (напр. Администратор)"
                                                                    className="input text-xs h-8 flex-1 bg-white dark:bg-zinc-950"
                                                                />
                                                            </div>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        <div>
                                            <div className="flex justify-between items-center mb-2">
                                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Email клиента</label>
                                                <button
                                                    type="button"
                                                    onClick={() => setFormData({ ...formData, client_emails: [...formData.client_emails, ''] })}
                                                    className="text-xs text-primary hover:underline flex items-center gap-1"
                                                >
                                                    <Plus size={12} /> Добавить
                                                </button>
                                            </div>
                                            <div className="space-y-2">
                                                {formData.client_emails.map((email, index) => (
                                                    <div key={index} className="flex gap-2">
                                                        <input
                                                            type="email"
                                                            value={email}
                                                            onChange={(e) => {
                                                                const newEmails = [...formData.client_emails];
                                                                newEmails[index] = e.target.value;
                                                                setFormData({ ...formData, client_emails: newEmails });
                                                            }}
                                                            placeholder="client@example.com"
                                                            className="input flex-1"
                                                        />
                                                        {formData.client_emails.length > 1 && (
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    const newEmails = formData.client_emails.filter((_, i) => i !== index);
                                                                    setFormData({ ...formData, client_emails: newEmails });
                                                                }}
                                                                className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                                                            >
                                                                <Trash2 size={16} />
                                                            </button>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Reminder Settings (Super-Admin Only) */}
                                    {adminUser?.role === 'super_admin' && (
                                        <div className="space-y-4 pt-4 border-t border-gray-200 dark:border-gray-800">
                                            <div className="flex items-center gap-2 mb-2">
                                                <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-200">Напоминания о звонке клиенту</h4>
                                                <span className="text-[10px] bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">NEW</span>
                                            </div>

                                            <label className="flex items-center gap-3 cursor-pointer p-3 rounded-lg border border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                                                <input
                                                    type="checkbox"
                                                    checked={formData.reminder_active}
                                                    onChange={(e) => setFormData({ ...formData, reminder_active: e.target.checked })}
                                                    className="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500"
                                                />
                                                <div className="flex items-center gap-2">
                                                    <Clock className="w-4 h-4 text-blue-500" />
                                                    <span className="text-sm text-gray-700 dark:text-gray-300">Активировать напоминания</span>
                                                </div>
                                            </label>

                                            {formData.reminder_active && (
                                                <div className="grid grid-cols-2 gap-4 animate-fadeIn">
                                                    <div>
                                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Периодичность</label>
                                                        <select
                                                            value={formData.reminder_frequency}
                                                            onChange={(e) => setFormData({
                                                                ...formData,
                                                                reminder_frequency: e.target.value as any
                                                            })}
                                                            className="input appearance-none"
                                                        >
                                                            <option value="weekly">Раз в неделю</option>
                                                            <option value="monthly">Раз в месяц</option>
                                                            <option value="quarterly">Раз в 3 месяца</option>
                                                        </select>
                                                    </div>
                                                    <div>
                                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Ответственный</label>
                                                        <select
                                                            value={formData.reminder_assignee_id}
                                                            onChange={(e) => setFormData({
                                                                ...formData,
                                                                reminder_assignee_id: e.target.value
                                                            })}
                                                            className="input appearance-none"
                                                            required={formData.reminder_active}
                                                        >
                                                            <option value="">Выберите админа...</option>
                                                            {adminsList.map(admin => (
                                                                <option key={admin.id} value={admin.id}>
                                                                    {admin.name} ({admin.role === 'super_admin' ? 'Super' : 'Sub'})
                                                                </option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* Schedule */}
                                    <div className="space-y-3 pt-2 border-t border-gray-200 dark:border-gray-800">
                                        <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-200">График работы</h4>

                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Дни недели</label>
                                            <div className="flex flex-wrap gap-2">
                                                {[
                                                    { val: 1, label: 'Пн' }, { val: 2, label: 'Вт' }, { val: 3, label: 'Ср' },
                                                    { val: 4, label: 'Чт' }, { val: 5, label: 'Пт' }, { val: 6, label: 'Сб' }, { val: 7, label: 'Вс' }
                                                ].map((day) => (
                                                    <button
                                                        type="button"
                                                        key={day.val}
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

                                    {/* Workers Selection */}
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                            Назначенные работники
                                        </label>
                                        <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-3 max-h-48 overflow-y-auto border border-gray-200 dark:border-gray-700">
                                            {allWorkers.length > 0 ? (
                                                allWorkers.map((worker) => (
                                                    <label key={worker.id} className="flex items-center gap-2 p-2 hover:bg-white dark:hover:bg-gray-800 rounded cursor-pointer transition-colors">
                                                        <input
                                                            type="checkbox"
                                                            checked={formData.worker_ids.includes(worker.id)}
                                                            onChange={(e) => {
                                                                if (e.target.checked) {
                                                                    setFormData({
                                                                        ...formData,
                                                                        worker_ids: [...formData.worker_ids, worker.id]
                                                                    });
                                                                } else {
                                                                    setFormData({
                                                                        ...formData,
                                                                        worker_ids: formData.worker_ids.filter(id => id !== worker.id)
                                                                    });
                                                                }
                                                            }}
                                                            className="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500"
                                                        />
                                                        <span className="text-gray-700 dark:text-gray-300">
                                                            {worker.first_name} {worker.last_name}
                                                        </span>
                                                    </label>
                                                ))
                                            ) : (
                                                <div className="text-center py-4 text-xs text-muted">Работники не найдены</div>
                                            )}
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

                                        <label className="flex items-center gap-3 cursor-pointer p-3 rounded-lg border border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                                            <input
                                                type="checkbox"
                                                checked={formData.requires_tasks}
                                                onChange={(e) => setFormData({ ...formData, requires_tasks: e.target.checked })}
                                                className="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500"
                                            />
                                            <div className="flex items-center gap-2">
                                                <CheckSquare className="w-4 h-4 text-purple-500" />
                                                <span className="text-sm text-gray-700 dark:text-gray-300">Требуется выполнение задач</span>
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
                )
            }

            {/* Task Management Modal */}
            {
                managingTasksFor && (
                    <TaskManagementModal
                        objectId={managingTasksFor.id}
                        objectName={managingTasksFor.name}
                        onClose={() => setManagingTasksFor(null)}
                    />
                )
            }

            {/* Object Details Modal */}
            {
                viewingObject && (
                    <ObjectDetailsModal
                        object={viewingObject}
                        onClose={() => setViewingObject(null)}
                        creators={creators}
                        adminUser={adminUser}
                    />
                )
            }
        </div >
    );
}

function ObjectDetailsModal({ object, onClose, creators, adminUser }: { object: CleaningObject, onClose: () => void, creators: Record<string, string>, adminUser: any }) {
    const [workers, setWorkers] = useState<any[]>([]);
    const [rates, setRates] = useState<Record<string, number>>({});
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            const [workersRes, ratesRes] = await Promise.all([
                supabase.from('worker_objects').select('worker:workers(*)').eq('object_id', object.id),
                supabase.from('admin_object_rates').select('admin_id, monthly_rate').eq('object_id', object.id)
            ]);

            if (workersRes.data) {
                setWorkers(workersRes.data.map((item: any) => item.worker).filter(Boolean));
            }
            if (ratesRes.data) {
                const ratesObj: Record<string, number> = {};
                ratesRes.data.forEach((r: any) => ratesObj[r.admin_id] = r.monthly_rate);
                setRates(ratesObj);
            }
            setLoading(false);
        };
        fetchData();
    }, [object.id]);

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content sm:max-w-2xl" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h3 className="text-xl font-bold text-main">{object.name}</h3>
                    <button onClick={onClose} className="btn-icon">
                        <X size={24} />
                    </button>
                </div>
                <div className="modal-body space-y-6">
                    {/* Basic Info */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-4">
                            <div>
                                <label className="text-xs font-semibold text-muted uppercase tracking-wider block mb-1">Адрес</label>
                                <div className="flex items-start gap-2 text-main">
                                    <MapPin className="w-4 h-4 mt-0.5 text-primary" />
                                    <span>{object.address}</span>
                                </div>
                                <a
                                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(object.address)}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs text-blue-500 hover:underline ml-6 mt-1 block"
                                >
                                    Открыть на карте
                                </a>
                            </div>

                            <div>
                                <label className="text-xs font-semibold text-muted uppercase tracking-wider block mb-1">Оплата</label>
                                <div className="flex items-center gap-2 text-main">
                                    <DollarSign className="w-4 h-4 text-emerald-500" />
                                    <span className="font-medium">
                                        {object.salary_type === 'hourly'
                                            ? `${object.hourly_rate} zł в час`
                                            : `${object.monthly_rate} zł в месяц (Fix)`}
                                    </span>
                                </div>
                            </div>

                            {(object.client_phones && object.client_phones.length > 0) && (
                                <div>
                                    <label className="text-xs font-semibold text-muted uppercase tracking-wider block mb-1">Телефоны клиента</label>
                                    <div className="space-y-1">
                                        {object.client_phones.map((phone, i) => (
                                            <div key={i} className="flex items-center gap-2">
                                                <a href={`tel:${phone}`} className="text-sm text-blue-500 hover:underline font-mono">{phone}</a>
                                                {object.client_contact_names && object.client_contact_names[i] && (
                                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500 font-medium">
                                                        {object.client_contact_names[i]}
                                                    </span>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {(object.client_emails?.length || 0) > 0 && (
                                <div>
                                    <label className="text-xs font-semibold text-muted uppercase tracking-wider block mb-1">Email клиента</label>
                                    <div className="space-y-1">
                                        {object.client_emails?.map((email, i) => (
                                            <a key={i} href={`mailto:${email}`} className="block text-sm text-blue-500 hover:underline">{email}</a>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="text-xs font-semibold text-muted uppercase tracking-wider block mb-1">Опекун (Supervisor)</label>
                                <div className="space-y-2">
                                    {object.owner_ids && object.owner_ids.length > 0 ? (
                                        object.owner_ids.map(ownerId => (
                                            <div key={ownerId} className="flex flex-col gap-1 p-2 bg-subtle rounded-lg border border-border">
                                                <div className="flex items-center gap-2 text-main">
                                                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                                                        {creators[ownerId]?.charAt(0).toUpperCase() || '?'}
                                                    </div>
                                                    <span className="font-medium text-sm">
                                                        {creators[ownerId] || 'Неизвестный'}
                                                    </span>
                                                </div>
                                                {(adminUser?.role === 'super_admin' || adminUser?.id === ownerId) && rates[ownerId] !== undefined && (
                                                    <div className="ml-10 text-xs font-bold text-primary">
                                                        Ставка: {rates[ownerId]} zł/мес
                                                    </div>
                                                )}
                                            </div>
                                        ))
                                    ) : object.created_by && creators[object.created_by] ? (
                                        <div className="flex flex-col gap-1 p-2 bg-subtle rounded-lg border border-border">
                                            <div className="flex items-center gap-2 text-main">
                                                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                                                    {creators[object.created_by].charAt(0).toUpperCase()}
                                                </div>
                                                <span className="font-medium text-sm">
                                                    {creators[object.created_by]}
                                                </span>
                                            </div>
                                            {(adminUser?.role === 'super_admin' || adminUser?.id === object.created_by) && (
                                                <div className="ml-10 text-xs italic text-muted">
                                                    {rates[object.created_by!] !== undefined ? `Ставка: ${rates[object.created_by!]} zł/мес` : 'Ставка не установлена'}
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-2 text-main p-2 bg-subtle rounded-lg border border-border italic text-muted text-sm">
                                            Не назначен
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div>
                                <label className="text-xs font-semibold text-muted uppercase tracking-wider block mb-1">График работы</label>
                                <div className="p-3 bg-subtle rounded-lg border border-border space-y-2">
                                    <div className="flex items-center gap-2 text-sm text-main">
                                        <Clock className="w-4 h-4 text-muted" />
                                        <span>{object.schedule_time_start} - {object.schedule_time_end}</span>
                                    </div>
                                    <div className="flex flex-wrap gap-1">
                                        {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((day, idx) => (
                                            <span
                                                key={idx}
                                                className={`text-[10px] w-6 h-6 flex items-center justify-center rounded-full ${object.schedule_days?.includes(idx + 1)
                                                    ? 'bg-primary text-white font-medium'
                                                    : 'text-muted bg-black/5 dark:bg-white/5'
                                                    }`}
                                            >
                                                {day}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Assigned Workers */}
                    <div>
                        <label className="text-xs font-semibold text-muted uppercase tracking-wider block mb-3 flex items-center gap-2">
                            <span className="bg-primary/10 text-primary p-1 rounded">
                                <Users size={14} />
                            </span>
                            Закрепленные работники ({loading ? '...' : workers.length})
                        </label>

                        {loading ? (
                            <div className="h-20 flex items-center justify-center text-muted text-sm">
                                Загрузка...
                            </div>
                        ) : workers.length > 0 ? (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {workers.map(worker => (
                                    <div key={worker.id} className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-subtle transition-colors">
                                        <div className="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold text-sm">
                                            {worker.first_name[0]}{worker.last_name[0]}
                                        </div>
                                        <div>
                                            <div className="font-medium text-main text-sm">{worker.first_name} {worker.last_name}</div>
                                            <div className="text-xs text-muted">{worker.phone_number}</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="text-center py-6 bg-subtle rounded-xl border border-dashed border-border text-muted text-sm">
                                <Users className="w-8 h-8 mx-auto mb-2 opacity-20" />
                                Нет закрепленных работников
                            </div>
                        )}
                    </div>

                    {/* Settings Badges */}
                    <div className="flex gap-3">
                        {object.requires_photos && (
                            <span className="badge-warning flex items-center gap-1.5 px-3 py-1">
                                <Camera size={14} /> Требуются фото
                            </span>
                        )}
                        {object.requires_tasks && (
                            <span className="badge-neutral flex items-center gap-1.5 px-3 py-1 bg-purple-100 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800">
                                <CheckSquare size={14} /> Есть задачи
                            </span>
                        )}
                    </div>
                </div>
                <div className="modal-footer">
                    <button onClick={onClose} className="btn-secondary w-full sm:w-auto">
                        Закрыть
                    </button>
                </div>
            </div>
        </div>
    );
}

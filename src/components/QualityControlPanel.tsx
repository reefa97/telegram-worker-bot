import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { ClipboardCheck, Calendar, Plus, X, Check, Minus, MapPin, User, Search, Star } from 'lucide-react';
import type { QualityCheck, QualityCheckSchedule } from '../types/qualityControl';

interface ObjectInfo {
    id: string;
    name: string;
    address: string;
    owner_names?: string[];
}

interface AdminInfo {
    id: string;
    email: string;
    name?: string;
    role: string;
}

interface CheckItem {
    task_name: string;
    is_passed: boolean;
}

const DAY_LABELS = ['', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const FREQ_LABELS: Record<number, string> = { 1: 'Каждую неделю', 2: 'Раз в 2 недели', 3: 'Раз в 3 недели', 4: 'Раз в месяц' };

export default function QualityControlPanel() {
    const { adminUser } = useAuth();
    const isSuperAdmin = adminUser?.role === 'super_admin';

    const [activeSubTab, setActiveSubTab] = useState<'checks' | 'schedules'>(isSuperAdmin ? 'checks' : 'checks');
    const [loading, setLoading] = useState(true);

    // Data
    const [objects, setObjects] = useState<ObjectInfo[]>([]);
    const [admins, setAdmins] = useState<AdminInfo[]>([]);
    const [schedules, setSchedules] = useState<QualityCheckSchedule[]>([]);
    const [checks, setChecks] = useState<QualityCheck[]>([]);

    // Modals
    const [showScheduleModal, setShowScheduleModal] = useState(false);
    const [showCheckModal, setShowCheckModal] = useState(false);
    const [checkObject, setCheckObject] = useState<ObjectInfo | null>(null);

    // Schedule form
    const [scheduleForm, setScheduleForm] = useState({
        object_id: '',
        manager_id: '',
        day_of_week: 1,
        frequency_weeks: 1 as 1 | 2 | 3 | 4,
    });

    // Check form
    const [checkItems, setCheckItems] = useState<CheckItem[]>([
        { task_name: 'Подлоги', is_passed: false },
        { task_name: 'Пыль на поверхностях', is_passed: false },
        { task_name: 'Мусорные корзины', is_passed: false },
        { task_name: 'Санузлы', is_passed: false },
        { task_name: 'Зеркала и стекла', is_passed: false },
    ]);
    const [checkNotes, setCheckNotes] = useState('');
    const [newItemName, setNewItemName] = useState('');
    const [searchQuery, setSearchQuery] = useState('');

    // Load data
    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            // Load objects
            const { data: objData } = await supabase.from('cleaning_objects').select('id, name, address').eq('is_active', true).order('name');
            setObjects(objData || []);

            // Load admins
            const { data: adminData } = await supabase.from('admin_users').select('id, email, name, role').in('role', ['super_admin', 'sub_admin']);
            setAdmins(adminData || []);

            // Load schedules
            const { data: schedData } = await supabase.from('quality_check_schedules').select('*').order('day_of_week');
            setSchedules(schedData || []);

            // Load checks
            const { data: checkData } = await supabase.from('quality_checks').select('*').order('check_date', { ascending: false }).limit(50);
            setChecks(checkData || []);
        } catch (err) {
            console.error('Error loading quality data:', err);
        } finally {
            setLoading(false);
        }
    };

    // Get today's scheduled objects for the current manager
    const getTodayScheduled = () => {
        const today = new Date();
        const jsDay = today.getDay();
        const dbDay = jsDay === 0 ? 7 : jsDay;

        return schedules.filter(s => {
            if (s.day_of_week !== dbDay) return false;
            // Check frequency
            if (s.frequency_weeks > 1 && s.last_check_date) {
                const lastCheck = new Date(s.last_check_date);
                const weeksSince = Math.floor((today.getTime() - lastCheck.getTime()) / (7 * 24 * 60 * 60 * 1000));
                if (weeksSince < s.frequency_weeks) return false;
            }
            // If not super_admin, only show own assignments
            if (!isSuperAdmin && s.manager_id !== adminUser?.id) return false;
            return true;
        });
    };

    const getObjectName = (id: string) => objects.find(o => o.id === id)?.name || 'Неизвестный';
    const getObjectAddress = (id: string) => objects.find(o => o.id === id)?.address || '';
    const getAdminName = (id: string) => {
        const admin = admins.find(a => a.id === id);
        return admin?.name || admin?.email || 'Неизвестный';
    };

    // Save schedule
    const handleSaveSchedule = async () => {
        if (!scheduleForm.object_id || !scheduleForm.manager_id) return;
        try {
            const { error } = await supabase.from('quality_check_schedules').insert({
                object_id: scheduleForm.object_id,
                manager_id: scheduleForm.manager_id,
                day_of_week: scheduleForm.day_of_week,
                frequency_weeks: scheduleForm.frequency_weeks,
            });
            if (error) throw error;
            setShowScheduleModal(false);
            setScheduleForm({ object_id: '', manager_id: '', day_of_week: 1, frequency_weeks: 1 });
            loadData();
        } catch (err) {
            console.error('Error saving schedule:', err);
            alert('Ошибка при сохранении графика');
        }
    };

    // Delete schedule
    const handleDeleteSchedule = async (id: string) => {
        if (!confirm('Удалить этот график?')) return;
        try {
            await supabase.from('quality_check_schedules').delete().eq('id', id);
            loadData();
        } catch (err) {
            console.error('Error deleting schedule:', err);
        }
    };

    // Start check
    const startCheck = (obj: ObjectInfo) => {
        setCheckObject(obj);
        setCheckItems([
            { task_name: 'Подлоги', is_passed: false },
            { task_name: 'Пыль на поверхностях', is_passed: false },
            { task_name: 'Мусорные корзины', is_passed: false },
            { task_name: 'Санузлы', is_passed: false },
            { task_name: 'Зеркала и стекла', is_passed: false },
        ]);
        setCheckNotes('');
        setNewItemName('');
        setShowCheckModal(true);
    };

    // Add custom check item
    const addCheckItem = () => {
        if (!newItemName.trim()) return;
        setCheckItems([...checkItems, { task_name: newItemName.trim(), is_passed: false }]);
        setNewItemName('');
    };

    // Remove check item
    const removeCheckItem = (idx: number) => {
        setCheckItems(checkItems.filter((_, i) => i !== idx));
    };

    // Calculate score
    const getScore = () => {
        if (checkItems.length === 0) return 0;
        const passed = checkItems.filter(i => i.is_passed).length;
        return Math.round((passed / checkItems.length) * 100);
    };

    // Submit check
    const handleSubmitCheck = async () => {
        if (!checkObject || checkItems.length === 0) return;

        const score = getScore();
        try {
            // 1. Insert check
            const { data: checkData, error: checkError } = await supabase.from('quality_checks').insert({
                object_id: checkObject.id,
                manager_id: adminUser?.id,
                score_percentage: score,
                notes: checkNotes || null,
            }).select('id').single();

            if (checkError) throw checkError;

            // 2. Insert check items
            const items = checkItems.map(item => ({
                check_id: checkData.id,
                task_name: item.task_name,
                is_passed: item.is_passed,
            }));
            const { error: itemsError } = await supabase.from('quality_check_items').insert(items);
            if (itemsError) throw itemsError;

            // 3. Update schedule last_check_date
            const todayStr = new Date().toISOString().split('T')[0];
            await supabase.from('quality_check_schedules')
                .update({ last_check_date: todayStr })
                .eq('object_id', checkObject.id)
                .eq('manager_id', adminUser?.id);

            // 4. Send Telegram notifications to workers (fire-and-forget)
            supabase.functions.invoke('quality-check-notifications', {
                body: { check_id: checkData.id },
            }).catch((err: any) => console.error('Notification error:', err));

            setShowCheckModal(false);
            loadData();
        } catch (err) {
            console.error('Error submitting check:', err);
            alert('Ошибка при сохранении проверки');
        }
    };

    // Score color helper
    const getScoreColor = (score: number) => {
        if (score >= 80) return 'text-green-500';
        if (score >= 50) return 'text-yellow-500';
        return 'text-red-500';
    };

    const getScoreBg = (score: number) => {
        if (score >= 80) return 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400';
        if (score >= 50) return 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400';
        return 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400';
    };

    const filteredObjects = objects.filter(o =>
        o.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        o.address.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const todayScheduled = getTodayScheduled();

    if (loading) {
        return (
            <div className="flex justify-center items-center h-64">
                <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    return (
        <div>
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                    <ClipboardCheck className="w-7 h-7 text-primary-500" />
                    Контроль качества
                </h2>

                <div className="flex items-center gap-3">
                    {/* Search */}
                    <div className="relative">
                        <input
                            type="text"
                            placeholder="Поиск объекта..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full md:w-56 pl-9 pr-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 transition-all shadow-sm"
                        />
                        <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    </div>
                </div>
            </div>

            {/* Sub-tabs */}
            <div className="flex bg-gray-100 dark:bg-gray-800 p-1 rounded-lg mb-6 w-fit border border-gray-200 dark:border-gray-700">
                <button
                    onClick={() => setActiveSubTab('checks')}
                    className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${activeSubTab === 'checks'
                        ? 'bg-white dark:bg-gray-700 text-primary-600 dark:text-primary-400 shadow-sm'
                        : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                        }`}
                >
                    <ClipboardCheck className="w-4 h-4 inline mr-1.5 -mt-0.5" />
                    Проверки
                </button>
                <button
                    onClick={() => setActiveSubTab('schedules')}
                    className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${activeSubTab === 'schedules'
                        ? 'bg-white dark:bg-gray-700 text-primary-600 dark:text-primary-400 shadow-sm'
                        : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                        }`}
                >
                    <Calendar className="w-4 h-4 inline mr-1.5 -mt-0.5" />
                    Графики
                </button>
            </div>

            {/* ===== CHECKS TAB ===== */}
            {activeSubTab === 'checks' && (
                <div>
                    {/* Today's scheduled checks */}
                    {todayScheduled.length > 0 && (
                        <div className="mb-8">
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                                <Star className="w-5 h-5 text-yellow-500" />
                                Проверить сегодня
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                                {todayScheduled.map(s => {
                                    const obj = objects.find(o => o.id === s.object_id);
                                    if (!obj) return null;
                                    return (
                                        <div key={s.id} className="bg-white dark:bg-gray-800 rounded-xl border-2 border-yellow-300 dark:border-yellow-600 p-5 shadow-sm hover:shadow-md transition-all">
                                            <h4 className="font-bold text-gray-900 dark:text-white text-lg">{obj.name}</h4>
                                            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 flex items-center gap-1">
                                                <MapPin className="w-3.5 h-3.5" /> {obj.address}
                                            </p>
                                            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 flex items-center gap-1">
                                                <User className="w-3.5 h-3.5" /> {getAdminName(s.manager_id)}
                                            </p>
                                            <button
                                                onClick={() => startCheck(obj)}
                                                className="mt-4 w-full bg-primary-600 hover:bg-primary-700 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
                                            >
                                                <ClipboardCheck className="w-4 h-4" />
                                                Провести контроль
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* All objects for ad-hoc checks */}
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Все объекты</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mb-8">
                        {filteredObjects.map(obj => (
                            <div key={obj.id} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 shadow-sm hover:shadow-md transition-all">
                                <h4 className="font-bold text-gray-900 dark:text-white">{obj.name}</h4>
                                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 flex items-center gap-1">
                                    <MapPin className="w-3.5 h-3.5" /> {obj.address}
                                </p>
                                <button
                                    onClick={() => startCheck(obj)}
                                    className="mt-4 w-full bg-gray-100 dark:bg-gray-700 hover:bg-primary-50 dark:hover:bg-primary-900/20 text-gray-700 dark:text-gray-300 hover:text-primary-600 dark:hover:text-primary-400 px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 border border-gray-200 dark:border-gray-600"
                                >
                                    <ClipboardCheck className="w-4 h-4" />
                                    Провести контроль
                                </button>
                            </div>
                        ))}
                    </div>

                    {/* Recent checks history */}
                    {checks.length > 0 && (
                        <div>
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">История проверок</h3>
                            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                                            <th className="text-left px-4 py-3 font-medium text-gray-500">Дата</th>
                                            <th className="text-left px-4 py-3 font-medium text-gray-500">Объект</th>
                                            <th className="text-left px-4 py-3 font-medium text-gray-500">Проверяющий</th>
                                            <th className="text-center px-4 py-3 font-medium text-gray-500">Оценка</th>
                                            <th className="text-left px-4 py-3 font-medium text-gray-500">Заметки</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {checks.map(c => (
                                            <tr key={c.id} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                                                <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                                                    {new Date(c.check_date).toLocaleDateString('pl-PL')}
                                                </td>
                                                <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">
                                                    {getObjectName(c.object_id)}
                                                </td>
                                                <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                                                    {getAdminName(c.manager_id)}
                                                </td>
                                                <td className="px-4 py-3 text-center">
                                                    <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-bold ${getScoreBg(c.score_percentage)}`}>
                                                        {c.score_percentage}%
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-xs max-w-[200px] truncate">
                                                    {c.notes || '—'}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ===== SCHEDULES TAB ===== */}
            {activeSubTab === 'schedules' && (
                <div>
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Графики проверок</h3>
                        {isSuperAdmin && (
                            <button
                                onClick={() => setShowScheduleModal(true)}
                                className="bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                            >
                                <Plus className="w-4 h-4" />
                                Назначить график
                            </button>
                        )}
                    </div>

                    {schedules.length === 0 ? (
                        <div className="text-center py-16 text-gray-400">
                            <Calendar className="w-16 h-16 mx-auto mb-4 opacity-50" />
                            <p className="text-lg font-medium">Нет назначенных графиков</p>
                            <p className="text-sm mt-1">Нажмите "Назначить график", чтобы создать первый</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                            {schedules.map(s => (
                                <div key={s.id} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 shadow-sm">
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <h4 className="font-bold text-gray-900 dark:text-white">{getObjectName(s.object_id)}</h4>
                                            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 flex items-center gap-1">
                                                <MapPin className="w-3.5 h-3.5" /> {getObjectAddress(s.object_id)}
                                            </p>
                                        </div>
                                        {isSuperAdmin && (
                                            <button
                                                onClick={() => handleDeleteSchedule(s.id)}
                                                className="text-gray-400 hover:text-red-500 p-1 transition-colors"
                                            >
                                                <X className="w-4 h-4" />
                                            </button>
                                        )}
                                    </div>
                                    <div className="mt-3 flex flex-wrap gap-2">
                                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400">
                                            <Calendar className="w-3 h-3" />
                                            {DAY_LABELS[s.day_of_week]}
                                        </span>
                                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400">
                                            {FREQ_LABELS[s.frequency_weeks]}
                                        </span>
                                    </div>
                                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-3 flex items-center gap-1">
                                        <User className="w-3 h-3" /> Опекун: {getAdminName(s.manager_id)}
                                    </p>
                                    {s.last_check_date && (
                                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                                            Последняя проверка: {new Date(s.last_check_date).toLocaleDateString('pl-PL')}
                                        </p>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* ===== SCHEDULE MODAL ===== */}
            {showScheduleModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowScheduleModal(false)}>
                    <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-md shadow-xl border border-gray-200 dark:border-gray-700" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-lg font-bold text-gray-900 dark:text-white">Назначить график проверки</h3>
                            <button onClick={() => setShowScheduleModal(false)} className="text-gray-400 hover:text-gray-600 p-1">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="space-y-4">
                            {/* Object */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Объект</label>
                                <select
                                    value={scheduleForm.object_id}
                                    onChange={e => setScheduleForm({ ...scheduleForm, object_id: e.target.value })}
                                    className="input w-full"
                                >
                                    <option value="">Выберите объект...</option>
                                    {objects.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                                </select>
                            </div>

                            {/* Manager */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Опекун</label>
                                <select
                                    value={scheduleForm.manager_id}
                                    onChange={e => setScheduleForm({ ...scheduleForm, manager_id: e.target.value })}
                                    className="input w-full"
                                >
                                    <option value="">Выберите опекуна...</option>
                                    {admins.map(a => <option key={a.id} value={a.id}>{a.name || a.email}</option>)}
                                </select>
                            </div>

                            {/* Day of week */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">День недели</label>
                                <div className="flex gap-1">
                                    {[1, 2, 3, 4, 5, 6, 7].map(d => (
                                        <button
                                            key={d}
                                            type="button"
                                            onClick={() => setScheduleForm({ ...scheduleForm, day_of_week: d })}
                                            className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${scheduleForm.day_of_week === d
                                                ? 'bg-primary-600 text-white shadow-md'
                                                : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                                                }`}
                                        >
                                            {DAY_LABELS[d]}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Frequency */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Частота</label>
                                <select
                                    value={scheduleForm.frequency_weeks}
                                    onChange={e => setScheduleForm({ ...scheduleForm, frequency_weeks: Number(e.target.value) as 1 | 2 | 3 | 4 })}
                                    className="input w-full"
                                >
                                    {Object.entries(FREQ_LABELS).map(([val, label]) => (
                                        <option key={val} value={val}>{label}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div className="flex gap-3 mt-6">
                            <button onClick={() => setShowScheduleModal(false)} className="flex-1 btn-secondary px-4 py-2.5">
                                Отмена
                            </button>
                            <button
                                onClick={handleSaveSchedule}
                                disabled={!scheduleForm.object_id || !scheduleForm.manager_id}
                                className="flex-1 btn-primary px-4 py-2.5 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                Сохранить
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ===== CHECK MODAL ===== */}
            {showCheckModal && checkObject && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowCheckModal(false)}>
                    <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-lg shadow-xl border border-gray-200 dark:border-gray-700 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-center mb-2">
                            <h3 className="text-lg font-bold text-gray-900 dark:text-white">Проверка качества</h3>
                            <button onClick={() => setShowCheckModal(false)} className="text-gray-400 hover:text-gray-600 p-1">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">{checkObject.name} — {checkObject.address}</p>

                        {/* Score preview */}
                        <div className="text-center mb-6 p-4 bg-gray-50 dark:bg-gray-700/30 rounded-xl">
                            <div className={`text-4xl font-black ${getScoreColor(getScore())}`}>
                                {getScore()}%
                            </div>
                            <p className="text-xs text-gray-400 mt-1">Оценка чистоты</p>
                        </div>

                        {/* Check items */}
                        <div className="space-y-2 mb-4">
                            {checkItems.map((item, idx) => (
                                <div
                                    key={idx}
                                    className={`flex items-center gap-3 pl-4 pr-2 py-3 rounded-xl border transition-all cursor-pointer ${item.is_passed
                                        ? 'bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-700'
                                        : 'bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-700'
                                        }`}
                                    onClick={() => {
                                        const updated = [...checkItems];
                                        updated[idx].is_passed = !updated[idx].is_passed;
                                        setCheckItems(updated);
                                    }}
                                >
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${item.is_passed
                                        ? 'bg-green-500 text-white'
                                        : 'bg-red-500 text-white'
                                        }`}>
                                        {item.is_passed ? <Check className="w-4 h-4" /> : <Minus className="w-4 h-4" />}
                                    </div>
                                    <span className="flex-1 text-sm font-medium text-gray-900 dark:text-white">{item.task_name}</span>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); removeCheckItem(idx); }}
                                        className="text-gray-300 hover:text-red-500 p-1 transition-colors"
                                    >
                                        <X className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            ))}
                        </div>

                        {/* Add custom item */}
                        <div className="flex gap-2 mb-6">
                            <input
                                type="text"
                                placeholder="Добавить пункт..."
                                value={newItemName}
                                onChange={e => setNewItemName(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && addCheckItem()}
                                className="input flex-1"
                            />
                            <button
                                onClick={addCheckItem}
                                disabled={!newItemName.trim()}
                                className="bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 px-3 py-2 rounded-lg text-gray-600 dark:text-gray-400 transition-colors disabled:opacity-50"
                            >
                                <Plus className="w-4 h-4" />
                            </button>
                        </div>

                        {/* Notes */}
                        <div className="mb-6">
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Заметки</label>
                            <textarea
                                value={checkNotes}
                                onChange={e => setCheckNotes(e.target.value)}
                                placeholder="Дополнительные комментарии..."
                                rows={3}
                                className="input w-full resize-none"
                            />
                        </div>

                        {/* Actions */}
                        <div className="flex gap-3">
                            <button onClick={() => setShowCheckModal(false)} className="flex-1 btn-secondary px-4 py-2.5">
                                Отмена
                            </button>
                            <button
                                onClick={handleSubmitCheck}
                                className="flex-1 btn-primary px-4 py-2.5 flex items-center justify-center gap-2"
                            >
                                <Check className="w-4 h-4" />
                                Сохранить ({getScore()}%)
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

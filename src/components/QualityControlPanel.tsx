import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { ClipboardCheck, Calendar, Plus, X, Check, Minus, MapPin, User, Search, Star, History, Filter, ChevronLeft, ChevronRight, Eye, AlertTriangle, SkipForward, CalendarClock, Camera, Image as ImageIcon } from 'lucide-react';
import type { QualityCheck, QualityCheckSchedule, QualityCheckItem } from '../types/qualityControl';
import imageCompression from 'browser-image-compression';

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
    photos: File[];       // local files pending upload
    photoUrls: string[];  // remote URLs after upload
}

const DAY_LABELS = ['', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const FREQ_LABELS: Record<number, string> = { 1: 'Каждую неделю', 2: 'Раз в 2 недели', 3: 'Раз в 3 недели', 4: 'Раз в месяц' };

export default function QualityControlPanel() {
    const { adminUser } = useAuth();
    const isSuperAdmin = adminUser?.role === 'super_admin';

    const [activeSubTab, setActiveSubTab] = useState<'checks' | 'schedules' | 'history'>(isSuperAdmin ? 'checks' : 'checks');
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
        { task_name: 'Подлоги', is_passed: false, photos: [], photoUrls: [] },
        { task_name: 'Пыль на поверхностях', is_passed: false, photos: [], photoUrls: [] },
        { task_name: 'Мусорные корзины', is_passed: false, photos: [], photoUrls: [] },
        { task_name: 'Санузлы', is_passed: false, photos: [], photoUrls: [] },
        { task_name: 'Зеркала и стекла', is_passed: false, photos: [], photoUrls: [] },
    ]);
    const [checkNotes, setCheckNotes] = useState('');
    const [newItemName, setNewItemName] = useState('');
    const [searchQuery, setSearchQuery] = useState('');

    // History state
    const [historyChecks, setHistoryChecks] = useState<any[]>([]);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [historyPage, setHistoryPage] = useState(0);
    const [historyTotal, setHistoryTotal] = useState(0);
    const [historyFilterObject, setHistoryFilterObject] = useState('');
    const [historyFilterManager, setHistoryFilterManager] = useState('');
    const [historyFilterDateFrom, setHistoryFilterDateFrom] = useState('');
    const [historyFilterDateTo, setHistoryFilterDateTo] = useState('');
    const [detailCheck, setDetailCheck] = useState<any | null>(null);
    const [detailItems, setDetailItems] = useState<QualityCheckItem[]>([]);
    const [detailPoints, setDetailPoints] = useState<number>(0);
    const [showDetailModal, setShowDetailModal] = useState(false);
    const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
    const PAGE_SIZE = 20;
    const fileInputRefs = useRef<Record<number, HTMLInputElement | null>>({});

    // Load data
    useEffect(() => {
        loadData();
    }, []);

    // Load history when tab or filters change
    useEffect(() => {
        if (activeSubTab === 'history') {
            loadHistory();
        }
    }, [activeSubTab, historyPage, historyFilterObject, historyFilterManager, historyFilterDateFrom, historyFilterDateTo]);

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

    // Load history with filters and pagination
    const loadHistory = async () => {
        setHistoryLoading(true);
        try {
            let query = supabase
                .from('quality_checks')
                .select('*', { count: 'exact' })
                .order('check_date', { ascending: false })
                .range(historyPage * PAGE_SIZE, (historyPage + 1) * PAGE_SIZE - 1);

            if (historyFilterObject) query = query.eq('object_id', historyFilterObject);
            if (historyFilterManager) query = query.eq('manager_id', historyFilterManager);
            if (historyFilterDateFrom) query = query.gte('check_date', historyFilterDateFrom);
            if (historyFilterDateTo) query = query.lte('check_date', historyFilterDateTo + 'T23:59:59');

            const { data, count, error } = await query;
            if (error) throw error;
            setHistoryChecks(data || []);
            setHistoryTotal(count || 0);
        } catch (err) {
            console.error('Error loading history:', err);
        } finally {
            setHistoryLoading(false);
        }
    };

    // Open detail modal
    const openDetail = async (check: any) => {
        setDetailCheck(check);
        setShowDetailModal(true);

        // Fetch check items
        const { data: items } = await supabase
            .from('quality_check_items')
            .select('*')
            .eq('check_id', check.id);
        setDetailItems(items || []);

        // Fetch points for this check
        const { data: points } = await supabase
            .from('worker_points_log')
            .select('points_change')
            .eq('check_id', check.id);
        const totalPts = (points || []).reduce((sum: number, p: any) => sum + p.points_change, 0);
        setDetailPoints(totalPts);
    };

    // Check if schedule is overdue (no check in 3+ weeks) or missed
    const getScheduleStatus = (s: QualityCheckSchedule): 'ok' | 'overdue' | 'missed' => {
        const now = new Date();
        const THREE_WEEKS_MS = 21 * 24 * 60 * 60 * 1000;

        // No check ever done
        if (!s.last_check_date) {
            return 'overdue';
        }

        const lastCheck = new Date(s.last_check_date);
        const diff = now.getTime() - lastCheck.getTime();

        // Overdue: more than 3 weeks since last check
        if (diff > THREE_WEEKS_MS) {
            return 'overdue';
        }

        // Missed: scheduled day passed this week without a check
        const jsDay = now.getDay();
        const todayDow = jsDay === 0 ? 7 : jsDay;
        const lastCheckDate = s.last_check_date;

        // Calculate the most recent occurrence of the scheduled day
        const daysDiff = todayDow - s.day_of_week;
        if (daysDiff > 0) {
            // The scheduled day already passed this week
            const scheduledDate = new Date(now);
            scheduledDate.setDate(scheduledDate.getDate() - daysDiff);
            const scheduledDateStr = scheduledDate.toISOString().split('T')[0];

            // If last check was before this scheduled occurrence, it was missed
            if (lastCheckDate < scheduledDateStr) {
                return 'missed';
            }
        }

        return 'ok';
    };

    // Reschedule: update last_check_date to push the next check forward
    const handleReschedule = async (scheduleId: string) => {
        // Set last_check_date to today so the frequency counter resets
        const todayStr = new Date().toISOString().split('T')[0];
        try {
            await supabase.from('quality_check_schedules')
                .update({ last_check_date: todayStr })
                .eq('id', scheduleId);
            loadData();
        } catch (err) {
            console.error('Error rescheduling:', err);
        }
    };

    // Skip: mark as checked without doing a real check
    const handleSkip = async (scheduleId: string) => {
        if (!confirm('Пропустить эту проверку? Следующая будет по графику.')) return;
        const todayStr = new Date().toISOString().split('T')[0];
        try {
            await supabase.from('quality_check_schedules')
                .update({ last_check_date: todayStr })
                .eq('id', scheduleId);
            loadData();
        } catch (err) {
            console.error('Error skipping:', err);
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
            { task_name: 'Подлоги', is_passed: false, photos: [], photoUrls: [] },
            { task_name: 'Пыль на поверхностях', is_passed: false, photos: [], photoUrls: [] },
            { task_name: 'Мусорные корзины', is_passed: false, photos: [], photoUrls: [] },
            { task_name: 'Санузлы', is_passed: false, photos: [], photoUrls: [] },
            { task_name: 'Зеркала и стекла', is_passed: false, photos: [], photoUrls: [] },
        ]);
        setCheckNotes('');
        setNewItemName('');
        setShowCheckModal(true);
    };

    // Add custom check item
    const addCheckItem = () => {
        if (!newItemName.trim()) return;
        setCheckItems([...checkItems, { task_name: newItemName.trim(), is_passed: false, photos: [], photoUrls: [] }]);
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

    // Compress and upload photo
    const compressAndUpload = async (file: File, checkId: string, itemIdx: number): Promise<string> => {
        const compressed = await imageCompression(file, {
            maxSizeMB: 0.5,
            maxWidthOrHeight: 1200,
            useWebWorker: true,
        });
        const timestamp = Date.now();
        const path = `${checkId}/${itemIdx}_${timestamp}.jpg`;
        const { error: uploadError } = await supabase.storage
            .from('quality_checks')
            .upload(path, compressed, { contentType: 'image/jpeg' });
        if (uploadError) throw uploadError;
        const { data: urlData } = supabase.storage.from('quality_checks').getPublicUrl(path);
        return urlData.publicUrl;
    };

    // Handle photo selection for a check item
    const handlePhotoSelect = async (idx: number, files: FileList | null) => {
        if (!files || files.length === 0) return;
        const updated = [...checkItems];
        updated[idx].photos = [...updated[idx].photos, ...Array.from(files)];
        setCheckItems(updated);
    };

    // Remove a pending photo
    const removePhoto = (itemIdx: number, photoIdx: number) => {
        const updated = [...checkItems];
        updated[itemIdx].photos = updated[itemIdx].photos.filter((_, i) => i !== photoIdx);
        setCheckItems(updated);
    };

    // Submit check
    const handleSubmitCheck = async () => {
        if (!checkObject || checkItems.length === 0) return;

        if (!adminUser?.id) {
            alert('Ошибка: Не найден ID пользователя. Пожалуйста, перезайдите.');
            return;
        }

        const score = getScore();
        try {
            console.log('Inserting quality check with payload:', {
                object_id: checkObject.id,
                manager_id: adminUser.id,
                score_percentage: score,
                notes: checkNotes || null,
            });

            console.log('Step 1: Inserting check...');
            // 1. Insert check
            const { data: checkData, error: checkError } = await supabase.from('quality_checks').insert({
                object_id: checkObject.id,
                manager_id: adminUser.id,
                score_percentage: score,
                notes: checkNotes || null,
            }).select('id').single();

            if (checkError) throw checkError;

            console.log('Step 2: Inserting check items...', { itemsCount: checkItems.length });
            // 2. Insert check items (without photos first)
            const items = checkItems.map(item => ({
                check_id: checkData.id,
                task_name: item.task_name,
                is_passed: item.is_passed,
                photo_urls: [] as string[],
            }));
            const { data: insertedItems, error: itemsError } = await supabase.from('quality_check_items').insert(items).select('id');
            if (itemsError) throw itemsError;

            console.log('Step 3: Uploading photos...');
            // 3. Upload photos and update items with URLs
            if (insertedItems) {
                for (let i = 0; i < checkItems.length; i++) {
                    if (checkItems[i].photos.length > 0) {
                        const urls: string[] = [];
                        for (const file of checkItems[i].photos) {
                            const url = await compressAndUpload(file, checkData.id, i);
                            urls.push(url);
                        }
                        await supabase.from('quality_check_items')
                            .update({ photo_urls: urls })
                            .eq('id', insertedItems[i].id);
                    }
                }
            }

            console.log('Step 4: Updating schedule...');
            // 4. Update schedule last_check_date
            const todayStr = new Date().toISOString().split('T')[0];
            await supabase.from('quality_check_schedules')
                .update({ last_check_date: todayStr })
                .eq('object_id', checkObject.id)
                .eq('manager_id', adminUser?.id);

            console.log('Step 5: Distributing points...');
            // 5. Distribute points to workers who actually worked in the period
            const { data: pointsResult, error: pointsError } = await supabase.rpc('distribute_quality_points', {
                p_check_id: checkData.id,
                p_object_id: checkObject.id,
                p_score: score,
            });
            if (pointsError) {
                console.error('Points distribution error:', pointsError);
            } else {
                console.log('Points distributed:', pointsResult);
            }

            console.log('Step 6: Sending notification...');
            // 6. Send Telegram notifications to workers (fire-and-forget)
            supabase.functions.invoke('quality-check-notifications', {
                body: { check_id: checkData.id },
            }).catch((err: any) => console.error('Notification error:', err));

            setShowCheckModal(false);
            loadData();
        } catch (err: any) {
            console.error('Error submitting check:', err);
            // Handle Supabase error object structure or generic Error
            const errorMsg = err?.message || err?.details || JSON.stringify(err);
            alert(`Ошибка при сохранении проверки: ${errorMsg}`);
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
                    onClick={() => setActiveSubTab('history')}
                    className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${activeSubTab === 'history'
                        ? 'bg-white dark:bg-gray-700 text-primary-600 dark:text-primary-400 shadow-sm'
                        : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                        }`}
                >
                    <History className="w-4 h-4 inline mr-1.5 -mt-0.5" />
                    История
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
                            {schedules.map(s => {
                                const status = getScheduleStatus(s);
                                const isAlert = status === 'overdue' || status === 'missed';
                                const cardBorder = isAlert
                                    ? 'border-red-400 dark:border-red-600 border-2 shadow-red-100 dark:shadow-red-900/20 shadow-md'
                                    : 'border-gray-200 dark:border-gray-700';
                                const daysSinceCheck = s.last_check_date
                                    ? Math.floor((new Date().getTime() - new Date(s.last_check_date).getTime()) / (24 * 60 * 60 * 1000))
                                    : null;

                                return (
                                    <div key={s.id} className={`bg-white dark:bg-gray-800 rounded-xl border ${cardBorder} p-5 shadow-sm transition-all`}>
                                        {/* Alert banner */}
                                        {isAlert && (
                                            <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium mb-3 ${status === 'overdue'
                                                ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                                                : 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400'
                                                }`}>
                                                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                                                {status === 'overdue'
                                                    ? `Просрочено! ${daysSinceCheck !== null ? `${daysSinceCheck} дн. без проверки` : 'Ни одной проверки'}`
                                                    : 'Пропущенная проверка'
                                                }
                                            </div>
                                        )}

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
                                            <p className={`text-xs mt-1 ${isAlert ? 'text-red-500 dark:text-red-400 font-medium' : 'text-gray-400 dark:text-gray-500'}`}>
                                                Последняя проверка: {new Date(s.last_check_date).toLocaleDateString('pl-PL')}
                                                {daysSinceCheck !== null && isAlert && ` (${daysSinceCheck} дн. назад)`}
                                            </p>
                                        )}
                                        {!s.last_check_date && (
                                            <p className="text-xs mt-1 text-red-500 dark:text-red-400 font-medium">
                                                ⚠️ Ещё не было ни одной проверки
                                            </p>
                                        )}

                                        {/* Reschedule / Skip buttons for super admin */}
                                        {isSuperAdmin && isAlert && (
                                            <div className="mt-3 flex gap-2">
                                                <button
                                                    onClick={() => handleReschedule(s.id)}
                                                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/40 border border-blue-200 dark:border-blue-800 transition-colors"
                                                >
                                                    <CalendarClock className="w-3.5 h-3.5" />
                                                    Перенести
                                                </button>
                                                <button
                                                    onClick={() => handleSkip(s.id)}
                                                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-gray-50 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-600 border border-gray-200 dark:border-gray-600 transition-colors"
                                                >
                                                    <SkipForward className="w-3.5 h-3.5" />
                                                    Пропустить
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* ===== HISTORY TAB ===== */}
            {activeSubTab === 'history' && (
                <div>
                    {/* Filters */}
                    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 mb-6">
                        <div className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                            <Filter className="w-4 h-4" />
                            Фильтры
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                            <select
                                value={historyFilterObject}
                                onChange={e => { setHistoryFilterObject(e.target.value); setHistoryPage(0); }}
                                className="input text-sm"
                            >
                                <option value="">Все объекты</option>
                                {objects.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                            </select>
                            <select
                                value={historyFilterManager}
                                onChange={e => { setHistoryFilterManager(e.target.value); setHistoryPage(0); }}
                                className="input text-sm"
                            >
                                <option value="">Все опекуны</option>
                                {admins.map(a => <option key={a.id} value={a.id}>{a.name || a.email}</option>)}
                            </select>
                            <input
                                type="date"
                                value={historyFilterDateFrom}
                                onChange={e => { setHistoryFilterDateFrom(e.target.value); setHistoryPage(0); }}
                                className="input text-sm"
                                placeholder="От"
                            />
                            <input
                                type="date"
                                value={historyFilterDateTo}
                                onChange={e => { setHistoryFilterDateTo(e.target.value); setHistoryPage(0); }}
                                className="input text-sm"
                                placeholder="До"
                            />
                        </div>
                        {(historyFilterObject || historyFilterManager || historyFilterDateFrom || historyFilterDateTo) && (
                            <button
                                onClick={() => { setHistoryFilterObject(''); setHistoryFilterManager(''); setHistoryFilterDateFrom(''); setHistoryFilterDateTo(''); setHistoryPage(0); }}
                                className="text-xs text-primary-500 hover:text-primary-600 mt-2 flex items-center gap-1"
                            >
                                <X className="w-3 h-3" /> Сбросить фильтры
                            </button>
                        )}
                    </div>

                    {/* Results count */}
                    <div className="flex justify-between items-center mb-4">
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                            Найдено: <span className="font-semibold text-gray-700 dark:text-gray-300">{historyTotal}</span> проверок
                        </p>
                    </div>

                    {historyLoading ? (
                        <div className="flex justify-center items-center h-40">
                            <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin"></div>
                        </div>
                    ) : historyChecks.length === 0 ? (
                        <div className="text-center py-16 text-gray-400">
                            <History className="w-16 h-16 mx-auto mb-4 opacity-50" />
                            <p className="text-lg font-medium">Нет проверок</p>
                            <p className="text-sm mt-1">Проведите первый контроль качества</p>
                        </div>
                    ) : (
                        <>
                            {/* Cards grid */}
                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mb-6">
                                {historyChecks.map(c => {
                                    const scoreBg = c.score_percentage >= 90
                                        ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-green-300 dark:border-green-700'
                                        : c.score_percentage >= 70
                                            ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 border-yellow-300 dark:border-yellow-700'
                                            : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 border-red-300 dark:border-red-700';
                                    const scoreBorder = c.score_percentage >= 90
                                        ? 'border-l-green-500'
                                        : c.score_percentage >= 70
                                            ? 'border-l-yellow-500'
                                            : 'border-l-red-500';
                                    return (
                                        <div
                                            key={c.id}
                                            onClick={() => openDetail(c)}
                                            className={`bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 border-l-4 ${scoreBorder} p-5 shadow-sm hover:shadow-lg transition-all cursor-pointer group`}
                                        >
                                            <div className="flex justify-between items-start">
                                                <div className="flex-1 min-w-0">
                                                    <h4 className="font-bold text-gray-900 dark:text-white truncate">{getObjectName(c.object_id)}</h4>
                                                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 flex items-center gap-1">
                                                        <MapPin className="w-3.5 h-3.5 shrink-0" />
                                                        <span className="truncate">{getObjectAddress(c.object_id)}</span>
                                                    </p>
                                                </div>
                                                <span className={`shrink-0 ml-3 px-3 py-1.5 rounded-lg text-lg font-black border ${scoreBg}`}>
                                                    {c.score_percentage}%
                                                </span>
                                            </div>

                                            <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-gray-400 dark:text-gray-500">
                                                <span className="flex items-center gap-1">
                                                    <Calendar className="w-3.5 h-3.5" />
                                                    {new Date(c.check_date).toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                                                </span>
                                                <span className="flex items-center gap-1">
                                                    <User className="w-3.5 h-3.5" />
                                                    {getAdminName(c.manager_id)}
                                                </span>
                                            </div>

                                            {c.notes && (
                                                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400 line-clamp-2 italic">💬 {c.notes}</p>
                                            )}

                                            <div className="mt-3 flex justify-end">
                                                <span className="text-xs text-primary-500 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                                                    <Eye className="w-3.5 h-3.5" /> Подробнее
                                                </span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Pagination */}
                            {historyTotal > PAGE_SIZE && (
                                <div className="flex items-center justify-center gap-3">
                                    <button
                                        onClick={() => setHistoryPage(p => Math.max(0, p - 1))}
                                        disabled={historyPage === 0}
                                        className="p-2 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-30 transition-colors"
                                    >
                                        <ChevronLeft className="w-4 h-4" />
                                    </button>
                                    <span className="text-sm text-gray-600 dark:text-gray-400">
                                        {historyPage + 1} / {Math.ceil(historyTotal / PAGE_SIZE)}
                                    </span>
                                    <button
                                        onClick={() => setHistoryPage(p => Math.min(Math.ceil(historyTotal / PAGE_SIZE) - 1, p + 1))}
                                        disabled={historyPage >= Math.ceil(historyTotal / PAGE_SIZE) - 1}
                                        className="p-2 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-30 transition-colors"
                                    >
                                        <ChevronRight className="w-4 h-4" />
                                    </button>
                                </div>
                            )}
                        </>
                    )}
                </div>
            )}

            {/* ===== DETAIL MODAL ===== */}
            {showDetailModal && detailCheck && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowDetailModal(false)}>
                    <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-lg shadow-xl border border-gray-200 dark:border-gray-700 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-center mb-2">
                            <h3 className="text-lg font-bold text-gray-900 dark:text-white">Детали проверки</h3>
                            <button onClick={() => setShowDetailModal(false)} className="text-gray-400 hover:text-gray-600 p-1">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Header info */}
                        <div className="bg-gray-50 dark:bg-gray-700/30 rounded-xl p-4 mb-5">
                            <h4 className="font-bold text-gray-900 dark:text-white">{getObjectName(detailCheck.object_id)}</h4>
                            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 flex items-center gap-1">
                                <MapPin className="w-3.5 h-3.5" /> {getObjectAddress(detailCheck.object_id)}
                            </p>
                            <div className="flex items-center gap-4 mt-3 flex-wrap">
                                <span className="text-sm text-gray-500 flex items-center gap-1">
                                    <Calendar className="w-3.5 h-3.5" />
                                    {new Date(detailCheck.check_date).toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                </span>
                                <span className="text-sm text-gray-500 flex items-center gap-1">
                                    <User className="w-3.5 h-3.5" />
                                    {getAdminName(detailCheck.manager_id)}
                                </span>
                            </div>
                        </div>

                        {/* Score */}
                        <div className="text-center mb-5">
                            <div className={`text-5xl font-black ${detailCheck.score_percentage >= 90 ? 'text-green-500' : detailCheck.score_percentage >= 70 ? 'text-yellow-500' : 'text-red-500'}`}>
                                {detailCheck.score_percentage}%
                            </div>
                            <p className={`text-sm mt-1 font-medium ${detailCheck.score_percentage >= 90 ? 'text-green-600 dark:text-green-400' :
                                detailCheck.score_percentage >= 70 ? 'text-yellow-600 dark:text-yellow-400' :
                                    'text-red-600 dark:text-red-400'
                                }`}>
                                {detailCheck.score_percentage >= 90 ? '✅ Отлично' : detailCheck.score_percentage >= 70 ? '⚠️ Нужно улучшить' : '❌ Требует внимания'}
                            </p>
                        </div>

                        {/* Points */}
                        {detailPoints !== 0 && (
                            <div className={`text-center mb-5 py-2 px-4 rounded-lg text-sm font-medium ${detailPoints > 0
                                ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400'
                                : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'
                                }`}>
                                {detailPoints > 0 ? `+${detailPoints}` : detailPoints} баллов работникам
                            </div>
                        )}

                        {/* Checklist items */}
                        {detailItems.length > 0 && (
                            <div className="mb-5">
                                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Чек-лист ({detailItems.filter(i => i.is_passed).length}/{detailItems.length})</h4>
                                <div className="space-y-2">
                                    {detailItems.map(item => (
                                        <div key={item.id}>
                                            <div
                                                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm ${item.is_passed
                                                    ? 'bg-green-50 dark:bg-green-900/10 text-gray-800 dark:text-gray-200'
                                                    : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 font-medium'
                                                    }`}
                                            >
                                                <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${item.is_passed
                                                    ? 'bg-green-500 text-white'
                                                    : 'bg-red-500 text-white'
                                                    }`}>
                                                    {item.is_passed ? <Check className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
                                                </div>
                                                <span className="flex-1">{item.task_name}</span>
                                                {item.photo_urls && item.photo_urls.length > 0 && (
                                                    <span className="text-xs text-gray-400 flex items-center gap-1">
                                                        <ImageIcon className="w-3 h-3" /> {item.photo_urls.length}
                                                    </span>
                                                )}
                                            </div>
                                            {/* Photo thumbnails */}
                                            {item.photo_urls && item.photo_urls.length > 0 && (
                                                <div className="flex gap-2 mt-1.5 ml-9 flex-wrap">
                                                    {item.photo_urls.map((url, pi) => (
                                                        <img
                                                            key={pi}
                                                            src={url}
                                                            alt=""
                                                            onClick={() => setLightboxUrl(url)}
                                                            className="w-16 h-16 object-cover rounded-lg border border-gray-200 dark:border-gray-600 cursor-pointer hover:opacity-80 transition-opacity"
                                                        />
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Notes */}
                        {detailCheck.notes && (
                            <div className="mb-5">
                                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Примечание</h4>
                                <div className="bg-gray-50 dark:bg-gray-700/30 rounded-lg p-3 text-sm text-gray-700 dark:text-gray-300 italic">
                                    💬 {detailCheck.notes}
                                </div>
                            </div>
                        )}

                        {/* Placeholder for future photos */}
                        {/* <div className="mb-5">
                            <h4 className="text-sm font-semibold mb-2">Фотографии</h4>
                            <div className="grid grid-cols-3 gap-2">thumbnails here</div>
                        </div> */}

                        <button
                            onClick={() => setShowDetailModal(false)}
                            className="w-full btn-secondary px-4 py-2.5 mt-2"
                        >
                            Закрыть
                        </button>
                    </div>
                </div>
            )}

            {/* ===== LIGHTBOX ===== */}
            {lightboxUrl && (
                <div
                    className="fixed inset-0 bg-black/90 flex items-center justify-center z-[60] p-4 cursor-pointer"
                    onClick={() => setLightboxUrl(null)}
                >
                    <button
                        onClick={() => setLightboxUrl(null)}
                        className="absolute top-4 right-4 text-white/70 hover:text-white p-2 z-10"
                    >
                        <X className="w-8 h-8" />
                    </button>
                    <img
                        src={lightboxUrl}
                        alt=""
                        className="max-w-full max-h-full object-contain rounded-lg"
                        onClick={(e) => e.stopPropagation()}
                    />
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
                                <div key={idx}>
                                    <div
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
                                        {/* Camera button */}
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                fileInputRefs.current[idx]?.click();
                                            }}
                                            className="text-gray-400 hover:text-primary-500 p-1.5 transition-colors relative"
                                            title="Добавить фото"
                                        >
                                            <Camera className="w-4 h-4" />
                                            {item.photos.length > 0 && (
                                                <span className="absolute -top-1 -right-1 w-4 h-4 bg-primary-500 text-white rounded-full text-[10px] flex items-center justify-center">
                                                    {item.photos.length}
                                                </span>
                                            )}
                                        </button>
                                        <input
                                            ref={el => { fileInputRefs.current[idx] = el; }}
                                            type="file"
                                            accept="image/*"
                                            multiple
                                            capture="environment"
                                            className="hidden"
                                            onChange={(e) => {
                                                handlePhotoSelect(idx, e.target.files);
                                                e.target.value = '';
                                            }}
                                        />
                                        <button
                                            onClick={(e) => { e.stopPropagation(); removeCheckItem(idx); }}
                                            className="text-gray-300 hover:text-red-500 p-1 transition-colors"
                                        >
                                            <X className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                    {/* Photo thumbnails */}
                                    {item.photos.length > 0 && (
                                        <div className="flex gap-2 mt-1.5 ml-14 flex-wrap">
                                            {item.photos.map((photo, pi) => (
                                                <div key={pi} className="relative group/photo">
                                                    <img
                                                        src={URL.createObjectURL(photo)}
                                                        alt=""
                                                        className="w-14 h-14 object-cover rounded-lg border border-gray-200 dark:border-gray-600"
                                                    />
                                                    <button
                                                        onClick={() => removePhoto(idx, pi)}
                                                        className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover/photo:opacity-100 transition-opacity"
                                                    >
                                                        <X className="w-3 h-3" />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
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

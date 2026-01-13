import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Calendar, Clock, MapPin, User, Edit2, Trash2, Save, X, FileDown, AlertTriangle, Camera, StopCircle } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import PhotoGalleryModal from './PhotoGalleryModal';


interface WorkSession {
    id: string;
    worker_id: string;
    object_id: string;
    start_time: string;
    end_time: string | null;
    duration_minutes: number | null;
    start_location: any;
    end_location: any;
    is_start_in_geofence?: boolean;
    is_end_in_geofence?: boolean;
    start_distance_meters?: number;
    end_distance_meters?: number;
    workers: {
        first_name: string;
        last_name: string;
    };
    cleaning_objects: {
        name: string;
        salary_type: 'hourly' | 'monthly_fixed';
        hourly_rate: number;
        monthly_rate: number;
        expected_cleanings_per_month: number;
    } | null;
    shift_photos: { count: number }[];
}

export default function ReportsPanel() {
    const [sessions, setSessions] = useState<WorkSession[]>([]);
    const [loading, setLoading] = useState(true);
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [editingSession, setEditingSession] = useState<string | null>(null);
    const [editForm, setEditForm] = useState({
        start_time: '',
        end_time: '',
    });
    const [viewingPhotos, setViewingPhotos] = useState<string | null>(null);

    const [workers, setWorkers] = useState<any[]>([]);
    const [objects, setObjects] = useState<any[]>([]);
    const [selectedWorker, setSelectedWorker] = useState<string>('');
    const [selectedObject, setSelectedObject] = useState<string>('');

    useEffect(() => {
        // Set default dates (last 30 days)
        const today = new Date();
        const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

        setDateFrom(thirtyDaysAgo.toISOString().split('T')[0]);
        setDateTo(today.toISOString().split('T')[0]);

        loadFilters();
        loadSessions();
    }, []);

    const loadFilters = async () => {
        const { data: workersData } = await supabase.from('workers').select('id, first_name, last_name').eq('is_active', true);
        if (workersData) setWorkers(workersData);

        const { data: objectsData } = await supabase.from('cleaning_objects').select('id, name').eq('is_active', true);
        if (objectsData) setObjects(objectsData);
    };

    const loadSessions = async () => {
        setLoading(true);

        let query = supabase
            .from('work_sessions')
            .select(`
                *,
                workers (first_name, last_name),
                cleaning_objects (
                    name,
                    salary_type,
                    hourly_rate,
                    monthly_rate,
                    expected_cleanings_per_month
                ),
                shift_photos (count)
            `)
            .order('start_time', { ascending: false });

        if (dateFrom) {
            query = query.gte('start_time', new Date(dateFrom).toISOString());
        }
        if (dateTo) {
            const endOfDay = new Date(dateTo);
            endOfDay.setHours(23, 59, 59, 999);
            query = query.lte('start_time', endOfDay.toISOString());
        }

        if (selectedWorker) {
            query = query.eq('worker_id', selectedWorker);
        }

        if (selectedObject) {
            query = query.eq('object_id', selectedObject);
        }

        const { data, error } = await query;

        if (error) {
            console.error('Error loading sessions:', error);
            alert(`Ошибка загрузки отчетов: ${error.message}`);
        }

        if (data) setSessions(data);
        setLoading(false);
    };

    const handleDeleteSession = async (id: string) => {
        if (!confirm('Вы уверены, что хотите удалить эту смену?')) return;

        const { error } = await supabase
            .from('work_sessions')
            .delete()
            .eq('id', id);

        if (error) {
            console.error('Error deleting session:', error);
            alert('Ошибка при удалении смены');
        } else {
            loadSessions();
        }
    };

    const startEditing = (session: WorkSession) => {
        setEditingSession(session.id);
        // Format for datetime-local input: YYYY-MM-DDThh:mm
        const formatForInput = (dateStr: string) => {
            const date = new Date(dateStr);
            return new Date(date.getTime() - (date.getTimezoneOffset() * 60000))
                .toISOString()
                .slice(0, 16);
        };

        setEditForm({
            start_time: formatForInput(session.start_time),
            end_time: session.end_time ? formatForInput(session.end_time) : '',
        });
    };

    const handleUpdateSession = async (id: string) => {
        try {
            const startTime = new Date(editForm.start_time);
            const endTime = editForm.end_time ? new Date(editForm.end_time) : null;

            let durationMinutes = null;
            if (endTime) {
                durationMinutes = Math.floor((endTime.getTime() - startTime.getTime()) / 60000);
            }

            const { error } = await supabase
                .from('work_sessions')
                .update({
                    start_time: startTime.toISOString(),
                    end_time: endTime ? endTime.toISOString() : null,
                    duration_minutes: durationMinutes,
                })
                .eq('id', id);

            if (error) throw error;

            setEditingSession(null);
            loadSessions();
        } catch (error) {
            console.error('Error updating session:', error);
            alert('Ошибка при обновлении смены');
        }
    };

    const handleFinishSession = async (id: string, startTimeStr: string) => {
        if (!confirm('Вы уверены, что хотите принудительно завершить эту смену? Будет установлено текущее время окончания.')) return;

        try {
            const startTime = new Date(startTimeStr);
            const endTime = new Date();

            const durationMinutes = Math.floor((endTime.getTime() - startTime.getTime()) / 60000);

            const { error } = await supabase
                .from('work_sessions')
                .update({
                    end_time: endTime.toISOString(),
                    duration_minutes: durationMinutes,
                })
                .eq('id', id);

            if (error) throw error;

            loadSessions();
        } catch (error) {
            console.error('Error finishing session:', error);
            alert('Ошибка при завершении смены');
        }
    };

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleDateString('ru-RU', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
        });
    };

    const formatTime = (dateString: string) => {
        return new Date(dateString).toLocaleTimeString('ru-RU', {
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    const formatDuration = (minutes: number | null) => {
        if (!minutes) return '-';
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        return `${hours}ч ${mins}м`;
    };

    const totalMinutes = sessions.reduce((sum, s) => sum + (s.duration_minutes || 0), 0);
    const completedSessions = sessions.filter(s => s.end_time).length;
    const averageDuration = completedSessions > 0 ? totalMinutes / completedSessions : 0;

    const getGoogleMapsLink = (location: { latitude: number; longitude: number } | null) => {
        if (!location) return null;
        return `https://www.google.com/maps?q=${location.latitude},${location.longitude}`;
    };

    const generatePDF = () => {
        try {
            const doc = new jsPDF();
            console.log('PDF initialized');

            doc.setFontSize(18);
            doc.text('Workers Report', 14, 22);

            doc.setFontSize(11);
            doc.text(`Period: ${dateFrom} - ${dateTo}`, 14, 30);

            // Aggregate data by worker
            const workerStats = sessions.reduce((acc, session) => {
                const workerName = session.workers
                    ? `${session.workers.first_name} ${session.workers.last_name}`
                    : 'Unknown Worker';

                if (!acc[workerName]) {
                    acc[workerName] = {
                        hours: 0,
                        salary: 0,
                        sessions_count: 0
                    };
                }

                const hours = (session.duration_minutes || 0) / 60;
                acc[workerName].hours += hours;
                acc[workerName].sessions_count += 1;

                // Calculate salary
                if (session.cleaning_objects) {
                    if (session.cleaning_objects.salary_type === 'hourly') {
                        acc[workerName].salary += hours * (session.cleaning_objects.hourly_rate || 0);
                    } else {
                        // For monthly fixed, we add a portion per session: monthly_rate / expected_cleanings
                        const perSession = (session.cleaning_objects.monthly_rate || 0) / (session.cleaning_objects.expected_cleanings_per_month || 20);
                        acc[workerName].salary += perSession;
                    }
                }

                return acc;
            }, {} as Record<string, { hours: number; salary: number; sessions_count: number }>);

            const tableData = Object.entries(workerStats).map(([name, stats]) => [
                name,
                stats.hours.toFixed(1),
                stats.sessions_count,
                `${stats.salary.toFixed(2)} zł`
            ]);

            try {
                // Use standard autoTable call
                autoTable(doc, {
                    head: [['Worker', 'Hours', 'Shifts', 'Salary (approx.)']],
                    body: tableData,
                    startY: 40,
                });
                console.log('Table generated');
            } catch (tableError) {
                console.error('Table error:', tableError);
                throw new Error(`Error generating table: ${tableError}`);
            }

            doc.save(`workers-report.pdf`);
            console.log('PDF saved');
        } catch (error: any) {
            console.error('PDF Generation Error:', error);
            alert(`Error creating PDF: ${error.message || error}`);
        }
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
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Отчеты и статистика</h2>

            {/* Filters */}
            <div className="card mb-6">
                <div className="flex flex-wrap gap-4 items-end">
                    <div className="flex-1 min-w-[200px]">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Дата от</label>
                        <input
                            type="date"
                            value={dateFrom}
                            onChange={(e) => setDateFrom(e.target.value)}
                            className="input"
                        />
                    </div>
                    <div className="flex-1 min-w-[200px]">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Дата до</label>
                        <input
                            type="date"
                            value={dateTo}
                            onChange={(e) => setDateTo(e.target.value)}
                            className="input"
                        />
                    </div>

                    <div className="flex-1 min-w-[200px]">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Объект</label>
                        <div className="relative">
                            <select
                                value={selectedObject}
                                onChange={(e) => setSelectedObject(e.target.value)}
                                className="input appearance-none"
                            >
                                <option value="">Все объекты</option>
                                {objects.map(obj => (
                                    <option key={obj.id} value={obj.id}>{obj.name}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="flex-1 min-w-[200px]">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Работники</label>
                        <div className="relative">
                            <select
                                value={selectedWorker}
                                onChange={(e) => setSelectedWorker(e.target.value)}
                                className="input appearance-none"
                            >
                                <option value="">Все работники</option>
                                {workers.map(w => (
                                    <option key={w.id} value={w.id}>{w.first_name} {w.last_name}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="flex gap-2">
                        <button onClick={loadSessions} className="btn-primary">
                            Применить
                        </button>
                        <button
                            onClick={() => {
                                setDateFrom('');
                                setDateTo('');
                                setSelectedObject('');
                                setSelectedWorker('');
                                setTimeout(() => loadSessions(), 100);
                            }}
                            className="btn-secondary"
                            title="Показать за все время"
                        >
                            Сбросить
                        </button>
                    </div>
                    <button onClick={generatePDF} className="btn-secondary flex items-center gap-2">
                        <FileDown className="w-4 h-4" />
                        PDF
                    </button>
                </div>
            </div>

            {/* Statistics */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className="card">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-primary-100 dark:bg-primary-900/40 rounded-xl text-primary-600 dark:text-primary-400">
                            <Calendar className="w-6 h-6" />
                        </div>
                        <div>
                            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Всего смен</p>
                            <p className="text-2xl font-bold text-gray-900 dark:text-white">{sessions.length}</p>
                        </div>
                    </div>
                </div>

                <div className="card">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-green-100 dark:bg-green-900/40 rounded-xl text-green-600 dark:text-green-400">
                            <Clock className="w-6 h-6" />
                        </div>
                        <div>
                            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Общее время</p>
                            <p className="text-2xl font-bold text-gray-900 dark:text-white">{formatDuration(totalMinutes)}</p>
                        </div>
                    </div>
                </div>

                <div className="card">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-blue-100 dark:bg-blue-900/40 rounded-xl text-blue-600 dark:text-blue-400">
                            <Clock className="w-6 h-6" />
                        </div>
                        <div>
                            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Средняя длительность</p>
                            <p className="text-2xl font-bold text-gray-900 dark:text-white">{formatDuration(Math.round(averageDuration))}</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Active Shifts Section */}
            <div className="card mb-6 border-l-4 border-green-500">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-full text-green-600 dark:text-green-400">
                            <Clock className="w-5 h-5" />
                        </div>
                        <h3 className="text-lg font-bold text-gray-900 dark:text-white">Активные смены (сейчас работают)</h3>
                    </div>
                </div>

                {sessions.filter(s => !s.end_time).length > 0 ? (
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                        {sessions.filter(s => !s.end_time).map(session => (
                            <div key={session.id} className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-100 dark:border-gray-800">
                                <div className="flex items-start justify-between mb-2">
                                    <div className="flex items-center gap-2">
                                        <div className="w-8 h-8 rounded-full bg-white dark:bg-gray-700 flex items-center justify-center shadow-sm">
                                            <User className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                                        </div>
                                        <div>
                                            <p className="font-semibold text-gray-900 dark:text-white">
                                                {session.workers ? `${session.workers.first_name} ${session.workers.last_name}` : 'Unknown'}
                                            </p>
                                            <div className="flex items-center gap-1 text-xs text-gray-500">
                                                <MapPin className="w-3 h-3" />
                                                {session.cleaning_objects?.name}
                                            </div>
                                        </div>
                                    </div>
                                    <span className="px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-xs rounded-full animate-pulse border border-green-200 dark:border-green-800">
                                        Активен
                                    </span>
                                </div>
                                <div className="space-y-1 text-sm">
                                    <div className="flex justify-between text-gray-600 dark:text-gray-400">
                                        <span>Начало:</span>
                                        <span className="font-medium">{formatTime(session.start_time)}</span>
                                    </div>
                                    <div className="flex justify-between text-gray-600 dark:text-gray-400">
                                        <span>Дата:</span>
                                        <span className="font-medium">{formatDate(session.start_time)}</span>
                                    </div>
                                </div>
                                <div className="mt-3 flex gap-2">
                                    <button
                                        onClick={() => handleFinishSession(session.id, session.start_time)}
                                        className="btn-danger w-full text-xs py-1.5 flex justify-center items-center gap-1"
                                        title="Завершить смену сейчас"
                                    >
                                        <StopCircle className="w-3 h-3" />
                                        Завершить
                                    </button>
                                    <button
                                        onClick={() => startEditing(session)}
                                        className="btn-secondary w-full text-xs py-1.5"
                                    >
                                        Редактировать
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <p className="text-gray-500 dark:text-gray-400 text-sm italic">Сейчас нет активных смен</p>
                )}
            </div>

            {/* Sessions Table */}
            <div className="card overflow-hidden p-0">
                <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Рабочие смены</h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="table w-full">
                        <thead>
                            <tr>
                                <th>Работник</th>
                                <th>Объект</th>
                                <th>Дата</th>
                                <th>Начало</th>
                                <th>Конец</th>
                                <th>Длительность</th>
                                <th>Начало (Место)</th>
                                <th>Конец (Место)</th>
                                <th>Оплата</th>
                                <th>Действия</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                            {sessions.map((session) => (
                                <tr key={session.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                                    <td className="font-medium text-gray-900 dark:text-white">
                                        <div className="flex items-center gap-2">
                                            <div className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
                                                <User className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                                            </div>
                                            {session.workers ? (
                                                <span className="font-medium">{session.workers.first_name} {session.workers.last_name}</span>
                                            ) : (
                                                <span className="text-red-500 italic">Неизвестный работник</span>
                                            )}
                                        </div>
                                    </td>
                                    <td>
                                        <div className="flex items-center gap-1.5 text-gray-700 dark:text-gray-300">
                                            <MapPin className="w-3.5 h-3.5 text-gray-400" />
                                            {session.cleaning_objects?.name || 'Не указан'}
                                        </div>
                                    </td>
                                    {editingSession === session.id ? (
                                        <td colSpan={2}>
                                            <input
                                                type="datetime-local"
                                                value={editForm.start_time}
                                                onChange={(e) => setEditForm({ ...editForm, start_time: e.target.value })}
                                                className="input py-1 text-sm mb-2"
                                            />
                                        </td>
                                    ) : (
                                        <>
                                            <td className="text-gray-600 dark:text-gray-400">
                                                {formatDate(session.start_time)}
                                            </td>
                                            <td className="text-gray-600 dark:text-gray-400">
                                                {formatTime(session.start_time)}
                                            </td>
                                        </>
                                    )}
                                    <td>
                                        {editingSession === session.id ? (
                                            <input
                                                type="datetime-local"
                                                value={editForm.end_time}
                                                onChange={(e) => setEditForm({ ...editForm, end_time: e.target.value })}
                                                className="input py-1 text-sm"
                                            />
                                        ) : (
                                            session.end_time ? (
                                                <span className="text-gray-600 dark:text-gray-400">{formatTime(session.end_time)}</span>
                                            ) : (
                                                <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 border border-yellow-200 dark:border-yellow-800 whitespace-nowrap">
                                                    В процессе
                                                </span>
                                            )
                                        )}
                                    </td>
                                    <td className="font-medium text-gray-900 dark:text-white">
                                        {session.duration_minutes ? formatDuration(session.duration_minutes) : '-'}
                                    </td>
                                    <td>
                                        {session.start_location ? (
                                            <div className="flex items-center gap-2">
                                                <a
                                                    href={getGoogleMapsLink(session.start_location)!}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
                                                >
                                                    <MapPin className="w-3 h-3" />
                                                    Карта
                                                </a>
                                                {session.is_start_in_geofence === false && (
                                                    <div className="group relative flex items-center">
                                                        <AlertTriangle className="w-4 h-4 text-amber-500 cursor-help" />
                                                        <span className="absolute z-10 p-2 bg-black/80 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap -top-8 left-1/2 -translate-x-1/2 pointer-events-none">
                                                            Вне зоны: {Math.round(session.start_distance_meters || 0)}м
                                                        </span>
                                                    </div>
                                                )}
                                            </div>
                                        ) : (
                                            <span className="text-gray-400">-</span>
                                        )}
                                    </td>
                                    <td>
                                        {session.end_location ? (
                                            <div className="flex items-center gap-2">
                                                <a
                                                    href={getGoogleMapsLink(session.end_location)!}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
                                                >
                                                    <MapPin className="w-3 h-3" />
                                                    Карта
                                                </a>
                                                {session.is_end_in_geofence === false && (
                                                    <div className="group relative flex items-center">
                                                        <AlertTriangle className="w-4 h-4 text-amber-500 cursor-help" />
                                                        <span className="absolute z-10 p-2 bg-black/80 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap -top-8 left-1/2 -translate-x-1/2 pointer-events-none">
                                                            Вне зоны: {Math.round(session.end_distance_meters || 0)}м
                                                        </span>
                                                    </div>
                                                )}
                                            </div>
                                        ) : (
                                            <span className="text-gray-400">-</span>
                                        )}
                                    </td>
                                    <td>
                                        {session.cleaning_objects?.salary_type === 'hourly' ? (
                                            <div>
                                                <div className="font-medium text-gray-900 dark:text-white">
                                                    {((session.duration_minutes || 0) / 60 * (session.cleaning_objects.hourly_rate || 0)).toFixed(2)} zł
                                                </div>
                                                <div className="text-xs text-gray-500">
                                                    {session.cleaning_objects.hourly_rate} zł/ч
                                                </div>
                                            </div>
                                        ) : session.cleaning_objects?.salary_type === 'monthly_fixed' ? (
                                            <div>
                                                <div className="font-medium text-gray-900 dark:text-white">Fix</div>
                                                <div className="text-xs text-gray-500">
                                                    {session.cleaning_objects.monthly_rate} zł/мес
                                                </div>
                                            </div>
                                        ) : (
                                            <span className="text-gray-400">-</span>
                                        )}
                                    </td>
                                    <td>
                                        <div className="flex items-center gap-1">
                                            {session.shift_photos && session.shift_photos[0]?.count > 0 && (
                                                <button
                                                    onClick={() => setViewingPhotos(session.id)}
                                                    className="p-1.5 hover:bg-purple-100 dark:hover:bg-purple-900/30 rounded-lg text-purple-600 dark:text-purple-400 transition-colors"
                                                    title="Смотреть фото"
                                                >
                                                    <Camera className="w-4 h-4" />
                                                </button>
                                            )}
                                            {editingSession === session.id ? (
                                                <>
                                                    <button
                                                        onClick={() => handleUpdateSession(session.id)}
                                                        className="p-1.5 hover:bg-green-100 dark:hover:bg-green-900/30 rounded-lg text-green-600 dark:text-green-400 transition-colors"
                                                        title="Сохранить"
                                                    >
                                                        <Save className="w-4 h-4" />
                                                    </button>
                                                    <button
                                                        onClick={() => setEditingSession(null)}
                                                        className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg text-gray-500 dark:text-gray-400 transition-colors"
                                                        title="Отмена"
                                                    >
                                                        <X className="w-4 h-4" />
                                                    </button>
                                                </>
                                            ) : (
                                                <>
                                                    {!session.end_time && (
                                                        <button
                                                            onClick={() => handleFinishSession(session.id, session.start_time)}
                                                            className="p-1.5 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg text-red-600 dark:text-red-400 transition-colors"
                                                            title="Завершить смену"
                                                        >
                                                            <StopCircle className="w-4 h-4" />
                                                        </button>
                                                    )}
                                                    <button
                                                        onClick={() => startEditing(session)}
                                                        className="p-1.5 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded-lg text-blue-600 dark:text-blue-400 transition-colors"
                                                        title="Редактировать"
                                                    >
                                                        <Edit2 className="w-4 h-4" />
                                                    </button>
                                                    <button
                                                        onClick={() => handleDeleteSession(session.id)}
                                                        className="p-1.5 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg text-red-600 dark:text-red-400 transition-colors"
                                                        title="Удалить"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {sessions.length === 0 && (
                    <div className="text-center text-gray-500 dark:text-gray-400 py-12">
                        <Calendar className="w-12 h-12 mx-auto mb-4 opacity-30" />
                        <p>Нет рабочих смен за выбранный период</p>
                    </div>
                )}
            </div>
            {viewingPhotos && (
                <PhotoGalleryModal
                    sessionId={viewingPhotos}
                    onClose={() => setViewingPhotos(null)}
                />
            )}
        </div>
    );
}

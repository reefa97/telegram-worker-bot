import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Calendar, Clock, MapPin, User, Edit2, Trash2, X, FileDown, AlertTriangle, Camera, StopCircle } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import PhotoGalleryModal from './PhotoGalleryModal';
import ShiftDetailsModal from './ShiftDetailsModal';


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
    tasks_completed?: boolean | null;
    workers: {
        first_name: string;
        last_name: string;
        phone_number?: string;
    };
    cleaning_objects: {
        id: string;
        name: string;
        address: string;
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
    const [viewingPhotos, setViewingPhotos] = useState<string | null>(null);
    const [selectedSessionDetails, setSelectedSessionDetails] = useState<WorkSession | null>(null);

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
                workers (first_name, last_name, phone_number),
                cleaning_objects (
                    id,
                    name,
                    address,
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
        <div className="space-y-8">
            <h2 className="text-2xl font-bold text-main">Отчеты и статистика</h2>

            {/* Filters */}
            <div className="card p-4 lg:p-6 mb-6 overflow-hidden">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
                    <div className="min-w-0">
                        <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">Дата от</label>
                        <input
                            type="date"
                            value={dateFrom}
                            onChange={(e) => setDateFrom(e.target.value)}
                            className="input w-full min-w-0 max-w-full box-border"
                        />
                    </div>
                    <div className="min-w-0">
                        <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">Дата до</label>
                        <input
                            type="date"
                            value={dateTo}
                            onChange={(e) => setDateTo(e.target.value)}
                            className="input w-full min-w-0 max-w-full box-border"
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">Объект</label>
                        <select
                            value={selectedObject}
                            onChange={(e) => setSelectedObject(e.target.value)}
                            className="input"
                        >
                            <option value="">Все объекты</option>
                            {objects.map(obj => (
                                <option key={obj.id} value={obj.id}>{obj.name}</option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">Работники</label>
                        <select
                            value={selectedWorker}
                            onChange={(e) => setSelectedWorker(e.target.value)}
                            className="input"
                        >
                            <option value="">Все работники</option>
                            {workers.map(w => (
                                <option key={w.id} value={w.id}>{w.first_name} {w.last_name}</option>
                            ))}
                        </select>
                    </div>

                    <div className="sm:col-span-2 lg:col-span-4 flex flex-wrap gap-2 pt-2">
                        <button onClick={loadSessions} className="btn-primary px-6">
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
                        >
                            Сбросить
                        </button>
                        <button onClick={generatePDF} className="btn-secondary flex items-center gap-2 ml-auto">
                            <FileDown className="w-4 h-4" />
                            <span className="hidden sm:inline">Экспорт в PDF</span>
                            <span className="sm:hidden">PDF</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* Statistics */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="card p-6">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-primary/10 rounded-xl text-primary">
                            <Calendar className="w-6 h-6" />
                        </div>
                        <div>
                            <p className="text-sm font-medium text-muted">Всего смен</p>
                            <p className="text-2xl font-bold text-main">{sessions.length}</p>
                        </div>
                    </div>
                </div>

                <div className="card p-6">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-emerald-500/10 rounded-xl text-emerald-600 dark:text-emerald-400">
                            <Clock className="w-6 h-6" />
                        </div>
                        <div>
                            <p className="text-sm font-medium text-muted">Общее время</p>
                            <p className="text-2xl font-bold text-main">{formatDuration(totalMinutes)}</p>
                        </div>
                    </div>
                </div>

                <div className="card p-6">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-blue-500/10 rounded-xl text-blue-600 dark:text-blue-400">
                            <Clock className="w-6 h-6" />
                        </div>
                        <div>
                            <p className="text-sm font-medium text-muted">Средняя длительность</p>
                            <p className="text-2xl font-bold text-main">{formatDuration(Math.round(averageDuration))}</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Active Shifts Section */}
            {sessions.filter(s => !s.end_time).length > 0 && (
                <div className="space-y-4">
                    <div className="flex items-center gap-2">
                        <span className="relative flex h-3 w-3">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                        </span>
                        <h3 className="text-lg font-bold text-main">Активные смены</h3>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                        {sessions.filter(s => !s.end_time).map(session => (
                            <div key={session.id} className="card p-5 border-emerald-500/30 flex flex-col gap-4">
                                <div className="flex items-start justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-subtle flex items-center justify-center border border-border">
                                            <User className="w-5 h-5 text-muted" />
                                        </div>
                                        <div>
                                            <p className="font-semibold text-main">
                                                {session.workers ? `${session.workers.first_name} ${session.workers.last_name}` : 'Unknown'}
                                            </p>
                                            <div className="flex items-center gap-1.5 text-xs text-muted mt-0.5">
                                                <MapPin className="w-3 h-3" />
                                                {session.cleaning_objects?.name}
                                            </div>
                                        </div>
                                    </div>
                                    <span className="badge-success animate-pulse">
                                        Активен
                                    </span>
                                </div>

                                <div className="h-px bg-border w-full" />

                                <div className="grid grid-cols-2 gap-4 text-sm">
                                    <div className="space-y-1">
                                        <span className="text-xs text-muted block">Начало</span>
                                        <span className="font-medium text-main">{formatTime(session.start_time)}</span>
                                    </div>
                                    <div className="space-y-1">
                                        <span className="text-xs text-muted block">Дата</span>
                                        <span className="font-medium text-main">{formatDate(session.start_time)}</span>
                                    </div>
                                </div>

                                <div className="flex gap-2 mt-2">
                                    <button
                                        onClick={() => handleFinishSession(session.id, session.start_time)}
                                        className="btn-danger w-full text-xs h-8"
                                        title="Завершить смену сейчас"
                                    >
                                        <StopCircle className="w-3 h-3" />
                                        Завершить
                                    </button>
                                    <button
                                        onClick={() => setSelectedSessionDetails(session)}
                                        className="btn-secondary w-full text-xs h-8"
                                    >
                                        <Edit2 className="w-3 h-3" />
                                        Изменить
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Sessions Table */}
            <div className="table-container">
                <div className="px-6 py-4 border-b border-border">
                    <h3 className="text-lg font-semibold text-main">История смен</h3>
                </div>
                <table className="table">
                    <thead>
                        <tr>
                            <th>Работник</th>
                            <th>Объект</th>
                            <th>Дата</th>
                            <th>Начало</th>
                            <th>Конец</th>
                            <th>Длительность</th>
                            <th>Место</th>
                            <th>Задачи</th>
                            <th>Оплата</th>
                            <th className="text-right">Действия</th>
                        </tr>
                    </thead>
                    <tbody>
                        {sessions.map((session) => (
                            <tr
                                key={session.id}
                                className="hover:bg-subtle transition-colors group cursor-pointer"
                                onClick={() => setSelectedSessionDetails(session)}
                            >
                                <td className="font-medium text-main">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-subtle flex items-center justify-center border border-border">
                                            <User className="w-4 h-4 text-muted" />
                                        </div>
                                        {session.workers ? (
                                            <span className="font-medium">{session.workers.first_name} {session.workers.last_name}</span>
                                        ) : (
                                            <span className="text-danger italic">Неизвестный</span>
                                        )}
                                    </div>
                                </td>
                                <td>
                                    <div className="flex items-center gap-1.5 text-muted">
                                        <MapPin className="w-3.5 h-3.5" />
                                        {session.cleaning_objects?.name || 'Не указан'}
                                    </div>
                                </td>
                                <td className="text-muted">
                                    {formatDate(session.start_time)}
                                </td>
                                <td className="text-muted font-mono text-xs">
                                    {formatTime(session.start_time)}
                                </td>
                                <td>
                                    {session.end_time ? (
                                        <span className="text-muted font-mono text-xs">{formatTime(session.end_time)}</span>
                                    ) : (
                                        <span className="badge-warning">
                                            В процессе
                                        </span>
                                    )}
                                </td>
                                <td className="font-medium text-main">
                                    {session.duration_minutes ? formatDuration(session.duration_minutes) : '-'}
                                </td>
                                <td onClick={(e) => e.stopPropagation()}>
                                    <div className="flex flex-col gap-1">
                                        {session.start_location && (
                                            <div className="flex items-center gap-2">
                                                <a
                                                    href={getGoogleMapsLink(session.start_location)!}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="link text-xs flex items-center gap-1 text-blue-500 hover:text-blue-600"
                                                >
                                                    Start
                                                </a>
                                                {session.is_start_in_geofence === false && (
                                                    <span className="text-xs text-amber-500 flex items-center gap-0.5" title={`Вне зоны: ${Math.round(session.start_distance_meters || 0)}м`}>
                                                        <AlertTriangle className="w-3 h-3" />
                                                        {Math.round(session.start_distance_meters || 0)}м
                                                    </span>
                                                )}
                                            </div>
                                        )}
                                        {session.end_location && (
                                            <div className="flex items-center gap-2">
                                                <a
                                                    href={getGoogleMapsLink(session.end_location)!}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="link text-xs flex items-center gap-1 text-blue-500 hover:text-blue-600"
                                                >
                                                    End
                                                </a>
                                                {session.is_end_in_geofence === false && (
                                                    <span className="text-xs text-amber-500 flex items-center gap-0.5" title={`Вне зоны: ${Math.round(session.end_distance_meters || 0)}м`}>
                                                        <AlertTriangle className="w-3 h-3" />
                                                        {Math.round(session.end_distance_meters || 0)}м
                                                    </span>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </td>
                                <td>
                                    {session.tasks_completed === true ? (
                                        <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-medium">
                                            <div className="w-5 h-5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                                                <X className="w-3 h-3 rotate-45" />
                                            </div>
                                            <span>Выполнено</span>
                                        </div>
                                    ) : session.tasks_completed === false ? (
                                        <div className="flex flex-col gap-1">
                                            <div className="flex items-center gap-1.5 text-danger font-bold text-xs">
                                                <AlertTriangle className="w-4 h-4" />
                                                <span>НЕ ВЫПОЛНЕНО</span>
                                            </div>
                                            <div className="text-[10px] leading-tight text-danger opacity-80 max-w-[120px]">
                                                Требуется контакт с работником
                                            </div>
                                        </div>
                                    ) : (
                                        <span className="text-muted italic">-</span>
                                    )}
                                </td>
                                <td>
                                    {session.cleaning_objects?.salary_type === 'hourly' ? (
                                        <div>
                                            <div className="font-medium text-main">
                                                {((session.duration_minutes || 0) / 60 * (session.cleaning_objects.hourly_rate || 0)).toFixed(2)} zł
                                            </div>
                                            <div className="text-xs text-muted">
                                                {session.cleaning_objects.hourly_rate} zł/ч
                                            </div>
                                        </div>
                                    ) : session.cleaning_objects?.salary_type === 'monthly_fixed' ? (
                                        <div>
                                            <div className="font-medium text-main">Fix</div>
                                            <div className="text-xs text-muted">
                                                {session.cleaning_objects.monthly_rate} zł/мес
                                            </div>
                                        </div>
                                    ) : (
                                        <span className="text-muted">-</span>
                                    )}
                                </td>
                                <td className="text-right" onClick={(e) => e.stopPropagation()}>
                                    <div className="flex items-center justify-end gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                                        {session.shift_photos && session.shift_photos[0]?.count > 0 && (
                                            <button
                                                onClick={() => setViewingPhotos(session.id)}
                                                className="btn-icon text-purple-500 hover:text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900/20"
                                                title="Смотреть фото"
                                            >
                                                <Camera size={16} />
                                            </button>
                                        )}

                                        {!session.end_time && (
                                            <button
                                                onClick={() => handleFinishSession(session.id, session.start_time)}
                                                className="btn-icon text-danger hover:bg-red-50 dark:hover:bg-red-900/20"
                                                title="Завершить смену"
                                            >
                                                <StopCircle size={16} />
                                            </button>
                                        )}
                                        <button
                                            onClick={() => setSelectedSessionDetails(session)}
                                            className="btn-icon hover:bg-blue-50 dark:hover:bg-blue-900/20 text-blue-500"
                                            title="Редактировать"
                                        >
                                            <Edit2 size={16} />
                                        </button>
                                        <button
                                            onClick={() => handleDeleteSession(session.id)}
                                            className="btn-icon text-danger hover:bg-red-50 dark:hover:bg-red-900/20"
                                            title="Удалить"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {sessions.length === 0 && (
                <div className="text-center text-muted py-12 bg-subtle/30 rounded-xl border border-dashed border-border">
                    <Calendar className="w-12 h-12 mx-auto mb-4 opacity-30" />
                    <p>Нет рабочих смен за выбранный период</p>
                </div>
            )}

            {viewingPhotos && (
                <PhotoGalleryModal
                    sessionId={viewingPhotos}
                    onClose={() => setViewingPhotos(null)}
                />
            )}

            {selectedSessionDetails && (
                <ShiftDetailsModal
                    session={selectedSessionDetails}
                    onClose={() => setSelectedSessionDetails(null)}
                    onUpdate={() => {
                        setSelectedSessionDetails(null);
                        loadSessions();
                    }}
                />
            )}
        </div>
    );
}

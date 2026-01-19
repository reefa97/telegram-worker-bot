import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Calendar, Users, MapPin, Clock, Layout } from 'lucide-react';

interface CleaningObject {
    id: string;
    name: string;
    address: string;
    schedule_days: number[]; // 0-6
    schedule_time_start: string;
    schedule_time_end: string;
}

interface Worker {
    id: string;
    first_name: string;
    last_name: string;
}

interface WorkerObject {
    worker_id: string;
    object_id: string;
    workers: Worker;
    cleaning_objects: CleaningObject;
}

const DAYS = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];

export default function ShiftPlanningPanel() {
    const [viewMode, setViewMode] = useState<'calendar' | 'template'>('calendar');
    const [calendarData, setCalendarData] = useState<any[]>([]);
    const [scheduleData, setScheduleData] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const loadData = async () => {
            setLoading(true);
            setError(null);

            try {
                // 1. Fetch Objects with Schedule
                const { data: objects, error: objError } = await supabase
                    .from('cleaning_objects')
                    .select('*')
                    .eq('is_active', true);

                if (objError) throw objError;

                // 2. Fetch Assignments (Worker -> Object)
                const { data: assignments, error: assignError } = await supabase
                    .from('worker_objects')
                    .select('worker_id, object_id, workers(id, first_name, last_name)')
                    .returns<WorkerObject[]>();

                if (assignError) throw assignError;

                // 3. Process Data
                const processedObjects = objects || [];
                const processedAssignments = assignments || [];

                // A. Weekly Template Data
                const template = DAYS.map((dayName, dayIndex) => {
                    const dayObjects = processedObjects.filter(obj =>
                        obj.schedule_days && obj.schedule_days.includes(dayIndex)
                    );
                    return {
                        title: dayName,
                        objects: mapWorkersToObjects(dayObjects, processedAssignments)
                    };
                });
                // Move Sunday to end for template view
                const sunday = template.shift();
                if (sunday) template.push(sunday);
                setScheduleData(template);

                // B. Calendar Data (Next 30 Days)
                const calendar = [];
                const today = new Date();
                for (let i = 0; i < 30; i++) {
                    const date = new Date(today);
                    date.setDate(today.getDate() + i);
                    const dayIndex = date.getDay(); // 0 (Sun) - 6 (Sat)

                    const dayObjects = processedObjects.filter(obj =>
                        obj.schedule_days && obj.schedule_days.includes(dayIndex)
                    );

                    if (dayObjects.length > 0) {
                        calendar.push({
                            date: date,
                            title: `${date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })} (${DAYS[dayIndex]})`,
                            objects: mapWorkersToObjects(dayObjects, processedAssignments),
                            isToday: i === 0
                        });
                    }
                }
                setCalendarData(calendar);

            } catch (error) {
                console.error('Error loading schedule:', error);
                setError('Не удалось загрузить расписание. Проверьте соединение и попробуйте снова.');
            } finally {
                setLoading(false);
            }
        };

        loadData();
    }, []);

    const mapWorkersToObjects = (objects: any[], assignments: WorkerObject[]) => {
        return objects.map((obj: any) => {
            const assignedWorkers = assignments
                .filter(a => a.object_id === obj.id)
                .map(a => a.workers);

            return {
                ...obj,
                workers: assignedWorkers
            };
        });
    };

    if (loading) {
        return (
            <div className="flex justify-center items-center h-64">
                <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center h-64 text-center p-4">
                <div className="w-12 h-12 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mb-4">
                    <Layout className="w-6 h-6 text-red-500" />
                </div>
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">Произошла ошибка</h3>
                <p className="text-gray-500 dark:text-gray-400 max-w-sm mb-6">{error}</p>
                <button
                    onClick={() => window.location.reload()}
                    className="px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg transition-colors"
                >
                    Попробовать снова
                </button>
            </div>
        );
    }

    const displayData = viewMode === 'calendar' ? calendarData : scheduleData;

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center flex-wrap gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">График смен</h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        {viewMode === 'calendar' ? 'Расписание на ближайшие 30 дней' : 'Шаблон недельного расписания'}
                    </p>
                </div>

                <div className="flex p-1 bg-gray-100 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
                    <button
                        onClick={() => setViewMode('calendar')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${viewMode === 'calendar'
                            ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                            : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                            }`}
                    >
                        <Calendar className="w-4 h-4" />
                        Календарь
                    </button>
                    <button
                        onClick={() => setViewMode('template')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${viewMode === 'template'
                            ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                            : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                            }`}
                    >
                        <Layout className="w-4 h-4" />
                        Шаблон недели
                    </button>
                </div>
            </div>

            <div className="grid gap-6">
                {displayData.map((item, index) => (
                    <div key={index} className={`card ${item.isToday ? 'ring-2 ring-primary-500 ring-offset-2 dark:ring-offset-gray-900' : ''}`}>
                        <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-4 mb-4">
                            <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                                <span className={`p-2 rounded-lg ${item.isToday ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400' : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'}`}>
                                    <Calendar className="w-5 h-5" />
                                </span>
                                {item.title}
                                {item.isToday && (
                                    <span className="ml-2 text-xs bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 px-2.5 py-0.5 rounded-full font-medium">
                                        Сегодня
                                    </span>
                                )}
                            </h3>
                            <span className="text-sm font-medium text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 px-3 py-1 rounded-full border border-gray-200 dark:border-gray-700">
                                {item.objects.length} {item.objects.length === 1 ? 'объект' : 'объекта'}
                            </span>
                        </div>

                        {item.objects.length === 0 ? (
                            <div className="text-center py-6">
                                <p className="text-gray-400 dark:text-gray-500 text-sm italic">Нет запланированных уборок</p>
                            </div>
                        ) : (
                            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                                {item.objects.map((obj: any) => (
                                    <div key={obj.id} className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4 border border-gray-200 dark:border-gray-700/50 hover:border-primary-500/50 dark:hover:border-primary-500/50 transition-colors group">
                                        <div className="flex justify-between items-start mb-3">
                                            <h4 className="font-semibold text-gray-900 dark:text-white group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">{obj.name}</h4>
                                            <div className="flex items-center gap-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 px-2 py-1 rounded-lg border border-blue-100 dark:border-blue-900/30">
                                                <Clock className="w-3 h-3" />
                                                {obj.schedule_time_start?.slice(0, 5)} - {obj.schedule_time_end?.slice(0, 5)}
                                            </div>
                                        </div>

                                        <div className="text-sm text-gray-500 dark:text-gray-400 mb-4 flex items-center gap-1.5">
                                            <MapPin className="w-3.5 h-3.5 flex-shrink-0 text-gray-400" />
                                            <span className="truncate">{obj.address}</span>
                                        </div>

                                        <div className="border-t border-gray-100 dark:border-gray-700/50 pt-3 mt-auto">
                                            <div className="flex items-center gap-2 text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">
                                                <Users className="w-3 h-3" />
                                                <span>Персонал ({obj.workers.length})</span>
                                            </div>

                                            {obj.workers.length > 0 ? (
                                                <div className="space-y-1.5">
                                                    {obj.workers.map((worker: Worker) => (
                                                        <div key={worker.id} className="flex items-center gap-2 text-sm bg-white dark:bg-gray-700/30 px-2.5 py-1.5 rounded-lg border border-gray-100 dark:border-gray-700/50">
                                                            <div className="w-2 h-2 rounded-full bg-green-500 ring-2 ring-green-100 dark:ring-green-900"></div>
                                                            <span className="text-gray-700 dark:text-gray-200 font-medium">
                                                                {worker.first_name} {worker.last_name}
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <div className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/10 px-2.5 py-2 rounded-lg border border-amber-100 dark:border-amber-900/20 flex items-center gap-2">
                                                    <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></div>
                                                    Нет назначенных работников
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}

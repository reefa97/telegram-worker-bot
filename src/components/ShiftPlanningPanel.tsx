import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Calendar, Users, MapPin, Layout } from 'lucide-react';

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

// Days in order Mon-Sun, values 1-7 to match schedule_days format in DB
const DAYS = [
    { val: 1, label: 'Понедельник' }, { val: 2, label: 'Вторник' }, { val: 3, label: 'Среда' },
    { val: 4, label: 'Четверг' }, { val: 5, label: 'Пятница' }, { val: 6, label: 'Суббота' }, { val: 7, label: 'Воскресенье' }
];

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
                    .select('worker_id, object_id, workers(id, first_name, last_name)');

                if (assignError) throw assignError;

                // 3. Process Data
                const processedObjects = objects || [];
                const processedAssignments = assignments || [];

                // A. Weekly Template Data (Mon=1 through Sun=7)
                const template = DAYS.map((day) => {
                    const dayObjects = processedObjects.filter((obj: any) =>
                        obj.schedule_days && obj.schedule_days.includes(day.val)
                    );
                    return {
                        title: day.label,
                        objects: mapWorkersToObjects(dayObjects, processedAssignments)
                    };
                });
                setScheduleData(template);

                // B. Calendar Data (Next 30 Days)
                const calendar = [];
                const today = new Date();
                for (let i = 0; i < 30; i++) {
                    const date = new Date(today);
                    date.setDate(today.getDate() + i);
                    const jsDay = date.getDay(); // 0 (Sun) - 6 (Sat)
                    const dayOfWeek = jsDay === 0 ? 7 : jsDay; // Convert to 1-7 (Mon=1, Sun=7)

                    const dayObjects = processedObjects.filter((obj: any) =>
                        obj.schedule_days && obj.schedule_days.includes(dayOfWeek)
                    );

                    const dayLabel = DAYS.find(d => d.val === dayOfWeek)?.label || '';
                    if (dayObjects.length > 0) {
                        calendar.push({
                            date: date,
                            title: `${date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })} (${dayLabel})`,
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
                .map(a => a.workers)
                .filter(w => w !== null && w !== undefined); // Remove null/undefined workers

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
                <h3 className="text-lg font-medium text-main mb-2">Произошла ошибка</h3>
                <p className="text-muted max-w-sm mb-6">{error}</p>
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
        <div className="space-y-8">
            {/* Header & Controls */}
            <div className="flex justify-between items-center flex-wrap gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-main mb-1">График смен</h2>
                    <p className="text-sm text-muted">
                        {viewMode === 'calendar' ? 'Расписание на ближайшие 30 дней' : 'Шаблон недельного расписания'}
                    </p>
                </div>

                <div className="flex p-1 bg-subtle rounded-lg border border-border">
                    <button
                        onClick={() => setViewMode('calendar')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${viewMode === 'calendar'
                            ? 'bg-card text-main shadow-sm border border-border'
                            : 'text-muted hover:text-main'
                            }`}
                    >
                        <Calendar className="w-4 h-4" />
                        Календарь
                    </button>
                    <button
                        onClick={() => setViewMode('template')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${viewMode === 'template'
                            ? 'bg-card text-main shadow-sm border border-border'
                            : 'text-muted hover:text-main'
                            }`}
                    >
                        <Layout className="w-4 h-4" />
                        Шаблон недели
                    </button>
                </div>
            </div>

            {/* Schedule Grid */}
            <div className="space-y-8">
                {displayData.map((item, index) => (
                    <div key={index} className="space-y-4">
                        {/* Day Header */}
                        <div className={`flex items-center gap-3 pb-2 border-b border-border ${item.isToday ? 'text-primary' : 'text-main'}`}>
                            <div className={`p-2 rounded-lg border border-border ${item.isToday ? 'bg-primary/10 text-primary border-primary/20' : 'bg-card text-muted'}`}>
                                <Calendar className="w-5 h-5" />
                            </div>
                            <h3 className="text-lg font-bold flex items-center gap-3">
                                {item.title}
                                {item.isToday && (
                                    <span className="badge-danger">
                                        Сегодня
                                    </span>
                                )}
                            </h3>
                            <span className="ml-auto text-xs font-medium text-muted bg-subtle px-2.5 py-1 rounded-full border border-border">
                                {item.objects.length} {item.objects.length === 1 ? 'объект' : 'объекта'}
                            </span>
                        </div>

                        {/* Objects Grid */}
                        {item.objects.length === 0 ? (
                            <div className="text-center py-12 bg-subtle/30 rounded-xl border border-dashed border-border">
                                <p className="text-muted text-sm">Нет запланированных уборок</p>
                            </div>
                        ) : (
                            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                                {item.objects.map((obj: any) => (
                                    <div key={obj.id} className="card p-5 hover:border-zinc-400 dark:hover:border-zinc-700 transition-colors group flex flex-col gap-4">

                                        {/* Card Header */}
                                        <div className="flex justify-between items-start gap-4">
                                            <div>
                                                <h4 className="font-semibold text-main group-hover:text-primary transition-colors">{obj.name}</h4>
                                                <div className="flex items-center gap-1.5 mt-1 text-xs text-muted">
                                                    <MapPin className="w-3.5 h-3.5" />
                                                    <span className="truncate max-w-[200px]">{obj.address}</span>
                                                </div>
                                            </div>
                                            <div className="badge-neutral font-mono text-xs">
                                                {obj.schedule_time_start?.slice(0, 5)} - {obj.schedule_time_end?.slice(0, 5)}
                                            </div>
                                        </div>

                                        <div className="h-px bg-border w-full" />

                                        {/* Workers Section */}
                                        <div className="space-y-3">
                                            <div className="flex items-center gap-2 text-xs font-medium text-muted uppercase tracking-wider">
                                                <Users className="w-3.5 h-3.5" />
                                                <span>Персонал ({obj.workers.length})</span>
                                            </div>

                                            {obj.workers.length > 0 ? (
                                                <div className="space-y-2">
                                                    {obj.workers.map((worker: Worker) => (
                                                        <div key={worker.id} className="flex items-center gap-3 text-sm p-2 rounded-md bg-subtle border border-border/50">
                                                            <div className="w-2 h-2 rounded-full bg-success"></div>
                                                            <span className="text-main font-medium">
                                                                {worker.first_name} {worker.last_name}
                                                            </span>
                                                            <div className="ml-auto md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                                                                {/* Potential action buttons for future */}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <div className="text-xs text-warning bg-orange-500/10 px-3 py-2 rounded-md border border-orange-500/20 flex items-center gap-2">
                                                    <div className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse"></div>
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

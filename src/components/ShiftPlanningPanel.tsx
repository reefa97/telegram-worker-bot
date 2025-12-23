import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Calendar, Clock, MapPin, Users, Info } from 'lucide-react';

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

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);

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
            alert('Ошибка загрузки расписания');
        } finally {
            setLoading(false);
        }
    };

    const mapWorkersToObjects = (objects: any[], assignments: WorkerObject[]) => {
        return objects.map(obj => {
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
            <div className="flex items-center justify-center p-8">
                <div className="text-white">Загрузка расписания...</div>
            </div>
        );
    }

    const displayData = viewMode === 'calendar' ? calendarData : scheduleData;

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center flex-wrap gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-white mb-1">График смен</h2>
                    <p className="text-sm text-gray-400">
                        {viewMode === 'calendar' ? 'Расписание на ближайшие 30 дней' : 'Шаблон недельного расписания'}
                    </p>
                </div>

                <div className="flex bg-gray-800 rounded-lg p-1 border border-gray-700">
                    <button
                        onClick={() => setViewMode('calendar')}
                        className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${viewMode === 'calendar'
                            ? 'bg-primary-600 text-white shadow'
                            : 'text-gray-400 hover:text-white'
                            }`}
                    >
                        Календарь
                    </button>
                    <button
                        onClick={() => setViewMode('template')}
                        className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${viewMode === 'template'
                            ? 'bg-primary-600 text-white shadow'
                            : 'text-gray-400 hover:text-white'
                            }`}
                    >
                        Шаблон недели
                    </button>
                </div>
            </div>

            <div className="grid gap-6">
                {displayData.map((item, index) => (
                    <div key={index} className={`card ${item.isToday ? 'border-primary-500/50 ring-1 ring-primary-500/20' : ''}`}>
                        <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2 border-b border-gray-700 pb-2">
                            <Calendar className={`w-5 h-5 ${item.isToday ? 'text-primary-400' : 'text-gray-400'}`} />
                            {item.title}
                            {item.isToday && <span className="ml-2 text-xs bg-primary-500/20 text-primary-400 px-2 py-0.5 rounded">Сегодня</span>}
                            <span className="text-sm font-normal text-gray-400 ml-auto">
                                {item.objects.length} {item.objects.length === 1 ? 'объект' : 'объекта'}
                            </span>
                        </h3>

                        {item.objects.length === 0 ? (
                            <p className="text-gray-500 text-sm italic">Нет запланированных уборок</p>
                        ) : (
                            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                                {item.objects.map((obj: any) => (
                                    <div key={obj.id} className="bg-gray-800/50 rounded-lg p-3 border border-gray-700/50 hover:border-gray-600 transition-colors">
                                        <div className="flex justify-between items-start mb-2">
                                            <h4 className="font-medium text-white">{obj.name}</h4>
                                            <div className="flex items-center gap-1 text-xs text-blue-400 bg-blue-400/10 px-2 py-0.5 rounded">
                                                <Clock className="w-3 h-3" />
                                                {obj.schedule_time_start?.slice(0, 5)} - {obj.schedule_time_end?.slice(0, 5)}
                                            </div>
                                        </div>

                                        <div className="text-sm text-gray-400 mb-3 flex items-center gap-1">
                                            <MapPin className="w-3 h-3" />
                                            <span className="truncate">{obj.address}</span>
                                        </div>

                                        <div className="border-t border-gray-700/50 pt-2">
                                            <div className="flex items-center gap-2 text-xs text-gray-300 mb-2">
                                                <Users className="w-3 h-3" />
                                                <span>Персонал ({obj.workers.length}):</span>
                                            </div>

                                            {obj.workers.length > 0 ? (
                                                <div className="space-y-1">
                                                    {obj.workers.map((worker: Worker) => (
                                                        <div key={worker.id} className="flex items-center gap-2 text-sm bg-gray-700/30 px-2 py-1 rounded">
                                                            <div className="w-2 h-2 rounded-full bg-green-500"></div>
                                                            <span className="text-gray-200">
                                                                {worker.first_name} {worker.last_name}
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <div className="text-xs text-red-400 bg-red-400/10 px-2 py-1 rounded">
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

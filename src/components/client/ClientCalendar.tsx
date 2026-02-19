
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Calendar as CalendarIcon, Clock } from 'lucide-react';

interface CleaningEvent {
    id: string;
    object_id: string;
    worker_id: string;
    start_time: string;
    end_time: string;
    status: string;
    object_name: string;
    worker_name?: string;
}

export default function ClientCalendar() {
    const { adminUser } = useAuth();
    const [events, setEvents] = useState<CleaningEvent[]>([]);
    const [loading, setLoading] = useState(true);
    const [currentMonth, setCurrentMonth] = useState(new Date());

    useEffect(() => {
        loadSchedule();
    }, [currentMonth, adminUser]);

    const loadSchedule = async () => {
        if (!adminUser?.email) return;
        setLoading(true);

        try {
            // 1. Find objects linked to this client email
            // Note: This relies on the client_emails array in cleaning_objects.
            // Since we can't do array contains easily with complex join in one go via SDK sometimes, 
            // we might need a workaround or RPC. 
            // For now, let's try to fetch objects where client_emails contains the user email.

            // PostgREST array containment: client_emails @> '{"email"}'
            // Supabase SDK: .contains('client_emails', [adminUser.email])

            const { data: objects, error: objError } = await supabase
                .from('cleaning_objects')
                .select('id, name')
                .contains('client_emails', [adminUser.email]);

            if (objError) throw objError;

            if (!objects || objects.length === 0) {
                setEvents([]);
                setLoading(false);
                return;
            }

            const objectIds = objects.map((o: any) => o.id);

            // 2. Fetch shifts for these objects
            const startOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1).toISOString();
            const endOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).toISOString();

            const { data: shifts, error: shiftsError } = await supabase
                .from('shifts')
                .select(`
                    id, start_time, end_time, status, object_id, worker_id,
                    workers(first_name, last_name)
                `)
                .in('object_id', objectIds)
                .gte('start_time', startOfMonth)
                .lte('end_time', endOfMonth);

            if (shiftsError) throw shiftsError;

            const formattedEvents = shifts?.map((s: any) => ({
                id: s.id,
                object_id: s.object_id,
                worker_id: s.worker_id,
                start_time: s.start_time,
                end_time: s.end_time,
                status: s.status,
                object_name: objects.find((o: any) => o.id === s.object_id)?.name || 'Unknown',
                worker_name: s.workers ? `${s.workers.first_name} ${s.workers.last_name}` : 'Не назначен'
            })) || [];

            setEvents(formattedEvents);

        } catch (error) {
            console.error('Error loading schedule:', error);
        } finally {
            setLoading(false);
        }
    };

    const daysInMonth = (date: Date) => {
        return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    };

    const getDayEvents = (day: number) => {
        return events.filter(e => {
            const date = new Date(e.start_time);
            return date.getDate() === day;
        });
    };

    const monthName = currentMonth.toLocaleString('ru-RU', { month: 'long', year: 'numeric' });

    if (loading) {
        return (
            <div className="flex justify-center items-center h-64">
                <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    if (events.length === 0) {
        return (
            <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700">
                <CalendarIcon className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <h3 className="text-lg font-medium text-gray-900 dark:text-white">Нет запланированных уборок</h3>
                <p className="text-gray-500">На этот месяц уборок не найдено.</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold capitalize text-gray-900 dark:text-white">{monthName}</h2>
                <div className="flex gap-2">
                    <button
                        onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1))}
                        className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                    >
                        ←
                    </button>
                    <button
                        onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1))}
                        className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                    >
                        →
                    </button>
                </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: daysInMonth(currentMonth) }, (_, i) => i + 1).map(day => {
                    const dayEvents = getDayEvents(day);
                    if (dayEvents.length === 0) return null;

                    const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
                    const isToday = new Date().toDateString() === date.toDateString();
                    const dayName = date.toLocaleString('ru-RU', { weekday: 'short' });

                    return (
                        <div key={day} className={`bg-white dark:bg-gray-800 p-5 rounded-2xl border ${isToday ? 'border-blue-500 ring-1 ring-blue-500' : 'border-gray-200 dark:border-gray-700'} shadow-sm`}>
                            <div className="flex items-center gap-2 mb-4 pb-3 border-b border-gray-100 dark:border-gray-700">
                                <span className={`text-2xl font-bold ${isToday ? 'text-blue-600' : 'text-gray-900 dark:text-white'}`}>{day}</span>
                                <span className="text-sm text-gray-500 uppercase font-medium">{dayName}</span>
                            </div>

                            <div className="space-y-3">
                                {dayEvents.map(event => (
                                    <div key={event.id} className="relative pl-4 py-1">
                                        <div className="absolute left-0 top-2 w-1.5 h-1.5 rounded-full bg-blue-500"></div>
                                        <div className="text-sm font-semibold text-gray-900 dark:text-white mb-0.5">
                                            {event.object_name}
                                        </div>
                                        <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 mb-1">
                                            <Clock size={12} />
                                            {new Date(event.start_time).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                                            {' - '}
                                            {new Date(event.end_time).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                                        </div>
                                        <div className="flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 px-2 py-1 rounded-md w-fit">
                                            <span>Клинер: {event.worker_name}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

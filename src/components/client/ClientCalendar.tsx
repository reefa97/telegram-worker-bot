import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Calendar as CalendarIcon, Clock, ChevronLeft, ChevronRight, User, CheckCircle2, CalendarDays } from 'lucide-react';

interface ScheduleEvent {
    session_id: string;
    object_id: string;
    object_name: string;
    worker_name: string;
    start_time: string;
    end_time: string | null;
    duration_minutes: number | null;
}

interface PlannedSchedule {
    object_id: string;
    object_name: string;
    schedule_days: number[];
    time_start: string;
    time_end: string;
}

interface UnifiedEvent {
    id: string;
    object_id: string;
    object_name: string;
    type: 'completed' | 'planned';
    // For completed
    worker_name?: string;
    start_time?: string;
    end_time?: string | null;
    duration_minutes?: number | null;
    // For planned
    planned_start?: string;
    planned_end?: string;
    date: Date; // For sorting
}

export default function ClientCalendar() {
    const { adminUser } = useAuth();
    const [events, setEvents] = useState<ScheduleEvent[]>([]);
    const [plannedSchedules, setPlannedSchedules] = useState<PlannedSchedule[]>([]);
    const [loading, setLoading] = useState(true);
    const [currentMonth, setCurrentMonth] = useState(new Date());

    useEffect(() => {
        if (adminUser?.id) loadSchedule();
    }, [currentMonth, adminUser]);

    const loadSchedule = async () => {
        if (!adminUser?.id) return;
        setLoading(true);

        try {
            const startOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
            const endOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0, 23, 59, 59);

            // 1. Fetch completed sessions
            const { data: sessionData, error: sessionError } = await supabase.rpc('get_client_schedule', {
                p_client_id: adminUser.id,
                p_from: startOfMonth.toISOString(),
                p_to: endOfMonth.toISOString()
            });

            if (sessionError) throw sessionError;
            setEvents(sessionData || []);

            // 2. Fetch planned schedules from objects
            const { data: objectsData, error: objectsError } = await supabase
                .from('client_objects')
                .select(`
                    object_id,
                    cleaning_objects(name, schedule_days, schedule_time_start, schedule_time_end)
                `)
                .eq('client_id', adminUser.id);

            if (objectsError) throw objectsError;

            if (objectsData) {
                setPlannedSchedules(objectsData.map((o: any) => ({
                    object_id: o.object_id,
                    object_name: o.cleaning_objects?.name || 'Obiekt',
                    schedule_days: o.cleaning_objects?.schedule_days || [],
                    time_start: o.cleaning_objects?.schedule_time_start || '09:00',
                    time_end: o.cleaning_objects?.schedule_time_end || '18:00',
                })));
            }

        } catch (error) {
            console.error('Error loading schedule:', error);
        } finally {
            setLoading(false);
        }
    };

    const daysInMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).getDate();
    const firstDayOfWeek = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1).getDay();
    // Convert Sunday=0 to Monday-based (Mon=0, Sun=6)
    const startOffset = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1;

    // Get merged events for a specific day
    const getDayEvents = (day: number): UnifiedEvent[] => {
        const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
        const jsDayOfWeek = date.getDay(); // 0-6

        // 1. Get completed
        const completed = events.filter(e => {
            const d = new Date(e.start_time);
            return d.getDate() === day && d.getMonth() === currentMonth.getMonth();
        });

        const completedObjectIds = new Set(completed.map(c => c.object_id));

        // 2. Get planned (only for objects that haven't been completed today)
        const planned = plannedSchedules
            .filter(p => p.schedule_days.includes(jsDayOfWeek) && !completedObjectIds.has(p.object_id))
            .map(p => ({
                id: `planned-${p.object_id}-${day}`,
                object_id: p.object_id,
                object_name: p.object_name,
                type: 'planned' as const,
                planned_start: p.time_start,
                planned_end: p.time_end,
                date: new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day, parseInt(p.time_start.split(':')[0] || '9'))
            }));

        const unifiedCompleted = completed.map(c => ({
            id: c.session_id,
            object_id: c.object_id,
            object_name: c.object_name,
            type: 'completed' as const,
            worker_name: c.worker_name,
            start_time: c.start_time,
            end_time: c.end_time,
            duration_minutes: c.duration_minutes,
            date: new Date(c.start_time)
        }));

        // Sort by time
        return [...unifiedCompleted, ...planned].sort((a, b) => a.date.getTime() - b.date.getTime());
    };

    // Get all events for the month (for list view)
    const allMonthEvents: UnifiedEvent[] = [];
    const today = new Date();
    today.setHours(0,0,0,0);

    for (let day = 1; day <= daysInMonth; day++) {
        const dayDate = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
        // We might want to only show future "planned" events in the list, to not clutter it with "missed" past planned events.
        // But let's show all completed, and future planned.
        const dayEvents = getDayEvents(day);
        
        dayEvents.forEach(ev => {
            if (ev.type === 'completed') {
                allMonthEvents.push(ev);
            } else if (ev.type === 'planned' && dayDate >= today) {
                // Only add future/today planned events to the detailed list
                allMonthEvents.push(ev);
            }
        });
    }

    // Sort all month events: past events descending, future events ascending... 
    // Actually, simple descending is better, or let's do ascending for upcoming.
    // Let's sort all by date descending (newest / furthest future first)
    allMonthEvents.sort((a, b) => b.date.getTime() - a.date.getTime());

    const monthName = currentMonth.toLocaleString('pl-PL', { month: 'long', year: 'numeric' });
    const weekDays = ['Pon', 'Wt', 'Śr', 'Czw', 'Pt', 'Sob', 'Ndz'];

    const prevMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1));
    const nextMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1));

    if (loading) {
        return (
            <div className="flex justify-center items-center h-64">
                <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold text-main capitalize">{monthName}</h2>
                    <p className="text-sm text-muted mt-1">Twój harmonogram sprzątań (zakończone i zaplanowane)</p>
                </div>
                <div className="flex gap-1">
                    <button onClick={prevMonth} className="btn-icon">
                        <ChevronLeft size={20} />
                    </button>
                    <button
                        onClick={() => setCurrentMonth(new Date())}
                        className="btn-secondary text-xs px-3"
                    >
                        Dziś
                    </button>
                    <button onClick={nextMonth} className="btn-icon">
                        <ChevronRight size={20} />
                    </button>
                </div>
            </div>

            {/* Calendar Grid */}
            <div className="card overflow-hidden">
                {/* Week day headers */}
                <div className="grid grid-cols-7 border-b border-border">
                    {weekDays.map(day => (
                        <div key={day} className="py-3 text-center text-xs font-bold text-muted uppercase tracking-wider">
                            {day}
                        </div>
                    ))}
                </div>

                {/* Days grid */}
                <div className="grid grid-cols-7">
                    {/* Empty cells for offset */}
                    {Array.from({ length: startOffset }, (_, i) => (
                        <div key={`empty-${i}`} className="min-h-[80px] md:min-h-[100px] border-b border-r border-border bg-subtle/30" />
                    ))}

                    {/* Day cells */}
                    {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => {
                        const dayEvents = getDayEvents(day);
                        const isToday = today.getDate() === day && today.getMonth() === currentMonth.getMonth() && today.getFullYear() === currentMonth.getFullYear();

                        return (
                            <div
                                key={day}
                                className={`min-h-[80px] md:min-h-[100px] border-b border-r border-border p-1.5 transition-colors ${
                                    isToday ? 'bg-primary/5' : 'hover:bg-subtle/50'
                                }`}
                            >
                                <div className={`text-xs font-bold mb-1 ${
                                    isToday ? 'w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center' : 'text-muted pl-1'
                                }`}>
                                    {day}
                                </div>
                                <div className="space-y-0.5">
                                    {dayEvents.slice(0, 3).map(event => (
                                        <div
                                            key={event.id}
                                            className={`text-[10px] md:text-xs p-1 rounded truncate cursor-default ${
                                                event.type === 'completed' 
                                                    ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-300' 
                                                    : 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300'
                                            }`}
                                            title={event.type === 'completed' ? `${event.object_name} (Zakończone)` : `${event.object_name} (Planowane ${event.planned_start})`}
                                        >
                                            <span className="font-medium">{event.object_name}</span>
                                        </div>
                                    ))}
                                    {dayEvents.length > 3 && (
                                        <div className="text-[10px] text-muted pl-1">+{dayEvents.length - 3} więcej</div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Event List for Current Month */}
            {allMonthEvents.length > 0 ? (
                <div className="space-y-3">
                    <h3 className="font-bold text-main">Lista wizyt</h3>
                    <div className="space-y-2">
                        {allMonthEvents.map(event => (
                            <div key={event.id} className="card p-4 flex items-center gap-4">
                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                                    event.type === 'completed'
                                        ? 'bg-emerald-100 dark:bg-emerald-900/30'
                                        : 'bg-blue-100 dark:bg-blue-900/30'
                                }`}>
                                    {event.type === 'completed' 
                                        ? <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                                        : <CalendarDays className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                                    }
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap mb-1">
                                        <span className="font-semibold text-main">{event.object_name}</span>
                                        {event.type === 'completed' ? (
                                            <span className="badge-success text-[10px]">Zakończone</span>
                                        ) : (
                                            <span className="badge-info text-[10px]">Zaplanowane</span>
                                        )}
                                    </div>
                                    
                                    {event.type === 'completed' ? (
                                        <div className="flex items-center gap-3 text-xs text-muted flex-wrap">
                                            <span className="flex items-center gap-1">
                                                <CalendarIcon size={11} />
                                                {new Date(event.start_time!).toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit' })}
                                            </span>
                                            <span className="flex items-center gap-1">
                                                <Clock size={11} />
                                                {new Date(event.start_time!).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}
                                                {event.end_time && ` — ${new Date(event.end_time).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}`}
                                            </span>
                                            {event.worker_name && (
                                                <span className="flex items-center gap-1">
                                                    <User size={11} />{event.worker_name}
                                                </span>
                                            )}
                                            {event.duration_minutes && (
                                                <span>{Math.floor(event.duration_minutes / 60)}h {event.duration_minutes % 60}min</span>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-3 text-xs text-muted">
                                            <span className="flex items-center gap-1">
                                                <CalendarIcon size={11} />
                                                {event.date.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit' })}
                                            </span>
                                            <span className="flex items-center gap-1">
                                                <Clock size={11} />
                                                {event.planned_start} - {event.planned_end}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            ) : (
                <div className="card flex flex-col items-center justify-center py-16 text-center">
                    <CalendarIcon className="w-16 h-16 text-muted opacity-20 mb-4" />
                    <h3 className="text-lg font-medium text-main mb-2">Brak sprzątań w tym miesiącu</h3>
                    <p className="text-muted max-w-sm">
                        W wybranym miesiącu nie ma ani zaplanowanych, ani zakończonych sprzątań.
                    </p>
                </div>
            )}
        </div>
    );
}

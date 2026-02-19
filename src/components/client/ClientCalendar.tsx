import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Calendar as CalendarIcon, Clock, ChevronLeft, ChevronRight, User } from 'lucide-react';

interface ScheduleEvent {
    session_id: string;
    object_id: string;
    object_name: string;
    worker_name: string;
    start_time: string;
    end_time: string | null;
    duration_minutes: number | null;
}

export default function ClientCalendar() {
    const { adminUser } = useAuth();
    const [events, setEvents] = useState<ScheduleEvent[]>([]);
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

            const { data, error } = await supabase.rpc('get_client_schedule', {
                p_client_id: adminUser.id,
                p_from: startOfMonth.toISOString(),
                p_to: endOfMonth.toISOString()
            });

            if (error) throw error;
            setEvents(data || []);
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

    const getDayEvents = (day: number) => {
        return events.filter(e => {
            const date = new Date(e.start_time);
            return date.getDate() === day && date.getMonth() === currentMonth.getMonth();
        });
    };

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
                    <p className="text-sm text-muted mt-1">Historia sprzątań w Twoich obiektach</p>
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
                        const today = new Date();
                        const isToday = today.getDate() === day && today.getMonth() === currentMonth.getMonth() && today.getFullYear() === currentMonth.getFullYear();

                        return (
                            <div
                                key={day}
                                className={`min-h-[80px] md:min-h-[100px] border-b border-r border-border p-1.5 transition-colors ${isToday ? 'bg-primary/5' : 'hover:bg-subtle/50'
                                    }`}
                            >
                                <div className={`text-xs font-bold mb-1 ${isToday ? 'w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center' : 'text-muted pl-1'
                                    }`}>
                                    {day}
                                </div>
                                <div className="space-y-0.5">
                                    {dayEvents.slice(0, 3).map(event => (
                                        <div
                                            key={event.session_id}
                                            className="text-[10px] md:text-xs p-1 rounded bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-300 truncate cursor-default"
                                            title={`${event.object_name} — ${event.worker_name} (${new Date(event.start_time).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })})`}
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
            {events.length > 0 ? (
                <div className="space-y-3">
                    <h3 className="font-bold text-main">Szczegóły sprzątań</h3>
                    <div className="space-y-2">
                        {events.map(event => (
                            <div key={event.session_id} className="card p-4 flex items-center gap-4">
                                <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center flex-shrink-0">
                                    <CalendarIcon className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="font-semibold text-main">{event.object_name}</span>
                                        <span className="text-xs text-muted">•</span>
                                        <span className="text-sm text-muted flex items-center gap-1">
                                            <User size={12} />{event.worker_name}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-3 mt-1 text-xs text-muted">
                                        <span className="flex items-center gap-1">
                                            <CalendarIcon size={11} />
                                            {new Date(event.start_time).toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit' })}
                                        </span>
                                        <span className="flex items-center gap-1">
                                            <Clock size={11} />
                                            {new Date(event.start_time).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}
                                            {event.end_time && ` — ${new Date(event.end_time).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}`}
                                        </span>
                                        {event.duration_minutes && (
                                            <span>{Math.floor(event.duration_minutes / 60)}h {event.duration_minutes % 60}min</span>
                                        )}
                                    </div>
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
                        W wybranym miesiącu nie odbyły się żadne sprzątania.
                    </p>
                </div>
            )}
        </div>
    );
}

import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import {
    Calendar as CalendarIcon, Clock, ChevronLeft, ChevronRight,
    User, CheckCircle2, CalendarDays, X, Building2, Camera
} from 'lucide-react';
import ClientPhotoGalleryModal from './ClientPhotoGalleryModal';

interface ScheduleEvent {
    session_id: string;
    object_id: string;
    object_name: string;
    worker_name: string;
    start_time: string;
    end_time: string | null;
    duration_minutes: number | null;
    photo_count: number;
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
    worker_name?: string;
    start_time?: string;
    end_time?: string | null;
    duration_minutes?: number | null;
    planned_start?: string;
    planned_end?: string;
    date: Date;
    session_id?: string;
    photo_count?: number;
}

export default function ClientCalendar() {
    const { adminUser } = useAuth();
    const [events, setEvents] = useState<ScheduleEvent[]>([]);
    const [plannedSchedules, setPlannedSchedules] = useState<PlannedSchedule[]>([]);
    const [loading, setLoading] = useState(true);
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [selectedDay, setSelectedDay] = useState<number | null>(null);
    const [gallerySessionId, setGallerySessionId] = useState<string | null>(null);

    useEffect(() => {
        if (adminUser?.id) loadSchedule();
    }, [currentMonth, adminUser]);

    const loadSchedule = async () => {
        if (!adminUser?.id) return;
        setLoading(true);
        try {
            const startOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
            const endOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0, 23, 59, 59);

            const [sessionsRes, plannedRes] = await Promise.all([
                supabase.rpc('get_client_schedule', {
                    p_client_id: adminUser.id,
                    p_from: startOfMonth.toISOString(),
                    p_to: endOfMonth.toISOString()
                }),
                supabase.rpc('get_client_planned_schedules', {
                    p_client_id: adminUser.id
                })
            ]);

            if (sessionsRes.error) throw sessionsRes.error;
            setEvents(sessionsRes.data || []);

            if (plannedRes.data) {
                setPlannedSchedules(plannedRes.data.map((o: any) => ({
                    object_id: o.object_id,
                    object_name: o.object_name,
                    schedule_days: o.schedule_days || [],
                    time_start: o.time_start || '09:00',
                    time_end: o.time_end || '18:00',
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
    const startOffset = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1;

    const getDayEvents = (day: number): UnifiedEvent[] => {
        const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
        const jsDow = date.getDay();
        const dbDow = jsDow === 0 ? 7 : jsDow;

        const completed = events.filter(e => {
            const d = new Date(e.start_time);
            return d.getDate() === day && d.getMonth() === currentMonth.getMonth();
        });

        const completedObjectIds = new Set(completed.map(c => c.object_id));

        const planned = plannedSchedules
            .filter(p => p.schedule_days.includes(dbDow) && !completedObjectIds.has(p.object_id))
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
            date: new Date(c.start_time),
            session_id: c.session_id,
            photo_count: c.photo_count ?? 0,
        }));

        return [...unifiedCompleted, ...planned].sort((a, b) => a.date.getTime() - b.date.getTime());
    };

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const monthName = currentMonth.toLocaleString('pl-PL', { month: 'long', year: 'numeric' });
    const weekDays = ['Pon', 'Wt', 'Śr', 'Czw', 'Pt', 'Sob', 'Ndz'];

    const prevMonth = () => { setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1)); setSelectedDay(null); };
    const nextMonth = () => { setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1)); setSelectedDay(null); };
    const goToday = () => { setCurrentMonth(new Date()); setSelectedDay(new Date().getDate()); };

    const selectedEvents = selectedDay ? getDayEvents(selectedDay) : [];

    const formatTime = (iso: string) => new Date(iso).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
    const formatDuration = (min: number) => {
        const h = Math.floor(min / 60);
        const m = min % 60;
        return h > 0 ? `${h}h ${m}min` : `${m}min`;
    };

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
                    <p className="text-sm text-muted mt-1">Twój harmonogram sprzątań</p>
                </div>
                <div className="flex gap-1">
                    <button onClick={prevMonth} className="p-2 rounded-lg hover:bg-subtle text-muted transition-colors">
                        <ChevronLeft size={20} />
                    </button>
                    <button onClick={goToday} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-colors">
                        Dziś
                    </button>
                    <button onClick={nextMonth} className="p-2 rounded-lg hover:bg-subtle text-muted transition-colors">
                        <ChevronRight size={20} />
                    </button>
                </div>
            </div>

            {/* Legend */}
            <div className="flex items-center gap-4 text-xs text-muted">
                <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                    Zakończone
                </span>
                <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span>
                    Zaplanowane
                </span>
            </div>

            {/* Calendar Grid */}
            <div className="bg-card rounded-2xl border border-border overflow-hidden shadow-sm">
                {/* Week day headers */}
                <div className="grid grid-cols-7 border-b border-border bg-subtle/40">
                    {weekDays.map(day => (
                        <div key={day} className="py-2.5 text-center text-[11px] font-bold text-muted uppercase tracking-wider">
                            {day}
                        </div>
                    ))}
                </div>

                {/* Days grid */}
                <div className="grid grid-cols-7">
                    {/* Empty offset cells */}
                    {Array.from({ length: startOffset }, (_, i) => (
                        <div key={`e-${i}`} className="min-h-[72px] md:min-h-[90px] border-b border-r border-border/50 bg-subtle/20" />
                    ))}

                    {/* Day cells */}
                    {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => {
                        const dayEvts = getDayEvents(day);
                        const hasCompleted = dayEvts.some(e => e.type === 'completed');
                        const hasPlanned = dayEvts.some(e => e.type === 'planned');
                        const isToday = today.getDate() === day && today.getMonth() === currentMonth.getMonth() && today.getFullYear() === currentMonth.getFullYear();
                        const isSelected = selectedDay === day;
                        const isPast = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day) < today;

                        return (
                            <div
                                key={day}
                                onClick={() => setSelectedDay(isSelected ? null : day)}
                                className={`min-h-[72px] md:min-h-[90px] border-b border-r border-border/50 p-1.5 cursor-pointer transition-all relative
                                    ${isSelected ? 'bg-primary/10 ring-2 ring-primary ring-inset' : ''}
                                    ${isToday && !isSelected ? 'bg-primary/5' : ''}
                                    ${!isToday && !isSelected ? 'hover:bg-subtle/60' : ''}
                                    ${isPast && !isToday ? 'opacity-80' : ''}
                                `}
                            >
                                <div className={`text-xs font-bold mb-1.5 w-6 h-6 flex items-center justify-center rounded-full
                                    ${isToday ? 'bg-primary text-white' : 'text-muted'}
                                `}>
                                    {day}
                                </div>

                                {/* Dots indicator */}
                                <div className="flex gap-1 items-center flex-wrap">
                                    {hasCompleted && (
                                        <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                                    )}
                                    {hasPlanned && (
                                        <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                                    )}
                                </div>

                                {/* Mini event labels (desktop only) */}
                                <div className="hidden md:block mt-1 space-y-0.5">
                                    {dayEvts.slice(0, 2).map(ev => (
                                        <div
                                            key={ev.id}
                                            className={`text-[10px] px-1.5 py-0.5 rounded truncate font-medium ${ev.type === 'completed'
                                                    ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300'
                                                    : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                                                }`}
                                        >
                                            {ev.object_name}
                                        </div>
                                    ))}
                                    {dayEvts.length > 2 && (
                                        <div className="text-[10px] text-muted pl-1">+{dayEvts.length - 2}</div>
                                    )}
                                </div>

                                {/* Mobile: event count badge */}
                                {dayEvts.length > 0 && (
                                    <div className="md:hidden absolute bottom-1.5 right-1.5 text-[10px] font-bold text-muted">
                                        {dayEvts.length}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Selected Day Detail Panel */}
            {selectedDay && (
                <div className="bg-card rounded-2xl border border-border p-5 shadow-sm animate-fadeIn">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="font-bold text-main flex items-center gap-2">
                            <CalendarIcon className="w-4 h-4 text-muted" />
                            {selectedDay} {currentMonth.toLocaleString('pl-PL', { month: 'long' })}
                        </h3>
                        <button onClick={() => setSelectedDay(null)} className="text-muted hover:text-main p-1">
                            <X className="w-4 h-4" />
                        </button>
                    </div>

                    {selectedEvents.length === 0 ? (
                        <p className="text-sm text-muted py-4 text-center">Brak wizyt w tym dniu</p>
                    ) : (
                        <div className="space-y-3">
                            {selectedEvents.map(event => (
                                <div
                                    key={event.id}
                                    className={`rounded-xl p-4 border-l-4 ${event.type === 'completed'
                                            ? 'bg-emerald-50 dark:bg-emerald-900/10 border-l-emerald-500'
                                            : 'bg-primary/5 border-l-blue-500'
                                        }`}
                                >
                                    <div className="flex items-center gap-2 mb-2">
                                        {event.type === 'completed'
                                            ? <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                                            : <CalendarDays className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                                        }
                                        <span className="font-semibold text-main text-sm">{event.object_name}</span>
                                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${event.type === 'completed'
                                                ? 'bg-emerald-200 dark:bg-emerald-800/40 text-emerald-800 dark:text-emerald-300'
                                                : 'bg-blue-200 dark:bg-blue-800/40 text-blue-800 dark:text-blue-300'
                                            }`}>
                                            {event.type === 'completed' ? 'Zakończone' : 'Zaplanowane'}
                                        </span>
                                    </div>

                                    {event.type === 'completed' ? (
                                        <>
                                            <div className="grid grid-cols-2 gap-2 text-xs text-muted mt-2">
                                                <div className="flex items-center gap-1.5">
                                                    <Clock className="w-3.5 h-3.5 shrink-0" />
                                                    {formatTime(event.start_time!)}
                                                    {event.end_time && ` — ${formatTime(event.end_time)}`}
                                                </div>
                                                {event.worker_name && (
                                                    <div className="flex items-center gap-1.5">
                                                        <User className="w-3.5 h-3.5 shrink-0" />
                                                        {event.worker_name}
                                                    </div>
                                                )}
                                                {event.duration_minutes && (
                                                    <div className="flex items-center gap-1.5">
                                                        <Building2 className="w-3.5 h-3.5 shrink-0" />
                                                        {formatDuration(event.duration_minutes)}
                                                    </div>
                                                )}
                                            </div>
                                            {(event.photo_count ?? 0) > 0 && event.session_id && (
                                                <button
                                                    onClick={() => setGallerySessionId(event.session_id!)}
                                                    className="mt-3 inline-flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-colors"
                                                >
                                                    <Camera className="w-3.5 h-3.5" />
                                                    Zobacz zdjęcia ({event.photo_count})
                                                </button>
                                            )}
                                        </>
                                    ) : (
                                        <div className="text-xs text-muted flex items-center gap-1.5 mt-2">
                                            <Clock className="w-3.5 h-3.5" />
                                            {event.planned_start} — {event.planned_end}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* No events state */}
            {!selectedDay && events.length === 0 && plannedSchedules.length === 0 && (
                <div className="bg-card rounded-2xl border border-border flex flex-col items-center justify-center py-16 text-center">
                    <CalendarIcon className="w-16 h-16 text-muted opacity-20 mb-4" />
                    <h3 className="text-lg font-medium text-main mb-2">Brak sprzątań w tym miesiącu</h3>
                    <p className="text-muted max-w-sm text-sm">
                        W wybranym miesiącu nie ma ani zaplanowanych, ani zakończonych sprzątań.
                    </p>
                </div>
            )}

            {gallerySessionId && adminUser?.id && (
                <ClientPhotoGalleryModal
                    sessionId={gallerySessionId}
                    clientId={adminUser.id}
                    onClose={() => setGallerySessionId(null)}
                />
            )}
        </div>
    );
}

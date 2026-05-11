import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { ClipboardList, Building2, Calendar as CalendarIcon } from 'lucide-react';

interface ClientTask {
    task_id: string;
    object_id: string;
    object_name: string;
    title: string;
    description: string;
    scheduled_days: number[] | null;
    scheduled_dates: string[] | null;
    is_recurring: boolean;
    frequency: string;
}

interface ObjectSchedule {
    object_id: string;
    object_name: string;
    schedule_days: number[];
}

const WEEK_DAYS = [
    { id: 1, label: 'Poniedziałek', short: 'Pn' },
    { id: 2, label: 'Wtorek', short: 'Wt' },
    { id: 3, label: 'Środa', short: 'Śr' },
    { id: 4, label: 'Czwartek', short: 'Cz' },
    { id: 5, label: 'Piątek', short: 'Pt' },
    { id: 6, label: 'Sobota', short: 'So' },
    { id: 7, label: 'Niedziela', short: 'Nd' },
];

export default function ClientTasks() {
    const { adminUser } = useAuth();
    const [tasks, setTasks] = useState<ClientTask[]>([]);
    const [schedules, setSchedules] = useState<ObjectSchedule[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedObject, setSelectedObject] = useState<string>('all');

    useEffect(() => {
        if (adminUser?.id) loadTasks();
    }, [adminUser]);

    const loadTasks = async () => {
        if (!adminUser?.id) return;
        setLoading(true);
        try {
            const [tasksRes, schedRes] = await Promise.all([
                supabase.rpc('get_client_object_tasks', { p_client_id: adminUser.id }),
                supabase.rpc('get_client_planned_schedules', { p_client_id: adminUser.id }),
            ]);
            if (tasksRes.error) throw tasksRes.error;
            setTasks(tasksRes.data || []);
            setSchedules((schedRes.data || []).map((s: any) => ({
                object_id: s.object_id,
                object_name: s.object_name,
                schedule_days: s.schedule_days || [],
            })));
        } catch (e) {
            console.error('Error loading client tasks:', e);
        } finally {
            setLoading(false);
        }
    };

    const objects = Array.from(new Set(tasks.map(t => t.object_id)))
        .map(id => {
            const t = tasks.find(x => x.object_id === id)!;
            return { id, name: t.object_name };
        });

    const filteredTasks = selectedObject === 'all'
        ? tasks
        : tasks.filter(t => t.object_id === selectedObject);

    // Working days = union of schedule_days for selected object(s)
    const workingDays = new Set<number>();
    const relevantSchedules = selectedObject === 'all'
        ? schedules
        : schedules.filter(s => s.object_id === selectedObject);
    relevantSchedules.forEach(s => s.schedule_days.forEach(d => workingDays.add(d)));

    const tasksByDay = (dayId: number) =>
        filteredTasks.filter(t => t.scheduled_days?.includes(dayId));

    const oneTimeTasks = filteredTasks.filter(t => !t.is_recurring || (t.scheduled_dates && t.scheduled_dates.length > 0));
    const recurringWithoutDays = filteredTasks.filter(t =>
        t.is_recurring && (!t.scheduled_days || t.scheduled_days.length === 0) && (!t.scheduled_dates || t.scheduled_dates.length === 0)
    );

    if (loading) {
        return (
            <div className="flex justify-center items-center h-64">
                <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    if (tasks.length === 0) {
        return (
            <div className="bg-card rounded-2xl border border-border flex flex-col items-center justify-center py-16 text-center">
                <ClipboardList className="w-16 h-16 text-muted opacity-20 mb-4" />
                <h3 className="text-lg font-medium text-main mb-2">Brak zadań</h3>
                <p className="text-muted max-w-sm text-sm">
                    Nie ma jeszcze ustalonych prac dla Twoich obiektów.
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h2 className="text-2xl font-bold text-main">Zakres prac</h2>
                <p className="text-sm text-muted mt-1">Co wykonujemy w Twoich obiektach każdego dnia tygodnia</p>
            </div>

            {/* Object filter */}
            {objects.length > 1 && (
                <div className="flex gap-2 flex-wrap">
                    <button
                        onClick={() => setSelectedObject('all')}
                        className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors flex items-center gap-1.5 ${
                            selectedObject === 'all'
                                ? 'bg-primary text-white'
                                : 'bg-subtle text-muted hover:text-main'
                        }`}
                    >
                        <Building2 size={14} />
                        Wszystkie obiekty
                    </button>
                    {objects.map(o => (
                        <button
                            key={o.id}
                            onClick={() => setSelectedObject(o.id)}
                            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                                selectedObject === o.id
                                    ? 'bg-primary text-white'
                                    : 'bg-subtle text-muted hover:text-main'
                            }`}
                        >
                            {o.name}
                        </button>
                    ))}
                </div>
            )}

            {/* Days grid — only working days */}
            {workingDays.size === 0 && (
                <div className="bg-card rounded-2xl border border-border p-5 text-center text-sm text-muted">
                    Brak ustalonych dni pracy dla wybranego obiektu.
                </div>
            )}
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {WEEK_DAYS.filter(day => workingDays.has(day.id)).map(day => {
                    const dayTasks = tasksByDay(day.id);
                    return (
                        <div
                            key={day.id}
                            className={`bg-card rounded-2xl border border-border p-4 ${dayTasks.length === 0 ? 'opacity-60' : ''}`}
                        >
                            <div className="flex items-center justify-between mb-3 pb-3 border-b border-border">
                                <div className="flex items-center gap-2">
                                    <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">
                                        {day.short}
                                    </div>
                                    <h3 className="font-semibold text-main">{day.label}</h3>
                                </div>
                                <span className="text-xs text-muted">{dayTasks.length}</span>
                            </div>

                            {dayTasks.length === 0 ? (
                                <p className="text-xs text-muted py-2 italic">Brak zaplanowanych prac</p>
                            ) : (
                                <ul className="space-y-2">
                                    {dayTasks.map(t => (
                                        <li key={t.task_id} className="text-sm">
                                            <div className="flex items-start gap-2">
                                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
                                                <div className="flex-1 min-w-0">
                                                    <div className="text-main font-medium leading-snug">{t.title}</div>
                                                    {t.description && (
                                                        <div className="text-xs text-muted mt-0.5">{t.description}</div>
                                                    )}
                                                    {selectedObject === 'all' && objects.length > 1 && (
                                                        <div className="text-[10px] text-muted mt-0.5 flex items-center gap-1">
                                                            <Building2 size={10} />
                                                            {t.object_name}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Recurring without specific days */}
            {recurringWithoutDays.length > 0 && (
                <div className="bg-card rounded-2xl border border-border p-5">
                    <h3 className="font-semibold text-main mb-3 flex items-center gap-2">
                        <CalendarIcon size={16} className="text-muted" />
                        Prace cykliczne (bez przypisanego dnia)
                    </h3>
                    <ul className="space-y-2">
                        {recurringWithoutDays.map(t => (
                            <li key={t.task_id} className="text-sm flex items-start gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5 shrink-0" />
                                <div className="flex-1">
                                    <div className="text-main font-medium">{t.title}</div>
                                    {t.description && <div className="text-xs text-muted mt-0.5">{t.description}</div>}
                                    {selectedObject === 'all' && objects.length > 1 && (
                                        <div className="text-[10px] text-muted mt-0.5">{t.object_name}</div>
                                    )}
                                </div>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {/* One-time tasks with specific dates */}
            {oneTimeTasks.length > 0 && (
                <div className="bg-card rounded-2xl border border-border p-5">
                    <h3 className="font-semibold text-main mb-3 flex items-center gap-2">
                        <CalendarIcon size={16} className="text-muted" />
                        Prace jednorazowe
                    </h3>
                    <ul className="space-y-2">
                        {oneTimeTasks.map(t => (
                            <li key={t.task_id} className="text-sm flex items-start gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mt-1.5 shrink-0" />
                                <div className="flex-1">
                                    <div className="text-main font-medium">{t.title}</div>
                                    {t.description && <div className="text-xs text-muted mt-0.5">{t.description}</div>}
                                    {t.scheduled_dates && t.scheduled_dates.length > 0 && (
                                        <div className="text-xs text-muted mt-0.5">
                                            Daty: {t.scheduled_dates.join(', ')}
                                        </div>
                                    )}
                                    {selectedObject === 'all' && objects.length > 1 && (
                                        <div className="text-[10px] text-muted mt-0.5">{t.object_name}</div>
                                    )}
                                </div>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
}

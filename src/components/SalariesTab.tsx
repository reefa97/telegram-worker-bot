import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { DollarSign, ChevronDown, ChevronRight, Loader2 } from 'lucide-react';

interface ObjectBreakdown {
    objectId: string;
    objectName: string;
    salaryType: 'hourly' | 'monthly_fixed';
    hourlyRate: number;
    monthlyRate: number;
    expectedCleanings: number;
    sessions: number;
    minutes: number;
    salary: number;
}

interface WorkerSalary {
    workerId: string;
    firstName: string;
    lastName: string;
    totalSessions: number;
    totalMinutes: number;
    totalSalary: number;
    objects: ObjectBreakdown[];
}

export default function SalariesTab() {
    const today = new Date();
    const [year, setYear] = useState(today.getFullYear());
    const [month, setMonth] = useState(today.getMonth() + 1);
    const [loading, setLoading] = useState(false);
    const [results, setResults] = useState<WorkerSalary[] | null>(null);
    const [expanded, setExpanded] = useState<Set<string>>(new Set());

    const monthNames = [
        'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
        'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
    ];

    const calculate = async () => {
        setLoading(true);
        setResults(null);
        setExpanded(new Set());

        const startDate = new Date(year, month - 1, 1).toISOString();
        const endDate = new Date(year, month, 1).toISOString();

        const { data, error } = await supabase
            .from('work_sessions')
            .select(`
                id,
                duration_minutes,
                worker_id,
                start_time,
                workers!inner(id, first_name, last_name),
                cleaning_objects(id, name, salary_type, hourly_rate, monthly_rate, expected_cleanings_per_month)
            `)
            .gte('start_time', startDate)
            .lt('start_time', endDate)
            .not('end_time', 'is', null)
            .not('duration_minutes', 'is', null)
            .gt('duration_minutes', 0);

        if (error) {
            console.error(error);
            alert('Ошибка при загрузке данных: ' + error.message);
            setLoading(false);
            return;
        }

        const workerMap = new Map<string, WorkerSalary>();

        for (const session of (data || [])) {
            const worker = (session as any).workers;
            const obj = (session as any).cleaning_objects;
            if (!worker) continue;

            const wId = worker.id;
            if (!workerMap.has(wId)) {
                workerMap.set(wId, {
                    workerId: wId,
                    firstName: worker.first_name,
                    lastName: worker.last_name,
                    totalSessions: 0,
                    totalMinutes: 0,
                    totalSalary: 0,
                    objects: [],
                });
            }

            const ws = workerMap.get(wId)!;
            const minutes = session.duration_minutes || 0;
            ws.totalSessions += 1;
            ws.totalMinutes += minutes;

            if (!obj) continue;

            const objId = obj.id;
            let objEntry = ws.objects.find(o => o.objectId === objId);
            if (!objEntry) {
                objEntry = {
                    objectId: objId,
                    objectName: obj.name || 'Неизвестный объект',
                    salaryType: obj.salary_type || 'hourly',
                    hourlyRate: obj.hourly_rate || 0,
                    monthlyRate: obj.monthly_rate || 0,
                    expectedCleanings: obj.expected_cleanings_per_month || 20,
                    sessions: 0,
                    minutes: 0,
                    salary: 0,
                };
                ws.objects.push(objEntry);
            }

            objEntry.sessions += 1;
            objEntry.minutes += minutes;
        }

        for (const ws of workerMap.values()) {
            ws.totalSalary = 0;
            for (const obj of ws.objects) {
                if (obj.salaryType === 'hourly') {
                    obj.salary = (obj.minutes / 60) * obj.hourlyRate;
                } else {
                    const perSession = obj.expectedCleanings > 0
                        ? obj.monthlyRate / obj.expectedCleanings
                        : 0;
                    obj.salary = perSession * obj.sessions;
                }
                ws.totalSalary += obj.salary;
            }
        }

        const sorted = Array.from(workerMap.values()).sort((a, b) =>
            a.lastName.localeCompare(b.lastName)
        );

        setResults(sorted);
        setLoading(false);
    };

    const toggleExpand = (workerId: string) => {
        setExpanded(prev => {
            const next = new Set(prev);
            if (next.has(workerId)) next.delete(workerId);
            else next.add(workerId);
            return next;
        });
    };

    const formatMoney = (n: number) =>
        n.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' zł';

    const formatHours = (minutes: number) => {
        const h = Math.floor(minutes / 60);
        const m = minutes % 60;
        return m > 0 ? `${h}ч ${m}м` : `${h}ч`;
    };

    const totalSalary = results?.reduce((sum, w) => sum + w.totalSalary, 0) ?? 0;

    return (
        <div className="space-y-4">
            {/* Controls */}
            <div className="card p-4 flex flex-wrap items-end gap-3">
                <div>
                    <label className="block text-xs text-muted mb-1">Месяц</label>
                    <select
                        value={month}
                        onChange={e => setMonth(Number(e.target.value))}
                        className="input h-9 pr-8"
                    >
                        {monthNames.map((name, i) => (
                            <option key={i + 1} value={i + 1}>{name}</option>
                        ))}
                    </select>
                </div>
                <div>
                    <label className="block text-xs text-muted mb-1">Год</label>
                    <select
                        value={year}
                        onChange={e => setYear(Number(e.target.value))}
                        className="input h-9 pr-8"
                    >
                        {[2024, 2025, 2026].map(y => (
                            <option key={y} value={y}>{y}</option>
                        ))}
                    </select>
                </div>
                <button
                    onClick={calculate}
                    disabled={loading}
                    className="btn-primary h-9 flex items-center gap-2"
                >
                    {loading
                        ? <><Loader2 className="w-4 h-4 animate-spin" /> Расчёт...</>
                        : <><DollarSign className="w-4 h-4" /> Рассчитать</>
                    }
                </button>

                {results && (
                    <div className="ml-auto text-right">
                        <div className="text-xs text-muted">Итого зарплат</div>
                        <div className="text-xl font-bold text-main">{formatMoney(totalSalary)}</div>
                    </div>
                )}
            </div>

            {/* Results — mobile cards */}
            {results !== null && (
                results.length === 0 ? (
                    <div className="card p-10 text-center text-muted">
                        Нет завершённых смен за выбранный период
                    </div>
                ) : (
                    <>
                        {/* Mobile: card list */}
                        <div className="flex flex-col gap-3 sm:hidden">
                            {results.map(worker => (
                                <div key={worker.workerId} className="card overflow-hidden">
                                    <button
                                        className="w-full flex items-center justify-between p-4 text-left"
                                        onClick={() => toggleExpand(worker.workerId)}
                                    >
                                        <div>
                                            <div className="font-semibold text-main">
                                                {worker.firstName} {worker.lastName}
                                            </div>
                                            <div className="text-xs text-muted mt-0.5">
                                                {worker.totalSessions} смен · {formatHours(worker.totalMinutes)}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-lg font-bold text-primary">
                                                {formatMoney(worker.totalSalary)}
                                            </span>
                                            {expanded.has(worker.workerId)
                                                ? <ChevronDown size={16} className="text-muted shrink-0" />
                                                : <ChevronRight size={16} className="text-muted shrink-0" />
                                            }
                                        </div>
                                    </button>

                                    {expanded.has(worker.workerId) && (
                                        <div className="border-t border-border divide-y divide-border">
                                            {worker.objects.map(obj => (
                                                <div key={obj.objectId} className="px-4 py-3 bg-subtle/40">
                                                    <div className="flex justify-between items-start gap-2">
                                                        <div className="min-w-0">
                                                            <div className="text-sm font-medium text-main truncate">
                                                                {obj.objectName}
                                                            </div>
                                                            <div className="text-xs text-muted mt-0.5">
                                                                {obj.salaryType === 'hourly'
                                                                    ? `${obj.hourlyRate} zł/ч · ${obj.sessions} смен · ${formatHours(obj.minutes)}`
                                                                    : `${obj.monthlyRate} zł/мес ÷ ${obj.expectedCleanings} · ${obj.sessions} смен`
                                                                }
                                                            </div>
                                                        </div>
                                                        <span className="text-sm font-semibold text-main shrink-0">
                                                            {formatMoney(obj.salary)}
                                                        </span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ))}

                            {/* Mobile total */}
                            <div className="card p-4 flex justify-between items-center">
                                <span className="font-semibold text-main">Итого</span>
                                <div className="text-right">
                                    <div className="text-xs text-muted">
                                        {results.reduce((s, w) => s + w.totalSessions, 0)} смен · {formatHours(results.reduce((s, w) => s + w.totalMinutes, 0))}
                                    </div>
                                    <div className="text-lg font-bold text-main">{formatMoney(totalSalary)}</div>
                                </div>
                            </div>
                        </div>

                        {/* Desktop: table */}
                        <div className="card overflow-hidden hidden sm:block">
                            <table className="table">
                                <thead>
                                    <tr>
                                        <th className="w-6"></th>
                                        <th>Работник</th>
                                        <th className="text-center">Смены</th>
                                        <th className="text-center">Часы</th>
                                        <th className="text-right">Зарплата</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {results.map(worker => (
                                        <>
                                            <tr
                                                key={worker.workerId}
                                                className="cursor-pointer hover:bg-subtle transition-colors"
                                                onClick={() => toggleExpand(worker.workerId)}
                                            >
                                                <td className="px-3 text-muted">
                                                    {expanded.has(worker.workerId)
                                                        ? <ChevronDown size={14} />
                                                        : <ChevronRight size={14} />
                                                    }
                                                </td>
                                                <td className="font-medium text-main">
                                                    {worker.firstName} {worker.lastName}
                                                </td>
                                                <td className="text-center text-muted">{worker.totalSessions}</td>
                                                <td className="text-center text-muted">{formatHours(worker.totalMinutes)}</td>
                                                <td className="text-right font-semibold text-main">
                                                    {formatMoney(worker.totalSalary)}
                                                </td>
                                            </tr>

                                            {expanded.has(worker.workerId) && worker.objects.map(obj => (
                                                <tr key={obj.objectId} className="bg-subtle/50 text-sm">
                                                    <td></td>
                                                    <td className="pl-8 text-muted">
                                                        <div>{obj.objectName}</div>
                                                        <div className="text-xs opacity-60">
                                                            {obj.salaryType === 'hourly'
                                                                ? `${obj.hourlyRate} zł/ч`
                                                                : `${obj.monthlyRate} zł/мес ÷ ${obj.expectedCleanings} смен`
                                                            }
                                                        </div>
                                                    </td>
                                                    <td className="text-center text-muted">{obj.sessions}</td>
                                                    <td className="text-center text-muted">{formatHours(obj.minutes)}</td>
                                                    <td className="text-right text-muted">{formatMoney(obj.salary)}</td>
                                                </tr>
                                            ))}
                                        </>
                                    ))}
                                </tbody>
                                <tfoot>
                                    <tr className="border-t-2 border-border font-semibold">
                                        <td></td>
                                        <td className="text-main">Итого</td>
                                        <td className="text-center text-main">
                                            {results.reduce((s, w) => s + w.totalSessions, 0)}
                                        </td>
                                        <td className="text-center text-main">
                                            {formatHours(results.reduce((s, w) => s + w.totalMinutes, 0))}
                                        </td>
                                        <td className="text-right text-main">{formatMoney(totalSalary)}</td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    </>
                )
            )}
        </div>
    );
}

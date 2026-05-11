import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { ChevronDown, ChevronRight, ChevronLeft, Loader2, Plus, Trash2, X, Clock, Banknote } from 'lucide-react';

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

interface Adjustment {
    id: string;
    type: 'overtime' | 'advance';
    amount: number;
    hours: number | null;
    hourly_rate: number | null;
    description: string | null;
}

interface WorkerSalary {
    workerId: string;
    firstName: string;
    lastName: string;
    totalSessions: number;
    totalMinutes: number;
    baseSalary: number;
    overtimeTotal: number;
    advanceTotal: number;
    totalSalary: number;
    objects: ObjectBreakdown[];
    adjustments: Adjustment[];
}

export default function SalariesTab() {
    const { adminUser } = useAuth();
    const today = new Date();
    const [year, setYear] = useState(today.getFullYear());
    const [month, setMonth] = useState(today.getMonth() + 1);
    const [loading, setLoading] = useState(false);
    const [results, setResults] = useState<WorkerSalary[] | null>(null);
    const [expanded, setExpanded] = useState<Set<string>>(new Set());

    // Add adjustment modal
    const [adjustModal, setAdjustModal] = useState<{ workerId: string; workerName: string; type: 'overtime' | 'advance' } | null>(null);
    const [adjForm, setAdjForm] = useState({ calcMode: 'hours' as 'hours' | 'fixed', hours: '', hourlyRate: '', amount: '', description: '' });
    const [savingAdj, setSavingAdj] = useState(false);

    const monthNames = [
        'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
        'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
    ];

    // Auto-calculate on month/year change
    useEffect(() => {
        calculate();
    }, [year, month]);

    const prevMonth = () => {
        if (month === 1) { setMonth(12); setYear(y => y - 1); }
        else setMonth(m => m - 1);
    };

    const nextMonth = () => {
        if (month === 12) { setMonth(1); setYear(y => y + 1); }
        else setMonth(m => m + 1);
    };

    const calculate = async () => {
        setLoading(true);
        setResults(null);
        setExpanded(new Set());

        const startDate = new Date(year, month - 1, 1).toISOString();
        const endDate = new Date(year, month, 1).toISOString();

        // Fetch sessions and adjustments in parallel
        const [sessionsRes, adjustmentsRes] = await Promise.all([
            supabase
                .from('work_sessions')
                .select(`
                    id, duration_minutes, worker_id, start_time,
                    workers!inner(id, first_name, last_name, is_active, deleted_at),
                    cleaning_objects(id, name, salary_type, hourly_rate, monthly_rate, expected_cleanings_per_month)
                `)
                .gte('start_time', startDate)
                .lt('start_time', endDate)
                .not('end_time', 'is', null)
                .not('duration_minutes', 'is', null)
                .gt('duration_minutes', 0),
            supabase
                .from('salary_adjustments')
                .select('*')
                .eq('year', year)
                .eq('month', month)
        ]);

        if (sessionsRes.error) {
            console.error(sessionsRes.error);
            alert('Ошибка при загрузке данных: ' + sessionsRes.error.message);
            setLoading(false);
            return;
        }

        const workerMap = new Map<string, WorkerSalary>();

        for (const session of (sessionsRes.data || [])) {
            const worker = (session as any).workers;
            const obj = (session as any).cleaning_objects;
            if (!worker || worker.deleted_at) continue;

            const wId = worker.id;
            if (!workerMap.has(wId)) {
                workerMap.set(wId, {
                    workerId: wId,
                    firstName: worker.first_name,
                    lastName: worker.last_name,
                    totalSessions: 0,
                    totalMinutes: 0,
                    baseSalary: 0,
                    overtimeTotal: 0,
                    advanceTotal: 0,
                    totalSalary: 0,
                    objects: [],
                    adjustments: [],
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

        // Process adjustments
        const adjustments = adjustmentsRes.data || [];
        for (const adj of adjustments) {
            let ws = workerMap.get(adj.worker_id);
            if (!ws) {
                // Worker has adjustments but no sessions this month — fetch worker info
                const { data: workerData } = await supabase
                    .from('workers')
                    .select('id, first_name, last_name, deleted_at')
                    .eq('id', adj.worker_id)
                    .single();
                if (!workerData || workerData.deleted_at) continue;
                ws = {
                    workerId: workerData.id,
                    firstName: workerData.first_name,
                    lastName: workerData.last_name,
                    totalSessions: 0,
                    totalMinutes: 0,
                    baseSalary: 0,
                    overtimeTotal: 0,
                    advanceTotal: 0,
                    totalSalary: 0,
                    objects: [],
                    adjustments: [],
                };
                workerMap.set(workerData.id, ws);
            }
            ws.adjustments.push({
                id: adj.id,
                type: adj.type,
                amount: Number(adj.amount),
                hours: adj.hours ? Number(adj.hours) : null,
                hourly_rate: adj.hourly_rate ? Number(adj.hourly_rate) : null,
                description: adj.description,
            });
        }

        // Calculate totals
        for (const ws of workerMap.values()) {
            ws.baseSalary = 0;
            for (const obj of ws.objects) {
                if (obj.salaryType === 'hourly') {
                    obj.salary = (obj.minutes / 60) * obj.hourlyRate;
                } else {
                    const perSession = obj.expectedCleanings > 0
                        ? obj.monthlyRate / obj.expectedCleanings
                        : 0;
                    obj.salary = perSession * obj.sessions;
                }
                ws.baseSalary += obj.salary;
            }

            ws.overtimeTotal = ws.adjustments
                .filter(a => a.type === 'overtime')
                .reduce((sum, a) => sum + a.amount, 0);

            ws.advanceTotal = ws.adjustments
                .filter(a => a.type === 'advance')
                .reduce((sum, a) => sum + a.amount, 0);

            ws.totalSalary = ws.baseSalary + ws.overtimeTotal - ws.advanceTotal;
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

    const openAdjustModal = (workerId: string, workerName: string, type: 'overtime' | 'advance') => {
        setAdjustModal({ workerId, workerName, type });
        setAdjForm({ calcMode: 'hours', hours: '', hourlyRate: '', amount: '', description: '' });
    };

    const saveAdjustment = async () => {
        if (!adjustModal) return;

        let amount: number;
        let hours: number | null = null;
        let hourlyRate: number | null = null;

        if (adjustModal.type === 'overtime' && adjForm.calcMode === 'hours') {
            hours = parseFloat(adjForm.hours);
            hourlyRate = parseFloat(adjForm.hourlyRate);
            if (!hours || !hourlyRate || hours <= 0 || hourlyRate <= 0) {
                alert('Введите часы и ставку');
                return;
            }
            amount = hours * hourlyRate;
        } else {
            amount = parseFloat(adjForm.amount);
            if (!amount || amount <= 0) {
                alert('Введите сумму');
                return;
            }
        }

        setSavingAdj(true);
        const { error } = await supabase.from('salary_adjustments').insert({
            worker_id: adjustModal.workerId,
            year,
            month,
            type: adjustModal.type,
            amount,
            hours,
            hourly_rate: hourlyRate,
            description: adjForm.description.trim() || null,
            created_by: adminUser?.id,
        });

        if (error) {
            console.error(error);
            alert('Ошибка: ' + error.message);
        } else {
            setAdjustModal(null);
            calculate();
        }
        setSavingAdj(false);
    };

    const deleteAdjustment = async (id: string) => {
        if (!confirm('Удалить?')) return;
        const { error } = await supabase.from('salary_adjustments').delete().eq('id', id);
        if (error) {
            alert('Ошибка: ' + error.message);
        } else {
            calculate();
        }
    };

    const formatMoney = (n: number) =>
        n.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' zł';

    const formatHours = (minutes: number) => {
        const h = Math.floor(minutes / 60);
        const m = minutes % 60;
        return m > 0 ? `${h}ч ${m}м` : `${h}ч`;
    };

    const totalBaseSalary = results?.reduce((sum, w) => sum + w.baseSalary, 0) ?? 0;
    const totalOvertime = results?.reduce((sum, w) => sum + w.overtimeTotal, 0) ?? 0;
    const totalAdvances = results?.reduce((sum, w) => sum + w.advanceTotal, 0) ?? 0;
    const totalSalary = results?.reduce((sum, w) => sum + w.totalSalary, 0) ?? 0;

    const isSuperAdmin = adminUser?.role === 'super_admin';

    return (
        <div className="space-y-4">
            {/* Month Navigation */}
            <div className="card p-4 flex items-center justify-between">
                <button onClick={prevMonth} className="btn-icon">
                    <ChevronLeft className="w-5 h-5" />
                </button>
                <div className="text-center">
                    <div className="text-lg font-bold text-main">{monthNames[month - 1]} {year}</div>
                    {results && (
                        <div className="text-sm text-muted mt-1">
                            {formatMoney(totalBaseSalary)}
                            {totalOvertime > 0 && <span className="text-green-600"> + {formatMoney(totalOvertime)}</span>}
                            {totalAdvances > 0 && <span className="text-red-500"> - {formatMoney(totalAdvances)}</span>}
                            {(totalOvertime > 0 || totalAdvances > 0) && <span className="font-semibold"> = {formatMoney(totalSalary)}</span>}
                        </div>
                    )}
                </div>
                <button onClick={nextMonth} className="btn-icon">
                    <ChevronRight className="w-5 h-5" />
                </button>
            </div>

            {/* Loading */}
            {loading && (
                <div className="card p-10 flex justify-center">
                    <Loader2 className="w-6 h-6 animate-spin text-muted" />
                </div>
            )}

            {/* Results */}
            {!loading && results !== null && (
                results.length === 0 ? (
                    <div className="card p-10 text-center text-muted">
                        Нет данных за выбранный период
                    </div>
                ) : (
                    <>
                        {/* Worker cards */}
                        <div className="flex flex-col gap-3">
                            {results.map(worker => (
                                <div key={worker.workerId} className="card overflow-hidden">
                                    <button
                                        className="w-full flex items-center justify-between p-4 text-left"
                                        onClick={() => toggleExpand(worker.workerId)}
                                    >
                                        <div className="min-w-0">
                                            <div className="font-semibold text-main">
                                                {worker.firstName} {worker.lastName}
                                            </div>
                                            <div className="text-xs text-muted mt-0.5">
                                                {worker.totalSessions} смен · {formatHours(worker.totalMinutes)}
                                                {worker.overtimeTotal > 0 && <span className="text-green-600 ml-1">+ переработки</span>}
                                                {worker.advanceTotal > 0 && <span className="text-red-500 ml-1">- аванс</span>}
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
                                        <div className="border-t border-border">
                                            {/* Objects */}
                                            {worker.objects.map(obj => (
                                                <div key={obj.objectId} className="px-4 py-3 bg-subtle/40 border-b border-border">
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

                                            {/* Overtimes */}
                                            {worker.adjustments.filter(a => a.type === 'overtime').length > 0 && (
                                                <div className="px-4 py-2 bg-green-50/50 dark:bg-green-900/10">
                                                    <div className="text-xs font-semibold text-green-700 dark:text-green-400 mb-1">Переработки</div>
                                                    {worker.adjustments.filter(a => a.type === 'overtime').map(adj => (
                                                        <div key={adj.id} className="flex items-center justify-between py-1">
                                                            <div className="text-sm text-main">
                                                                {adj.hours && adj.hourly_rate
                                                                    ? `${adj.hours}ч × ${adj.hourly_rate} zł/ч`
                                                                    : adj.description || 'Переработка'
                                                                }
                                                                {adj.description && adj.hours ? <span className="text-xs text-muted ml-2">({adj.description})</span> : null}
                                                            </div>
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-sm font-semibold text-green-700 dark:text-green-400">+{formatMoney(adj.amount)}</span>
                                                                {isSuperAdmin && (
                                                                    <button onClick={() => deleteAdjustment(adj.id)} className="text-red-400 hover:text-red-600">
                                                                        <Trash2 size={14} />
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}

                                            {/* Advances */}
                                            {worker.adjustments.filter(a => a.type === 'advance').length > 0 && (
                                                <div className="px-4 py-2 bg-red-50/50 dark:bg-red-900/10">
                                                    <div className="text-xs font-semibold text-red-700 dark:text-red-400 mb-1">Авансы</div>
                                                    {worker.adjustments.filter(a => a.type === 'advance').map(adj => (
                                                        <div key={adj.id} className="flex items-center justify-between py-1">
                                                            <div className="text-sm text-main">
                                                                {adj.description || 'Аванс'}
                                                            </div>
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-sm font-semibold text-red-600 dark:text-red-400">-{formatMoney(adj.amount)}</span>
                                                                {isSuperAdmin && (
                                                                    <button onClick={() => deleteAdjustment(adj.id)} className="text-red-400 hover:text-red-600">
                                                                        <Trash2 size={14} />
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}

                                            {/* Summary row */}
                                            {(worker.overtimeTotal > 0 || worker.advanceTotal > 0) && (
                                                <div className="px-4 py-2 border-t border-border flex justify-between items-center">
                                                    <span className="text-xs text-muted">
                                                        Базовая: {formatMoney(worker.baseSalary)}
                                                        {worker.overtimeTotal > 0 && ` + ${formatMoney(worker.overtimeTotal)}`}
                                                        {worker.advanceTotal > 0 && ` - ${formatMoney(worker.advanceTotal)}`}
                                                    </span>
                                                    <span className="text-sm font-bold text-main">= {formatMoney(worker.totalSalary)}</span>
                                                </div>
                                            )}

                                            {/* Action buttons */}
                                            {isSuperAdmin && (
                                                <div className="px-4 py-3 border-t border-border flex gap-2">
                                                    <button
                                                        onClick={() => openAdjustModal(worker.workerId, `${worker.firstName} ${worker.lastName}`, 'overtime')}
                                                        className="flex-1 btn-secondary text-xs py-1.5 flex items-center justify-center gap-1.5"
                                                    >
                                                        <Clock size={14} /> Переработка
                                                    </button>
                                                    <button
                                                        onClick={() => openAdjustModal(worker.workerId, `${worker.firstName} ${worker.lastName}`, 'advance')}
                                                        className="flex-1 btn-secondary text-xs py-1.5 flex items-center justify-center gap-1.5"
                                                    >
                                                        <Banknote size={14} /> Аванс
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            ))}

                            {/* Total card */}
                            <div className="card p-4 flex justify-between items-center">
                                <span className="font-semibold text-main">Итого к выплате</span>
                                <div className="text-right">
                                    <div className="text-xs text-muted">
                                        {results.reduce((s, w) => s + w.totalSessions, 0)} смен · {formatHours(results.reduce((s, w) => s + w.totalMinutes, 0))}
                                    </div>
                                    <div className="text-lg font-bold text-main">{formatMoney(totalSalary)}</div>
                                </div>
                            </div>
                        </div>
                    </>
                )
            )}

            {/* Adjustment Modal */}
            {adjustModal && createPortal(
                <div className="modal-overlay" onClick={() => setAdjustModal(null)}>
                    <div className="modal-content max-w-sm" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3 className="text-lg font-bold text-main">
                                {adjustModal.type === 'overtime' ? 'Добавить переработку' : 'Добавить аванс'}
                            </h3>
                            <button onClick={() => setAdjustModal(null)} className="btn-icon">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="modal-body space-y-4">
                            <div className="text-sm text-muted">
                                {adjustModal.workerName} — {monthNames[month - 1]} {year}
                            </div>

                            {adjustModal.type === 'overtime' && (
                                <div className="flex gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setAdjForm({ ...adjForm, calcMode: 'hours' })}
                                        className={`flex-1 py-1.5 rounded-lg text-sm font-medium border transition-colors ${adjForm.calcMode === 'hours'
                                            ? 'bg-primary/10 text-primary border-primary/30'
                                            : 'bg-subtle text-muted border-border'
                                        }`}
                                    >
                                        Часы × Ставка
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setAdjForm({ ...adjForm, calcMode: 'fixed' })}
                                        className={`flex-1 py-1.5 rounded-lg text-sm font-medium border transition-colors ${adjForm.calcMode === 'fixed'
                                            ? 'bg-primary/10 text-primary border-primary/30'
                                            : 'bg-subtle text-muted border-border'
                                        }`}
                                    >
                                        Фикс. сумма
                                    </button>
                                </div>
                            )}

                            {adjustModal.type === 'overtime' && adjForm.calcMode === 'hours' ? (
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-xs font-medium text-muted mb-1">Часы</label>
                                        <input
                                            type="number"
                                            step="0.5"
                                            min="0.5"
                                            value={adjForm.hours}
                                            onChange={e => setAdjForm({ ...adjForm, hours: e.target.value })}
                                            className="input"
                                            placeholder="2"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-muted mb-1">Ставка (zł/ч)</label>
                                        <input
                                            type="number"
                                            step="0.5"
                                            min="0"
                                            value={adjForm.hourlyRate}
                                            onChange={e => setAdjForm({ ...adjForm, hourlyRate: e.target.value })}
                                            className="input"
                                            placeholder="30"
                                        />
                                    </div>
                                    {adjForm.hours && adjForm.hourlyRate && (
                                        <div className="col-span-2 text-sm text-center text-primary font-medium">
                                            = {formatMoney(parseFloat(adjForm.hours) * parseFloat(adjForm.hourlyRate))}
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div>
                                    <label className="block text-xs font-medium text-muted mb-1">Сумма (zł)</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        value={adjForm.amount}
                                        onChange={e => setAdjForm({ ...adjForm, amount: e.target.value })}
                                        className="input"
                                        placeholder="100"
                                    />
                                </div>
                            )}

                            <div>
                                <label className="block text-xs font-medium text-muted mb-1">Описание (необязательно)</label>
                                <input
                                    type="text"
                                    value={adjForm.description}
                                    onChange={e => setAdjForm({ ...adjForm, description: e.target.value })}
                                    className="input"
                                    placeholder={adjustModal.type === 'overtime' ? 'Уборка после ремонта...' : 'Аванс за первую неделю...'}
                                />
                            </div>
                        </div>
                        <div className="modal-footer flex gap-3">
                            <button onClick={() => setAdjustModal(null)} className="btn-secondary flex-1">
                                Отмена
                            </button>
                            <button
                                onClick={saveAdjustment}
                                disabled={savingAdj}
                                className="btn-primary flex-1 flex items-center justify-center gap-2"
                            >
                                {savingAdj ? 'Сохранение...' : (
                                    <><Plus size={16} /> Добавить</>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            , document.body)}
        </div>
    );
}

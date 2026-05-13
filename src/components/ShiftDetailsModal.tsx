import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../lib/supabase';
import { X, MapPin, Save, History, Phone, User, Edit2, ExternalLink } from 'lucide-react';

interface WorkSession {
    id: string;
    start_time: string;
    end_time: string | null;
    duration_minutes: number | null;
    start_location: any;
    end_location: any;
    tasks_completed?: boolean | null;
    workers: {
        first_name: string;
        last_name: string;
        phone_number?: string;
    };
    cleaning_objects: {
        id: string;
        name: string;
        address: string;
        salary_type: 'hourly' | 'monthly_fixed';
        hourly_rate: number;
        monthly_rate: number;
    } | null;
}

interface ShiftDetailsModalProps {
    session: WorkSession;
    onClose: () => void;
    onUpdate: () => void;
}

export default function ShiftDetailsModal({ session, onClose, onUpdate }: ShiftDetailsModalProps) {
    const [history, setHistory] = useState<WorkSession[]>([]);
    const [loadingHistory, setLoadingHistory] = useState(true);
    const [editForm, setEditForm] = useState({
        start_time: '',
        end_time: '',
    });
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        // Initialize edit form
        const formatForInput = (dateStr: string) => {
            const date = new Date(dateStr);
            return new Date(date.getTime() - (date.getTimezoneOffset() * 60000))
                .toISOString()
                .slice(0, 16);
        };

        setEditForm({
            start_time: formatForInput(session.start_time),
            end_time: session.end_time ? formatForInput(session.end_time) : '',
        });

        loadHistory();
    }, [session]);

    const loadHistory = async () => {
        if (!session.cleaning_objects?.id) return;

        setLoadingHistory(true);
        const { data, error } = await supabase
            .from('work_sessions')
            .select(`
                *,
                workers (first_name, last_name),
                cleaning_objects (name)
            `)
            .eq('object_id', session.cleaning_objects.id)
            .neq('id', session.id) // Exclude current session
            .order('start_time', { ascending: false })
            .limit(10);

        if (error) {
            console.error('Error loading history:', error);
        } else {
            console.log('Loaded history:', data); // Debug
            setHistory(data || []);
        }
        setLoadingHistory(false);
    };

    const handleUpdate = async () => {
        setSaving(true);
        try {
            const startTime = new Date(editForm.start_time);
            const endTime = editForm.end_time ? new Date(editForm.end_time) : null;

            let durationMinutes = null;
            if (endTime) {
                durationMinutes = Math.floor((endTime.getTime() - startTime.getTime()) / 60000);
            }

            const { error } = await supabase
                .from('work_sessions')
                .update({
                    start_time: startTime.toISOString(),
                    end_time: endTime ? endTime.toISOString() : null,
                    duration_minutes: durationMinutes,
                })
                .eq('id', session.id);

            if (error) throw error;

            onUpdate();
        } catch (error) {
            console.error('Error updating session:', error);
            alert('Ошибка при обновлении смены');
        } finally {
            setSaving(false);
        }
    };

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleDateString('ru-RU', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
        });
    };


    const formatDuration = (minutes: number | null) => {
        if (!minutes) return '-';
        const h = Math.floor(minutes / 60);
        const m = minutes % 60;
        return `${h}ч ${m}м`;
    };

    const getGoogleMapsLink = (query: string) => {
        return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
    };

    return createPortal(
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content sm:max-w-4xl" onClick={e => e.stopPropagation()}>

                {/* Header */}
                <div className="modal-header">
                    <div>
                        <h3 className="text-xl font-bold text-main flex items-center gap-2">
                            <span className="bg-primary-100 dark:bg-primary-900/30 text-primary dark:text-primary p-2 rounded-lg">
                                <User size={20} />
                            </span>
                            {session.workers?.first_name} {session.workers?.last_name}
                        </h3>
                        {session.workers?.phone_number && (
                            <a
                                href={`tel:${session.workers.phone_number}`}
                                className="flex items-center gap-1.5 text-sm text-muted mt-2 hover:text-primary dark:hover:text-primary transition-colors w-fit"
                            >
                                <Phone size={14} />
                                {session.workers.phone_number}
                            </a>
                        )}
                    </div>
                    <button onClick={onClose} className="btn-icon">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="modal-body">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">

                        {/* Current Session Details */}
                        <div className="space-y-6">
                            <div>
                                <h4 className="text-sm font-bold text-gray-900 dark:text-gray-100 uppercase tracking-wider mb-4 flex items-center gap-2">
                                    <Edit2 className="w-4 h-4" />
                                    Редактирование смены
                                </h4>
                                <div className="space-y-4 bg-subtle/30 p-4 rounded-xl border border-gray-100 dark:border-gray-700">
                                    <div>
                                        <label className="block text-xs font-medium text-muted mb-1.5">Время начала</label>
                                        <input
                                            type="datetime-local"
                                            value={editForm.start_time}
                                            onChange={(e) => setEditForm({ ...editForm, start_time: e.target.value })}
                                            className="input w-full text-sm"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-muted mb-1.5">Время окончания</label>
                                        <input
                                            type="datetime-local"
                                            value={editForm.end_time}
                                            onChange={(e) => setEditForm({ ...editForm, end_time: e.target.value })}
                                            className="input w-full text-sm"
                                        />
                                    </div>
                                    <button
                                        onClick={handleUpdate}
                                        disabled={saving}
                                        className="btn-primary w-full flex items-center justify-center gap-2"
                                    >
                                        <Save size={16} />
                                        {saving ? 'Сохранение...' : 'Сохранить изменения'}
                                    </button>
                                </div>
                            </div>

                            <div>
                                <h4 className="text-sm font-bold text-gray-900 dark:text-gray-100 uppercase tracking-wider mb-4 flex items-center gap-2">
                                    <MapPin className="w-4 h-4" />
                                    Информация об объекте
                                </h4>
                                <div className="bg-primary/5 p-4 rounded-xl border border-blue-100 dark:border-blue-900/30">
                                    <div className="font-semibold text-lg text-main mb-1">
                                        {session.cleaning_objects?.name}
                                    </div>
                                    {session.cleaning_objects?.address && (
                                        <a
                                            href={getGoogleMapsLink(session.cleaning_objects.address)}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-sm text-blue-600 dark:text-blue-400 hover:underline flex items-start gap-1.5 mt-2"
                                        >
                                            <MapPin size={14} className="mt-0.5 shrink-0" />
                                            {session.cleaning_objects.address}
                                            <ExternalLink size={12} className="mt-0.5 opacity-50" />
                                        </a>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* History */}
                        <div>
                            <h4 className="text-sm font-bold text-gray-900 dark:text-gray-100 uppercase tracking-wider mb-4 flex items-center gap-2">
                                <History className="w-4 h-4" />
                                История смен на объекте
                            </h4>

                            <div className="bg-card rounded-xl border border-border overflow-hidden min-h-[300px]">
                                {loadingHistory ? (
                                    <div className="flex justify-center items-center h-48">
                                        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                                    </div>
                                ) : history.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center h-48 text-gray-400">
                                        <History className="w-8 h-8 mb-2 opacity-20" />
                                        <p className="text-sm">Истории нет</p>
                                    </div>
                                ) : (
                                    <>
                                        {/* Mobile cards */}
                                        <div className="flex flex-col divide-y divide-gray-100 dark:divide-gray-800 sm:hidden">
                                            {history.map(item => (
                                                <div key={item.id} className="flex items-center justify-between px-4 py-3">
                                                    <div>
                                                        <div className="font-medium text-main text-sm">
                                                            {item.workers?.first_name} {item.workers?.last_name}
                                                        </div>
                                                        <div className="text-xs text-gray-500 mt-0.5">{formatDate(item.start_time)}</div>
                                                    </div>
                                                    <div>
                                                        {item.duration_minutes ? (
                                                            <span className="text-xs bg-subtle px-2 py-0.5 rounded">{formatDuration(item.duration_minutes)}</span>
                                                        ) : (
                                                            <span className="text-amber-500 text-xs">В процессе</span>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                        {/* Desktop table */}
                                        <div className="hidden sm:block overflow-x-auto">
                                            <table className="w-full text-sm">
                                                <thead className="bg-subtle/50 text-xs text-gray-500 font-semibold uppercase">
                                                    <tr>
                                                        <th className="px-4 py-3 text-left">Работник</th>
                                                        <th className="px-4 py-3 text-left">Дата</th>
                                                        <th className="px-4 py-3 text-right">Время</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                                                    {history.map(item => (
                                                        <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                                                            <td className="px-4 py-3">
                                                                <div className="font-medium text-main">
                                                                    {item.workers?.first_name} {item.workers?.last_name}
                                                                </div>
                                                            </td>
                                                            <td className="px-4 py-3 text-muted">
                                                                {formatDate(item.start_time)}
                                                            </td>
                                                            <td className="px-4 py-3 text-right">
                                                                {item.duration_minutes ? (
                                                                    <span className="inline-flex items-center gap-1 bg-subtle px-2 py-0.5 rounded text-xs">
                                                                        {formatDuration(item.duration_minutes)}
                                                                    </span>
                                                                ) : (
                                                                    <span className="text-amber-500 text-xs">В процессе</span>
                                                                )}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>

                    </div>
                </div>
            </div>
        </div>
    , document.body);
}


import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { X, MapPin, Clock, Edit2, Trash2, Save, History } from 'lucide-react';

interface WorkSession {
    id: string;
    start_time: string;
    end_time: string | null;
    duration_minutes: number | null;
    start_location: {
        latitude: number;
        longitude: number;
    } | null;
    end_location: {
        latitude: number;
        longitude: number;
    } | null;
    cleaning_objects: {
        name: string;
        address: string;
    } | null;
}

interface WorkSessionsModalProps {
    workerId: string;
    workerName: string;
    onClose: () => void;
}

export default function WorkSessionsModal({ workerId, workerName, onClose }: WorkSessionsModalProps) {
    const [sessions, setSessions] = useState<WorkSession[]>([]);
    const [loading, setLoading] = useState(true);
    const [editingSession, setEditingSession] = useState<string | null>(null);
    const [editForm, setEditForm] = useState({
        start_time: '',
        end_time: '',
    });

    useEffect(() => {
        loadSessions();
    }, [workerId]);

    const loadSessions = async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from('work_sessions')
            .select(`
                *,
                cleaning_objects (
                    name,
                    address
                )
            `)
            .eq('worker_id', workerId)
            .order('start_time', { ascending: false });

        if (error) {
            console.error('Error loading sessions:', error);
        } else {
            setSessions(data || []);
        }
        setLoading(false);
    };

    const handleDeleteSession = async (id: string) => {
        if (!confirm('Вы уверены, что хотите удалить эту смену?')) return;

        const { error } = await supabase
            .from('work_sessions')
            .delete()
            .eq('id', id);

        if (error) {
            console.error('Error deleting session:', error);
            alert('Ошибка при удалении смены');
        } else {
            loadSessions();
        }
    };

    const startEditing = (session: WorkSession) => {
        setEditingSession(session.id);
        // Format for datetime-local input: YYYY-MM-DDThh:mm
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
    };

    const handleUpdateSession = async (id: string) => {
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
                .eq('id', id);

            if (error) throw error;

            setEditingSession(null);
            loadSessions();
        } catch (error) {
            console.error('Error updating session:', error);
            alert('Ошибка при обновлении смены');
        }
    };

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleString('ru-RU', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    const formatDuration = (minutes: number | null) => {
        if (!minutes) return '-';
        const h = Math.floor(minutes / 60);
        const m = minutes % 60;
        return `${h}ч ${m}м`;
    };

    const getGoogleMapsLink = (location: { latitude: number; longitude: number } | null) => {
        if (!location) return null;
        return `https://www.google.com/maps?q=${location.latitude},${location.longitude}`;
    };

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fadeIn overflow-hidden">
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-5xl w-full max-h-[90vh] flex flex-col animate-scaleIn border border-gray-100 dark:border-gray-700">
                <div className="p-6 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-gray-50/50 dark:bg-gray-800/50 rounded-t-2xl">
                    <div>
                        <h3 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                            <History className="w-5 h-5 text-primary-500" />
                            История работы
                        </h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                            Сотрудник: <span className="font-medium text-gray-900 dark:text-white">{workerName}</span>
                        </p>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="flex-1 overflow-auto p-0 custom-scrollbar">
                    {loading ? (
                        <div className="flex justify-center items-center h-64">
                            <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin"></div>
                        </div>
                    ) : sessions.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-64 text-gray-400 dark:text-gray-500">
                            <History className="w-12 h-12 mb-3 opacity-20" />
                            <p>История смен пуста</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="table w-full">
                                <thead className="bg-gray-50 dark:bg-gray-900/50 sticky top-0 z-10">
                                    <tr>
                                        <th className="pl-6 w-64">Объект</th>
                                        <th className="w-48">Начало</th>
                                        <th className="w-48">Конец</th>
                                        <th className="w-24 text-center">Длительность</th>
                                        <th className="w-32">Локация</th>
                                        <th className="pr-6 w-24 text-right">Действия</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                                    {sessions.map((session) => (
                                        <tr key={session.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors group">
                                            <td className="pl-6 py-4">
                                                <div className="font-medium text-gray-900 dark:text-white">
                                                    {session.cleaning_objects?.name || 'Не указан'}
                                                </div>
                                                {session.cleaning_objects?.address && (
                                                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate max-w-[200px]" title={session.cleaning_objects.address}>
                                                        {session.cleaning_objects.address}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="py-4">
                                                {editingSession === session.id ? (
                                                    <input
                                                        type="datetime-local"
                                                        value={editForm.start_time}
                                                        onChange={(e) => setEditForm({ ...editForm, start_time: e.target.value })}
                                                        className="input py-1 px-2 text-xs w-full"
                                                    />
                                                ) : (
                                                    <div className="text-sm text-gray-600 dark:text-gray-300">
                                                        {formatDate(session.start_time)}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="py-4">
                                                {editingSession === session.id ? (
                                                    <input
                                                        type="datetime-local"
                                                        value={editForm.end_time}
                                                        onChange={(e) => setEditForm({ ...editForm, end_time: e.target.value })}
                                                        className="input py-1 px-2 text-xs w-full"
                                                    />
                                                ) : (
                                                    <div className={`text-sm ${session.end_time ? 'text-gray-600 dark:text-gray-300' : 'text-green-600 dark:text-green-400 font-medium'}`}>
                                                        {session.end_time ? formatDate(session.end_time) : (
                                                            <span className="flex items-center gap-1.5 text-xs bg-green-50 dark:bg-green-900/20 px-2 py-0.5 rounded-full border border-green-100 dark:border-green-900/30">
                                                                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
                                                                В процессе
                                                            </span>
                                                        )}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="py-4 text-center">
                                                {session.duration_minutes !== null ? (
                                                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-gray-100 dark:bg-gray-800 text-xs font-medium text-gray-700 dark:text-gray-300">
                                                        <Clock className="w-3 h-3" />
                                                        {formatDuration(session.duration_minutes)}
                                                    </span>
                                                ) : '-'}
                                            </td>
                                            <td className="py-4">
                                                <div className="flex flex-col gap-1">
                                                    {session.start_location ? (
                                                        <a
                                                            href={getGoogleMapsLink(session.start_location)!}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400 hover:underline"
                                                            title="Начало смены"
                                                        >
                                                            <MapPin className="w-3 h-3" />
                                                            Начало
                                                        </a>
                                                    ) : <span className="text-xs text-gray-400 pl-4">-</span>}

                                                    {session.end_location ? (
                                                        <a
                                                            href={getGoogleMapsLink(session.end_location)!}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400 hover:underline"
                                                            title="Конец смены"
                                                        >
                                                            <MapPin className="w-3 h-3" />
                                                            Конец
                                                        </a>
                                                    ) : null}
                                                </div>
                                            </td>
                                            <td className="pr-6 py-4 text-right">
                                                <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    {editingSession === session.id ? (
                                                        <>
                                                            <button
                                                                onClick={() => handleUpdateSession(session.id)}
                                                                className="p-1.5 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg text-green-600 dark:text-green-400 transition-colors"
                                                                title="Сохранить"
                                                            >
                                                                <Save className="w-4 h-4" />
                                                            </button>
                                                            <button
                                                                onClick={() => setEditingSession(null)}
                                                                className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-gray-500 transition-colors"
                                                                title="Отмена"
                                                            >
                                                                <X className="w-4 h-4" />
                                                            </button>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <button
                                                                onClick={() => startEditing(session)}
                                                                className="p-1.5 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg text-blue-600 dark:text-blue-400 transition-colors"
                                                                title="Редактировать время"
                                                            >
                                                                <Edit2 className="w-4 h-4" />
                                                            </button>
                                                            <button
                                                                onClick={() => handleDeleteSession(session.id)}
                                                                className="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg text-red-600 dark:text-red-400 transition-colors"
                                                                title="Удалить запись"
                                                            >
                                                                <Trash2 className="w-4 h-4" />
                                                            </button>
                                                        </>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

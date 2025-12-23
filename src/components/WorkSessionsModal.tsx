import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { X, MapPin, Clock, Edit2, Trash2, Save } from 'lucide-react';

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
            year: '2-digit',
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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <div className="bg-gray-800 rounded-lg max-w-4xl w-full max-h-[90vh] flex flex-col">
                <div className="p-6 border-b border-gray-700 flex justify-between items-center">
                    <h3 className="text-xl font-bold text-white">
                        История работы: {workerName}
                    </h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-white">
                        <X className="w-6 h-6" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6">
                    {loading ? (
                        <div className="text-center text-gray-400">Загрузка...</div>
                    ) : sessions.length === 0 ? (
                        <div className="text-center text-gray-400">История пуста</div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <thead className="text-xs text-gray-400 uppercase bg-gray-700/50">
                                    <tr>
                                        <th className="px-4 py-3">Объект</th>
                                        <th className="px-4 py-3">Начало</th>
                                        <th className="px-4 py-3">Конец</th>
                                        <th className="px-4 py-3">Длительность</th>
                                        <th className="px-4 py-3">Локация (Начало)</th>
                                        <th className="px-4 py-3">Локация (Конец)</th>
                                        <th className="px-4 py-3">Действия</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-700">
                                    {sessions.map((session) => (
                                        <tr key={session.id} className="hover:bg-gray-700/30">
                                            <td className="px-4 py-3 text-white">
                                                {session.cleaning_objects?.name || 'Не указан'}
                                                {session.cleaning_objects?.address && (
                                                    <div className="text-xs text-gray-400">
                                                        {session.cleaning_objects.address}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-gray-300">
                                                {editingSession === session.id ? (
                                                    <input
                                                        type="datetime-local"
                                                        value={editForm.start_time}
                                                        onChange={(e) => setEditForm({ ...editForm, start_time: e.target.value })}
                                                        className="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-white text-sm"
                                                    />
                                                ) : (
                                                    formatDate(session.start_time)
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-gray-300">
                                                {editingSession === session.id ? (
                                                    <input
                                                        type="datetime-local"
                                                        value={editForm.end_time}
                                                        onChange={(e) => setEditForm({ ...editForm, end_time: e.target.value })}
                                                        className="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-white text-sm"
                                                    />
                                                ) : (
                                                    session.end_time ? formatDate(session.end_time) : 'В процессе'
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-gray-300">
                                                {session.duration_minutes !== null ? (
                                                    <div className="flex items-center gap-1">
                                                        <Clock className="w-3 h-3" />
                                                        {formatDuration(session.duration_minutes)}
                                                    </div>
                                                ) : '-'}
                                            </td>
                                            <td className="px-4 py-3">
                                                {session.start_location ? (
                                                    <a
                                                        href={getGoogleMapsLink(session.start_location)!}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="flex items-center gap-1 text-blue-400 hover:text-blue-300"
                                                    >
                                                        <MapPin className="w-4 h-4" />
                                                        Карта
                                                    </a>
                                                ) : (
                                                    <span className="text-gray-500">-</span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3">
                                                {session.end_location ? (
                                                    <a
                                                        href={getGoogleMapsLink(session.end_location)!}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="flex items-center gap-1 text-blue-400 hover:text-blue-300"
                                                    >
                                                        <MapPin className="w-4 h-4" />
                                                        Карта
                                                    </a>
                                                ) : (
                                                    <span className="text-gray-500">-</span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-2">
                                                    {editingSession === session.id ? (
                                                        <>
                                                            <button
                                                                onClick={() => handleUpdateSession(session.id)}
                                                                className="p-1 hover:bg-gray-600 rounded text-green-400"
                                                                title="Сохранить"
                                                            >
                                                                <Save className="w-4 h-4" />
                                                            </button>
                                                            <button
                                                                onClick={() => setEditingSession(null)}
                                                                className="p-1 hover:bg-gray-600 rounded text-gray-400"
                                                                title="Отмена"
                                                            >
                                                                <X className="w-4 h-4" />
                                                            </button>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <button
                                                                onClick={() => startEditing(session)}
                                                                className="p-1 hover:bg-gray-600 rounded text-blue-400"
                                                                title="Редактировать"
                                                            >
                                                                <Edit2 className="w-4 h-4" />
                                                            </button>
                                                            <button
                                                                onClick={() => handleDeleteSession(session.id)}
                                                                className="p-1 hover:bg-gray-600 rounded text-red-400"
                                                                title="Удалить"
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

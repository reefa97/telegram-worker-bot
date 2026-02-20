import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { X, Calendar, MapPin, Phone, User, Shield, MessageCircle, Coins, ChevronDown, TrendingUp } from 'lucide-react';

interface Worker {
    id: string;
    first_name: string;
    last_name: string;
    telegram_username: string;
    phone_number: string;
    is_active: boolean;
    role: string;
    worker_roles?: { name: string };
    created_at: string;
    created_by?: string;
    total_points?: number;
}

interface PointsLogEntry {
    id: string;
    points_change: number;
    reason: string | null;
    created_at: string;
    check_id: string | null;
}

interface WorkerDetailsModalProps {
    worker: Worker;
    onClose: () => void;
}

export default function WorkerDetailsModal({ worker, onClose }: WorkerDetailsModalProps) {
    const [assignedObjects, setAssignedObjects] = useState<any[]>([]);
    const [creatorName, setCreatorName] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [pointsLog, setPointsLog] = useState<PointsLogEntry[]>([]);
    const [showPointsHistory, setShowPointsHistory] = useState(false);

    useEffect(() => {
        const fetchDetails = async () => {
            setLoading(true);
            const { data, error } = await supabase
                .from('worker_objects')
                .select(`
                    object_id,
                    cleaning_objects (
                        id,
                        name,
                        address
                    )
                `)
                .eq('worker_id', worker.id);

            if (data) {
                setAssignedObjects(data.map((item: any) => item.cleaning_objects).filter(Boolean));
            }
            if (error) {
                console.error('Error fetching worker objects:', error);
            }

            // Fetch creator name if created_by is present
            if (worker.created_by) {
                const { data: adminData } = await supabase
                    .from('admin_users')
                    .select('name')
                    .eq('id', worker.created_by)
                    .maybeSingle();

                if (adminData) {
                    setCreatorName(adminData.name);
                }
            }

            // Fetch points history (last 5)
            const { data: pointsData } = await supabase
                .from('worker_points_log')
                .select('id, points_change, reason, created_at, check_id')
                .eq('worker_id', worker.id)
                .order('created_at', { ascending: false })
                .limit(5);
            if (pointsData) setPointsLog(pointsData);

            setLoading(false);
        };

        fetchDetails();
    }, [worker.id]);

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleDateString('ru-RU', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fadeIn" onClick={onClose}>
            <div className="bg-white dark:bg-zinc-950 rounded-2xl shadow-xl border border-zinc-200 dark:border-zinc-800 max-w-lg w-full max-h-[90vh] overflow-y-auto animate-scaleIn" onClick={e => e.stopPropagation()}>
                <div className="p-6">
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="text-xl font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                            <User className="w-5 h-5 text-zinc-500" />
                            Карточка работника
                        </h3>
                        <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200">
                            <span className="sr-only">Закрыть</span>
                            <X className="w-6 h-6" />
                        </button>
                    </div>

                    <div className="space-y-6">
                        {/* Header Info */}
                        <div className="flex items-center gap-4 pb-6 border-b border-zinc-100 dark:border-zinc-800">
                            <div className="w-16 h-16 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-500 dark:text-zinc-400 text-xl font-bold">
                                {worker.first_name[0]}{worker.last_name[0]}
                            </div>
                            <div>
                                <h4 className="text-lg font-bold text-zinc-900 dark:text-white">
                                    {worker.first_name} {worker.last_name}
                                </h4>
                                <div className="flex items-center gap-2 mt-1 flex-wrap">
                                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${worker.is_active
                                        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                                        : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'}`}>
                                        {worker.is_active ? 'Активен' : 'Неактивен'}
                                    </span>
                                    <span className="text-sm text-zinc-500 dark:text-zinc-400 flex items-center gap-1">
                                        <Shield className="w-3 h-3" />
                                        {worker.worker_roles?.name || worker.role || 'Без роли'}
                                    </span>
                                    {/* Points badge */}
                                    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold border ${(worker.total_points || 0) >= 50
                                        ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-700'
                                        : (worker.total_points || 0) > 0
                                            ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border-green-200 dark:border-green-700'
                                            : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700'
                                        }`}>
                                        <Coins className="w-3 h-3" />
                                        {worker.total_points || 0} баллов
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Details Grid */}
                        <div className="grid grid-cols-1 gap-4">
                            <div className="p-3 bg-zinc-50 dark:bg-zinc-900/50 rounded-lg border border-zinc-100 dark:border-zinc-800">
                                <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1 block">Дата добавления</label>
                                <div className="flex items-center gap-2 text-zinc-700 dark:text-zinc-300">
                                    <Calendar className="w-4 h-4 text-zinc-400" />
                                    {formatDate(worker.created_at)}
                                </div>
                            </div>

                            <div className="p-3 bg-zinc-50 dark:bg-zinc-900/50 rounded-lg border border-zinc-100 dark:border-zinc-800">
                                <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1 block">Опекун</label>
                                <div className="flex items-center gap-2 text-zinc-700 dark:text-zinc-300">
                                    <Shield className="w-4 h-4 text-zinc-400" />
                                    {loading ? 'Загрузка...' : creatorName || 'Без опекуна'}
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="p-3 bg-zinc-50 dark:bg-zinc-900/50 rounded-lg border border-zinc-100 dark:border-zinc-800">
                                    <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1 block">Телефон</label>
                                    <div className="flex items-center gap-2 text-zinc-700 dark:text-zinc-300">
                                        <Phone className="w-4 h-4 text-zinc-400" />
                                        {worker.phone_number || '-'}
                                    </div>
                                </div>
                                <div className="p-3 bg-zinc-50 dark:bg-zinc-900/50 rounded-lg border border-zinc-100 dark:border-zinc-800">
                                    <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1 block">Telegram</label>
                                    <div className="flex items-center gap-2 text-zinc-700 dark:text-zinc-300 truncate">
                                        <MessageCircle className="w-4 h-4 text-zinc-400" />
                                        {worker.telegram_username ? (
                                            <a href={`https://t.me/${worker.telegram_username}`} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline truncate">
                                                @{worker.telegram_username}
                                            </a>
                                        ) : '-'}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Assigned Objects */}
                        <div>
                            <h5 className="text-sm font-semibold text-zinc-900 dark:text-white mb-3 flex items-center gap-2">
                                <MapPin className="w-4 h-4 text-zinc-500" />
                                Закрепленные объекты ({loading ? '...' : assignedObjects.length})
                            </h5>

                            {loading ? (
                                <div className="h-20 flex items-center justify-center text-zinc-400 text-sm">
                                    Загрузка...
                                </div>
                            ) : assignedObjects.length > 0 ? (
                                <div className="space-y-2">
                                    {assignedObjects.map((obj) => (
                                        <div key={obj.id} className="p-3 bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors">
                                            <div className="font-medium text-zinc-900 dark:text-white">{obj.name}</div>
                                            <div className="text-xs text-zinc-500 mt-0.5">{obj.address}</div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-center py-6 bg-zinc-50 dark:bg-zinc-900/30 rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800 text-zinc-500 text-sm">
                                    Нет закрепленных объектов
                                </div>
                            )}
                        </div>

                        {/* Points History */}
                        <div>
                            <button
                                onClick={() => setShowPointsHistory(!showPointsHistory)}
                                className="flex items-center gap-2 text-sm font-semibold text-zinc-900 dark:text-white hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
                            >
                                <TrendingUp className="w-4 h-4 text-zinc-500" />
                                История начислений
                                <ChevronDown className={`w-4 h-4 text-zinc-400 transition-transform ${showPointsHistory ? 'rotate-180' : ''}`} />
                            </button>

                            {showPointsHistory && (
                                <div className="mt-3 space-y-2">
                                    {pointsLog.length > 0 ? (
                                        pointsLog.map(entry => (
                                            <div key={entry.id} className="flex items-center justify-between p-3 bg-zinc-50 dark:bg-zinc-900/50 rounded-lg border border-zinc-100 dark:border-zinc-800">
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm text-zinc-700 dark:text-zinc-300 truncate">
                                                        {entry.reason || 'Контроль качества'}
                                                    </p>
                                                    <p className="text-xs text-zinc-400 mt-0.5">
                                                        {new Date(entry.created_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' })}
                                                    </p>
                                                </div>
                                                <span className={`text-sm font-bold ml-3 shrink-0 ${entry.points_change > 0
                                                        ? 'text-green-600 dark:text-green-400'
                                                        : 'text-red-600 dark:text-red-400'
                                                    }`}>
                                                    {entry.points_change > 0 ? `+${entry.points_change}` : entry.points_change}
                                                </span>
                                            </div>
                                        ))
                                    ) : (
                                        <div className="text-center py-4 text-zinc-400 text-sm">
                                            Нет записей
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="mt-8 pt-4 border-t border-zinc-100 dark:border-zinc-800 flex justify-end">
                        <button onClick={onClose} className="btn-secondary w-full sm:w-auto">
                            Закрыть
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

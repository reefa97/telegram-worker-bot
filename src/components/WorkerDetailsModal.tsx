import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { X, Calendar, MapPin, Phone, User, Shield, MessageCircle, Coins, ChevronDown, TrendingUp, Plus, Minus, Save, Unlink } from 'lucide-react';

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
    deleted_at?: string | null;
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
    const { adminUser } = useAuth();
    const [pointsLog, setPointsLog] = useState<PointsLogEntry[]>([]);
    const [showPointsHistory, setShowPointsHistory] = useState(false);
    const [showAdjustPoints, setShowAdjustPoints] = useState(false);
    const [adjustMode, setAdjustMode] = useState<'add' | 'deduct'>('add');
    const [pointsChange, setPointsChange] = useState<number | ''>('');
    const [adjustReason, setAdjustReason] = useState('');
    const [isAdjusting, setIsAdjusting] = useState(false);
    const [unlinkingObjectId, setUnlinkingObjectId] = useState<string | null>(null);

    const isDeleted = !!worker.deleted_at;

    const handleUnlinkObject = async (objectId: string) => {
        if (!confirm('Отвязать объект от работника?')) return;
        setUnlinkingObjectId(objectId);
        try {
            const { error } = await supabase
                .from('worker_objects')
                .delete()
                .eq('worker_id', worker.id)
                .eq('object_id', objectId);
            if (error) throw error;
            setAssignedObjects(prev => prev.filter(o => o.id !== objectId));
        } catch (err: any) {
            console.error('Error unlinking object:', err);
            alert(`Ошибка: ${err.message}`);
        } finally {
            setUnlinkingObjectId(null);
        }
    };

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
    }, [worker.id, isAdjusting]); // Added isAdjusting to re-fetch after points update

    const handleAdjustPoints = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!pointsChange || typeof pointsChange !== 'number' || pointsChange <= 0) {
            alert('Введите корректное число баллов');
            return;
        }
        if (!adjustReason.trim()) {
            alert('Укажите причину');
            return;
        }

        setIsAdjusting(true);
        const changeValue = adjustMode === 'add' ? pointsChange : -pointsChange;

        try {
            const { error } = await supabase.rpc('manual_adjust_points', {
                p_worker_id: worker.id,
                p_points_change: changeValue,
                p_reason: adjustReason.trim()
            });

            if (error) throw error;

            // Re-fetch immediately by toggling state
            setPointsChange('');
            setAdjustReason('');
            setShowAdjustPoints(false);

            // Manually update the worker object in the parent component ideally, 
            // but for now relying on the fetchDetails hook refiring.
            if (worker) {
                worker.total_points = (worker.total_points || 0) + changeValue;
            }

        } catch (error: any) {
            console.error('Error adjusting points:', error);
            alert(`Ошибка при изменении баллов: ${error.message}`);
        } finally {
            setIsAdjusting(false);
        }
    };

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleDateString('ru-RU', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    return createPortal(
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content sm:max-w-lg" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h3 className="text-xl font-bold text-main flex items-center gap-2">
                        <User className="w-5 h-5 text-muted" />
                        Карточка работника
                    </h3>
                    <button onClick={onClose} className="btn-icon">
                        <X className="w-6 h-6" />
                    </button>
                </div>
                <div className="modal-body">

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
                                        <div key={obj.id} className="p-3 bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors flex items-center justify-between gap-2">
                                            <div className="min-w-0">
                                                <div className="font-medium text-zinc-900 dark:text-white">{obj.name}</div>
                                                <div className="text-xs text-zinc-500 mt-0.5">{obj.address}</div>
                                            </div>
                                            {isDeleted && (
                                                <button
                                                    onClick={() => handleUnlinkObject(obj.id)}
                                                    disabled={unlinkingObjectId === obj.id}
                                                    className="shrink-0 p-1.5 rounded-lg text-red-500 hover:bg-danger/10 transition-colors disabled:opacity-50"
                                                    title="Отвязать объект"
                                                >
                                                    <Unlink className="w-4 h-4" />
                                                </button>
                                            )}
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
                                className="flex items-center gap-2 text-sm font-semibold text-zinc-900 dark:text-white hover:text-primary dark:hover:text-primary transition-colors"
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

                        {/* Adjust Points Form (Super Admin Only) */}
                        {adminUser?.role === 'super_admin' && (
                            <div className="pt-2">
                                {!showAdjustPoints ? (
                                    <button
                                        onClick={() => setShowAdjustPoints(true)}
                                        className="btn-secondary w-full text-sm py-2 flex items-center justify-center gap-2"
                                    >
                                        <Coins className="w-4 h-4" />
                                        Начислить / списать баллы
                                    </button>
                                ) : (
                                    <form onSubmit={handleAdjustPoints} className="p-4 bg-zinc-50 dark:bg-zinc-900/50 rounded-xl border border-zinc-200 dark:border-zinc-800 space-y-3">
                                        <h5 className="text-sm font-semibold text-zinc-900 dark:text-white mb-2 flex items-center justify-between">
                                            Изменение баллов
                                            <button type="button" onClick={() => setShowAdjustPoints(false)} className="text-zinc-400 hover:text-zinc-600">
                                                <X className="w-4 h-4" />
                                            </button>
                                        </h5>

                                        <div className="flex gap-2">
                                            <button
                                                type="button"
                                                onClick={() => setAdjustMode('add')}
                                                className={`flex-1 py-1.5 rounded-lg text-sm font-medium flex items-center justify-center gap-1 transition-colors ${adjustMode === 'add'
                                                    ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border border-green-200 dark:border-green-800'
                                                    : 'bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700'
                                                    }`}
                                            >
                                                <Plus className="w-3.5 h-3.5" /> Начислить
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setAdjustMode('deduct')}
                                                className={`flex-1 py-1.5 rounded-lg text-sm font-medium flex items-center justify-center gap-1 transition-colors ${adjustMode === 'deduct'
                                                    ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border border-red-200 dark:border-red-800'
                                                    : 'bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700'
                                                    }`}
                                            >
                                                <Minus className="w-3.5 h-3.5" /> Списать
                                            </button>
                                        </div>

                                        <div className="grid grid-cols-3 gap-3">
                                            <div className="col-span-1">
                                                <label className="block text-xs font-medium text-zinc-500 mb-1">Количество</label>
                                                <input
                                                    type="number"
                                                    min="1"
                                                    value={pointsChange}
                                                    onChange={(e) => setPointsChange(e.target.value ? Number(e.target.value) : '')}
                                                    className="input py-1.5 px-3 text-sm"
                                                    placeholder="10"
                                                    required
                                                />
                                            </div>
                                            <div className="col-span-2">
                                                <label className="block text-xs font-medium text-zinc-500 mb-1">Причина</label>
                                                <input
                                                    type="text"
                                                    value={adjustReason}
                                                    onChange={(e) => setAdjustReason(e.target.value)}
                                                    className="input py-1.5 px-3 text-sm"
                                                    placeholder={adjustMode === 'add' ? 'Бонус за отличную работу...' : 'Штраф за опоздание...'}
                                                    required
                                                />
                                            </div>
                                        </div>

                                        <button
                                            type="submit"
                                            disabled={isAdjusting}
                                            className={`w-full py-2 rounded-lg text-sm font-medium flex justify-center items-center gap-2 text-white transition-colors ${adjustMode === 'add' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'
                                                }`}
                                        >
                                            {isAdjusting ? 'Сохранение...' : (
                                                <>
                                                    <Save className="w-4 h-4" />
                                                    {adjustMode === 'add' ? 'Начислить баллы' : 'Списать баллы'}
                                                </>
                                            )}
                                        </button>
                                    </form>
                                )}
                            </div>
                        )}
                    </div>

                </div>
                <div className="modal-footer">
                    <button onClick={onClose} className="btn-secondary flex-1 sm:flex-none">
                        Закрыть
                    </button>
                </div>
            </div>
        </div>
    , document.body);
}

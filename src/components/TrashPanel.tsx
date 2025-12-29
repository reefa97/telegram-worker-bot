import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Trash2, RefreshCw, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

interface TrashedItem {
    id: string;
    name: string;
    info: string;
    deleted_at: string;
}

type ItemType = 'objects' | 'workers' | 'tasks';

export default function TrashPanel() {
    const { adminUser } = useAuth();
    const [activeTab, setActiveTab] = useState<ItemType>('objects');
    const [items, setItems] = useState<TrashedItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [processingId, setProcessingId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const loadItems = async () => {
        setLoading(true);
        setError(null);
        try {
            const { data, error } = await supabase.rpc('get_trashed_items', {
                item_type: activeTab
            });

            if (error) throw error;
            setItems(data || []);
        } catch (err: any) {
            console.error('Error loading trash:', err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadItems();
    }, [activeTab]);

    const handleRestore = async (id: string) => {
        if (!confirm('Восстановить этот элемент?')) return;

        setProcessingId(id);
        try {
            const { error } = await supabase.rpc('restore_from_trash', {
                item_type: activeTab,
                item_id: id
            });

            if (error) throw error;

            // Remove from list locally
            setItems(items.filter(item => item.id !== id));
        } catch (err: any) {
            console.error('Error restoring item:', err);
            alert('Ошибка при восстановлении: ' + err.message);
        } finally {
            setProcessingId(null);
        }
    };

    const handlePermanentDelete = async (id: string) => {
        if (!confirm('ВНИМАНИЕ: Это действие нельзя отменить! Удалить навсегда?')) return;

        setProcessingId(id);
        try {
            const { error } = await supabase.rpc('permanently_delete_item', {
                item_type: activeTab,
                item_id: id
            });

            if (error) throw error;

            // Remove from list locally
            setItems(items.filter(item => item.id !== id));
        } catch (err: any) {
            console.error('Error deleting item:', err);
            alert('Ошибка при удалении: ' + err.message);
        } finally {
            setProcessingId(null);
        }
    };

    if (adminUser?.role !== 'super_admin') {
        return <div className="text-white p-4">Доступ запрещен</div>;
    }

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                    <Trash2 className="w-6 h-6" />
                    Корзина
                </h2>
                <button
                    onClick={loadItems}
                    disabled={loading}
                    className="p-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-white transition-colors"
                >
                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                </button>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 border-b border-gray-700 pb-1">
                <button
                    onClick={() => setActiveTab('objects')}
                    className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${activeTab === 'objects'
                            ? 'bg-gray-800 text-primary-400 border-b-2 border-primary-500'
                            : 'text-gray-400 hover:text-white'
                        }`}
                >
                    Объекты
                </button>
                <button
                    onClick={() => setActiveTab('workers')}
                    className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${activeTab === 'workers'
                            ? 'bg-gray-800 text-primary-400 border-b-2 border-primary-500'
                            : 'text-gray-400 hover:text-white'
                        }`}
                >
                    Работники
                </button>
                <button
                    onClick={() => setActiveTab('tasks')}
                    className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${activeTab === 'tasks'
                            ? 'bg-gray-800 text-primary-400 border-b-2 border-primary-500'
                            : 'text-gray-400 hover:text-white'
                        }`}
                >
                    Задачи
                </button>
            </div>

            {/* Content */}
            {error && (
                <div className="bg-red-500/10 border border-red-500 text-red-400 p-4 rounded-lg flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5" />
                    {error}
                </div>
            )}

            <div className="card overflow-hidden">
                <table className="w-full">
                    <thead>
                        <tr className="border-b border-gray-700 bg-gray-800/50">
                            <th className="text-left py-3 px-4 text-gray-400 font-medium w-1/3">Название</th>
                            <th className="text-left py-3 px-4 text-gray-400 font-medium">Инфо</th>
                            <th className="text-left py-3 px-4 text-gray-400 font-medium">Дата удаления</th>
                            <th className="text-right py-3 px-4 text-gray-400 font-medium">Действия</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-700">
                        {loading && items.length === 0 ? (
                            <tr>
                                <td colSpan={4} className="py-8 text-center text-gray-500">
                                    Загрузка...
                                </td>
                            </tr>
                        ) : items.length === 0 ? (
                            <tr>
                                <td colSpan={4} className="py-8 text-center text-gray-500">
                                    Корзина пуста
                                </td>
                            </tr>
                        ) : (
                            items.map((item) => (
                                <tr key={item.id} className="hover:bg-gray-700/30 transition-colors">
                                    <td className="py-3 px-4 text-white font-medium">
                                        {item.name}
                                    </td>
                                    <td className="py-3 px-4 text-gray-400 text-sm">
                                        {item.info}
                                    </td>
                                    <td className="py-3 px-4 text-gray-400 text-sm">
                                        {new Date(item.deleted_at).toLocaleString('ru-RU')}
                                    </td>
                                    <td className="py-3 px-4 text-right">
                                        <div className="flex items-center justify-end gap-2">
                                            <button
                                                onClick={() => handleRestore(item.id)}
                                                disabled={!!processingId}
                                                className="p-2 bg-green-500/10 hover:bg-green-500/20 text-green-400 rounded transition-colors disabled:opacity-50"
                                                title="Восстановить"
                                            >
                                                {processingId === item.id ? (
                                                    <RefreshCw className="w-4 h-4 animate-spin" />
                                                ) : (
                                                    <CheckCircle className="w-4 h-4" />
                                                )}
                                            </button>
                                            <button
                                                onClick={() => handlePermanentDelete(item.id)}
                                                disabled={!!processingId}
                                                className="p-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded transition-colors disabled:opacity-50"
                                                title="Удалить навсегда"
                                            >
                                                {processingId === item.id ? (
                                                    <RefreshCw className="w-4 h-4 animate-spin" />
                                                ) : (
                                                    <XCircle className="w-4 h-4" />
                                                )}
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

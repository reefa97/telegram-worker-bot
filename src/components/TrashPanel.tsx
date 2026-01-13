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
        return <div className="p-8 text-center text-gray-500">Доступ запрещен</div>;
    }

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                    <Trash2 className="w-6 h-6" />
                    Корзина
                </h2>
                <button
                    onClick={loadItems}
                    disabled={loading}
                    className="p-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg text-gray-600 dark:text-gray-300 transition-colors"
                >
                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                </button>
            </div>

            {/* Tabs */}
            <div className="flex p-1 bg-gray-100 dark:bg-gray-800/50 rounded-xl w-fit">
                <button
                    onClick={() => setActiveTab('objects')}
                    className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${activeTab === 'objects'
                            ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                            : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                        }`}
                >
                    Объекты
                </button>
                <button
                    onClick={() => setActiveTab('workers')}
                    className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${activeTab === 'workers'
                            ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                            : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                        }`}
                >
                    Работники
                </button>
                <button
                    onClick={() => setActiveTab('tasks')}
                    className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${activeTab === 'tasks'
                            ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                            : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                        }`}
                >
                    Задачи
                </button>
            </div>

            {/* Content */}
            {error && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 p-4 rounded-xl flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5" />
                    {error}
                </div>
            )}

            <div className="card overflow-hidden p-0">
                <div className="overflow-x-auto">
                    <table className="table w-full">
                        <thead>
                            <tr>
                                <th className="w-1/3">Название</th>
                                <th>Инфо</th>
                                <th>Дата удаления</th>
                                <th className="text-right">Действия</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                            {loading && items.length === 0 ? (
                                <tr>
                                    <td colSpan={4} className="py-12 text-center">
                                        <div className="flex justify-center">
                                            <div className="w-8 h-8 border-4 border-gray-200 border-t-primary-500 rounded-full animate-spin"></div>
                                        </div>
                                    </td>
                                </tr>
                            ) : items.length === 0 ? (
                                <tr>
                                    <td colSpan={4} className="py-12 text-center text-gray-500 dark:text-gray-400">
                                        <Trash2 className="w-12 h-12 mx-auto mb-3 opacity-20" />
                                        Корзина пуста
                                    </td>
                                </tr>
                            ) : (
                                items.map((item) => (
                                    <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                                        <td className="font-medium text-gray-900 dark:text-white">
                                            {item.name}
                                        </td>
                                        <td className="text-gray-500 dark:text-gray-400 text-sm">
                                            {item.info}
                                        </td>
                                        <td className="text-gray-500 dark:text-gray-400 text-sm">
                                            {new Date(item.deleted_at).toLocaleString('ru-RU')}
                                        </td>
                                        <td>
                                            <div className="flex items-center justify-end gap-2">
                                                <button
                                                    onClick={() => handleRestore(item.id)}
                                                    disabled={!!processingId}
                                                    className="p-1.5 bg-green-50 dark:bg-green-900/20 hover:bg-green-100 dark:hover:bg-green-900/30 text-green-600 dark:text-green-400 rounded-lg transition-colors disabled:opacity-50"
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
                                                    className="p-1.5 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400 rounded-lg transition-colors disabled:opacity-50"
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
        </div>
    );
}

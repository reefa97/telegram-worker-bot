import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { AlertCircle, CheckCircle, AlertTriangle, RefreshCw } from 'lucide-react';

interface SystemLog {
    id: string;
    created_at: string;
    level: 'info' | 'warn' | 'error';
    category: string;
    message: string;
    metadata: any;
    worker_id?: string;
    object_id?: string;
    admin_id?: string;
}

export default function LogsPanel() {
    const [logs, setLogs] = useState<SystemLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<'all' | 'info' | 'warn' | 'error'>('all');
    const [categoryFilter, setCategoryFilter] = useState('all');
    const [autoRefresh, setAutoRefresh] = useState(true);
    const [expandedRow, setExpandedRow] = useState<string | null>(null);

    const loadLogs = async () => {
        setLoading(true);
        let query = supabase
            .from('system_logs')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(100);

        if (filter !== 'all') {
            query = query.eq('level', filter);
        }

        if (categoryFilter !== 'all') {
            query = query.eq('category', categoryFilter);
        }

        const { data, error } = await query;

        if (data) setLogs(data);
        if (error) console.error('Error loading logs:', error);
        setLoading(false);
    };

    useEffect(() => {
        loadLogs();
    }, [filter, categoryFilter]);

    useEffect(() => {
        if (autoRefresh) {
            const interval = setInterval(loadLogs, 5000);
            return () => clearInterval(interval);
        }
    }, [autoRefresh, filter, categoryFilter]);

    const getLevelIcon = (level: string) => {
        switch (level) {
            case 'info':
                return <CheckCircle className="w-4 h-4 text-green-400" />;
            case 'warn':
                return <AlertTriangle className="w-4 h-4 text-yellow-400" />;
            case 'error':
                return <AlertCircle className="w-4 h-4 text-red-400" />;
            default:
                return null;
        }
    };

    const getLevelColor = (level: string) => {
        switch (level) {
            case 'info':
                return 'text-green-400 bg-green-500/10';
            case 'warn':
                return 'text-yellow-400 bg-yellow-500/10';
            case 'error':
                return 'text-red-400 bg-red-500/10';
            default:
                return 'text-gray-400 bg-gray-500/10';
        }
    };

    const formatTime = (timestamp: string) => {
        const date = new Date(timestamp);
        return date.toLocaleString('ru-RU', {
            day: '2-digit',
            month: '2-digit',
            year: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    };

    if (loading && logs.length === 0) {
        return <div className="text-white">Загрузка логов...</div>;
    }

    return (
        <div>
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-white">Системные логи</h2>
                <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={autoRefresh}
                            onChange={(e) => setAutoRefresh(e.target.checked)}
                            className="rounded border-gray-600 bg-gray-700 text-blue-500"
                        />
                        Авто-обновление (5с)
                    </label>
                    <button
                        onClick={loadLogs}
                        className="p-2 bg-blue-600 hover:bg-blue-700 rounded transition-colors"
                        disabled={loading}
                    >
                        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                </div>
            </div>

            {/* Filters */}
            <div className="card mb-4">
                <div className="flex gap-4 flex-wrap">
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">Уровень:</label>
                        <select
                            value={filter}
                            onChange={(e) => setFilter(e.target.value as any)}
                            className="input"
                        >
                            <option value="all">Все</option>
                            <option value="info">Info</option>
                            <option value="warn">Warn</option>
                            <option value="error">Error</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">Категория:</label>
                        <select
                            value={categoryFilter}
                            onChange={(e) => setCategoryFilter(e.target.value)}
                            className="input"
                        >
                            <option value="all">Все</option>
                            <option value="notification">Уведомления</option>
                            <option value="shift">Смены</option>
                            <option value="geofence">Геозона</option>
                            <option value="system">Система</option>
                        </select>
                    </div>
                </div>
            </div>

            {/* Logs Table */}
            <div className="card overflow-x-auto">
                <table className="w-full">
                    <thead>
                        <tr className="border-b border-gray-700">
                            <th className="text-left py-3 px-4 text-sm font-medium text-gray-400">Время</th>
                            <th className="text-left py-3 px-4 text-sm font-medium text-gray-400">Уровень</th>
                            <th className="text-left py-3 px-4 text-sm font-medium text-gray-400">Категория</th>
                            <th className="text-left py-3 px-4 text-sm font-medium text-gray-400">Сообщение</th>
                        </tr>
                    </thead>
                    <tbody>
                        {logs.length === 0 ? (
                            <tr>
                                <td colSpan={4} className="text-center py-12 text-gray-500">
                                    Логов не найдено
                                </td>
                            </tr>
                        ) : (
                            logs.map((log) => (
                                <>
                                    <tr
                                        key={log.id}
                                        onClick={() => setExpandedRow(expandedRow === log.id ? null : log.id)}
                                        className="border-b border-gray-800 hover:bg-gray-800/50 cursor-pointer transition-colors"
                                    >
                                        <td className="py-3 px-4 text-sm text-gray-400">
                                            {formatTime(log.created_at)}
                                        </td>
                                        <td className="py-3 px-4">
                                            <div className={`inline-flex items-center gap-2 px-2 py-1 rounded text-xs font-medium ${getLevelColor(log.level)}`}>
                                                {getLevelIcon(log.level)}
                                                {log.level.toUpperCase()}
                                            </div>
                                        </td>
                                        <td className="py-3 px-4 text-sm text-gray-300">
                                            <span className="px-2 py-1 bg-gray-700 rounded text-xs">
                                                {log.category}
                                            </span>
                                        </td>
                                        <td className="py-3 px-4 text-sm text-white">
                                            {log.message}
                                        </td>
                                    </tr>
                                    {expandedRow === log.id && log.metadata && (
                                        <tr key={`${log.id}-expanded`} className="bg-gray-900">
                                            <td colSpan={4} className="py-3 px-4">
                                                <div className="text-xs text-gray-400">
                                                    <div className="font-semibold mb-2">Метаданные:</div>
                                                    <pre className="bg-black/30 p-3 rounded overflow-x-auto">
                                                        {JSON.stringify(log.metadata, null, 2)}
                                                    </pre>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

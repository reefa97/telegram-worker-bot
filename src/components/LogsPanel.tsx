import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { AlertCircle, CheckCircle, AlertTriangle, RefreshCw, Filter, Clock, Tag, MessageSquare, Terminal } from 'lucide-react';

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
                return <CheckCircle className="w-4 h-4 text-green-500 dark:text-green-400" />;
            case 'warn':
                return <AlertTriangle className="w-4 h-4 text-yellow-500 dark:text-yellow-400" />;
            case 'error':
                return <AlertCircle className="w-4 h-4 text-red-500 dark:text-red-400" />;
            default:
                return null;
        }
    };

    const getLevelColor = (level: string) => {
        switch (level) {
            case 'info':
                return 'text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-800';
            case 'warn':
                return 'text-yellow-700 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/30 border-yellow-200 dark:border-yellow-800';
            case 'error':
                return 'text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-800';
            default:
                return 'text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700';
        }
    };

    const formatTime = (timestamp: string) => {
        const date = new Date(timestamp);
        return date.toLocaleString('ru-RU', {
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    };

    if (loading && logs.length === 0) {
        return (
            <div className="flex justify-center items-center h-64">
                <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center flex-wrap gap-4">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Системные логи</h2>

                <div className="flex items-center gap-3">
                    <button
                        onClick={async () => {
                            const { error } = await supabase.from('system_logs').insert({
                                level: 'info',
                                category: 'system',
                                message: 'Debug: Test log from UI button',
                                metadata: { test: true },
                                admin_id: (await supabase.auth.getUser()).data.user?.id
                            });

                            if (error) {
                                alert(`Ошибка записи лога: ${error.message}\n${error.details || ''}`);
                            } else {
                                alert('Тестовый лог успешно создан! Обновите таблицу.');
                                loadLogs();
                            }
                        }}
                        className="px-3 py-1.5 text-xs bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 rounded border border-gray-300 dark:border-gray-600 transition-colors"
                    >
                        Тест записи
                    </button>

                    <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 cursor-pointer bg-white dark:bg-gray-800 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                        <input
                            type="checkbox"
                            checked={autoRefresh}
                            onChange={(e) => setAutoRefresh(e.target.checked)}
                            className="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500"
                        />
                        Авто-обновление
                    </label>
                    <button
                        onClick={loadLogs}
                        className="p-2 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400 rounded-lg border border-gray-200 dark:border-gray-700 transition-colors shadow-sm"
                        disabled={loading}
                        title="Обновить"
                    >
                        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                </div>
            </div>

            {/* Filters */}
            <div className="card p-4">
                <div className="flex flex-wrap gap-4 items-end">
                    <div className="w-full sm:w-auto">
                        <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wide">Уровень</label>
                        <div className="relative">
                            <select
                                value={filter}
                                onChange={(e) => setFilter(e.target.value as any)}
                                className="input py-2 pl-9 pr-8 w-full sm:w-40 appearance-none bg-no-repeat"
                            >
                                <option value="all">Все уровни</option>
                                <option value="info">Info</option>
                                <option value="warn">Warn</option>
                                <option value="error">Error</option>
                            </select>
                            <Filter className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                        </div>
                    </div>
                    <div className="w-full sm:w-auto">
                        <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wide">Категория</label>
                        <div className="relative">
                            <select
                                value={categoryFilter}
                                onChange={(e) => setCategoryFilter(e.target.value)}
                                className="input py-2 pl-9 pr-8 w-full sm:w-48 appearance-none"
                            >
                                <option value="all">Все категории</option>
                                <option value="notification">Уведомления</option>
                                <option value="shift">Смены</option>
                                <option value="geofence">Геозона</option>
                                <option value="system">Система</option>
                                <option value="bulk_message">Массовая рассылка</option>
                            </select>
                            <Tag className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                        </div>
                    </div>
                </div>
            </div>

            {/* Logs Table */}
            <div className="card p-0 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="table w-full">
                        <thead>
                            <tr>
                                <th className="w-48">
                                    <div className="flex items-center gap-2">
                                        <Clock className="w-4 h-4" />
                                        Время
                                    </div>
                                </th>
                                <th className="w-32">Уровень</th>
                                <th className="w-40">
                                    <div className="flex items-center gap-2">
                                        <Tag className="w-4 h-4" />
                                        Категория
                                    </div>
                                </th>
                                <th>
                                    <div className="flex items-center gap-2">
                                        <MessageSquare className="w-4 h-4" />
                                        Сообщение
                                    </div>
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                            {logs.length === 0 ? (
                                <tr>
                                    <td colSpan={4} className="text-center py-12 text-gray-500 dark:text-gray-400">
                                        <Terminal className="w-12 h-12 mx-auto mb-4 opacity-20" />
                                        <p>Логов не найдено</p>
                                    </td>
                                </tr>
                            ) : (
                                logs.map((log) => (
                                    <>
                                        <tr
                                            key={log.id}
                                            onClick={() => setExpandedRow(expandedRow === log.id ? null : log.id)}
                                            className="hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer transition-colors"
                                        >
                                            <td className="text-gray-500 dark:text-gray-400 font-mono text-sm whitespace-nowrap">
                                                {formatTime(log.created_at)}
                                            </td>
                                            <td>
                                                <div className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${getLevelColor(log.level)}`}>
                                                    {getLevelIcon(log.level)}
                                                    {log.level.toUpperCase()}
                                                </div>
                                            </td>
                                            <td>
                                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700">
                                                    {log.category}
                                                </span>
                                            </td>
                                            <td className="text-gray-900 dark:text-white font-medium text-sm">
                                                <div className="truncate max-w-lg" title={log.message}>
                                                    {log.message}
                                                </div>
                                            </td>
                                        </tr>
                                        {expandedRow === log.id && (
                                            <tr key={`${log.id}-expanded`} className="bg-gray-50/50 dark:bg-gray-800/30">
                                                <td colSpan={4} className="p-4 relative">
                                                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary-500"></div>
                                                    <div className="pl-2">
                                                        <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">Метаданные события</div>
                                                        {log.metadata ? (
                                                            <pre className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 p-4 rounded-lg overflow-x-auto font-mono text-xs text-gray-700 dark:text-gray-300 shadow-sm">
                                                                {JSON.stringify(log.metadata, null, 2)}
                                                            </pre>
                                                        ) : (
                                                            <div className="text-sm text-gray-400 italic">Нет метаданных</div>
                                                        )}

                                                        <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
                                                            {log.worker_id && (
                                                                <div className="text-xs">
                                                                    <span className="text-gray-500 dark:text-gray-400">Worker ID:</span>
                                                                    <span className="font-mono ml-2 text-gray-900 dark:text-gray-200">{log.worker_id}</span>
                                                                </div>
                                                            )}
                                                            {log.object_id && (
                                                                <div className="text-xs">
                                                                    <span className="text-gray-500 dark:text-gray-400">Object ID:</span>
                                                                    <span className="font-mono ml-2 text-gray-900 dark:text-gray-200">{log.object_id}</span>
                                                                </div>
                                                            )}
                                                            {log.admin_id && (
                                                                <div className="text-xs">
                                                                    <span className="text-gray-500 dark:text-gray-400">Admin ID:</span>
                                                                    <span className="font-mono ml-2 text-gray-900 dark:text-gray-200">{log.admin_id}</span>
                                                                </div>
                                                            )}
                                                        </div>
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
        </div>
    );
}

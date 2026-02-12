import { useState, useEffect } from 'react';
import { Search, Play, Square, Save, Loader2, Copy, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

interface SearchJob {
    id: string;
    query: string;
    status: 'pending' | 'running' | 'completed' | 'stopped' | 'failed';
    total_emails_found: number;
    created_at: string;
    stopped_at?: string;
}

interface SearchResult {
    id: string;
    email: string;
    source_url: string;
    source_type?: string;
    created_at: string;
}

export default function EmailSearchPanel() {
    const { user } = useAuth();
    const [serperToken, setSerperToken] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [jobs, setJobs] = useState<SearchJob[]>([]);
    const [results, setResults] = useState<SearchResult[]>([]);
    const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);


    // Fetch initial data
    useEffect(() => {
        if (user) {
            fetchToken();
            fetchJobs();
        }
    }, [user]);

    // Real-time subscription for jobs
    useEffect(() => {
        const jobsChannel = supabase
            .channel('email_search_jobs_changes')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'email_search_jobs', filter: `admin_id=eq.${user?.id}` },
                () => fetchJobs()
            )
            .subscribe();

        return () => {
            supabase.removeChannel(jobsChannel);
        };
    }, [user, selectedJobId]);

    const fetchToken = async () => {
        try {
            const { data } = await supabase
                .from('admin_users')
                .select('serper_token')
                .eq('id', user?.id)
                .single();

            if (data?.serper_token) {
                setSerperToken(data.serper_token);
            }
        } catch (err) {
            console.error('Error fetching token:', err);
        } finally {

        }
    };

    const saveToken = async () => {
        try {
            setLoading(true);
            const { error } = await supabase
                .from('admin_users')
                .update({ serper_token: serperToken })
                .eq('id', user?.id);

            if (error) alert('Ошибка при сохранении токена');
            else alert('Токен сохранен!');
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const fetchJobs = async () => {
        const { data } = await supabase
            .from('email_search_jobs')
            .select('*')
            .eq('admin_id', user?.id)
            .order('created_at', { ascending: false });

        if (data) setJobs(data);
    };

    const fetchResults = async (jobId: string) => {
        setSelectedJobId(jobId);
        // Fetch results
        const { data: resData } = await supabase
            .from('email_search_results')
            .select('*')
            .eq('job_id', jobId)
            .order('created_at', { ascending: true });

        if (resData) setResults(resData);
    };

    const deleteJob = async (jobId: string) => {
        if (!confirm('Вы уверены, что хотите удалить эту историю поиска?')) return;

        // Optimistic update
        const previousJobs = [...jobs];
        const previousResults = [...results];

        setJobs(jobs.filter(job => job.id !== jobId));

        if (selectedJobId === jobId) {
            setSelectedJobId(null);
            setResults([]);
        }

        try {
            // Delete results first (safe fallback if no cascade)
            await supabase
                .from('email_search_results')
                .delete()
                .eq('job_id', jobId);

            // Then delete job
            const { error } = await supabase
                .from('email_search_jobs')
                .delete()
                .eq('id', jobId);

            if (error) throw error;
        } catch (err) {
            console.error('Error deleting job:', err);
            alert('Ошибка при удалении истории');
            // Revert optimistic update
            setJobs(previousJobs);
            if (selectedJobId === jobId) {
                setSelectedJobId(jobId);
                setResults(previousResults);
            }
        }
    };

    const startSearch = async () => {
        if (!searchQuery.trim()) return;
        if (!serperToken) return alert('Пожалуйста, сначала сохраните ваш токен Serper.');

        try {
            setLoading(true);

            // 1. Create Job
            const { error } = await supabase
                .from('email_search_jobs')
                .insert({
                    admin_id: user?.id,
                    query: searchQuery,
                    status: 'pending'
                })
                .select()
                .single();

            if (error) throw error;

            // 2. Invoke Worker - REMOVED (Python worker polling)
            // const { error: invokeError } = await supabase.functions.invoke('email-search-worker', { ... });

            setSearchQuery('');
            await fetchJobs(); // Refresh jobs list immediately

            setSearchQuery('');
            await fetchJobs(); // Refresh jobs list immediately
        } catch (err: any) {
            console.error('Search failed:', err);
            // If job was created but invocation failed, mark it as failed
            // (We can't easily get the job ID here if job creation succeeded but variable is lost scope-wise in try block structure,
            // but usually we'd want to handle this better. For now, alert detail.)
            alert(`Не удалось начать поиск. Проверьте консоль.\nОшибка: ${err.message || JSON.stringify(err)}`);
        } finally {
            setLoading(false);
        }
    };

    const stopSearch = async (jobId: string) => {
        await supabase
            .from('email_search_jobs')
            .update({ status: 'stopped', stopped_at: new Date().toISOString() })
            .eq('id', jobId);
    };

    const handleCopyEmails = () => {
        const emails = results.map(r => r.email).join('\n');
        navigator.clipboard.writeText(emails);
        alert('Email-адреса скопированы в буфер обмена!');
    };

    const downloadCSV = () => {
        if (results.length === 0) return;

        // Add BOM for Excel UTF-8 compatibility
        const BOM = '\uFEFF';
        const headers = ['Email', 'Source URL', 'Found At'];
        const csvContent = [
            headers.join(','),
            ...results.map(r => [
                r.email,
                `"${r.source_url}"`, // Quote URLs to handle commas
                `"${new Date(r.created_at).toLocaleString('ru-RU')}"`
            ].join(','))
        ].join('\n');

        const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `email_search_results_${new Date().toISOString().slice(0, 10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };


    const getStatusLabel = (status: string) => {
        switch (status) {
            case 'pending': return 'В очереди';
            case 'running': return 'В процессе';
            case 'completed': return 'Завершено';
            case 'stopped': return 'Остановлено';
            case 'failed': return 'Ошибка';
            default: return status;
        }
    };

    return (
        <div className="h-full flex flex-col gap-6 p-6">
            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold flex items-center gap-2 text-main">
                    <Search className="w-6 h-6 text-primary" />
                    Поиск Email
                </h2>
            </div>

            {/* Settings & Search Bar */}
            <div className="card p-6 flex flex-col gap-6">
                <div className="flex gap-4 items-end">
                    <div className="flex-1">
                        <label className="block text-sm font-medium text-main mb-2">API Токен Serper</label>
                        <div className="flex gap-2">
                            <input
                                type="password"
                                value={serperToken}
                                onChange={(e) => setSerperToken(e.target.value)}
                                className="input flex-1"
                                placeholder="Введите ваш API ключ Serper.dev"
                            />
                            <button
                                onClick={saveToken}
                                disabled={loading}
                                className="btn-secondary"
                            >
                                <Save size={16} /> Сохранить
                            </button>
                        </div>
                    </div>
                </div>

                <div className="flex gap-2">
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="input flex-1"
                        placeholder="Поисковой запрос (например, 'Стоматологи в Лондоне')"
                        onKeyDown={(e) => e.key === 'Enter' && startSearch()}
                    />
                    <button
                        onClick={startSearch}
                        disabled={loading || !searchQuery}
                        className="btn-primary"
                    >
                        {loading ? <Loader2 className="animate-spin w-4 h-4" /> : <Play size={16} />}
                        Начать поиск
                    </button>
                </div>
            </div>

            <div className="flex gap-6 h-full min-h-0">
                {/* Jobs List */}
                <div className="w-1/3 card overflow-hidden flex flex-col">
                    <div className="p-3 bg-subtle border-b border-border font-medium text-main">История поиска</div>
                    <div className="overflow-y-auto flex-1 p-2 space-y-2">
                        {jobs.map(job => (
                            <div
                                key={job.id}
                                onClick={() => fetchResults(job.id)}
                                className={`p-3 rounded-lg cursor-pointer border transition-colors group relative ${selectedJobId === job.id
                                    ? 'border-primary bg-primary/5 dark:bg-primary/10'
                                    : 'border-border hover:bg-subtle'}`}
                            >
                                <div className="flex justify-between items-start mb-1 pr-6">
                                    <span className="font-medium text-main line-clamp-1">{job.query}</span>
                                    <span className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${job.status === 'completed' ? 'badge-success' :
                                        job.status === 'running' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border border-blue-200 dark:border-blue-800' :
                                            job.status === 'failed' ? 'badge-danger' :
                                                'badge-neutral'
                                        }`}>
                                        {getStatusLabel(job.status)}
                                    </span>
                                </div>
                                <div className="flex justify-between items-center text-sm text-muted">
                                    <span>Найдено: {job.total_emails_found} email</span>
                                    <div className="flex items-center gap-1">
                                        {job.status === 'running' && (
                                            <button
                                                onClick={(e) => { e.stopPropagation(); stopSearch(job.id); }}
                                                className="text-danger hover:text-red-600 p-1"
                                                title="Остановить поиск"
                                            >
                                                <Square size={16} fill="currentColor" />
                                            </button>
                                        )}
                                        <button
                                            onClick={(e) => { e.stopPropagation(); deleteJob(job.id); }}
                                            className="text-zinc-400 hover:text-red-500 p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                                            title="Удалить историю"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                </div>
                                <div className="text-xs text-muted mt-1">
                                    {new Date(job.created_at).toLocaleString('ru-RU')}
                                </div>
                            </div>
                        ))}
                        {jobs.length === 0 && <div className="text-muted text-center mt-10 text-sm">История поиска пуста</div>}
                    </div>
                </div>

                {/* Results List */}
                <div className="w-2/3 flex flex-col gap-6 min-h-0">
                    <div className="card overflow-hidden flex flex-col flex-1">
                        <div className="p-3 bg-subtle border-b border-border font-medium flex justify-between items-center text-main">
                            <span>Результаты {results.length > 0 && `(${results.length})`}</span>
                            {results.length > 0 && (
                                <div className="flex gap-2">
                                    <button
                                        onClick={downloadCSV}
                                        className="btn-secondary h-7 text-xs px-2"
                                        title="Скачать в Excel (CSV)"
                                    >
                                        <Save size={12} className="mr-1" /> Скачать Excel
                                    </button>
                                    <button
                                        onClick={handleCopyEmails}
                                        className="btn-secondary h-7 text-xs px-2"
                                    >
                                        <Copy size={12} className="mr-1" /> Копировать
                                    </button>
                                </div>
                            )}
                        </div>
                        <div className="overflow-y-auto flex-1 p-0">
                            {selectedJobId ? (
                                <table className="table">
                                    <thead className="bg-subtle text-muted sticky top-0">
                                        <tr>
                                            <th>Email</th>
                                            <th>Источник</th>
                                            <th>Тип</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {results.map((res: any) => (
                                            <tr key={res.id} className="hover:bg-subtle transition-colors">
                                                <td className="px-6 py-3 text-main select-all">{res.email}</td>
                                                <td className="px-6 py-3 text-blue-500 hover:underline truncate max-w-xs">
                                                    <a href={res.source_url} target="_blank" rel="noopener noreferrer">
                                                        {res.source_url}
                                                    </a>
                                                </td>
                                                <td className="px-6 py-3">
                                                    <span className={`text-[10px] uppercase px-1.5 py-0.5 rounded font-bold ${res.source_type === 'maps'
                                                        ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'
                                                        : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                                                        }`}>
                                                        {res.source_type === 'maps' ? 'Карты' : 'Поиск'}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                        {results.length === 0 && (
                                            <tr>
                                                <td colSpan={2} className="p-8 text-center text-muted">
                                                    Email не найдены по этому запросу.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            ) : (
                                <div className="flex flex-col items-center justify-center h-full text-muted gap-2">
                                    <Search className="w-8 h-8 opacity-20" />
                                    <p>Выберите задачу поиска для просмотра результатов</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

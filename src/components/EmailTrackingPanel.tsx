import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import {
    Plus, Copy, Check, Eye, Trash2, X, ArrowLeft,
    Mail, Clock, Globe, Monitor, ChevronDown
} from 'lucide-react';

interface EmailTrack {
    id: string;
    object_id: string | null;
    recipient_email: string;
    subject: string;
    created_at: string;
    created_by: string;
    notes: string | null;
    open_count?: number;
    last_opened_at?: string | null;
}

interface EmailOpen {
    id: number;
    track_id: string;
    opened_at: string;
    ip: string | null;
    user_agent: string | null;
}

interface CleaningObjectOption {
    id: string;
    name: string;
}

export default function EmailTrackingPanel() {
    const { adminUser } = useAuth();

    // Data
    const [tracks, setTracks] = useState<EmailTrack[]>([]);
    const [objects, setObjects] = useState<CleaningObjectOption[]>([]);
    const [loading, setLoading] = useState(true);

    // UI
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [viewingTrack, setViewingTrack] = useState<EmailTrack | null>(null);
    const [opens, setOpens] = useState<EmailOpen[]>([]);
    const [opensLoading, setOpensLoading] = useState(false);
    const [copied, setCopied] = useState(false);
    const [createdTrackId, setCreatedTrackId] = useState<string | null>(null);
    const [deleting, setDeleting] = useState<string | null>(null);

    // Form
    const [formData, setFormData] = useState({
        recipient_email: '',
        subject: '',
        object_id: '',
        notes: '',
    });

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';

    const getPixelUrl = (trackId: string) =>
        `${supabaseUrl}/functions/v1/track-pixel/${trackId}`;

    const getImgTag = (trackId: string) =>
        `<img src="${getPixelUrl(trackId)}" width="1" height="1" alt="" style="display:none" />`;

    // Load tracks with open counts
    const loadTracks = useCallback(async () => {
        try {
            setLoading(true);
            const { data: tracksData } = await supabase
                .from('email_tracks')
                .select('*')
                .order('created_at', { ascending: false });

            if (!tracksData) {
                setTracks([]);
                return;
            }

            // Fetch open counts and last opened for each track
            const trackIds = tracksData.map((t: any) => t.id);
            if (trackIds.length === 0) {
                setTracks(tracksData);
                return;
            }

            const { data: opensData } = await supabase
                .from('email_opens')
                .select('track_id, opened_at')
                .in('track_id', trackIds)
                .order('opened_at', { ascending: false });

            // Aggregate opens per track
            const openStats: Record<string, { count: number; last: string | null }> = {};
            for (const open of (opensData || [])) {
                if (!openStats[open.track_id]) {
                    openStats[open.track_id] = { count: 0, last: open.opened_at };
                }
                openStats[open.track_id].count++;
            }

            const enriched = tracksData.map((t: any) => ({
                ...t,
                open_count: openStats[t.id]?.count || 0,
                last_opened_at: openStats[t.id]?.last || null,
            }));

            setTracks(enriched);
        } catch (err) {
            console.error('Failed to load tracks:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    const loadObjects = useCallback(async () => {
        try {
            const { data } = await supabase
                .from('cleaning_objects')
                .select('id, name')
                .eq('is_active', true)
                .order('name');
            setObjects(data || []);
        } catch (err) {
            console.error('Failed to load objects:', err);
        }
    }, []);

    useEffect(() => {
        loadTracks();
        loadObjects();
    }, [loadTracks, loadObjects]);

    // Create tracker
    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const { data, error } = await supabase
                .from('email_tracks')
                .insert({
                    recipient_email: formData.recipient_email,
                    subject: formData.subject,
                    object_id: formData.object_id || null,
                    notes: formData.notes || null,
                    created_by: adminUser?.id,
                })
                .select()
                .single();

            if (error) throw error;

            setCreatedTrackId(data.id);
            await loadTracks();
        } catch (err) {
            console.error('Failed to create tracker:', err);
        }
    };

    // Delete tracker
    const handleDelete = async (trackId: string) => {
        if (!confirm('Удалить трекер? Все данные об открытиях будут потеряны.')) return;
        try {
            setDeleting(trackId);
            await supabase.from('email_tracks').delete().eq('id', trackId);
            await loadTracks();
            if (viewingTrack?.id === trackId) setViewingTrack(null);
        } catch (err) {
            console.error('Failed to delete tracker:', err);
        } finally {
            setDeleting(null);
        }
    };

    // View track details + opens
    const handleViewTrack = async (track: EmailTrack) => {
        setViewingTrack(track);
        setOpensLoading(true);
        try {
            const { data } = await supabase
                .from('email_opens')
                .select('*')
                .eq('track_id', track.id)
                .order('opened_at', { ascending: false });
            setOpens(data || []);
        } catch (err) {
            console.error('Failed to load opens:', err);
        } finally {
            setOpensLoading(false);
        }
    };

    // Copy to clipboard
    const copyToClipboard = async (text: string) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            // Fallback
            const textarea = document.createElement('textarea');
            textarea.value = text;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    const closeCreateModal = () => {
        setShowCreateModal(false);
        setCreatedTrackId(null);
        setFormData({ recipient_email: '', subject: '', object_id: '', notes: '' });
        setCopied(false);
    };

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleString('pl-PL', {
            timeZone: 'Europe/Warsaw',
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    const objectName = (objectId: string | null) => {
        if (!objectId) return null;
        return objects.find(o => o.id === objectId)?.name || null;
    };

    // ============= DETAIL VIEW =============
    if (viewingTrack) {
        return (
            <div className="animate-fadeIn">
                <button
                    onClick={() => setViewingTrack(null)}
                    className="flex items-center gap-2 text-sm text-muted hover:text-main mb-4 transition-colors"
                >
                    <ArrowLeft className="w-4 h-4" />
                    Назад к списку
                </button>

                <div className="bg-card rounded-xl border border-border p-6 mb-6">
                    <div className="flex items-start justify-between mb-4">
                        <div>
                            <h2 className="text-lg font-semibold text-main">{viewingTrack.subject}</h2>
                            <p className="text-sm text-muted mt-1">
                                <Mail className="w-3.5 h-3.5 inline mr-1" />
                                {viewingTrack.recipient_email}
                            </p>
                        </div>
                        <div className="flex items-center gap-3">
                            <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${
                                viewingTrack.open_count && viewingTrack.open_count > 0
                                    ? 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400'
                                    : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
                            }`}>
                                <Eye className="w-3.5 h-3.5" />
                                {viewingTrack.open_count || 0} открытий
                            </span>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
                        <div>
                            <span className="text-muted">Создано:</span>
                            <p className="text-main">{formatDate(viewingTrack.created_at)}</p>
                        </div>
                        {viewingTrack.last_opened_at && (
                            <div>
                                <span className="text-muted">Последнее открытие:</span>
                                <p className="text-main">{formatDate(viewingTrack.last_opened_at)}</p>
                            </div>
                        )}
                        {objectName(viewingTrack.object_id) && (
                            <div>
                                <span className="text-muted">Объект:</span>
                                <p className="text-main">{objectName(viewingTrack.object_id)}</p>
                            </div>
                        )}
                    </div>

                    {viewingTrack.notes && (
                        <div className="mt-4 text-sm">
                            <span className="text-muted">Заметки:</span>
                            <p className="text-main mt-1">{viewingTrack.notes}</p>
                        </div>
                    )}

                    {/* Pixel code */}
                    <div className="mt-4 p-3 bg-subtle rounded-lg">
                        <div className="flex items-center justify-between mb-1">
                            <span className="text-xs text-muted font-medium">HTML-код пикселя</span>
                            <button
                                onClick={() => copyToClipboard(getImgTag(viewingTrack.id))}
                                className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
                            >
                                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                                {copied ? 'Скопировано' : 'Копировать'}
                            </button>
                        </div>
                        <code className="text-xs text-muted break-all select-all">{getImgTag(viewingTrack.id)}</code>
                    </div>
                </div>

                {/* Opens table */}
                <div className="bg-card rounded-xl border border-border">
                    <div className="px-6 py-4 border-b border-border">
                        <h3 className="text-sm font-semibold text-main">История открытий</h3>
                    </div>

                    {opensLoading ? (
                        <div className="p-8 text-center text-muted text-sm">Загрузка...</div>
                    ) : opens.length === 0 ? (
                        <div className="p-8 text-center text-muted text-sm">
                            Пока нет открытий
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b border-border text-xs text-muted">
                                        <th className="text-left px-6 py-3 font-medium">#</th>
                                        <th className="text-left px-6 py-3 font-medium">
                                            <Clock className="w-3.5 h-3.5 inline mr-1" />Время
                                        </th>
                                        <th className="text-left px-6 py-3 font-medium">
                                            <Globe className="w-3.5 h-3.5 inline mr-1" />IP
                                        </th>
                                        <th className="text-left px-6 py-3 font-medium">
                                            <Monitor className="w-3.5 h-3.5 inline mr-1" />User-Agent
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {opens.map((open, idx) => (
                                        <tr key={open.id} className="border-b border-border last:border-0 hover:bg-subtle/50 transition-colors">
                                            <td className="px-6 py-3 text-sm text-muted">{opens.length - idx}</td>
                                            <td className="px-6 py-3 text-sm text-main">{formatDate(open.opened_at)}</td>
                                            <td className="px-6 py-3 text-sm text-muted font-mono">{open.ip || '—'}</td>
                                            <td className="px-6 py-3 text-sm text-muted max-w-xs truncate">{open.user_agent || '—'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    // ============= MAIN LIST VIEW =============
    return (
        <div className="animate-fadeIn">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-xl font-bold text-main">Трекинг Email</h1>
                    <p className="text-sm text-muted mt-1">Отслеживание открытий отправленных предложений</p>
                </div>
                <button
                    onClick={() => setShowCreateModal(true)}
                    className="btn-primary flex items-center gap-2"
                >
                    <Plus className="w-4 h-4" />
                    Новый трекер
                </button>
            </div>

            {/* Tracks table */}
            {loading ? (
                <div className="bg-card rounded-xl border border-border p-8 text-center text-muted text-sm">
                    Загрузка...
                </div>
            ) : tracks.length === 0 ? (
                <div className="bg-card rounded-xl border border-border p-12 text-center">
                    <Mail className="w-12 h-12 text-muted/30 mx-auto mb-3" />
                    <p className="text-muted text-sm">Нет трекеров</p>
                    <p className="text-muted/60 text-xs mt-1">Создайте первый трекер для отслеживания открытий email</p>
                </div>
            ) : (
                <>
                    {/* Mobile cards */}
                    <div className="space-y-3 sm:hidden">
                        {tracks.map(track => (
                            <div
                                key={track.id}
                                className="card-interactive p-4"
                                onClick={() => handleViewTrack(track)}
                            >
                                <div className="flex items-start justify-between mb-2">
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-main truncate">{track.subject}</p>
                                        <p className="text-xs text-muted truncate mt-0.5">{track.recipient_email}</p>
                                    </div>
                                    <span className={`ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                                        track.open_count && track.open_count > 0
                                            ? 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400'
                                            : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
                                    }`}>
                                        <Eye className="w-3 h-3" />
                                        {track.open_count || 0}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between text-xs text-muted">
                                    <span>{formatDate(track.created_at)}</span>
                                    {track.last_opened_at && (
                                        <span>Последнее: {formatDate(track.last_opened_at)}</span>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Desktop table */}
                    <div className="hidden sm:block bg-card rounded-xl border border-border overflow-hidden">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-border text-xs text-muted">
                                    <th className="text-left px-6 py-3 font-medium">Получатель</th>
                                    <th className="text-left px-6 py-3 font-medium">Тема</th>
                                    <th className="text-left px-6 py-3 font-medium">Создано</th>
                                    <th className="text-center px-6 py-3 font-medium">Открытия</th>
                                    <th className="text-left px-6 py-3 font-medium">Последнее</th>
                                    <th className="text-right px-6 py-3 font-medium">Действия</th>
                                </tr>
                            </thead>
                            <tbody>
                                {tracks.map(track => (
                                    <tr
                                        key={track.id}
                                        className="border-b border-border last:border-0 hover:bg-subtle/50 transition-colors cursor-pointer group"
                                        onClick={() => handleViewTrack(track)}
                                    >
                                        <td className="px-6 py-3">
                                            <p className="text-sm text-main">{track.recipient_email}</p>
                                            {objectName(track.object_id) && (
                                                <p className="text-xs text-muted mt-0.5">{objectName(track.object_id)}</p>
                                            )}
                                        </td>
                                        <td className="px-6 py-3 text-sm text-main max-w-xs truncate">{track.subject}</td>
                                        <td className="px-6 py-3 text-sm text-muted">{formatDate(track.created_at)}</td>
                                        <td className="px-6 py-3 text-center">
                                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                                                track.open_count && track.open_count > 0
                                                    ? 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400'
                                                    : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
                                            }`}>
                                                <Eye className="w-3 h-3" />
                                                {track.open_count || 0}
                                            </span>
                                        </td>
                                        <td className="px-6 py-3 text-sm text-muted">
                                            {track.last_opened_at ? formatDate(track.last_opened_at) : '—'}
                                        </td>
                                        <td className="px-6 py-3 text-right">
                                            <button
                                                onClick={(e) => { e.stopPropagation(); handleDelete(track.id); }}
                                                disabled={deleting === track.id}
                                                className="p-1.5 text-muted hover:text-red-500 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors opacity-0 group-hover:opacity-100"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </>
            )}

            {/* Create Modal */}
            {showCreateModal && createPortal(
                <div className="modal-overlay" onClick={closeCreateModal}>
                    <div className="modal-content max-w-md" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3 className="text-lg font-semibold text-main">
                                {createdTrackId ? 'Трекер создан' : 'Новый трекер'}
                            </h3>
                            <button onClick={closeCreateModal} className="btn-icon">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {createdTrackId ? (
                            /* Success state — show pixel code */
                            <div className="modal-body space-y-4">
                                <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-100 dark:border-green-800">
                                    <p className="text-sm text-green-700 dark:text-green-400 font-medium mb-1">
                                        Трекер успешно создан
                                    </p>
                                    <p className="text-xs text-green-600 dark:text-green-500">
                                        Вставьте код ниже в HTML вашего письма
                                    </p>
                                </div>

                                <div className="p-3 bg-subtle rounded-lg">
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-xs text-muted font-medium">HTML-код пикселя</span>
                                        <button
                                            onClick={() => copyToClipboard(getImgTag(createdTrackId))}
                                            className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
                                        >
                                            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                                            {copied ? 'Скопировано!' : 'Копировать'}
                                        </button>
                                    </div>
                                    <code className="text-xs text-muted break-all select-all block">
                                        {getImgTag(createdTrackId)}
                                    </code>
                                </div>

                                <div className="modal-footer">
                                    <button onClick={closeCreateModal} className="btn-primary w-full">
                                        Готово
                                    </button>
                                </div>
                            </div>
                        ) : (
                            /* Create form */
                            <form onSubmit={handleCreate}>
                                <div className="modal-body space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium text-main mb-1">
                                            Email получателя *
                                        </label>
                                        <input
                                            type="email"
                                            value={formData.recipient_email}
                                            onChange={e => setFormData({ ...formData, recipient_email: e.target.value })}
                                            className="input"
                                            placeholder="client@company.com"
                                            required
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-main mb-1">
                                            Тема письма *
                                        </label>
                                        <input
                                            type="text"
                                            value={formData.subject}
                                            onChange={e => setFormData({ ...formData, subject: e.target.value })}
                                            className="input"
                                            placeholder="Предложение по уборке офиса"
                                            required
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-main mb-1">
                                            Привязка к объекту
                                        </label>
                                        <div className="relative">
                                            <select
                                                value={formData.object_id}
                                                onChange={e => setFormData({ ...formData, object_id: e.target.value })}
                                                className="input appearance-none pr-8"
                                            >
                                                <option value="">Без привязки</option>
                                                {objects.map(obj => (
                                                    <option key={obj.id} value={obj.id}>{obj.name}</option>
                                                ))}
                                            </select>
                                            <ChevronDown className="absolute right-2.5 top-2.5 w-4 h-4 text-gray-400 pointer-events-none" />
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-main mb-1">
                                            Заметки
                                        </label>
                                        <textarea
                                            value={formData.notes}
                                            onChange={e => setFormData({ ...formData, notes: e.target.value })}
                                            className="input min-h-[80px] resize-y"
                                            placeholder="Дополнительные заметки..."
                                        />
                                    </div>
                                </div>

                                <div className="modal-footer">
                                    <button type="button" onClick={closeCreateModal} className="btn-secondary">
                                        Отмена
                                    </button>
                                    <button type="submit" className="btn-primary">
                                        Создать
                                    </button>
                                </div>
                            </form>
                        )}
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
}

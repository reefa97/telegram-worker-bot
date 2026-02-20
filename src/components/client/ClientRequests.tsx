import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Send, MessageSquare, Clock, CheckCircle2, Loader2, Building2, AlertCircle } from 'lucide-react';

interface ClientRequest {
    id: string;
    object_id: string;
    message: string;
    status: 'new' | 'in_progress' | 'done';
    admin_note: string | null;
    created_at: string;
    resolved_at: string | null;
    object_name?: string;
}

interface ClientObject {
    object_id: string;
    object_name: string;
}

export default function ClientRequests() {
    const { adminUser } = useAuth();
    const [requests, setRequests] = useState<ClientRequest[]>([]);
    const [objects, setObjects] = useState<ClientObject[]>([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [showForm, setShowForm] = useState(false);
    const [formData, setFormData] = useState({ object_id: '', message: '' });

    const loadData = async () => {
        if (!adminUser?.id) return;
        setLoading(true);
        try {
            // 1. Fetch objects via RPC to bypass RLS on cleaning_objects
            const { data: guardiansData } = await supabase.rpc('get_client_guardians', {
                p_client_id: adminUser.id
            });

            const objectsMap = new Map<string, string>();
            if (guardiansData) {
                guardiansData.forEach((d: any) => {
                    if (!objectsMap.has(d.object_id)) {
                        objectsMap.set(d.object_id, d.object_name);
                    }
                });

                const uniqueObjects = Array.from(objectsMap.entries()).map(([id, name]) => ({
                    object_id: id,
                    object_name: name
                }));
                setObjects(uniqueObjects);
            }

            // 2. Fetch requests and map names
            const { data: reqData, error } = await supabase
                .from('client_requests')
                .select('*')
                .eq('client_id', adminUser.id)
                .order('created_at', { ascending: false });

            if (error) throw error;
            if (reqData) {
                setRequests(reqData.map((r: any) => ({
                    ...r,
                    object_name: objectsMap.get(r.object_id) || 'Obiekt'
                })));
            }
        } catch (err) {
            console.error('Error loading data:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, [adminUser]);

    // Used for refreshing after submit
    const loadRequests = loadData;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.object_id || !formData.message.trim()) return;

        setSubmitting(true);
        try {
            const { error } = await supabase
                .from('client_requests')
                .insert({
                    client_id: adminUser!.id,
                    object_id: formData.object_id,
                    message: formData.message.trim(),
                    status: 'new'
                });

            if (error) throw error;

            // Send Telegram notification to guardian
            try {
                const { data: owners } = await supabase.rpc('get_object_owners_with_chat_ids', {
                    target_object_id: formData.object_id
                });

                console.log('Sending notification. Owners found:', owners);

                if (owners && owners.length > 0) {
                    const objectName = objects.find(o => o.object_id === formData.object_id)?.object_name || 'Obiekt';
                    for (const owner of owners) {
                        if (owner.telegram_chat_id) {
                            console.log('Invoking send-telegram-notification for chat:', owner.telegram_chat_id);
                            // Use edge function to send Telegram message
                            await supabase.functions.invoke('send-telegram-notification', {
                                body: {
                                    chat_id: parseInt(owner.telegram_chat_id),
                                    message: `📋 <b>Nowa prośba od klienta</b>\n\n📍 Obiekt: <b>${objectName}</b>\n💬 ${formData.message.trim()}\n\n👤 Klient: ${adminUser?.email}`
                                }
                            });
                        }
                    }
                }
            } catch (notifErr) {
                console.error('Telegram notification failed:', notifErr);
                // Don't block the request submission
            }

            setFormData({ object_id: '', message: '' });
            setShowForm(false);
            loadRequests();
        } catch (err) {
            console.error('Error submitting request:', err);
            alert('Błąd przy wysyłaniu prośby. Spróbuj ponownie.');
        } finally {
            setSubmitting(false);
        }
    };

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'new':
                return <span className="badge-neutral flex items-center gap-1"><AlertCircle size={12} />Nowa</span>;
            case 'in_progress':
                return <span className="badge-info flex items-center gap-1"><Loader2 size={12} className="animate-spin" />W trakcie</span>;
            case 'done':
                return <span className="badge-success flex items-center gap-1"><CheckCircle2 size={12} />Zrobione</span>;
            default:
                return <span className="badge">{status}</span>;
        }
    };

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleDateString('pl-PL', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    if (loading) {
        return (
            <div className="flex justify-center items-center h-64">
                <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold text-main">Prośby</h2>
                    <p className="text-sm text-muted mt-1">Wyślij prośbę do opiekuna obiektu</p>
                </div>
                <button
                    onClick={() => setShowForm(!showForm)}
                    className="btn-primary flex items-center gap-2"
                >
                    <Send className="w-4 h-4" />
                    Nowa prośba
                </button>
            </div>

            {/* New Request Form */}
            {showForm && (
                <div className="card p-6 border-primary/30 animate-fadeIn">
                    <h3 className="font-bold text-main mb-4 flex items-center gap-2">
                        <MessageSquare className="w-5 h-5 text-primary" />
                        Nowa prośba
                    </h3>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1.5">
                                Obiekt
                            </label>
                            <select
                                value={formData.object_id}
                                onChange={(e) => setFormData({ ...formData, object_id: e.target.value })}
                                className="input"
                                required
                            >
                                <option value="">Wybierz obiekt...</option>
                                {objects.map(obj => (
                                    <option key={obj.object_id} value={obj.object_id}>{obj.object_name}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1.5">
                                Wiadomość
                            </label>
                            <textarea
                                value={formData.message}
                                onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                                className="input min-h-[100px] resize-y"
                                placeholder="Np. Proszę o umycie okien w kuchni..."
                                required
                            />
                        </div>
                        <div className="flex gap-3 justify-end">
                            <button
                                type="button"
                                onClick={() => { setShowForm(false); setFormData({ object_id: '', message: '' }); }}
                                className="btn-secondary"
                            >
                                Anuluj
                            </button>
                            <button
                                type="submit"
                                disabled={submitting}
                                className="btn-primary flex items-center gap-2"
                            >
                                {submitting ? (
                                    <><Loader2 className="w-4 h-4 animate-spin" />Wysyłanie...</>
                                ) : (
                                    <><Send className="w-4 h-4" />Wyślij</>
                                )}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* Requests List */}
            {requests.length === 0 ? (
                <div className="card flex flex-col items-center justify-center py-16 text-center">
                    <MessageSquare className="w-16 h-16 text-muted opacity-20 mb-4" />
                    <h3 className="text-lg font-medium text-main mb-2">Brak próśb</h3>
                    <p className="text-muted max-w-sm">
                        Nie wysłałeś jeszcze żadnych próśb. Kliknij "Nowa prośba" aby wysłać pierwszą.
                    </p>
                </div>
            ) : (
                <div className="space-y-3">
                    {requests.map(req => (
                        <div key={req.id} className="card p-5 hover:shadow-md transition-shadow">
                            <div className="flex items-start justify-between gap-4">
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-3 mb-2">
                                        <div className="flex items-center gap-1.5 text-xs text-muted">
                                            <Building2 size={12} />
                                            {req.object_name}
                                        </div>
                                        {getStatusBadge(req.status)}
                                    </div>
                                    <p className="text-main font-medium">{req.message}</p>
                                    {req.admin_note && (
                                        <div className="mt-2 p-3 bg-subtle rounded-lg text-sm">
                                            <span className="text-xs font-semibold text-muted uppercase">Odpowiedź:</span>
                                            <p className="text-main mt-1">{req.admin_note}</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div className="flex items-center gap-4 mt-3 pt-3 border-t border-border text-xs text-muted">
                                <div className="flex items-center gap-1">
                                    <Clock size={12} />
                                    {formatDate(req.created_at)}
                                </div>
                                {req.resolved_at && (
                                    <div className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                                        <CheckCircle2 size={12} />
                                        Rozwiązano: {formatDate(req.resolved_at)}
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

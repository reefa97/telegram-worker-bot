import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import {
    Package, CheckCircle, Clock, Truck, ExternalLink, RefreshCw,
    ShoppingCart, Archive, Briefcase, Users, MapPin, User, X,
    Search
} from 'lucide-react';

interface ProcurementRequest {
    id: number;
    worker_id: string;
    object_id: string;
    item_name: string;
    photo_url: string | null;
    status: 'pending' | 'ordered' | 'delivered';
    created_at: string;
    ordered_at: string | null;
    delivered_at: string | null;
    worker: {
        first_name: string;
        last_name: string;
        phone_number: string | null;
    };
    object: {
        name: string;
        address: string;
    };
}

import { useAuth } from '../contexts/AuthContext';

export default function ProcurementPanel() {
    const { adminUser } = useAuth();
    const [requests, setRequests] = useState<ProcurementRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'active' | 'archive'>('active');
    const [processingId, setProcessingId] = useState<number | null>(null);
    const [selectedRequest, setSelectedRequest] = useState<ProcurementRequest | null>(null);
    const [searchQuery, setSearchQuery] = useState('');

    useEffect(() => {
        fetchRequests();

        const channel = supabase
            .channel('procurement_changes')
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'procurement_requests'
                },
                () => {
                    fetchRequests();
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [activeTab]);

    const fetchRequests = async () => {
        setLoading(true);
        try {
            let query = supabase
                .from('procurement_requests')
                .select(`
                    *,
                    worker:workers(first_name, last_name, phone_number),
                    object:cleaning_objects(name, address)
                `)
            if (adminUser?.role !== 'super_admin') {
                // Fetch objects owned by this admin
                const { data: ownedObjects } = await supabase
                    .from('object_owners')
                    .select('object_id')
                    .eq('admin_id', adminUser?.id);

                if (ownedObjects && ownedObjects.length > 0) {
                    const objectIds = ownedObjects.map(o => o.object_id);
                    query = query.in('object_id', objectIds);
                } else {
                    // If admin owns no objects, show nothing
                    setRequests([]);
                    setLoading(false);
                    return;
                }
            }

            if (activeTab === 'active') {
                query = query.in('status', ['pending', 'ordered']);
            } else {
                query = query.eq('status', 'delivered');
            }

            const { data, error } = await query.order('created_at', { ascending: false });

            if (error) throw error;
            setRequests(data || []);
        } catch (error) {
            console.error('Error fetching procurement requests:', error);
        } finally {
            setLoading(false);
        }
    };

    const updateStatus = async (id: number, newStatus: 'pending' | 'ordered' | 'delivered') => {
        setProcessingId(id);
        try {
            const updates: any = { status: newStatus };

            if (newStatus === 'pending') {
                updates.ordered_at = null;
                updates.delivered_at = null;
            } else if (newStatus === 'ordered') {
                updates.ordered_at = new Date().toISOString();
                updates.delivered_at = null;
            } else if (newStatus === 'delivered') {
                updates.delivered_at = new Date().toISOString();
            }

            const { error } = await supabase
                .from('procurement_requests')
                .update(updates)
                .eq('id', id);

            if (error) throw error;

            // Optimistic update
            setRequests(prev => prev.map(req =>
                req.id === id ? { ...req, ...updates } : req
            ).filter(() => {
                // If moving to delivered, remove from Active tab
                if (activeTab === 'active' && newStatus === 'delivered') return false;
                // If moving from delivered (archive) to active, remove from Archive tab
                if (activeTab === 'archive' && newStatus !== 'delivered') return false;
                return true;
            }));

            // Close modal if open
            if (selectedRequest?.id === id) {
                // Update selected request in place if we don't close it, OR close it. 
                // User might want to keep it open to see the change? 
                // The prompt says "choose status", usually implies changing it. 
                // If I change status, it might disappear from the current list (active/archive).
                // So maybe it's safer to close it or at least update the local state.
                setSelectedRequest(prev => prev ? { ...prev, ...updates } : null);
            }

        } catch (error) {
            console.error('Error updating status:', error);
            alert('Ошибка при обновлении статуса');
        } finally {
            setProcessingId(null);
        }
    };

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleString('ru-RU', {
            day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
        });
    };

    // Filter Logic
    const filteredRequests = requests.filter(req => {
        if (!searchQuery) return true;
        const lowerQuery = searchQuery.toLowerCase();
        return (
            req.item_name.toLowerCase().includes(lowerQuery) ||
            req.object?.name.toLowerCase().includes(lowerQuery) ||
            req.worker?.first_name.toLowerCase().includes(lowerQuery) ||
            req.worker?.last_name.toLowerCase().includes(lowerQuery)
        );
    });

    return (
        <div className="animate-fadeIn">
            {/* Header Area */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
                <div>
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Закупки</h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Управление заявками на материалы</p>
                </div>

                <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
                    {/* Search Input */}
                    <div className="relative flex-grow md:flex-grow-0 md:w-64">
                        <input
                            type="text"
                            placeholder="Поиск по названию, объекту..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-9 pr-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 transition-all shadow-sm text-gray-900 dark:text-gray-100 placeholder-gray-400"
                        />
                        <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    </div>

                    {/* Tabs */}
                    <div className="flex bg-gray-100 dark:bg-gray-800 p-1 rounded-lg border border-gray-200 dark:border-gray-700">
                        <button
                            onClick={() => setActiveTab('active')}
                            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${activeTab === 'active'
                                ? 'bg-white dark:bg-gray-700 shadow-sm text-gray-900 dark:text-white'
                                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                                }`}
                        >
                            <ShoppingCart size={14} />
                            Активные
                        </button>
                        <button
                            onClick={() => setActiveTab('archive')}
                            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${activeTab === 'archive'
                                ? 'bg-white dark:bg-gray-700 shadow-sm text-gray-900 dark:text-white'
                                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                                }`}
                        >
                            <Archive size={14} />
                            Архив
                        </button>
                    </div>

                    <button
                        onClick={fetchRequests}
                        className="p-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100 transition-colors shadow-sm"
                        title="Обновить"
                    >
                        <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
                    </button>
                </div>
            </div>

            {/* Grid Content */}
            {filteredRequests.length === 0 && !loading ? (
                <div className="flex flex-col items-center justify-center py-16 bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 border-dashed text-center">
                    <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-full mb-4">
                        <Package className="w-8 h-8 text-gray-400 dark:text-gray-500" />
                    </div>
                    <h3 className="text-lg font-medium text-gray-900 dark:text-white">Нет заявок</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 max-w-xs mx-auto">
                        {activeTab === 'active' ? 'Новые заявки от работников появятся здесь.' : 'В архиве пока пусто.'}
                    </p>
                </div>
            ) : (
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                    {filteredRequests.map((req) => (
                        <div
                            key={req.id}
                            onClick={() => setSelectedRequest(req)}
                            className="group bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm overflow-hidden hover:shadow-md hover:border-blue-500 dark:hover:border-blue-500/50 transition-all cursor-pointer flex flex-col"
                        >
                            {/* Card Image */}
                            {req.photo_url && (
                                <div className="h-48 w-full bg-gray-100 dark:bg-gray-900 overflow-hidden relative border-b border-gray-200 dark:border-gray-700">
                                    <img
                                        src={req.photo_url}
                                        alt={req.item_name}
                                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                                    />
                                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
                                </div>
                            )}

                            {/* Card Content */}
                            <div className="p-5 flex-1 flex flex-col">
                                <div className="flex justify-between items-start mb-3">
                                    <span className={`
                                        px-2.5 py-1 text-xs font-semibold rounded-full border
                                        ${req.status === 'pending' ? 'bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-900/20 dark:text-yellow-400 dark:border-yellow-900/30' : ''}
                                        ${req.status === 'ordered' ? 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-900/30' : ''}
                                        ${req.status === 'delivered' ? 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-900/30' : ''}
                                    `}>
                                        {req.status === 'pending' && 'Ожидает'}
                                        {req.status === 'ordered' && 'Заказано'}
                                        {req.status === 'delivered' && 'Доставлено'}
                                    </span>
                                    <span className="text-xs text-gray-400 dark:text-gray-500 flex items-center gap-1">
                                        <Clock size={12} />
                                        {new Date(req.created_at).toLocaleDateString()}
                                    </span>
                                </div>

                                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2 line-clamp-2 leading-tight group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                                    {req.item_name}
                                </h3>

                                <div className="space-y-2 mt-2 mb-6">
                                    <div className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-400">
                                        <Briefcase size={16} className="mt-0.5 text-gray-400 dark:text-gray-500 flex-shrink-0" />
                                        <span className="line-clamp-1">{req.object?.name || 'Неизвестный объект'}</span>
                                    </div>
                                    <div className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-400">
                                        <Users size={16} className="mt-0.5 text-gray-400 dark:text-gray-500 flex-shrink-0" />
                                        <span className="line-clamp-1">{req.worker?.first_name} {req.worker?.last_name}</span>
                                    </div>
                                </div>

                                {/* Card Actions */}
                                <div className="mt-auto pt-4 border-t border-gray-100 dark:border-gray-700 grid grid-cols-1 gap-2">
                                    {req.status === 'pending' && (
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                updateStatus(req.id, 'ordered');
                                            }}
                                            disabled={processingId === req.id}
                                            className="w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors shadow-sm disabled:opacity-50 flex items-center justify-center gap-2"
                                        >
                                            <Truck size={16} />
                                            Заказано
                                        </button>
                                    )}
                                    {req.status === 'ordered' && (
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                updateStatus(req.id, 'delivered');
                                            }}
                                            disabled={processingId === req.id}
                                            className="w-full py-2 px-4 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors shadow-sm disabled:opacity-50 flex items-center justify-center gap-2"
                                        >
                                            <CheckCircle size={16} />
                                            Доставлено
                                        </button>
                                    )}
                                    {req.status === 'delivered' && (
                                        <div className="w-full py-2 px-4 bg-gray-50 dark:bg-gray-800/50 text-green-600 dark:text-green-500 rounded-lg text-sm font-medium flex items-center justify-center gap-2 border border-gray-100 dark:border-gray-700">
                                            <CheckCircle size={16} />
                                            Выполнено
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Modal */}
            {selectedRequest && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
                    <div
                        className="bg-white dark:bg-gray-800 w-full max-w-2xl max-h-[90vh] rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col animate-in scale-95 duration-200"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Modal Header */}
                        <div className="flex items-center justify-between p-5 border-b border-gray-100 dark:border-gray-700">
                            <div>
                                <h3 className="text-xl font-bold text-gray-900 dark:text-white">Детали заявки #{selectedRequest.id}</h3>
                                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                                    Создана {formatDate(selectedRequest.created_at)}
                                </p>
                            </div>
                            <button
                                onClick={() => setSelectedRequest(null)}
                                className="p-2 rounded-lg text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* Modal Body */}
                        <div className="overflow-y-auto p-6 space-y-8">
                            {/* Photo Section */}
                            {selectedRequest.photo_url ? (
                                <div className="rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 relative group aspect-video">
                                    <img
                                        src={selectedRequest.photo_url}
                                        alt={selectedRequest.item_name}
                                        className="w-full h-full object-contain"
                                    />
                                    <a
                                        href={selectedRequest.photo_url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="absolute bottom-4 right-4 bg-gray-900/80 text-white px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-sm hover:bg-black"
                                    >
                                        <ExternalLink size={14} />
                                        Открыть оригинал
                                    </a>
                                </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center py-12 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 text-gray-400 dark:text-gray-500">
                                    <Package size={32} className="mb-2 opacity-50" />
                                    <span className="text-sm">Фото отсутствует</span>
                                </div>
                            )}

                            {/* Info Grid */}
                            <div className="grid gap-6 md:grid-cols-2">
                                {/* Left Column */}
                                <div className="space-y-6">
                                    <div>
                                        <label className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider block mb-2">
                                            Товар / Материал
                                        </label>
                                        <p className="text-lg font-semibold text-gray-900 dark:text-white leading-tight">
                                            {selectedRequest.item_name}
                                        </p>
                                    </div>

                                    <div>
                                        <label className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider block mb-2">
                                            Статус
                                        </label>
                                        <span className={`
                                            inline-flex items-center px-3 py-1.5 rounded-full text-sm font-semibold border
                                            ${selectedRequest.status === 'pending' ? 'bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-900/20 dark:text-yellow-400 dark:border-yellow-900/30' : ''}
                                            ${selectedRequest.status === 'ordered' ? 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-900/30' : ''}
                                            ${selectedRequest.status === 'delivered' ? 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-900/30' : ''}
                                        `}>
                                            {selectedRequest.status === 'pending' && 'Ожидает обработки'}
                                            {selectedRequest.status === 'ordered' && 'Заказано'}
                                            {selectedRequest.status === 'delivered' && 'Доставлено на объект'}
                                        </span>
                                    </div>
                                </div>

                                {/* Right Column */}
                                <div className="space-y-4">
                                    <div className="bg-gray-50 dark:bg-gray-900/50 p-4 rounded-xl border border-gray-100 dark:border-gray-700">
                                        <label className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider block mb-3">
                                            Место доставки
                                        </label>
                                        <div className="space-y-3">
                                            <div className="flex items-start gap-3">
                                                <div className="p-2 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-lg">
                                                    <Briefcase size={16} />
                                                </div>
                                                <div>
                                                    <p className="text-sm font-medium text-gray-900 dark:text-white">{selectedRequest.object?.name}</p>
                                                    <p className="text-xs text-gray-500 dark:text-gray-400">Объект</p>
                                                </div>
                                            </div>
                                            <div className="flex items-start gap-3">
                                                <div className="p-2 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-lg">
                                                    <MapPin size={16} />
                                                </div>
                                                <div>
                                                    <p className="text-sm font-medium text-gray-900 dark:text-white leading-snug">{selectedRequest.object?.address}</p>
                                                    <p className="text-xs text-gray-500 dark:text-gray-400">Адрес</p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="bg-gray-50 dark:bg-gray-900/50 p-4 rounded-xl border border-gray-100 dark:border-gray-700">
                                        <label className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider block mb-3">
                                            Контактное лицо
                                        </label>
                                        <div className="flex items-start gap-3">
                                            <div className="p-2 bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded-lg">
                                                <User size={16} />
                                            </div>
                                            <div>
                                                <p className="text-sm font-medium text-gray-900 dark:text-white">
                                                    {selectedRequest.worker?.first_name} {selectedRequest.worker?.last_name}
                                                </p>
                                                {selectedRequest.worker?.phone_number && (
                                                    <a href={`tel:${selectedRequest.worker.phone_number}`} className="text-xs text-blue-600 dark:text-blue-400 hover:underline mt-0.5 block">
                                                        {selectedRequest.worker.phone_number}
                                                    </a>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Modal Footer */}
                        <div className="p-4 bg-gray-50 dark:bg-gray-900/50 border-t border-gray-100 dark:border-gray-700 flex gap-3">
                            <button
                                onClick={() => setSelectedRequest(null)}
                                className="py-2.5 px-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl text-sm font-semibold hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors shadow-sm"
                            >
                                Закрыть
                            </button>

                            <div className="flex-1 flex gap-2">
                                <button
                                    onClick={() => updateStatus(selectedRequest.id, 'pending')}
                                    disabled={processingId === selectedRequest.id}
                                    className={`flex-1 py-2.5 px-2 rounded-xl text-xs font-semibold transition-colors shadow-sm border ${selectedRequest.status === 'pending'
                                        ? 'bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-900/50'
                                        : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'
                                        }`}
                                >
                                    Ожидает
                                </button>
                                <button
                                    onClick={() => updateStatus(selectedRequest.id, 'ordered')}
                                    disabled={processingId === selectedRequest.id}
                                    className={`flex-1 py-2.5 px-2 rounded-xl text-xs font-semibold transition-colors shadow-sm border ${selectedRequest.status === 'ordered'
                                        ? 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-900/50'
                                        : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'
                                        }`}
                                >
                                    Заказано
                                </button>
                                <button
                                    onClick={() => updateStatus(selectedRequest.id, 'delivered')}
                                    disabled={processingId === selectedRequest.id}
                                    className={`flex-1 py-2.5 px-2 rounded-xl text-xs font-semibold transition-colors shadow-sm border ${selectedRequest.status === 'delivered'
                                        ? 'bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-900/50'
                                        : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'
                                        }`}
                                >
                                    Доставлено
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

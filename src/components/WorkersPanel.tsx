import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Plus, Edit2, Trash2, Send, Copy, Check, Users, History } from 'lucide-react';
import WorkSessionsModal from './WorkSessionsModal';

interface Worker {
    id: string;
    first_name: string;
    last_name: string;
    telegram_username: string;
    telegram_user_id: string;
    telegram_chat_id: number;
    phone_number: string;
    is_active: boolean;
    role: string; // Deprecated but keeping for fallback
    role_id?: string;
    worker_roles?: { name: string };
    invitation_token: string;
    created_at: string;
    created_by?: string;
}

interface WorkerRole {
    id: string;
    name: string;
}

interface CleaningObject {
    id: string;
    name: string;
    address: string;
}

export default function WorkersPanel() {
    const { adminUser } = useAuth();
    const [workers, setWorkers] = useState<Worker[]>([]);
    const [objects, setObjects] = useState<CleaningObject[]>([]);
    const [roles, setRoles] = useState<WorkerRole[]>([]);
    const [creators, setCreators] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingWorker, setEditingWorker] = useState<Worker | null>(null);
    const [copiedToken, setCopiedToken] = useState<string | null>(null);
    const [historyWorker, setHistoryWorker] = useState<Worker | null>(null);

    // Bulk messaging state
    const [selectedWorkers, setSelectedWorkers] = useState<Set<string>>(new Set());
    const [showBulkModal, setShowBulkModal] = useState(false);
    const [bulkMessage, setBulkMessage] = useState('');
    const [sendingBulk, setSendingBulk] = useState(false);

    // Form state
    const [formData, setFormData] = useState({
        first_name: '',
        last_name: '',
        phone_number: '',

        role_id: '',
        selectedObjects: [] as string[],
    });




    useEffect(() => {
        loadWorkers();
        loadObjects();
        loadRoles();
        loadCreators();
    }, []);

    const loadCreators = async () => {
        const { data } = await supabase.from('admin_users').select('id, name');
        if (data) {
            const lookup: Record<string, string> = {};
            data.forEach((user: any) => {
                if (user.id && user.name) {
                    lookup[user.id] = user.name;
                }
            });
            setCreators(lookup);
        }
    };

    const loadRoles = async () => {
        const { data } = await supabase.from('worker_roles').select('*').order('name');
        if (data) setRoles(data);
    };

    const loadWorkers = async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from('workers')
            .select('*, worker_roles(name)')
            .order('created_at', { ascending: false });

        if (data) setWorkers(data);
        if (error) console.error('Error loading workers:', error);
        setLoading(false);
    };

    const loadObjects = async () => {
        const { data } = await supabase
            .from('cleaning_objects')
            .select('*')
            .eq('is_active', true)
            .order('name');

        if (data) setObjects(data);
    };

    const generateToken = () => {
        return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        try {
            if (editingWorker) {
                // Update worker
                const { error } = await supabase
                    .from('workers')
                    .update({
                        first_name: formData.first_name,
                        last_name: formData.last_name,
                        phone_number: formData.phone_number,
                        role_id: formData.role_id || null,
                    })
                    .eq('id', editingWorker.id);

                if (error) throw error;

                // Update worker_objects
                await supabase.from('worker_objects').delete().eq('worker_id', editingWorker.id);

                if (formData.selectedObjects.length > 0) {
                    const workerObjects = formData.selectedObjects.map(objId => ({
                        worker_id: editingWorker.id,
                        object_id: objId,
                    }));

                    await supabase.from('worker_objects').insert(workerObjects);
                }
            } else {
                // Create worker - only insert valid fields
                const token = generateToken();
                const { data: newWorker, error } = await supabase
                    .from('workers')
                    .insert({
                        first_name: formData.first_name,
                        last_name: formData.last_name,
                        phone_number: formData.phone_number,

                        role_id: formData.role_id || null,
                        created_by: adminUser?.id,
                        invitation_token: token,
                    })
                    .select()
                    .single();

                if (error) throw error;

                // Add worker_objects
                if (formData.selectedObjects.length > 0 && newWorker) {
                    const workerObjects = formData.selectedObjects.map(objId => ({
                        worker_id: newWorker.id,
                        object_id: objId,
                    }));

                    await supabase.from('worker_objects').insert(workerObjects);
                }
            }

            loadWorkers();
            closeModal();
        } catch (error) {
            console.error('Error saving worker:', error);
            const errorMessage = error instanceof Error ? error.message : (typeof error === 'object' && error !== null && 'message' in error ? (error as any).message : JSON.stringify(error));
            alert(`Ошибка при сохранении работника: ${errorMessage}`);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Удалить работника?')) return;

        const { error } = await supabase.from('workers').delete().eq('id', id);

        if (error) {
            console.error('Error deleting worker:', error);
            alert('Ошибка при удалении');
        } else {
            loadWorkers();
            // Remove from selected if deleted
            if (selectedWorkers.has(id)) {
                const newSelected = new Set(selectedWorkers);
                newSelected.delete(id);
                setSelectedWorkers(newSelected);
            }
        }
    };



    const handleBulkSendMessage = async () => {
        if (!bulkMessage.trim()) {
            alert('Введите сообщение');
            return;
        }

        setSendingBulk(true);
        let successCount = 0;
        let failCount = 0;

        try {
            for (const workerId of selectedWorkers) {
                try {
                    const response = await supabase.functions.invoke('send-message', {
                        body: { workerId, message: bulkMessage },
                    });
                    if (response.error) throw response.error;
                    successCount++;
                } catch (error) {
                    console.error(`Error sending to worker ${workerId}:`, error);
                    failCount++;
                }
            }

            alert(`Рассылка завершена.\nУспешно: ${successCount}\nОшибок: ${failCount}`);
            setBulkMessage('');
            setShowBulkModal(false);
            setSelectedWorkers(new Set()); // Clear selection after sending
        } catch (error) {
            console.error('Error in bulk sending:', error);
            alert('Ошибка при рассылке');
        } finally {
            setSendingBulk(false);
        }
    };

    const copyInvitationLink = (token: string) => {
        const botUsername = 'reefa_worktime_bot'; // Bot username
        const link = `https://t.me/${botUsername}?start=${token}`;
        navigator.clipboard.writeText(link);
        setCopiedToken(token);
        setTimeout(() => setCopiedToken(null), 2000);
    };

    const openModal = (worker?: Worker) => {
        if (worker) {
            setEditingWorker(worker);
            setFormData({
                first_name: worker.first_name,
                last_name: worker.last_name,
                phone_number: worker.phone_number,

                role_id: worker.role_id || '',
                selectedObjects: [],
            });

            // Load worker's objects
            supabase
                .from('worker_objects')
                .select('object_id')
                .eq('worker_id', worker.id)
                .then(({ data }) => {
                    if (data) {
                        setFormData(prev => ({
                            ...prev,
                            selectedObjects: data.map(wo => wo.object_id),
                        }));
                    }
                });
        } else {
            setEditingWorker(null);
            setFormData({
                first_name: '',
                last_name: '',
                phone_number: '',

                role_id: '',
                selectedObjects: [],
            });
        }
        setShowModal(true);
    };

    const closeModal = () => {
        setShowModal(false);
        setEditingWorker(null);
    };

    const toggleSelectAll = () => {
        if (selectedWorkers.size === workers.length) {
            setSelectedWorkers(new Set());
        } else {
            setSelectedWorkers(new Set(workers.map(w => w.id)));
        }
    };

    const toggleSelectWorker = (id: string) => {
        const newSelected = new Set(selectedWorkers);
        if (newSelected.has(id)) {
            newSelected.delete(id);
        } else {
            newSelected.add(id);
        }
        setSelectedWorkers(newSelected);
    };

    if (loading) {
        return <div className="text-white">Загрузка...</div>;
    }

    const canWrite = adminUser?.role === 'super_admin' || adminUser?.permissions?.workers_write;

    return (
        <div>
            <div className="flex justify-between items-center mb-6">
                <div className="flex items-center gap-4">
                    <h2 className="text-2xl font-bold text-white">Работники</h2>
                    {selectedWorkers.size > 0 && (
                        <button
                            onClick={() => setShowBulkModal(true)}
                            className="btn-primary flex items-center gap-2 bg-blue-600 hover:bg-blue-700"
                        >
                            <Users className="w-4 h-4" />
                            Написать ({selectedWorkers.size})
                        </button>
                    )}
                </div>
                {(adminUser?.role === 'super_admin' || adminUser?.permissions?.workers_create) && (
                    <button onClick={() => openModal()} className="btn-primary flex items-center gap-2">
                        <Plus className="w-4 h-4" />
                        Добавить работника
                    </button>
                )}
            </div>

            <div className="card overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-gray-700">
                            <tr>
                                <th className="px-4 py-3 w-10">
                                    <input
                                        type="checkbox"
                                        checked={workers.length > 0 && selectedWorkers.size === workers.length}
                                        onChange={toggleSelectAll}
                                        className="rounded border-gray-600 bg-gray-700 text-primary-500 focus:ring-primary-500"
                                    />
                                </th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Имя</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Роль</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Телефон</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Telegram</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Создал</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Статус</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Действия</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-700">
                            {workers.map((worker) => (
                                <tr key={worker.id} className={`hover:bg-gray-700/50 ${selectedWorkers.has(worker.id) ? 'bg-blue-900/20' : ''}`}>
                                    <td className="px-4 py-3">
                                        <input
                                            type="checkbox"
                                            checked={selectedWorkers.has(worker.id)}
                                            onChange={() => toggleSelectWorker(worker.id)}
                                            className="rounded border-gray-600 bg-gray-700 text-primary-500 focus:ring-primary-500"
                                        />
                                    </td>
                                    <td className="px-4 py-3 text-white">
                                        {worker.first_name} {worker.last_name}
                                    </td>
                                    <td className="px-4 py-3 text-gray-300">
                                        {worker.worker_roles?.name || worker.role || '-'}
                                    </td>
                                    <td className="px-4 py-3 text-gray-300">{worker.phone_number}</td>
                                    <td className="px-4 py-3 text-gray-300">
                                        {worker.telegram_username || 'Не активирован'}
                                    </td>
                                    <td className="px-4 py-3 text-gray-500 text-sm">
                                        {(worker as any).created_by && creators[(worker as any).created_by] ? creators[(worker as any).created_by] : '-'}
                                    </td>

                                    <td className="px-4 py-3">
                                        <span className={`px-2 py-1 rounded text-xs ${worker.is_active ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                                            }`}>
                                            {worker.is_active ? 'Активен' : 'Неактивен'}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => setHistoryWorker(worker)}
                                                className="p-1 hover:bg-gray-600 rounded"
                                                title="История работы"
                                            >
                                                <History className="w-4 h-4 text-purple-400" />
                                            </button>
                                            {canWrite && (
                                                <>
                                                    <button
                                                        onClick={() => openModal(worker)}
                                                        className="p-1 hover:bg-gray-600 rounded"
                                                        title="Редактировать"
                                                    >
                                                        <Edit2 className="w-4 h-4 text-blue-400" />
                                                    </button>
                                                    <button
                                                        onClick={() => handleDelete(worker.id)}
                                                        className="p-1 hover:bg-gray-600 rounded"
                                                        title="Удалить"
                                                    >
                                                        <Trash2 className="w-4 h-4 text-red-400" />
                                                    </button>
                                                    {!worker.telegram_user_id && (
                                                        <button
                                                            onClick={() => copyInvitationLink(worker.invitation_token)}
                                                            className="p-1 hover:bg-gray-600 rounded"
                                                            title="Скопировать ссылку активации"
                                                        >
                                                            {copiedToken === worker.invitation_token ? (
                                                                <Check className="w-4 h-4 text-green-400" />
                                                            ) : (
                                                                <Copy className="w-4 h-4 text-gray-400" />
                                                            )}
                                                        </button>
                                                    )}
                                                </>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
                    <div className="bg-gray-800 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                        <div className="p-6">
                            <h3 className="text-xl font-bold text-white mb-4">
                                {editingWorker ? 'Редактировать работника' : 'Новый работник'}
                            </h3>

                            <form onSubmit={handleSubmit} className="space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-300 mb-2">Имя</label>
                                        <input
                                            type="text"
                                            value={formData.first_name}
                                            onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                                            className="input"
                                            required
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-300 mb-2">Фамилия</label>
                                        <input
                                            type="text"
                                            value={formData.last_name}
                                            onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                                            className="input"
                                            required
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-2">Телефон</label>
                                    <input
                                        type="tel"
                                        value={formData.phone_number}
                                        onChange={(e) => setFormData({ ...formData, phone_number: e.target.value })}
                                        className="input"
                                    />
                                </div>



                                <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-2">Роль</label>
                                    <select
                                        value={formData.role_id}
                                        onChange={(e) => setFormData({ ...formData, role_id: e.target.value })}
                                        className="input"
                                    >
                                        <option value="">Выберите роль</option>
                                        {roles.map(role => (
                                            <option key={role.id} value={role.id}>{role.name}</option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-2">Объекты работы</label>
                                    <div className="space-y-2 max-h-40 overflow-y-auto">
                                        {objects.map((obj) => (
                                            <label key={obj.id} className="flex items-center gap-2 text-gray-300 cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={formData.selectedObjects.includes(obj.id)}
                                                    onChange={(e) => {
                                                        if (e.target.checked) {
                                                            setFormData({
                                                                ...formData,
                                                                selectedObjects: [...formData.selectedObjects, obj.id],
                                                            });
                                                        } else {
                                                            setFormData({
                                                                ...formData,
                                                                selectedObjects: formData.selectedObjects.filter(id => id !== obj.id),
                                                            });
                                                        }
                                                    }}
                                                    className="rounded"
                                                />
                                                {obj.name} - {obj.address}
                                            </label>
                                        ))}
                                    </div>
                                </div>

                                <div className="flex gap-2 pt-4">
                                    <button type="submit" className="btn-primary flex-1">
                                        {editingWorker ? 'Сохранить' : 'Создать'}
                                    </button>
                                    <button type="button" onClick={closeModal} className="btn-secondary flex-1">
                                        Отмена
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            )}

            {/* Bulk Message Modal */}
            {showBulkModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
                    <div className="bg-gray-800 rounded-lg max-w-md w-full">
                        <div className="p-6">
                            <h3 className="text-xl font-bold text-white mb-4">
                                Написать {selectedWorkers.size} работникам
                            </h3>

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-2">Сообщение</label>
                                    <textarea
                                        value={bulkMessage}
                                        onChange={(e) => setBulkMessage(e.target.value)}
                                        className="input min-h-[100px]"
                                        placeholder="Введите текст рассылки..."
                                    />
                                </div>

                                <div className="flex gap-2">
                                    <button
                                        onClick={handleBulkSendMessage}
                                        disabled={sendingBulk || !bulkMessage.trim()}
                                        className="btn-primary flex-1 flex items-center justify-center gap-2"
                                    >
                                        {sendingBulk ? 'Отправка...' : 'Отправить'}
                                        <Send className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={() => setShowBulkModal(false)}
                                        disabled={sendingBulk}
                                        className="btn-secondary flex-1"
                                    >
                                        Отмена
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {historyWorker && (
                <WorkSessionsModal
                    workerId={historyWorker.id}
                    workerName={`${historyWorker.first_name} ${historyWorker.last_name}`}
                    onClose={() => setHistoryWorker(null)}
                />
            )}
        </div>
    );
}

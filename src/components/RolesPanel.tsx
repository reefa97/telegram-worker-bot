import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Plus, Trash2, Edit2 } from 'lucide-react';

interface WorkerRole {
    id: string;
    name: string;
}

export default function RolesPanel() {
    const [roles, setRoles] = useState<WorkerRole[]>([]);
    const [loading, setLoading] = useState(true);
    const [newRoleName, setNewRoleName] = useState('');
    const [editingRole, setEditingRole] = useState<WorkerRole | null>(null);

    useEffect(() => {
        loadRoles();
    }, []);

    const loadRoles = async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from('worker_roles')
            .select('*')
            .order('name');

        if (error) {
            console.error('Error loading roles:', error);
        } else {
            setRoles(data || []);
        }
        setLoading(false);
    };

    const handleAddRole = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newRoleName.trim()) return;

        const { error } = await supabase
            .from('worker_roles')
            .insert([{ name: newRoleName.trim() }]);

        if (error) {
            alert('Ошибка при создании роли');
            console.error(error);
        } else {
            setNewRoleName('');
            loadRoles();
        }
    };

    const handleUpdateRole = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingRole || !newRoleName.trim()) return;

        const { error } = await supabase
            .from('worker_roles')
            .update({ name: newRoleName.trim() })
            .eq('id', editingRole.id);

        if (error) {
            alert('Ошибка при обновлении роли');
        } else {
            setEditingRole(null);
            setNewRoleName('');
            loadRoles();
        }
    };

    const handleDeleteRole = async (id: string) => {
        if (!confirm('Вы уверены? Это может повлиять на работников с этой ролью.')) return;

        const { error } = await supabase
            .from('worker_roles')
            .delete()
            .eq('id', id);

        if (error) {
            alert('Ошибка при удалении');
        } else {
            loadRoles();
        }
    };

    const startEdit = (role: WorkerRole) => {
        setEditingRole(role);
        setNewRoleName(role.name);
    };

    const cancelEdit = () => {
        setEditingRole(null);
        setNewRoleName('');
    };

    return (
        <div>
            <h2 className="text-2xl font-bold text-white mb-6">Управление ролями</h2>

            <div className="grid gap-6 md:grid-cols-2">
                {/* Form */}
                <div className="card h-fit">
                    <h3 className="text-lg font-semibold text-white mb-4">
                        {editingRole ? 'Редактировать роль' : 'Новая роль'}
                    </h3>
                    <form onSubmit={editingRole ? handleUpdateRole : handleAddRole} className="flex gap-2">
                        <input
                            type="text"
                            value={newRoleName}
                            onChange={(e) => setNewRoleName(e.target.value)}
                            className="input flex-1"
                            placeholder="Название роли (например: Менеджер)"
                        />
                        <button type="submit" className="btn-primary">
                            {editingRole ? 'Сохранить' : <Plus className="w-5 h-5" />}
                        </button>
                        {editingRole && (
                            <button type="button" onClick={cancelEdit} className="btn-secondary">
                                Отмена
                            </button>
                        )}
                    </form>
                </div>

                {/* List */}
                <div className="space-y-4">
                    {loading ? (
                        <div className="text-white">Загрузка...</div>
                    ) : roles.length === 0 ? (
                        <div className="text-gray-400">Ролей пока нет</div>
                    ) : (
                        roles.map(role => (
                            <div key={role.id} className="card flex justify-between items-center py-3">
                                <span className="text-white font-medium">{role.name}</span>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => startEdit(role)}
                                        className="p-2 text-blue-400 hover:bg-blue-500/10 rounded"
                                    >
                                        <Edit2 className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={() => handleDeleteRole(role.id)}
                                        className="p-2 text-red-400 hover:bg-red-500/10 rounded"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}

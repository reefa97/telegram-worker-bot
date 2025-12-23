import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Settings as SettingsIcon, Save, Plus, Trash2 } from 'lucide-react';

interface BotSettings {
    id: string;
    telegram_bot_token: string | null;
    is_active: boolean;
}

interface BotAdmin {
    id: string;
    telegram_chat_id: string;
    name: string;
    is_active: boolean;
}

export default function SettingsPanel() {
    const { adminUser } = useAuth();
    const [settings, setSettings] = useState<BotSettings | null>(null);
    const [botAdmins, setBotAdmins] = useState<BotAdmin[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const [botToken, setBotToken] = useState('');
    const [botActive, setBotActive] = useState(false);

    const [newAdminChatId, setNewAdminChatId] = useState('');
    const [newAdminName, setNewAdminName] = useState('');

    const isSuperAdmin = adminUser?.role === 'super_admin';

    useEffect(() => {
        loadSettings();
        loadBotAdmins();
    }, []);

    const loadSettings = async () => {
        const { data } = await supabase
            .from('bot_settings')
            .select('*')
            .single();

        if (data) {
            setSettings(data);
            setBotToken(data.telegram_bot_token || '');
            setBotActive(data.is_active);
        }
        setLoading(false);
    };

    const loadBotAdmins = async () => {
        const { data } = await supabase
            .from('bot_admins')
            .select('*')
            .order('created_at', { ascending: false });

        if (data) setBotAdmins(data);
    };

    const handleSaveSettings = async () => {
        if (!isSuperAdmin) {
            alert('Только Super Admin может изменять настройки');
            return;
        }

        setSaving(true);
        try {
            const { error } = await supabase
                .from('bot_settings')
                .update({
                    telegram_bot_token: botToken,
                    is_active: botActive,
                })
                .eq('id', settings!.id);

            if (error) throw error;

            alert('Настройки сохранены');
            loadSettings();
        } catch (error) {
            console.error('Error saving settings:', error);
            alert('Ошибка при сохранении');
        } finally {
            setSaving(false);
        }
    };

    const handleAddBotAdmin = async () => {
        if (!isSuperAdmin) {
            alert('Только Super Admin может добавлять администраторов бота');
            return;
        }

        if (!newAdminChatId || !newAdminName) {
            alert('Заполните все поля');
            return;
        }

        try {
            const { error } = await supabase
                .from('bot_admins')
                .insert({
                    telegram_chat_id: newAdminChatId,
                    name: newAdminName,
                });

            if (error) throw error;

            setNewAdminChatId('');
            setNewAdminName('');
            loadBotAdmins();
        } catch (error) {
            console.error('Error adding bot admin:', error);
            alert('Ошибка при добавлении администратора');
        }
    };

    const handleDeleteBotAdmin = async (id: string) => {
        if (!isSuperAdmin) {
            alert('Только Super Admin может удалять администраторов бота');
            return;
        }

        if (!confirm('Удалить администратора бота?')) return;

        const { error } = await supabase
            .from('bot_admins')
            .delete()
            .eq('id', id);

        if (error) {
            console.error('Error deleting bot admin:', error);
            alert('Ошибка при удалении');
        } else {
            loadBotAdmins();
        }
    };

    const toggleBotAdminActive = async (id: string, currentStatus: boolean) => {
        if (!isSuperAdmin) {
            alert('Только Super Admin может изменять статус');
            return;
        }

        const { error } = await supabase
            .from('bot_admins')
            .update({ is_active: !currentStatus })
            .eq('id', id);

        if (error) {
            console.error('Error toggling status:', error);
        } else {
            loadBotAdmins();
        }
    };

    if (loading) {
        return <div className="text-white">Загрузка...</div>;
    }

    return (
        <div className="space-y-6">
            <h2 className="text-2xl font-bold text-white">Настройки</h2>

            {/* Bot Settings */}
            <div className="card">
                <div className="flex items-center gap-3 mb-6">
                    <div className="p-3 bg-primary-600/20 rounded-lg">
                        <SettingsIcon className="w-6 h-6 text-primary-400" />
                    </div>
                    <div>
                        <h3 className="text-lg font-semibold text-white">Настройки Telegram бота</h3>
                        <p className="text-sm text-gray-400">Конфигурация токена и статуса бота</p>
                    </div>
                </div>

                {!isSuperAdmin && (
                    <div className="bg-yellow-500/10 border border-yellow-500 text-yellow-500 px-4 py-3 rounded-lg mb-4">
                        Только Super Admin может изменять настройки бота
                    </div>
                )}

                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">
                            Telegram Bot Token
                        </label>
                        <input
                            type="text"
                            value={botToken}
                            onChange={(e) => setBotToken(e.target.value)}
                            className="input"
                            placeholder="1234567890:ABCdefGHIjklMNOpqrSTUvwxYZ"
                            disabled={!isSuperAdmin}
                        />
                        <p className="text-xs text-gray-400 mt-1">
                            Получите токен у @BotFather в Telegram
                        </p>
                    </div>

                    <div className="flex items-center gap-3">
                        <input
                            type="checkbox"
                            id="bot-active"
                            checked={botActive}
                            onChange={(e) => setBotActive(e.target.checked)}
                            disabled={!isSuperAdmin}
                            className="w-4 h-4 rounded"
                        />
                        <label htmlFor="bot-active" className="text-white">
                            Бот активен
                        </label>
                    </div>

                    {isSuperAdmin && (
                        <button
                            onClick={handleSaveSettings}
                            disabled={saving}
                            className="btn-primary flex items-center gap-2 disabled:opacity-50"
                        >
                            <Save className="w-4 h-4" />
                            {saving ? 'Сохранение...' : 'Сохранить настройки'}
                        </button>
                    )}
                </div>
            </div>

            {/* Bot Admins */}
            <div className="card">
                <h3 className="text-lg font-semibold text-white mb-4">
                    Администраторы для уведомлений
                </h3>
                <p className="text-sm text-gray-400 mb-4">
                    Эти администраторы будут получать уведомления о начале и окончании работы в Telegram
                </p>

                {!isSuperAdmin && (
                    <div className="bg-yellow-500/10 border border-yellow-500 text-yellow-500 px-4 py-3 rounded-lg mb-4">
                        Только Super Admin может управлять администраторами для уведомлений
                    </div>
                )}

                {isSuperAdmin && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                        <input
                            type="text"
                            value={newAdminChatId}
                            onChange={(e) => setNewAdminChatId(e.target.value)}
                            className="input"
                            placeholder="Chat ID (например, 123456789)"
                        />
                        <input
                            type="text"
                            value={newAdminName}
                            onChange={(e) => setNewAdminName(e.target.value)}
                            className="input"
                            placeholder="Имя администратора"
                        />
                        <button onClick={handleAddBotAdmin} className="btn-primary flex items-center justify-center gap-2">
                            <Plus className="w-4 h-4" />
                            Добавить
                        </button>
                    </div>
                )}

                <div className="space-y-2">
                    {botAdmins.map((admin) => (
                        <div
                            key={admin.id}
                            className="flex items-center justify-between p-3 bg-gray-700 rounded-lg"
                        >
                            <div className="flex-1">
                                <div className="flex items-center gap-3">
                                    <span className="text-white font-medium">{admin.name}</span>
                                    <span className={`px-2 py-0.5 rounded text-xs ${admin.is_active ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'
                                        }`}>
                                        {admin.is_active ? 'Активен' : 'Неактивен'}
                                    </span>
                                </div>
                                <div className="text-sm text-gray-400 mt-1">
                                    Chat ID: {admin.telegram_chat_id}
                                </div>
                            </div>

                            {isSuperAdmin && (
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => toggleBotAdminActive(admin.id, admin.is_active)}
                                        className="px-3 py-1 bg-gray-600 hover:bg-gray-500 text-white text-sm rounded transition-colors"
                                    >
                                        {admin.is_active ? 'Деактивировать' : 'Активировать'}
                                    </button>
                                    <button
                                        onClick={() => handleDeleteBotAdmin(admin.id)}
                                        className="p-1 hover:bg-gray-600 rounded"
                                    >
                                        <Trash2 className="w-4 h-4 text-red-400" />
                                    </button>
                                </div>
                            )}
                        </div>
                    ))}

                    {botAdmins.length === 0 && (
                        <div className="text-center text-gray-400 py-8">
                            Нет администраторов для уведомлений
                        </div>
                    )}
                </div>

                <div className="mt-6 p-4 bg-blue-500/10 border border-blue-500 rounded-lg">
                    <p className="text-sm text-blue-400">
                        <strong>Как получить Chat ID:</strong><br />
                        1. Напишите боту @userinfobot в Telegram<br />
                        2. Он отправит вам ваш Chat ID<br />
                        3. Скопируйте и вставьте его в поле выше
                    </p>
                </div>
            </div>
        </div>
    );
}

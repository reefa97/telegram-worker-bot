import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Settings as SettingsIcon, Save } from 'lucide-react';

interface BotSettings {
    id: string;
    telegram_bot_token: string | null;
    is_active: boolean;
}

export default function SettingsPanel() {
    const { adminUser } = useAuth();
    const [settings, setSettings] = useState<BotSettings | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const [botToken, setBotToken] = useState('');
    const [botActive, setBotActive] = useState(false);

    const isSuperAdmin = adminUser?.role === 'super_admin';

    useEffect(() => {
        loadSettings();
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

            {/* Info about new notification system */}
            <div className="card">
                <h3 className="text-lg font-semibold text-white mb-4">
                    Уведомления в Telegram
                </h3>
                <div className="space-y-3 text-sm text-gray-300">
                    <p>
                        Уведомления о начале и окончании работы теперь отправляются <strong className="text-white">автоматически</strong> тому администратору, который создал работника.
                    </p>
                    <div className="bg-blue-500/10 border border-blue-500 rounded-lg p-4">
                        <p className="text-blue-400 mb-2"><strong>Как настроить уведомления:</strong></p>
                        <ol className="list-decimal list-inside space-y-1 text-blue-300">
                            <li>Перейдите в раздел <strong>"Роли"</strong> (Администраторы и Менеджеры)</li>
                            <li>При создании или редактировании администратора укажите <strong>Telegram Chat ID</strong></li>
                            <li>Теперь этот администратор будет получать уведомления от всех работников, которых он создал</li>
                        </ol>
                    </div>
                    <div className="bg-gray-700 border border-gray-600 rounded-lg p-4">
                        <p className="text-gray-300 mb-2"><strong>Как получить Chat ID:</strong></p>
                        <ol className="list-decimal list-inside space-y-1 text-gray-400">
                            <li>Напишите боту <code className="bg-gray-800 px-1 py-0.5 rounded">@userinfobot</code> в Telegram</li>
                            <li>Он отправит вам ваш Chat ID</li>
                            <li>Скопируйте и вставьте его в поле "Telegram Chat ID" при редактировании администратора</li>
                        </ol>
                    </div>
                </div>
            </div>
        </div>
    );
}

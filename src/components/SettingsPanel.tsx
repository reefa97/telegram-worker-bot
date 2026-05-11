import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Settings as SettingsIcon, Save, Bell, Info, UserCog, UserPlus2, Shield, ScrollText, Trash2 } from 'lucide-react';
import UsersPanel from './UsersPanel';
import SubAdminsPanel from './SubAdminsPanel';
import RolesPanel from './RolesPanel';
import LogsPanel from './LogsPanel';
import TrashPanel from './TrashPanel';

type SettingsTab = 'general' | 'superadmins' | 'subadmins' | 'roles' | 'logs' | 'trash';

interface BotSettings {
    id: string;
    telegram_bot_token: string | null;
    is_active: boolean;
}

const SUB_TABS: { id: SettingsTab; label: string; icon: any }[] = [
    { id: 'general', label: 'Общие', icon: SettingsIcon },
    { id: 'superadmins', label: 'Super Admins', icon: UserCog },
    { id: 'subadmins', label: 'Sub Admins', icon: UserPlus2 },
    { id: 'roles', label: 'Роли', icon: Shield },
    { id: 'logs', label: 'Логи', icon: ScrollText },
    { id: 'trash', label: 'Корзина', icon: Trash2 },
];

export default function SettingsPanel() {
    const { adminUser } = useAuth();
    const [subTab, setSubTab] = useState<SettingsTab>('general');
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

    return (
        <div>
            {/* Sub-tabs */}
            <div className="flex gap-1 mb-4 border-b border-border overflow-x-auto">
                {SUB_TABS.map(tab => {
                    const Icon = tab.icon;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => setSubTab(tab.id)}
                            className={`px-3 py-2.5 text-sm font-medium transition-colors relative flex items-center gap-1.5 whitespace-nowrap ${
                                subTab === tab.id
                                    ? 'text-main after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-blue-500'
                                    : 'text-muted hover:text-main'
                            }`}
                        >
                            <Icon className="w-4 h-4" />
                            {tab.label}
                        </button>
                    );
                })}
            </div>

            {subTab === 'superadmins' && <UsersPanel />}
            {subTab === 'subadmins' && <SubAdminsPanel />}
            {subTab === 'roles' && <RolesPanel />}
            {subTab === 'logs' && <LogsPanel />}
            {subTab === 'trash' && <TrashPanel />}

            {subTab === 'general' && (
                <div className="space-y-6">
                    {loading ? (
                        <div className="flex justify-center items-center h-64">
                            <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin"></div>
                        </div>
                    ) : (
                        <>
                            {/* Bot Settings */}
                            <div className="card">
                                <div className="flex items-center gap-3 mb-6">
                                    <div className="p-3 bg-primary-100 dark:bg-primary-900/30 rounded-xl text-primary-600 dark:text-primary-400">
                                        <SettingsIcon className="w-6 h-6" />
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Настройки Telegram бота</h3>
                                        <p className="text-sm text-gray-500 dark:text-gray-400">Конфигурация токена и статуса бота</p>
                                    </div>
                                </div>

                                {!isSuperAdmin && (
                                    <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 text-yellow-700 dark:text-yellow-500 px-4 py-3 rounded-xl mb-6">
                                        Только Super Admin может изменять настройки бота
                                    </div>
                                )}

                                <div className="space-y-6">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                                            Telegram Bot Token
                                        </label>
                                        <input
                                            type="text"
                                            value={botToken}
                                            onChange={(e) => setBotToken(e.target.value)}
                                            className="input font-mono text-sm"
                                            placeholder="1234567890:ABCdefGHIjklMNOpqrSTUvwxYZ"
                                            disabled={!isSuperAdmin}
                                        />
                                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5 flex items-center gap-1">
                                            <Info className="w-3 h-3" />
                                            Получите токен у @BotFather в Telegram
                                        </p>
                                    </div>

                                    <div className="flex items-center gap-3 p-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-800/50">
                                        <div className="relative inline-block w-12 mr-2 align-middle select-none transition duration-200 ease-in">
                                            <input
                                                type="checkbox"
                                                name="toggle"
                                                id="bot-active"
                                                checked={botActive}
                                                onChange={(e) => setBotActive(e.target.checked)}
                                                disabled={!isSuperAdmin}
                                                className="toggle-checkbox absolute block w-6 h-6 rounded-full bg-white border-4 appearance-none cursor-pointer peer checked:right-0 right-6"
                                                style={{ top: 0 }}
                                            />
                                            <label htmlFor="bot-active" className={`toggle-label block overflow-hidden h-6 rounded-full cursor-pointer ${botActive ? 'bg-primary-500' : 'bg-gray-300 dark:bg-gray-600'}`}></label>
                                        </div>
                                        <label htmlFor="bot-active" className="text-gray-700 dark:text-gray-300 font-medium cursor-pointer select-none">
                                            Бот активен
                                        </label>
                                    </div>

                                    {isSuperAdmin && (
                                        <div className="pt-2">
                                            <button
                                                onClick={handleSaveSettings}
                                                disabled={saving}
                                                className="btn-primary w-full sm:w-auto flex justify-center items-center gap-2 disabled:opacity-50"
                                            >
                                                <Save className="w-4 h-4" />
                                                {saving ? 'Сохранение...' : 'Сохранить настройки'}
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Info about notification system */}
                            <div className="card">
                                <div className="flex items-center gap-3 mb-4">
                                    <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg text-blue-600 dark:text-blue-400">
                                        <Bell className="w-5 h-5" />
                                    </div>
                                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                                        Уведомления в Telegram
                                    </h3>
                                </div>

                                <div className="space-y-4 text-sm text-gray-600 dark:text-gray-300">
                                    <p>
                                        Уведомления о начале и окончании работы теперь отправляются <strong className="text-gray-900 dark:text-white">автоматически</strong> тому администратору, который создал работника.
                                    </p>

                                    <div className="grid md:grid-cols-2 gap-4">
                                        <div className="bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/30 rounded-xl p-4">
                                            <p className="text-blue-700 dark:text-blue-300 font-medium mb-2">Как настроить уведомления:</p>
                                            <ol className="list-decimal list-inside space-y-1.5 text-blue-600 dark:text-blue-400">
                                                <li>Перейдите в раздел <strong>"Роли"</strong></li>
                                                <li>При редактировании админа укажите <strong>Telegram Chat ID</strong></li>
                                                <li>Админ будет получать уведомления от своих работников</li>
                                            </ol>
                                        </div>

                                        <div className="bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
                                            <p className="text-gray-700 dark:text-gray-200 font-medium mb-2">Как получить Chat ID:</p>
                                            <ol className="list-decimal list-inside space-y-1.5 text-gray-600 dark:text-gray-400">
                                                <li>Напишите боту <code className="bg-white dark:bg-gray-700 px-1.5 py-0.5 rounded border border-gray-200 dark:border-gray-600 text-gray-800 dark:text-gray-200 font-mono text-xs">@userinfobot</code></li>
                                                <li>Он отправит вам ваш Chat ID</li>
                                                <li>Скопируйте его в поле "Telegram Chat ID"</li>
                                            </ol>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}

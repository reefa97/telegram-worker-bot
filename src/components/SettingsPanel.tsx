import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import {
    Settings as SettingsIcon, Save, Bell, Info, UserCog, UserPlus2, Shield, ScrollText, Trash2,
    AlertTriangle, Eye, EyeOff, Loader2,
} from 'lucide-react';
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
    { id: 'general',     label: 'Общие',        icon: SettingsIcon },
    { id: 'superadmins', label: 'Super Admins', icon: UserCog },
    { id: 'subadmins',   label: 'Sub Admins',   icon: UserPlus2 },
    { id: 'roles',       label: 'Роли',         icon: Shield },
    { id: 'logs',        label: 'Логи',         icon: ScrollText },
    { id: 'trash',       label: 'Корзина',      icon: Trash2 },
];

export default function SettingsPanel() {
    const { adminUser } = useAuth();
    const [subTab, setSubTab] = useState<SettingsTab>('general');
    const [settings, setSettings] = useState<BotSettings | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const [botToken, setBotToken] = useState('');
    const [botActive, setBotActive] = useState(false);
    const [showToken, setShowToken] = useState(false);

    const isSuperAdmin = adminUser?.role === 'super_admin';
    const dirty = settings != null && (
        (settings.telegram_bot_token || '') !== botToken ||
        settings.is_active !== botActive
    );

    useEffect(() => {
        loadSettings();
    }, []);

    const loadSettings = async () => {
        setLoading(true);
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
            await loadSettings();
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
            <div className="tabs mb-5">
                {SUB_TABS.map(tab => {
                    const Icon = tab.icon;
                    const isActive = subTab === tab.id;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => setSubTab(tab.id)}
                            className={`tab ${isActive ? 'is-active' : ''}`}
                            aria-selected={isActive}
                        >
                            <Icon className="w-4 h-4" />
                            {tab.label}
                        </button>
                    );
                })}
            </div>

            {subTab === 'superadmins' && <UsersPanel />}
            {subTab === 'subadmins'   && <SubAdminsPanel />}
            {subTab === 'roles'       && <RolesPanel />}
            {subTab === 'logs'        && <LogsPanel />}
            {subTab === 'trash'       && <TrashPanel />}

            {subTab === 'general' && (
                loading ? (
                    <div className="flex justify-center items-center h-64">
                        <Loader2 className="w-6 h-6 text-muted animate-spin" />
                    </div>
                ) : (
                    <div className="space-y-5">
                        {/* ============ Bot Settings ============ */}
                        <section className="card p-5 sm:p-6">
                            <header className="flex items-start gap-3 mb-5">
                                <div className="shrink-0 w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center" style={{ color: 'var(--accent)' }}>
                                    <SettingsIcon className="w-4 h-4" />
                                </div>
                                <div>
                                    <h3 className="text-base font-semibold text-main">Telegram-бот</h3>
                                    <p className="text-sm text-muted mt-0.5">Токен и переключатель активности</p>
                                </div>
                            </header>

                            {!isSuperAdmin && (
                                <div
                                    role="alert"
                                    className="flex items-start gap-2.5 p-3 mb-5 rounded-md text-sm"
                                    style={{ background: 'var(--warning-soft)', color: 'var(--warning-fg)' }}
                                >
                                    <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                                    <span>Изменять настройки бота может только Super Admin.</span>
                                </div>
                            )}

                            <div className="space-y-5">
                                {/* Token */}
                                <div>
                                    <label className="label" htmlFor="bot-token">Bot Token</label>
                                    <div className="relative">
                                        <input
                                            id="bot-token"
                                            type={showToken ? 'text' : 'password'}
                                            value={botToken}
                                            onChange={(e) => setBotToken(e.target.value)}
                                            className="input font-mono pr-11"
                                            placeholder="1234567890:ABCdefGHIjklMNOpqrSTUvwxYZ"
                                            disabled={!isSuperAdmin}
                                            autoComplete="off"
                                            spellCheck={false}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowToken(v => !v)}
                                            className="absolute right-1 top-1/2 -translate-y-1/2 btn-icon"
                                            style={{ width: 36, height: 36 }}
                                            aria-label={showToken ? 'Скрыть токен' : 'Показать токен'}
                                            tabIndex={-1}
                                        >
                                            {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                        </button>
                                    </div>
                                    <p className="help flex items-center gap-1.5">
                                        <Info className="w-3 h-3" />
                                        Получите токен у <span className="font-medium">@BotFather</span> в Telegram.
                                    </p>
                                </div>

                                {/* Bot active toggle */}
                                <div className="flex items-center justify-between gap-3 p-3 rounded-md border border-border">
                                    <div className="flex items-center gap-3 min-w-0">
                                        <span
                                            className="badge-dot shrink-0"
                                            style={{ background: botActive ? 'var(--success)' : 'var(--text-faint)' }}
                                        />
                                        <div className="min-w-0">
                                            <div className="text-sm font-medium text-main">
                                                {botActive ? 'Бот активен' : 'Бот выключен'}
                                            </div>
                                            <div className="text-xs text-muted truncate">
                                                {botActive
                                                    ? 'Принимает обновления через webhook'
                                                    : 'Webhook отключен, сообщения не обрабатываются'}
                                            </div>
                                        </div>
                                    </div>
                                    <label className="switch shrink-0">
                                        <input
                                            type="checkbox"
                                            checked={botActive}
                                            onChange={(e) => setBotActive(e.target.checked)}
                                            disabled={!isSuperAdmin}
                                        />
                                        <span className="switch-track" />
                                        <span className="switch-thumb" />
                                    </label>
                                </div>

                                {/* Save bar */}
                                {isSuperAdmin && (
                                    <div className="flex items-center justify-end gap-2 pt-1">
                                        {dirty && (
                                            <span className="text-xs text-muted mr-auto">
                                                Есть несохранённые изменения
                                            </span>
                                        )}
                                        <button
                                            onClick={() => { if (settings) { setBotToken(settings.telegram_bot_token || ''); setBotActive(settings.is_active); } }}
                                            disabled={!dirty || saving}
                                            className="btn-ghost"
                                        >
                                            Отменить
                                        </button>
                                        <button
                                            onClick={handleSaveSettings}
                                            disabled={!dirty || saving}
                                            className="btn-primary"
                                        >
                                            {saving
                                                ? <><Loader2 className="w-4 h-4 animate-spin" /> Сохранение...</>
                                                : <><Save className="w-4 h-4" /> Сохранить</>}
                                        </button>
                                    </div>
                                )}
                            </div>
                        </section>

                        {/* ============ Info: notification routing ============ */}
                        <section className="card p-5 sm:p-6">
                            <header className="flex items-start gap-3 mb-4">
                                <div className="shrink-0 w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center" style={{ color: 'var(--accent)' }}>
                                    <Bell className="w-4 h-4" />
                                </div>
                                <div>
                                    <h3 className="text-base font-semibold text-main">Уведомления в Telegram</h3>
                                    <p className="text-sm text-muted mt-0.5">Как настроить адресацию событий</p>
                                </div>
                            </header>

                            <p className="text-sm text-muted mb-5">
                                Уведомления о начале и окончании смены отправляются <strong className="text-main">тому администратору, который создал работника</strong>.
                            </p>

                            <div className="grid md:grid-cols-2 gap-3">
                                <div className="rounded-md p-4" style={{ background: 'var(--accent-soft)' }}>
                                    <p className="text-sm font-medium mb-2" style={{ color: 'var(--accent-soft-fg)' }}>
                                        Настроить уведомления
                                    </p>
                                    <ol className="list-decimal list-inside space-y-1 text-sm" style={{ color: 'var(--accent-soft-fg)' }}>
                                        <li>Откройте раздел <strong>«Роли»</strong></li>
                                        <li>В профиле админа укажите <strong>Telegram Chat ID</strong></li>
                                        <li>Админ начнёт получать события от своих работников</li>
                                    </ol>
                                </div>

                                <div className="rounded-md p-4 bg-subtle border border-border">
                                    <p className="text-sm font-medium text-main mb-2">Как узнать Chat ID</p>
                                    <ol className="list-decimal list-inside space-y-1 text-sm text-muted">
                                        <li>Напишите боту <code className="kbd font-mono">@userinfobot</code></li>
                                        <li>Он пришлёт ваш числовой Chat ID</li>
                                        <li>Скопируйте его в поле <em>Telegram Chat ID</em> профиля</li>
                                    </ol>
                                </div>
                            </div>
                        </section>
                    </div>
                )
            )}
        </div>
    );
}

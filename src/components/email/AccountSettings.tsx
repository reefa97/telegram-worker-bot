import React, { useState, useEffect } from 'react';
import { Loader2, Plus, Trash2, Users, Image as ImageIcon, Link as LinkIcon, Mail } from 'lucide-react';
import { EmailAccount } from './types';
import { useAuth } from '../../contexts/AuthContext';
import { AccountAccessModal } from './AccountAccessModal';
import { supabase } from '../../lib/supabase';
import { EMAIL_SERVICE_URL } from './config';

interface AccountSettingsProps {
    onClose: () => void;
}

export const AccountSettings: React.FC<AccountSettingsProps> = ({ onClose }) => {
    const { adminUser } = useAuth();
    const isSuperAdmin = adminUser?.role === 'super_admin';
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
    const [message, setMessage] = useState('');
    const [accounts, setAccounts] = useState<EmailAccount[]>([]);
    const [accessAccount, setAccessAccount] = useState<EmailAccount | null>(null);

    const fetchAccounts = async () => {
        try {
            const res = await fetch(`${EMAIL_SERVICE_URL}/api/mail/accounts`, {
                headers: {
                    'X-User-Id': adminUser?.id || '',
                    'X-User-Role': adminUser?.role || ''
                }
            });
            if (res.ok) {
                const data = await res.json();
                setAccounts(data);
            }
        } catch (e) {
            console.error('Failed to fetch accounts:', e);
        }
    };

    useEffect(() => {
        if (adminUser) {
            fetchAccounts();
        }
    }, [adminUser]);

    const [form, setForm] = useState({
        email_address: '',
        password: '',
        imap_host: 'serwer2599155.home.pl',
        imap_port: 993,
        smtp_host: 'serwer2599155.home.pl',
        smtp_port: 465,
        signature_text: '',
        signature_image_url: '',
        signature_image_link: ''
    });

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setForm({ ...form, [e.target.name]: e.target.value });
    };

    const handleDelete = async (id: string, email: string) => {
        if (!confirm(`Вы уверены, что хотите скрыть аккаунт ${email}? Письма останутся в базе, но не будут отображаться.`)) {
            return;
        }

        setLoading(true);
        try {
            const res = await fetch(`${EMAIL_SERVICE_URL}/api/mail/accounts/${id}`, {
                method: 'DELETE',
                headers: {
                    'X-User-Id': adminUser?.id || '',
                    'X-User-Role': adminUser?.role || ''
                }
            });
            if (res.ok) {
                await fetchAccounts();
            } else {
                const data = await res.json();
                alert(`Ошибка при удалении: ${data.error}`);
            }
        } catch (e) {
            console.error('Failed to delete account:', e);
            alert('Ошибка сети при удалении');
        } finally {
            setLoading(false);
        }
    };

    const handleOpenAccess = (acc: EmailAccount) => {
        setAccessAccount(acc);
    };

    const handleTest = async () => {
        setLoading(true);
        setStatus('idle');
        setMessage('');
        try {
            const res = await fetch(`${EMAIL_SERVICE_URL}/api/mail/test-connection`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: form.email_address,
                    password: form.password,
                    imap_host: form.imap_host,
                    imap_port: Number(form.imap_port)
                })
            });
            const data = await res.json();
            if (res.ok) {
                setStatus('success');
                setMessage('Соединение успешно!');
            } else {
                setStatus('error');
                setMessage(data.message || 'Ошибка соединения');
            }
        } catch (e) {
            setStatus('error');
            setMessage('Ошибка сети');
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        setLoading(true);
        try {
            // 1. Create Account
            const res = await fetch(`${EMAIL_SERVICE_URL}/api/mail/accounts`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-User-Id': adminUser?.id || '',
                    'X-User-Role': adminUser?.role || ''
                },
                body: JSON.stringify({
                    email_address: form.email_address,
                    password: form.password,
                    imap_host: form.imap_host,
                    imap_port: Number(form.imap_port),
                    smtp_host: form.smtp_host,
                    smtp_port: Number(form.smtp_port),
                    signature_text: form.signature_text || null,
                    signature_image_url: form.signature_image_url || null,
                    signature_image_link: form.signature_image_link || null
                })
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Failed to create account');
            }

            // 2. Trigger Sync (Background)
            fetch(`${EMAIL_SERVICE_URL}/api/mail/sync`, {
                method: 'POST',
                headers: {
                    'X-User-Id': adminUser?.id || '',
                    'X-User-Role': adminUser?.role || ''
                }
            }).catch(console.error);

            alert('Аккаунт добавлен! Началась загрузка писем...');
            onClose();
        } catch (e: any) {
            alert(`Ошибка: ${e.message}`);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-card rounded-lg w-full max-w-2xl p-6 shadow-xl">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-xl font-bold dark:text-gray-100">Настройки почты</h2>
                    <button onClick={onClose} className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">✕</button>
                </div>

                <div className="grid grid-cols-2 gap-6">
                    {/* Список аккаунтов */}
                    <div className="border-r dark:border-gray-700 pr-6">
                        <h3 className="font-semibold mb-4 text-main">Подключенные ящики</h3>
                        <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2">
                            {accounts.map(acc => (
                                <div key={acc.id} className="flex justify-between items-center p-3 bg-subtle rounded border dark:border-gray-700">
                                    <div className="flex flex-col">
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm font-medium truncate max-w-[120px] font-bold dark:text-gray-200">{acc.email_address}</span>
                                        </div>
                                        <span className="text-[10px] text-muted">{acc.imap_host}</span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        {isSuperAdmin && (
                                            <button
                                                onClick={() => handleOpenAccess(acc)}
                                                className="p-1.5 rounded transition text-blue-500 hover:bg-blue-50"
                                                title="Управление доступом"
                                            >
                                                <Users size={14} />
                                            </button>
                                        )}
                                        <button
                                            onClick={() => {
                                                setForm({
                                                    email_address: acc.email_address,
                                                    password: '',
                                                    imap_host: acc.imap_host,
                                                    imap_port: acc.imap_port,
                                                    smtp_host: acc.smtp_host,
                                                    smtp_port: acc.smtp_port,
                                                    signature_text: acc.signature_text || '',
                                                    signature_image_url: acc.signature_image_url || '',
                                                    signature_image_link: acc.signature_image_link || ''
                                                });
                                            }}
                                            className="p-1.5 rounded transition text-gray-400 hover:text-blue-500 hover:bg-blue-50"
                                            title="Редактировать"
                                        >
                                            <Mail size={14} />
                                        </button>
                                        <button
                                            onClick={() => handleDelete(acc.id, acc.email_address)}
                                            disabled={loading}
                                            className="text-red-400 hover:text-red-600 hover:bg-red-50 p-1.5 rounded transition"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                </div>
                            ))}
                            {accounts.length === 0 && (
                                <div className="text-center py-8 text-gray-400 text-xs italic">
                                    Нет подключенных аккаунтов
                                </div>
                            )}
                        </div>
                        <button className="mt-4 w-full py-2 border border-dashed border-gray-300 dark:border-gray-600 text-muted hover:bg-gray-50 dark:hover:bg-gray-700 rounded flex items-center justify-center gap-2 transition-colors">
                            <Plus size={16} /> Добавить аккаунт
                        </button>
                    </div>

                    {/* Форма добавления */}
                    <div>
                        <h3 className="font-semibold mb-4 text-main">Добавить / Редактировать</h3>
                        <div className="space-y-3 max-h-[450px] overflow-y-auto pr-2 custom-scrollbar">
                            <div>
                                <label className="block text-xs font-medium text-muted mb-1">Email</label>
                                <input name="email_address" value={form.email_address} onChange={handleChange} className="w-full p-2 border dark:border-gray-700 rounded text-sm bg-transparent dark:text-gray-100" placeholder="user@example.com" />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-muted mb-1">Пароль</label>
                                <input name="password" type="password" value={form.password} onChange={handleChange} className="w-full p-2 border dark:border-gray-700 rounded text-sm bg-transparent dark:text-gray-100" placeholder="••••••••" />
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <label className="block text-xs font-medium text-muted mb-1">IMAP Host</label>
                                    <input name="imap_host" value={form.imap_host} onChange={handleChange} className="w-full p-2 border dark:border-gray-700 rounded text-sm bg-transparent dark:text-gray-100" placeholder="imap.gmail.com" />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-muted mb-1">Port</label>
                                    <input name="imap_port" type="number" value={form.imap_port} onChange={handleChange} className="w-full p-2 border dark:border-gray-700 rounded text-sm bg-transparent dark:text-gray-100" />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <label className="block text-xs font-medium text-muted mb-1">SMTP Host</label>
                                    <input name="smtp_host" value={form.smtp_host} onChange={handleChange} className="w-full p-2 border dark:border-gray-700 rounded text-sm bg-transparent dark:text-gray-100" placeholder="smtp.gmail.com" />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-muted mb-1">Port</label>
                                    <input name="smtp_port" type="number" value={form.smtp_port} onChange={handleChange} className="w-full p-2 border dark:border-gray-700 rounded text-sm bg-transparent dark:text-gray-100" />
                                </div>
                            </div>

                            <div className="pt-4 border-t dark:border-gray-700">
                                <h4 className="text-sm font-semibold text-main mb-3">Подпись (Стопка)</h4>
                                <div className="space-y-3">
                                    <div>
                                        <label className="block text-xs font-medium text-muted mb-1">Текст подписи</label>
                                        <textarea
                                            name="signature_text"
                                            value={form.signature_text}
                                            onChange={(e) => setForm({ ...form, signature_text: e.target.value })}
                                            className="w-full p-2 border dark:border-gray-700 rounded text-sm h-20 bg-transparent dark:text-gray-100"
                                            placeholder="Ваше имя, должность..."
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-muted mb-1">Ссылка на изображение</label>
                                        <div className="flex gap-2">
                                            <div className="flex-1 relative">
                                                <input
                                                    name="signature_image_url"
                                                    value={form.signature_image_url}
                                                    onChange={handleChange}
                                                    className="w-full p-2 pl-8 border dark:border-gray-700 rounded text-sm bg-transparent dark:text-gray-100"
                                                    placeholder="https://..."
                                                />
                                                <ImageIcon className="absolute left-2.5 top-2.5 text-muted" size={14} />
                                            </div>
                                            <label className="cursor-pointer bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 px-3 py-2 rounded text-xs flex items-center gap-1 transition text-gray-600 dark:text-gray-300">
                                                <ImageIcon size={14} />
                                                <span>Загрузить</span>
                                                <input
                                                    type="file"
                                                    className="hidden"
                                                    accept="image/*"
                                                    onChange={async (e) => {
                                                        const file = e.target.files?.[0];
                                                        if (!file) return;
                                                        setLoading(true);
                                                        try {
                                                            const fileName = `${Date.now()}-${file.name}`;
                                                            const { data: _data, error } = await supabase.storage
                                                                .from('signatures')
                                                                .upload(fileName, file);
                                                            if (error) throw error;
                                                            const { data: { publicUrl } } = supabase.storage
                                                                .from('signatures')
                                                                .getPublicUrl(fileName);
                                                            setForm({ ...form, signature_image_url: publicUrl });
                                                        } catch (err: any) {
                                                            alert('Ошибка при загрузке: ' + err.message);
                                                        } finally {
                                                            setLoading(false);
                                                        }
                                                    }}
                                                />
                                            </label>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-muted mb-1">Ссылка при клике на картинку</label>
                                        <div className="relative">
                                            <input
                                                name="signature_image_link"
                                                value={form.signature_image_link}
                                                onChange={handleChange}
                                                className="w-full p-2 pl-8 border dark:border-gray-700 rounded text-sm bg-transparent dark:text-gray-100"
                                                placeholder="https://yourwebsite.com"
                                            />
                                            <LinkIcon className="absolute left-2.5 top-2.5 text-muted" size={14} />
                                        </div>
                                    </div>
                                    {form.signature_image_url && (
                                        <div className="mt-2 p-2 bg-subtle rounded border border-dashed dark:border-gray-700">
                                            <p className="text-[10px] text-muted mb-1 uppercase">Предпросмотр картинки:</p>
                                            <img src={form.signature_image_url} className="max-h-20 rounded" alt="Signature preview" />
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {message && (
                            <div className={`mt-2 text-sm ${status === 'success' ? 'text-green-600' : 'text-red-600'}`}>
                                {message}
                            </div>
                        )}

                        <div className="mt-6 flex gap-2">
                            <button
                                onClick={handleTest}
                                disabled={loading}
                                className="flex-1 py-2 border border-border rounded text-sm hover:bg-gray-50 dark:hover:bg-gray-700 dark:text-gray-300 flex justify-center items-center gap-2 transition-colors"
                            >
                                {loading && <Loader2 size={14} className="animate-spin" />}
                                Тест
                            </button>
                            <button onClick={handleSave} disabled={loading} className="flex-1 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700">
                                {loading ? 'Сохранение...' : 'Сохранить'}
                            </button>
                        </div>
                    </div>
                </div>
                {accessAccount && (
                    <AccountAccessModal
                        account={accessAccount}
                        onClose={() => setAccessAccount(null)}
                    />
                )}
            </div>
        </div>
    );
};

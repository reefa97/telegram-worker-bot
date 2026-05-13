import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../lib/supabase';
import { Mail, Plus, Trash2, RefreshCw, Send, Search, Edit2, Image, Inbox, Send as SendIcon, ChevronDown } from 'lucide-react';

export default function EmailPanel() {
    const [view, setView] = useState<'inbox' | 'settings'>('inbox');
    const [accounts, setAccounts] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [showAccountModal, setShowAccountModal] = useState(false);
    const [editingAccount, setEditingAccount] = useState<any | null>(null);
    const [selectedAccount, setSelectedAccount] = useState<any | null>(null);

    useEffect(() => {
        loadAccounts();
    }, []);

    const loadAccounts = async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from('email_accounts')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) console.error('Error loading accounts:', error);
        else {
            setAccounts(data || []);
            // Auto-select first account if none selected and accounts exist
            if (data && data.length > 0 && !selectedAccount) {
                setSelectedAccount(data[0]);
            }
        }
        setLoading(false);
    };

    return (
        <div>
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
                <div>
                    <h2 className="text-2xl font-bold text-main flex items-center gap-2">
                        <Mail className="text-primary-500" />
                        Почта
                    </h2>
                    <p className="text-muted text-sm mt-1">Управление почтовыми ящиками и рассылками</p>
                </div>

                <div className="flex items-center gap-3">
                    <div className="flex bg-subtle p-1 rounded-lg border border-border">
                        <button
                            onClick={() => setView('inbox')}
                            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${view === 'inbox'
                                ? 'bg-white dark:bg-gray-700 shadow-sm text-primary-600 dark:text-primary-400'
                                : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                                }`}
                        >
                            Почта
                        </button>
                        <button
                            onClick={() => setView('settings')}
                            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${view === 'settings'
                                ? 'bg-white dark:bg-gray-700 shadow-sm text-primary-600 dark:text-primary-400'
                                : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                                }`}
                        >
                            Настройки
                        </button>
                    </div>

                    {view === 'settings' && (
                        <button
                            onClick={() => { setEditingAccount(null); setShowAccountModal(true); }}
                            className="btn-primary flex items-center gap-2 whitespace-nowrap"
                        >
                            <Plus className="w-4 h-4" />
                            <span className="hidden sm:inline">Добавить аккаунт</span>
                        </button>
                    )}
                </div>
            </div>

            {/* Content */}
            <div className="animate-fadeIn">
                {view === 'inbox' ? (
                    <InboxView
                        accounts={accounts}
                        selectedAccount={selectedAccount}
                        onSelectAccount={setSelectedAccount}
                    />
                ) : (
                    <SettingsView
                        accounts={accounts}
                        loading={loading}
                        onDelete={loadAccounts}
                        onEdit={(acc) => { setEditingAccount(acc); setShowAccountModal(true); }}
                    />
                )}
            </div>

            {/* Account Modal */}
            {showAccountModal && (
                <AccountModal
                    account={editingAccount}
                    onClose={() => setShowAccountModal(false)}
                    onSave={() => { setShowAccountModal(false); loadAccounts(); }}
                />
            )}
        </div>
    );
}

function SettingsView({ accounts, loading, onDelete, onEdit }: { accounts: any[], loading: boolean, onDelete: () => void, onEdit: (acc: any) => void }) {
    if (loading) {
        return (
            <div className="flex justify-center items-center h-64">
                <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    if (accounts.length === 0) {
        return (
            <div className="text-center py-12 bg-subtle/30 rounded-2xl border border-dashed border-border">
                <Mail className="w-12 h-12 text-muted mx-auto mb-3 opacity-50" />
                <h3 className="text-lg font-medium text-main">Нет подключенных аккаунтов</h3>
                <p className="text-muted text-sm mt-1">Добавьте почтовый ящик, чтобы начать работу</p>
            </div>
        );
    }

    return (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {accounts.map(account => (
                <div key={account.id} className="card-interactive group p-5 flex flex-col gap-4 relative">
                    <div className="flex justify-between items-start">
                        <div>
                            <h3 className="font-semibold text-main text-lg">{account.email}</h3>
                            <div className="flex items-center gap-2 mt-1">
                                <span className={`w-2 h-2 rounded-full ${account.is_active ? 'bg-green-500' : 'bg-gray-300'}`}></span>
                                <span className="text-xs text-muted">{account.is_active ? 'Активен' : 'Отключен'}</span>
                            </div>
                        </div>

                        <div className="flex gap-1">
                            <button
                                onClick={() => onEdit(account)}
                                className="p-1.5 text-muted hover:text-primary hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded-lg transition-colors"
                            >
                                <Edit2 size={16} />
                            </button>
                            <button
                                onClick={async () => {
                                    if (confirm('Удалить этот аккаунт?')) {
                                        await supabase.from('email_accounts').delete().eq('id', account.id);
                                        onDelete();
                                    }
                                }}
                                className="p-1.5 text-muted hover:text-red-600 hover:bg-danger/10 rounded-lg transition-colors"
                            >
                                <Trash2 size={16} />
                            </button>
                        </div>
                    </div>

                    <div className="bg-subtle/50 rounded-lg p-3 text-xs space-y-1 font-mono text-muted">
                        <div className="flex justify-between">
                            <span>IMAP:</span>
                            <span className="text-main">{account.imap_host}:{account.imap_port}</span>
                        </div>
                        <div className="flex justify-between">
                            <span>SMTP:</span>
                            <span className="text-main">{account.smtp_host}:{account.smtp_port}</span>
                        </div>
                    </div>

                    <div className="mt-auto pt-2 border-t border-border flex justify-between items-center text-xs text-muted">
                        <span>Обновлено: {new Date(account.updated_at).toLocaleDateString()}</span>
                    </div>
                </div>
            ))}
        </div>
    );
}

function AccountModal({ account, onClose, onSave }: { account?: any, onClose: () => void, onSave: () => void }) {
    const [formData, setFormData] = useState({
        email: account?.email || '',
        password: account?.password || '',
        imap_host: account?.imap_host || 'serwer2599155.home.pl',
        imap_port: account?.imap_port || 993,
        smtp_host: account?.smtp_host || 'serwer2599155.home.pl',
        smtp_port: account?.smtp_port || 465,
        signature_html: account?.signature_html || ''
    });
    const [saving, setSaving] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        try {
            // 1. Verify Configuration
            const { data: verifyData, error: verifyError } = await supabase.functions.invoke('verify-email-config', {
                body: formData
            });

            if (verifyError || (verifyData && verifyData.error)) {
                // Remove unused 'data' warning by not restructuring it if not needed, or just allow it.
                // actually verifyData is used.
                alert(`Ошибка подключения: ${verifyError?.message || verifyData?.error}`);
                setSaving(false);
                return;
            }

            // 2. Save if verified
            // Get current user for 'created_by'
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error("No authenticated user found");

            if (account) {
                await supabase.from('email_accounts').update(formData).eq('id', account.id);
            } else {
                await supabase.from('email_accounts').insert([{
                    ...formData,
                    created_by: user.id
                }]);
            }
            onSave();
        } catch (error: any) {
            console.error('Error saving account:', error);
            alert('Ошибка при сохранении: ' + error.message);
        } finally {
            setSaving(false);
        }
    };

    return createPortal(
        <div className="modal-overlay">
            <div className="modal-content max-w-2xl">
                <div className="modal-header">
                    <h3 className="text-xl font-bold text-main">
                        {account ? 'Редактировать аккаунт' : 'Новый аккаунт'}
                    </h3>
                    <button onClick={onClose} className="btn-icon">
                        <span className="text-2xl leading-none">&times;</span>
                    </button>
                </div>

                <form onSubmit={handleSubmit}>
                    <div className="modal-body space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="label">Email</label>
                            <input
                                type="email"
                                required
                                className="input w-full"
                                value={formData.email}
                                onChange={e => setFormData({ ...formData, email: e.target.value })}
                                placeholder="worker@example.com"
                            />
                        </div>
                        <div>
                            <label className="label">Пароль</label>
                            <input
                                type="password"
                                required
                                className="input w-full"
                                value={formData.password}
                                onChange={e => setFormData({ ...formData, password: e.target.value })}
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-subtle/30 p-4 rounded-lg border border-border">
                        <div>
                            <label className="label text-xs uppercase tracking-wider text-muted mb-2">IMAP (Входящие)</label>
                            <div className="space-y-2">
                                <input
                                    type="text"
                                    required
                                    className="input w-full text-sm"
                                    placeholder="Host"
                                    value={formData.imap_host}
                                    onChange={e => setFormData({ ...formData, imap_host: e.target.value })}
                                />
                                <input
                                    type="number"
                                    required
                                    className="input w-full text-sm"
                                    placeholder="Port"
                                    value={formData.imap_port}
                                    onChange={e => setFormData({ ...formData, imap_port: parseInt(e.target.value) })}
                                />
                            </div>
                        </div>
                        <div>
                            <label className="label text-xs uppercase tracking-wider text-muted mb-2">SMTP (Исходящие)</label>
                            <div className="space-y-2">
                                <input
                                    type="text"
                                    required
                                    className="input w-full text-sm"
                                    placeholder="Host"
                                    value={formData.smtp_host}
                                    onChange={e => setFormData({ ...formData, smtp_host: e.target.value })}
                                />
                                <input
                                    type="number"
                                    required
                                    className="input w-full text-sm"
                                    placeholder="Port"
                                    value={formData.smtp_port}
                                    onChange={e => setFormData({ ...formData, smtp_port: parseInt(e.target.value) })}
                                />
                            </div>
                        </div>
                    </div>

                    <div>
                        <div className="flex justify-between items-center mb-2">
                            <label className="label mb-0">Подпись (HTML)</label>
                            <label className="cursor-pointer p-1.5 bg-card rounded-md border border-border shadow-sm hover:bg-subtle transition-colors flex items-center justify-center gap-2" title="Вставить изображение">
                                <input
                                    type="file"
                                    className="hidden"
                                    accept="image/*"
                                    onChange={async (e) => {
                                        const file = e.target.files?.[0];
                                        if (!file) return;

                                        // 1. Upload
                                        const path = `signatures/${Date.now()}_${file.name}`;
                                        const { data: _data, error } = await supabase.storage
                                            .from('email-attachments') // Using existing bucket
                                            .upload(path, file);

                                        if (error) {
                                            alert('Ошибка загрузки: ' + error.message);
                                            return;
                                        }

                                        // 2. Get Public URL
                                        const { data: { publicUrl } } = supabase.storage
                                            .from('email-attachments')
                                            .getPublicUrl(path);

                                        // 3. Insert into textarea
                                        const imgTag = `<img src="${publicUrl}" alt="signature" style="max-height: 100px;">`;
                                        setFormData(prev => ({
                                            ...prev,
                                            signature_html: (prev.signature_html || '') + '\n' + imgTag
                                        }));
                                    }}
                                />
                                <Image size={14} className="text-primary-600 dark:text-primary-400" />
                                <span className="text-xs font-medium text-main">Добавить фото</span>
                            </label>
                        </div>
                        <textarea
                            className="input w-full h-32 font-mono text-xs"
                            value={formData.signature_html}
                            onChange={e => setFormData({ ...formData, signature_html: e.target.value })}
                            placeholder="<div>С уважением,<br>...</div>"
                        />
                        <p className="text-xs text-muted mt-1">Поддерживается HTML и CSS inline стили.</p>
                    </div>

                    </div>

                    <div className="modal-footer">
                        <button type="button" onClick={onClose} className="btn-secondary">
                            Отмена
                        </button>
                        <button type="submit" disabled={saving} className="btn-primary">
                            {saving ? 'Сохранение...' : 'Сохранить'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    , document.body);
}

function InboxView({ accounts, selectedAccount, onSelectAccount }: { accounts: any[], selectedAccount: any, onSelectAccount: (acc: any) => void }) {
    const [messages, setMessages] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [selectedMessage, setSelectedMessage] = useState<any | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [currentFolder, setCurrentFolder] = useState<'inbox' | 'sent'>('inbox');
    const [replyText, setReplyText] = useState('');
    const [sending, setSending] = useState(false);
    const [showCompose, setShowCompose] = useState(false);
    const [composeData, setComposeData] = useState({ to: '', subject: '', body: '' });

    useEffect(() => {
        if (selectedAccount) {
            loadMessages();
        } else {
            setMessages([]);
        }
    }, [selectedAccount, currentFolder]); // Reload when account or folder changes

    const loadMessages = async (forceSync = false) => {
        if (!selectedAccount) return;

        setLoading(true);

        if (forceSync) {
            try {
                // Pass account_id to poller to only sync this account?
                // Or let poller sync all? Poller syncs all active accounts.
                // We could optimize poller to accept account_id, but current implementation syncs all.
                // It's acceptable for now.
                await supabase.functions.invoke('email-poller');
                await new Promise(r => setTimeout(r, 1000));
            } catch (err) {
                console.error("Failed to sync emails:", err);
            }
        }

        const { data, error } = await supabase
            .from('email_messages')
            .select(`*, account:email_accounts(email)`)
            .eq('account_id', selectedAccount.id) // Filter by Account ID
            .eq('folder', currentFolder) // Filter by folder
            .order('received_at', { ascending: false });

        if (error) console.error('Error loading messages:', error);
        else setMessages(data || []);
        setLoading(false);
    };

    const handleSend = async () => {
        if (!selectedAccount) return;
        setSending(true);

        try {
            const { error: fnError } = await supabase.functions.invoke('send-email', {
                body: {
                    account_id: selectedAccount.id, // Use selected account
                    to: showCompose ? composeData.to : selectedMessage.from_address,
                    subject: showCompose ? composeData.subject : `Re: ${selectedMessage.subject}`,
                    body: showCompose ? composeData.body : replyText,
                    reply_to_message_id: showCompose ? undefined : selectedMessage.remote_id
                }
            });

            if (fnError) throw fnError;

            alert('Письмо отправлено!');
            setReplyText('');
            setComposeData({ to: '', subject: '', body: '' });
            setShowCompose(false);

            if (currentFolder === 'sent') {
                loadMessages(true);
            } else {
                loadMessages();
            }

        } catch (error: any) {
            console.error('Error sending email:', error);
            alert('Ошибка отправки: ' + error.message);
        } finally {
            setSending(false);
        }
    };

    const filteredMessages = messages.filter(msg =>
        msg.subject?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        msg.from_address?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        msg.from_name?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    if (!selectedAccount) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center h-[calc(100vh-180px)] bg-subtle/10 rounded-2xl border border-dashed border-border text-muted">
                <Mail className="w-12 h-12 mb-3 opacity-30" />
                <p>Выберите аккаунт для просмотра почты</p>
                {accounts.length === 0 && <p className="text-xs mt-2">Нет доступных аккаунтов. Добавьте их в настройках.</p>}
            </div>
        );
    }

    return (
        <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden flex flex-col md:flex-row h-[calc(100vh-180px)]">

            {/* List */}
            <div className={`${selectedMessage || showCompose ? 'hidden md:flex' : 'flex'} w-full md:w-1/3 border-r border-border flex-col bg-subtle/10`}>
                <div className="p-4 border-b border-border flex flex-col gap-3">

                    {/* Account Selector */}
                    <div className="relative">
                        <select
                            className="w-full appearance-none bg-card border border-border px-3 py-2 rounded-lg font-medium text-main focus:ring-2 focus:ring-primary-500 pr-8"
                            value={selectedAccount.id}
                            onChange={(e) => {
                                const acc = accounts.find(a => a.id === e.target.value);
                                if (acc) {
                                    onSelectAccount(acc);
                                    setSelectedMessage(null);
                                    setShowCompose(false);
                                }
                            }}
                        >
                            {accounts.map(acc => (
                                <option key={acc.id} value={acc.id}>{acc.email}</option>
                            ))}
                        </select>
                        <ChevronDown className="w-4 h-4 text-gray-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    </div>

                    {/* Folder Switcher */}
                    <div className="flex bg-subtle p-1 rounded-lg">
                        <button
                            onClick={() => { setCurrentFolder('inbox'); setSelectedMessage(null); setShowCompose(false); }}
                            className={`flex-1 flex items-center justify-center gap-2 py-1.5 rounded-md text-sm font-medium transition-all ${currentFolder === 'inbox' ? 'bg-card shadow-sm text-primary-600 dark:text-primary-400' : 'text-muted hover:text-main'}`}
                        >
                            <Inbox size={14} /> Входящие
                        </button>
                        <button
                            onClick={() => { setCurrentFolder('sent'); setSelectedMessage(null); setShowCompose(false); }}
                            className={`flex-1 flex items-center justify-center gap-2 py-1.5 rounded-md text-sm font-medium transition-all ${currentFolder === 'sent' ? 'bg-card shadow-sm text-primary-600 dark:text-primary-400' : 'text-muted hover:text-main'}`}
                        >
                            <SendIcon size={14} /> Отправленные
                        </button>
                    </div>

                    <div className="flex gap-2">
                        <div className="relative flex-1">
                            <input
                                type="text"
                                placeholder="Поиск..."
                                className="w-full pl-9 pr-3 py-2 bg-card border border-border rounded-lg text-sm focus:ring-2 focus:ring-primary-500"
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                            />
                            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        </div>
                        <button onClick={() => { setShowCompose(true); setSelectedMessage(null); }} className="p-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors shadow-sm" title="Написать письмо">
                            <Plus size={18} />
                        </button>
                        <button onClick={() => loadMessages(true)} className="p-2 hover:bg-subtle rounded-lg text-muted hover:text-main transition-colors" title="Обновить и синхронизировать">
                            <RefreshCw size={18} />
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto divide-y divide-border">
                    {loading ? (
                        <div className="p-8 text-center text-muted">Загрузка...</div>
                    ) : filteredMessages.length === 0 ? (
                        <div className="p-8 text-center text-muted">Нет писем</div>
                    ) : (
                        filteredMessages.map(msg => (
                            <div
                                key={msg.id}
                                onClick={() => { setSelectedMessage(msg); setShowCompose(false); }}
                                className={`p-4 cursor-pointer hover:bg-subtle/50 transition-all ${selectedMessage?.id === msg.id ? 'bg-primary-50 dark:bg-primary-900/10 border-l-4 border-primary-500 pl-3' : 'pl-4 border-l-4 border-transparent'}`}
                            >
                                <div className="flex justify-between items-start mb-1">
                                    <span className={`text-sm truncate pr-2 ${!msg.is_read ? 'font-bold text-main' : 'font-medium text-main'}`}>
                                        {currentFolder === 'sent' ? `Кому: ${msg.to_address}` : (msg.from_name || msg.from_address)}
                                    </span>
                                    <span className="text-[10px] text-muted shrink-0 bg-subtle px-1.5 py-0.5 rounded">
                                        {new Date(msg.received_at).toLocaleDateString()}
                                    </span>
                                </div>
                                <div className={`text-sm mb-1 truncate ${!msg.is_read ? 'font-semibold text-main' : 'text-main'}`}>
                                    {msg.subject || '(Без темы)'}
                                </div>
                                <div className="text-xs text-muted truncate opacity-80">
                                    {msg.body_preview || msg.body_text?.slice(0, 50)}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* Detail / Compose */}
            <div className={`${!selectedMessage && !showCompose ? 'hidden md:flex' : 'flex'} flex-1 flex-col bg-card`}>
                {showCompose ? (
                    <div className="flex-1 flex flex-col h-full bg-card">
                        <div className="p-6 border-b border-border bg-subtle/5 flex justify-between items-center">
                            <h2 className="text-xl font-bold text-main">Новое письмо</h2>
                            <div className="text-sm text-muted">От: <span className="font-medium text-main">{selectedAccount.email}</span></div>
                            <button onClick={() => setShowCompose(false)} className="text-muted hover:text-main">&times;</button>
                        </div>
                        <div className="p-6 flex-1 flex flex-col gap-4 overflow-y-auto">
                            <input
                                className="input w-full"
                                placeholder="Кому (email)"
                                value={composeData.to}
                                onChange={e => setComposeData({ ...composeData, to: e.target.value })}
                            />
                            <input
                                className="input w-full"
                                placeholder="Тема"
                                value={composeData.subject}
                                onChange={e => setComposeData({ ...composeData, subject: e.target.value })}
                            />
                            <textarea
                                className="input w-full flex-1 resize-none p-4 font-normal"
                                placeholder="Текст письма..."
                                value={composeData.body}
                                onChange={e => setComposeData({ ...composeData, body: e.target.value })}
                            />
                        </div>
                        <div className="p-4 border-t border-border bg-subtle/5 flex justify-end">
                            <button
                                onClick={handleSend}
                                disabled={sending}
                                className="btn-primary flex items-center gap-2"
                            >
                                <Send size={18} /> {sending ? 'Отправка...' : 'Отправить'}
                            </button>
                        </div>
                    </div>
                ) : selectedMessage ? (
                    <>
                        {/* Detail Header */}
                        <div className="p-6 border-b border-border bg-subtle/5">
                            <h2 className="text-xl font-bold mb-4 text-main leading-tight">{selectedMessage.subject}</h2>
                            <div className="flex justify-between items-start">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary-100 to-primary-200 dark:from-primary-900 dark:to-primary-800 flex items-center justify-center text-primary-700 dark:text-primary-300 font-bold text-lg shadow-sm">
                                        {(selectedMessage.from_name || selectedMessage.from_address)[0].toUpperCase()}
                                    </div>
                                    <div>
                                        <div className="font-medium text-main">
                                            {selectedMessage.from_name} <span className="text-muted text-sm font-normal">&lt;{selectedMessage.from_address}&gt;</span>
                                        </div>
                                        <div className="text-xs text-muted mt-0.5">
                                            Кому: {selectedMessage.to_address}
                                        </div>
                                    </div>
                                </div>
                                <div className="text-sm text-muted">
                                    {new Date(selectedMessage.received_at).toLocaleString()}
                                </div>
                            </div>
                        </div>

                        {/* Body — rendered in a sandboxed iframe so any script/img/onerror
                            from incoming email cannot run in the admin origin */}
                        <div className="flex-1 overflow-y-auto p-8 bg-card">
                            {selectedMessage.body_html ? (
                                <iframe
                                    title="Email body"
                                    sandbox=""
                                    srcDoc={`<!doctype html><html><head><meta charset="utf-8"><base target="_blank"><style>body{font-family:system-ui,-apple-system,sans-serif;color:#111;line-height:1.5;margin:0;padding:0}a{color:#2563eb}img{max-width:100%;height:auto}</style></head><body>${selectedMessage.body_html}</body></html>`}
                                    className="w-full min-h-[60vh] border-0 bg-white"
                                />
                            ) : (
                                <pre className="whitespace-pre-wrap font-sans text-main leading-relaxed">{selectedMessage.body_text}</pre>
                            )}
                        </div>

                        {/* Reply Area - Only show for inbox or if we want to reply to sent */}
                        <div className="p-4 border-t border-border bg-subtle/5">
                            <div className="relative">
                                <textarea
                                    className="input w-full h-24 mb-2 pr-12 resize-none"
                                    placeholder="Напишите ваш ответ..."
                                    value={replyText}
                                    onChange={e => setReplyText(e.target.value)}
                                />
                                <button
                                    onClick={handleSend}
                                    disabled={sending}
                                    className="absolute bottom-4 right-2 btn-primary p-2 rounded-full w-auto h-auto shadow-md"
                                >
                                    <Send size={18} />
                                </button>
                            </div>
                        </div>
                    </>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-muted bg-subtle/5">
                        <div className="w-20 h-20 bg-subtle/50 rounded-full flex items-center justify-center mb-4">
                            <Mail size={40} className="opacity-20" />
                        </div>
                        <p className="font-medium">Выберите письмо для просмотра</p>
                    </div>
                )}
            </div>
        </div>
    );
}

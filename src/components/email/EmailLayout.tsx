
import React, { useState, useEffect } from 'react';
import { MessageList } from './MessageList';
import { MessageView } from './MessageView';
import { EmailMessage, EmailAccount } from './types';
import { Plus, RefreshCw, Settings, ChevronDown, Mail, ArrowLeft } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

import { AccountSettings } from './AccountSettings';
import { ComposeModal } from './ComposeModal';
import { EMAIL_SERVICE_URL } from './config';

export const EmailLayout: React.FC = () => {
    const { adminUser } = useAuth();
    const [accounts, setAccounts] = useState<EmailAccount[]>([]);
    const [selectedAccountId, setSelectedAccountId] = useState<string | 'all'>(() => {
        if (typeof window !== 'undefined') {
            return localStorage.getItem('selectedEmailAccountId') || 'all';
        }
        return 'all';
    });

    useEffect(() => {
        localStorage.setItem('selectedEmailAccountId', selectedAccountId);
    }, [selectedAccountId]);
    const [selectedFolder, setSelectedFolder] = useState<string>('Inbox');
    const [messages, setMessages] = useState<EmailMessage[]>([]);
    const [selectedId, setSelectedId] = useState<string | undefined>();
    const [loading, setLoading] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [showCompose, setShowCompose] = useState(false);
    const [composeData, setComposeData] = useState<{ to?: string, subject?: string, body?: string, replyTo?: string, references?: string, id?: string, bcc?: string } | undefined>();
    const [mobileView, setMobileView] = useState<'folders' | 'list' | 'message'>('folders');

    const handleOpenCompose = (data?: typeof composeData) => {
        setComposeData(data);
        setShowCompose(true);
    };

    const handleReply = (msg: EmailMessage) => {
        handleOpenCompose({
            to: msg.from_address,
            subject: msg.subject?.startsWith('Re:') ? msg.subject : `Re: ${msg.subject || ''}`,
            body: `\n\n--- В ответ на ---\nОт: ${msg.from_name || msg.from_address}\nДата: ${msg.date_received ? new Date(msg.date_received * 1000).toLocaleString() : ''}\n\n`,
            replyTo: msg.message_id || undefined,
            references: msg.message_id ? (msg.references ? `${msg.references} ${msg.message_id}` : msg.message_id) : undefined
        });
    };

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

    const fetchMessages = async () => {
        setLoading(true);
        try {
            const folderParam = selectedFolder.toLowerCase();
            let url = `${EMAIL_SERVICE_URL}/api/mail/list/${folderParam}`;
            if (selectedAccountId !== 'all') {
                url += `?account_id=${selectedAccountId}`;
            }

            const res = await fetch(url, {
                headers: {
                    'X-User-Id': adminUser?.id || '',
                    'X-User-Role': adminUser?.role || ''
                }
            });
            if (res.ok) {
                const data = await res.json();
                setMessages(data);
            }
        } catch (error) {
            console.error('Failed to fetch messages:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteMessage = async (messageId: string, accountId: string, folder: string) => {
        if (!window.confirm('Вы уверены, что хотите удалить это сообщение?')) return;

        try {
            const res = await fetch(`${EMAIL_SERVICE_URL}/api/mail/message/${messageId}?folder=${folder.toLowerCase()}&account_id=${accountId}`, {
                method: 'DELETE',
                headers: {
                    'X-User-Id': adminUser?.id || '',
                    'X-User-Role': adminUser?.role || ''
                }
            });
            if (res.ok) {
                if (selectedId === messageId) setSelectedId(undefined);
                await fetchMessages();
            } else {
                const error = await res.json();
                alert('Ошибка при удалении: ' + (error.error || 'Неизвестная ошибка'));
            }
        } catch (err) {
            console.error('Delete failed:', err);
        }
    };

    const handleRefresh = async () => {
        setLoading(true);
        try {
            await fetch(`${EMAIL_SERVICE_URL}/api/mail/sync`, {
                method: 'POST',
                headers: {
                    'X-User-Id': adminUser?.id || '',
                    'X-User-Role': adminUser?.role || ''
                }
            });
            await fetchMessages();
        } catch (error) {
            console.error('Refresh failed:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (adminUser) {
            fetchAccounts();
        }
    }, [adminUser]);

    useEffect(() => {
        if (adminUser) {
            fetchMessages();
        }
    }, [selectedAccountId, selectedFolder, adminUser]);

    useEffect(() => {
        if (selectedId) {
            setMobileView('message');
        }
    }, [selectedId]);

    const selectedMessage = messages.find(m => m.id === selectedId) || null;

    return (
        <div className="flex h-full lg:h-[calc(100vh-64px)] bg-card lg:rounded-lg shadow-sm lg:border border-border overflow-hidden relative">
            {/* Sidebar / Folders */}
            <div className={`
                ${mobileView === 'folders' ? 'flex' : 'hidden'} 
                lg:flex w-full lg:w-64 bg-subtle/50 border-r border-border flex-col
            `}>
                <div className="p-4 border-b border-border space-y-3">
                    {/* Account Selector */}
                    <div className="relative">
                        <select
                            value={selectedAccountId}
                            onChange={(e) => setSelectedAccountId(e.target.value)}
                            className="w-full pl-9 pr-8 py-2 bg-card border border-border rounded-md text-sm font-medium text-main appearance-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent cursor-pointer transition shadow-sm"
                        >
                            <option value="all">Все аккаунты</option>
                            {accounts.map(acc => (
                                <option key={acc.id} value={acc.id}>
                                    {acc.email_address}
                                </option>
                            ))}
                        </select>
                        <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-gray-400">
                            <Mail size={16} />
                        </div>
                        <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none text-gray-400">
                            <ChevronDown size={14} />
                        </div>
                    </div>

                    <button
                        onClick={() => handleOpenCompose()}
                        className="w-full bg-blue-600 text-white rounded-md py-2.5 px-4 flex items-center justify-center gap-2 hover:bg-blue-700 transition shadow-sm active:transform active:scale-[0.98] font-semibold"
                    >
                        <Plus size={18} />
                        <span>Написать</span>
                    </button>
                </div>
                <div className="p-2 space-y-1 overflow-y-auto flex-1">
                    {[
                        { id: 'Inbox', label: 'Входящие' },
                        { id: 'Sent', label: 'Отправленные' },
                        { id: 'Drafts', label: 'Черновики' },
                        { id: 'Trash', label: 'Корзина' },
                        { id: 'Scheduled', label: 'Запланированные' }
                    ].map(folder => (
                        <div
                            key={folder.id}
                            onClick={() => {
                                setSelectedFolder(folder.id);
                                setMobileView('list');
                            }}
                            className={`px-3 py-2 rounded-md cursor-pointer text-sm font-medium flex justify-between transition ${selectedFolder === folder.id
                                ? 'bg-primary-50 dark:bg-primary-900/20 text-primary dark:text-primary-300'
                                : 'text-main hover:bg-subtle'
                                }`}
                        >
                            <span>{folder.label}</span>
                            {folder.id === 'Inbox' && messages.length > 0 && (
                                <span className={`px-2 py-0.5 rounded-full text-xs ${selectedFolder === 'Inbox' ? 'bg-blue-100 text-blue-800' : 'bg-gray-200 text-gray-600'}`}>
                                    {messages.length}
                                </span>
                            )}
                        </div>
                    ))}
                </div>
                <div className="p-4 border-t border-border mt-auto">
                    <div
                        onClick={() => setShowSettings(true)}
                        className="flex items-center gap-2 text-sm text-muted hover:text-main cursor-pointer transition-colors"
                    >
                        <Settings size={16} />
                        <span>Настройки</span>
                    </div>
                </div>
            </div>

            {/* Message List */}
            <div className={`
                ${mobileView === 'list' ? 'flex' : 'hidden'} 
                lg:flex w-full lg:w-80 border-r border-border flex-col bg-card
            `}>
                <div className="p-4 border-b border-border flex justify-between items-center bg-subtle/30">
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setMobileView('folders')}
                            className="lg:hidden p-1 -ml-1 hover:bg-subtle rounded text-muted"
                        >
                            <ArrowLeft size={18} />
                        </button>
                        <span className="font-bold text-muted uppercase text-[10px] lg:text-xs tracking-wider">
                            {selectedFolder === 'Inbox' ? 'Входящие' :
                                selectedFolder === 'Sent' ? 'Отправленные' :
                                    selectedFolder === 'Drafts' ? 'Черновики' :
                                        selectedFolder === 'Trash' ? 'Корзина' : 'Запланированные'}
                        </span>
                    </div>
                    <button
                        onClick={handleRefresh}
                        disabled={loading}
                        className={`p-1.5 hover:bg-subtle rounded-lg transition-all ${loading ? 'animate-spin opacity-50' : 'text-muted hover:text-main'}`}
                    >
                        <RefreshCw size={16} />
                    </button>
                </div>
                {loading ? (
                    <div className="flex-1 flex flex-col items-center justify-center p-8 text-gray-400 space-y-2">
                        <Loader2 className="animate-spin" size={24} />
                        <span className="text-xs font-medium">Загрузка писем...</span>
                    </div>
                ) : messages.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center p-8 text-muted text-center space-y-2">
                        <Mail className="opacity-20" size={48} />
                        <span className="text-sm">Нет сообщений</span>
                    </div>
                ) : (
                    <MessageList
                        messages={messages}
                        selectedId={selectedId}
                        onSelect={(id) => {
                            const msg = messages.find(m => m.id === id);
                            if (selectedFolder === 'Drafts' && msg) {
                                handleOpenCompose({
                                    id: msg.id,
                                    to: msg.to_address || '',
                                    subject: msg.subject || '',
                                    body: (msg as any).body_html || '',
                                    bcc: (msg as any).bcc_addresses?.join(', ') || '',
                                    replyTo: (msg as any).in_reply_to,
                                    references: (msg as any).references
                                });
                            } else {
                                setSelectedId(id);
                            }
                        }}
                    />
                )}
            </div>

            {/* Message View */}
            <div className={`
                ${mobileView === 'message' ? 'flex' : 'hidden'} 
                lg:flex flex-1 flex-col min-w-0 bg-card
            `}>
                {selectedId && (
                    <div className="lg:hidden p-4 border-b border-border flex items-center gap-2 bg-subtle/30">
                        <button
                            onClick={() => {
                                setSelectedId(undefined);
                                setMobileView('list');
                            }}
                            className="p-1 -ml-1 hover:bg-subtle rounded text-muted"
                        >
                            <ArrowLeft size={18} />
                        </button>
                        <span className="text-xs font-semibold text-muted">Вернуться к списку</span>
                    </div>
                )}
                <MessageView
                    message={selectedMessage}
                    onReply={handleReply}
                    onDelete={(id, accId) => handleDeleteMessage(id, accId, selectedFolder)}
                />
            </div>

            {showSettings && (
                <AccountSettings
                    onClose={() => {
                        setShowSettings(false);
                        fetchAccounts();
                    }}
                />
            )}
            {showCompose && (
                <ComposeModal
                    onClose={() => {
                        setShowCompose(false);
                        setComposeData(undefined);
                    }}
                    accountId={selectedAccountId === 'all' ? (accounts[0]?.id || '') : selectedAccountId}
                    initialData={composeData}
                    onDelete={(id, accId) => handleDeleteMessage(id, accId, 'Drafts')}
                />
            )}
        </div>
    );
};

const Loader2: React.FC<{ className?: string, size?: number }> = ({ className, size = 20 }) => (
    <svg
        className={className}
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
    >
        <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
);


import React, { useState, useEffect } from 'react';
import { X, Clock, FileText, Paperclip, Send, Trash2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { EMAIL_SERVICE_URL } from './config';

interface ComposeModalProps {
    onClose: () => void;
    accountId: string;
    initialData?: {
        to?: string;
        subject?: string;
        body?: string;
        replyTo?: string; // Message-ID for In-Reply-To
        references?: string;
        id?: string; // Persistent Draft ID
        bcc?: string;
    };
    onDelete?: (id: string, accountId: string) => void;
}

export const ComposeModal: React.FC<ComposeModalProps> = ({ onClose, accountId, initialData, onDelete }) => {
    const { adminUser } = useAuth();
    const [to, setTo] = useState(initialData?.to || '');
    const [bcc, setBcc] = useState('');
    const [showBcc, setShowBcc] = useState(false);
    const [subject, setSubject] = useState(initialData?.subject || '');
    const [body, setBody] = useState(initialData?.body || '');
    const [draftId, setDraftId] = useState<string | undefined>(initialData?.id);
    const [status, setStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved');
    const [lastSavedContent, setLastSavedContent] = useState('');

    // Split recipients by comma
    const parseAddresses = (addrString: string) => {
        return addrString.split(',').map(s => s.trim()).filter(s => s.length > 0);
    };

    // Autosave Logic
    useEffect(() => {
        const timer = setTimeout(() => {
            if (to || subject || body) {
                const currentContent = `${to}|${bcc}|${subject}|${body}`;
                if (currentContent !== lastSavedContent) {
                    handleSaveDraft();
                }
            }
        }, 3000);

        return () => clearTimeout(timer);
    }, [to, bcc, subject, body, lastSavedContent]);

    const handleSaveDraft = async (isClosing = false) => {
        if (!to.trim() && !subject.trim() && !body.trim()) return;

        const currentContent = `${to}|${bcc}|${subject}|${body}`;
        if (!isClosing) setStatus('saving');

        try {
            const bodyObj = {
                id: draftId,
                account_id: accountId,
                to_addresses: parseAddresses(to),
                bcc_addresses: parseAddresses(bcc),
                subject,
                body_html: body
            };

            const headers = {
                'Content-Type': 'application/json',
                'X-User-Id': adminUser?.id || '',
                'X-User-Role': adminUser?.role || ''
            };

            if (isClosing && typeof navigator !== 'undefined' && (navigator as any).sendBeacon) {
                // sendBeacon doesn't support custom headers easily, so we stick to fetch
                // but we add keepalive: true
                fetch(`${EMAIL_SERVICE_URL}/api/mail/drafts`, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(bodyObj),
                    keepalive: true
                });
                return;
            }

            const res = await fetch(`${EMAIL_SERVICE_URL}/api/mail/drafts`, {
                method: 'POST',
                headers,
                body: JSON.stringify(bodyObj)
            });

            if (res.ok) {
                const data = await res.json();
                if (data.id && !draftId) {
                    setDraftId(data.id);
                }
                setLastSavedContent(currentContent);
                setStatus('saved');
            }
        } catch (err) {
            console.error("Failed to save draft", err);
            if (!isClosing) setStatus('unsaved');
        }
    };

    // Save on Close logic
    useEffect(() => {
        return () => {
            const currentContent = `${to}|${bcc}|${subject}|${body}`;
            if (currentContent !== lastSavedContent) {
                handleSaveDraft(true);
            }
        };
    }, [to, bcc, subject, body, lastSavedContent, draftId, accountId, adminUser]);

    const handleSend = async () => {
        try {
            const res = await fetch(`${EMAIL_SERVICE_URL}/api/mail/send`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-User-Id': adminUser?.id || '',
                    'X-User-Role': adminUser?.role || ''
                },
                body: JSON.stringify({
                    account_id: accountId,
                    to_addresses: parseAddresses(to),
                    bcc_addresses: parseAddresses(bcc),
                    subject,
                    body_html: body,
                    in_reply_to: initialData?.replyTo,
                    references: initialData?.references
                })
            });
            if (res.ok) {
                onClose();
            }
        } catch (err) {
            alert("Ошибка при отправке: " + err);
        }
    };

    const handleSchedule = async () => {
        const dateStr = prompt("Введите дату отправки (YYYY-MM-DD HH:MM):", "2026-02-13 10:00");
        if (!dateStr) return;

        try {
            const res = await fetch(`${EMAIL_SERVICE_URL}/api/mail/schedule`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-User-Id': adminUser?.id || '',
                    'X-User-Role': adminUser?.role || ''
                },
                body: JSON.stringify({
                    account_id: accountId,
                    to_addresses: parseAddresses(to),
                    bcc_addresses: parseAddresses(bcc),
                    subject,
                    body_html: body,
                    scheduled_at: new Date(dateStr).toISOString(),
                    in_reply_to: initialData?.replyTo,
                    references: initialData?.references
                })
            });
            if (res.ok) {
                onClose();
            }
        } catch (err) {
            alert("Ошибка при планировании: " + err);
        }
    };

    const handleTemplate = () => {
        const template = "Здравствуйте, {{name}}!\n\nМы рассмотрели вашу заявку...";
        setBody(template);
    };

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4 animate-fadeIn">
            <div className="bg-white dark:bg-gray-800 rounded-t-2xl sm:rounded-lg w-full sm:max-w-4xl h-[95vh] sm:h-[85vh] flex flex-col shadow-xl animate-slideUp sm:animate-scaleIn">
                {/* Header */}
                <div className="flex justify-between items-center p-4 border-b dark:border-gray-700 bg-gray-50 dark:bg-gray-900 rounded-t-lg">
                    <h2 className="font-semibold text-gray-700 dark:text-gray-200">
                        {initialData?.replyTo ? 'Ответ на сообщение' : 'Новое сообщение'}
                    </h2>
                    <div className="flex items-center gap-4">
                        <span className="text-xs text-gray-500">
                            {status === 'saving' ? 'Сохранение...' : status === 'saved' ? 'Черновик сохранен' : ''}
                        </span>
                        <button onClick={onClose} className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
                            <X size={20} />
                        </button>
                    </div>
                </div>

                {/* Body */}
                <div className="flex-1 flex flex-col p-4 gap-4 overflow-y-auto">
                    <div className="flex flex-col gap-2">
                        <div className="flex items-center border-b dark:border-gray-700">
                            <span className="text-sm text-gray-500 dark:text-gray-400 w-12">Кому:</span>
                            <input
                                className="flex-1 p-2 focus:outline-none text-sm bg-transparent dark:text-gray-100"
                                placeholder="example1@mail.com, example2@mail.com"
                                value={to}
                                onChange={(e) => setTo(e.target.value)}
                            />
                            <button
                                onClick={() => setShowBcc(!showBcc)}
                                className="text-xs text-blue-500 hover:underline px-2"
                            >
                                {showBcc ? 'Скрыть Bcc' : 'Добавить Bcc'}
                            </button>
                        </div>

                        {showBcc && (
                            <div className="flex items-center border-b dark:border-gray-700 animate-in fade-in slide-in-from-top-1">
                                <span className="text-sm text-gray-500 dark:text-gray-400 w-12">Bcc:</span>
                                <input
                                    className="flex-1 p-2 focus:outline-none text-sm bg-transparent dark:text-gray-100"
                                    placeholder="Скрытые получатели через запятую"
                                    value={bcc}
                                    onChange={(e) => setBcc(e.target.value)}
                                />
                            </div>
                        )}

                        <input
                            className="border-b dark:border-gray-700 p-2 focus:outline-none focus:border-blue-500 font-medium bg-transparent dark:text-gray-100"
                            placeholder="Тема"
                            value={subject}
                            onChange={(e) => setSubject(e.target.value)}
                        />
                    </div>

                    <textarea
                        className="flex-1 p-4 resize-none focus:outline-none border dark:border-gray-700 rounded-md text-sm leading-relaxed bg-transparent dark:text-gray-100"
                        placeholder="Напишите текст сообщения..."
                        value={body}
                        onChange={(e) => setBody(e.target.value)}
                    />
                </div>

                {/* Footer */}
                <div className="p-4 border-t dark:border-gray-700 bg-gray-50 dark:bg-gray-900 rounded-b-lg flex justify-between items-center">
                    <div className="flex gap-1 sm:gap-2">
                        <button className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded text-gray-600 dark:text-gray-400" title="Прикрепить файл">
                            <Paperclip size={20} />
                        </button>
                        <button onClick={handleTemplate} className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded text-gray-600 dark:text-gray-400 flex items-center gap-1" title="Шаблоны">
                            <FileText size={20} />
                            <span className="text-xs hidden sm:inline">Шаблон</span>
                        </button>
                    </div>

                    <div className="flex gap-2">
                        {draftId && (
                            <button
                                onClick={() => {
                                    onDelete?.(draftId, accountId);
                                    onClose();
                                }}
                                className="flex items-center gap-2 px-3 sm:px-4 py-2 border border-red-200 text-red-600 rounded hover:bg-red-50 transition"
                                title="Удалить черновик"
                            >
                                <Trash2 size={18} />
                                <span className="hidden sm:inline">Удалить</span>
                            </button>
                        )}
                        <button onClick={handleSchedule} className="flex items-center gap-2 px-3 sm:px-4 py-2 border border-gray-300 rounded hover:bg-gray-100 text-gray-700 transition" title="Запланировать">
                            <Clock size={18} />
                            <span className="hidden sm:inline">Запланировать</span>
                        </button>
                        <button onClick={handleSend} className="flex items-center gap-2 px-4 sm:px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 shadow-md transition font-medium">
                            <Send size={18} />
                            <span>Отправить</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

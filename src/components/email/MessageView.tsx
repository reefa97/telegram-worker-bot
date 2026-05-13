
import React, { useEffect, useState } from 'react';
import { EmailMessage, EmailBody } from './types';
import { Loader2, Reply, Trash2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { EMAIL_SERVICE_URL } from './config';

interface MessageViewProps {
    message: EmailMessage | null;
    onReply?: (message: EmailMessage) => void;
    onDelete?: (id: string, accountId: string) => void;
}

export const MessageView: React.FC<MessageViewProps> = ({ message, onReply, onDelete }) => {
    const { adminUser } = useAuth();
    const [body, setBody] = useState<EmailBody | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!message) {
            setBody(null);
            return;
        }

        const fetchBody = async () => {
            setLoading(true);
            try {
                const res = await fetch(`${EMAIL_SERVICE_URL}/api/mail/message/${message.id}`, {
                    headers: {
                        'X-User-Id': adminUser?.id || '',
                        'X-User-Role': adminUser?.role || ''
                    }
                });
                if (res.ok) {
                    const data = await res.json();
                    setBody(data.body);
                }
            } catch (err) {
                console.error("Failed to fetch body", err);
            } finally {
                setLoading(false);
            }
        };

        fetchBody();
    }, [message, adminUser]);

    if (!message) {
        return (
            <div className="flex-1 flex items-center justify-center bg-subtle/30 text-muted font-medium">
                Выберите письмо для просмотра
            </div>
        );
    }

    if (loading) {
        return (
            <div className="flex-1 flex items-center justify-center">
                <Loader2 className="animate-spin text-blue-500" />
            </div>
        );
    }

    return (
        <div className="flex-1 flex flex-col h-full bg-card">
            <div className="p-6 border-b border-border bg-card">
                <div className="flex justify-between items-start mb-4">
                    <h2 className="text-xl font-bold text-main leading-tight">{message.subject}</h2>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => onReply?.(message)}
                            className="flex items-center gap-2 px-4 py-2 bg-primary-50 dark:bg-primary-900/20 text-primary dark:text-primary rounded-lg hover:bg-primary-100 dark:hover:bg-primary-900/40 transition shadow-sm font-semibold text-sm"
                        >
                            <Reply size={16} />
                            <span>Ответить</span>
                        </button>
                        <button
                            onClick={() => onDelete?.(message.id, message.account_id)}
                            className="flex items-center gap-2 px-4 py-2 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/40 transition shadow-sm font-semibold text-sm"
                            title="Удалить"
                        >
                            <Trash2 size={16} />
                            <span>Удалить</span>
                        </button>
                    </div>
                </div>
                <div className="flex justify-between items-center text-sm">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-primary-100 dark:bg-primary-900 flex items-center justify-center text-primary dark:text-primary-300 font-bold uppercase">
                            {(message.from_name || message.from_address)[0]}
                        </div>
                        <div>
                            <span className="font-bold text-main block">{message.from_name || message.from_address}</span>
                            <span className="text-muted text-xs italic">&lt;{message.from_address}&gt;</span>
                        </div>
                    </div>
                    <div className="text-muted text-xs font-medium">
                        {message.date_received && new Date(message.date_received * 1000).toLocaleString('ru-RU')}
                    </div>
                </div>
            </div>

            <div className="flex-1 overflow-auto p-6 bg-card">
                {body?.body_html ? (
                    <iframe
                        className="w-full h-full border-none"
                        srcDoc={body.body_html}
                        sandbox="allow-same-origin"
                        title="Email Content"
                    />
                ) : (
                    <div className="whitespace-pre-wrap font-sans text-sm text-main leading-relaxed">
                        {body?.body_plain || "Содержимое письма пусто"}
                    </div>
                )}
            </div>
        </div>
    );
};

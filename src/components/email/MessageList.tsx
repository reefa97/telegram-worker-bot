
import React from 'react';
import { EmailMessage } from './types';
import { Mail, Paperclip } from 'lucide-react';

interface MessageListProps {
    messages: EmailMessage[];
    selectedId?: string;
    onSelect: (id: string) => void;
}

export const MessageList: React.FC<MessageListProps> = ({ messages, selectedId, onSelect }) => {
    return (
        <div className="flex-1 overflow-y-auto">
            {messages.map((msg) => (
                <div
                    key={msg.id}
                    onClick={() => onSelect(msg.id)}
                    className={`p-4 border-b border-border cursor-pointer hover:bg-subtle/50 ${selectedId === msg.id ? 'bg-primary-50 dark:bg-primary-900/10 border-l-4 border-l-primary-500' : ''}`}
                >
                    <div className="flex justify-between items-start mb-1">
                        <span className={`font-medium ${msg.is_read ? 'text-muted' : 'text-main font-bold'}`}>
                            {msg.from_name || msg.from_address}
                        </span>
                        <span className="text-xs text-muted">
                            {msg.date_received ? new Date(msg.date_received * 1000).toLocaleDateString() : ''}
                        </span>
                    </div>
                    <div className="flex items-center gap-2 mb-1">
                        <div className={`text-sm truncate ${msg.is_read ? 'text-muted font-normal' : 'text-main font-semibold'}`}>
                            {msg.subject || '(No Subject)'}
                        </div>
                        {msg.has_attachments && <Paperclip size={14} className="text-muted" />}
                    </div>
                    <div className="text-xs text-muted line-clamp-2">
                        {msg.snippet}
                    </div>
                </div>
            ))}
            {messages.length === 0 && (
                <div className="p-8 text-center text-muted">
                    <Mail className="mx-auto mb-2 opacity-20" size={48} />
                    <p>Нет писем</p>
                </div>
            )}
        </div>
    );
};

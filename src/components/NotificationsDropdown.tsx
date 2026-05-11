import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

type NotifTab = 'client' | 'procurement' | 'late' | 'calls';

interface Props {
    notifications: any[];
    notifTab: NotifTab;
    setNotifTab: (tab: NotifTab) => void;
    lastSeenAt: string;
    onClose: () => void;
    onNavigate: (tab: string) => void;
    anchorRef: React.RefObject<HTMLButtonElement | null>;
}

const TABS: { id: NotifTab; label: string }[] = [
    { id: 'client', label: '💬 Клиенты' },
    { id: 'procurement', label: '📦 Закупки' },
    { id: 'late', label: '⏰ Опоздания' },
    { id: 'calls', label: '📞 Звонки' },
];

export default function NotificationsDropdown({ notifications, notifTab, setNotifTab, lastSeenAt, onClose, onNavigate, anchorRef }: Props) {
    const panelRef = useRef<HTMLDivElement>(null);

    // Close on click outside
    useEffect(() => {
        function handleClick(e: MouseEvent) {
            if (
                panelRef.current && !panelRef.current.contains(e.target as Node) &&
                anchorRef.current && !anchorRef.current.contains(e.target as Node)
            ) {
                onClose();
            }
        }
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, [onClose, anchorRef]);

    // Close on Escape
    useEffect(() => {
        function handleKey(e: KeyboardEvent) {
            if (e.key === 'Escape') onClose();
        }
        document.addEventListener('keydown', handleKey);
        return () => document.removeEventListener('keydown', handleKey);
    }, [onClose]);

    const filtered = notifications.filter(n => n.type === notifTab);

    // Calculate position from anchor
    const rect = anchorRef.current?.getBoundingClientRect();
    const desktopStyle: React.CSSProperties = rect ? {
        top: rect.bottom + 8,
        right: Math.max(8, window.innerWidth - rect.right),
    } : { top: 60, right: 16 };

    return (
        <>
            {/* Mobile backdrop */}
            <div className="fixed inset-0 bg-black/30 z-[90] sm:hidden" onClick={onClose} />

            {/* Panel */}
            <div
                ref={panelRef}
                style={desktopStyle}
                className="
                    fixed z-[100]
                    sm:w-[420px] sm:max-h-[70vh] sm:rounded-xl sm:shadow-2xl
                    inset-x-0 bottom-0 top-auto sm:inset-auto sm:bottom-auto
                    max-h-[85vh] rounded-t-2xl sm:rounded-t-xl
                    bg-card border border-border
                    flex flex-col
                    animate-fadeIn
                "
            >
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
                    <h3 className="text-sm font-semibold text-main">Уведомления</h3>
                    <button onClick={onClose} className="p-1 hover:bg-subtle rounded-md text-muted hover:text-main transition-colors">
                        <X size={16} />
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-border shrink-0 overflow-x-auto">
                    {TABS.map(tab => {
                        const count = notifications.filter(n => n.type === tab.id).length;
                        return (
                            <button
                                key={tab.id}
                                onClick={() => setNotifTab(tab.id)}
                                className={`flex-1 min-w-0 px-2 py-2.5 text-xs font-medium whitespace-nowrap transition-colors
                                    ${notifTab === tab.id
                                        ? 'text-blue-500 border-b-2 border-blue-500'
                                        : 'text-muted hover:text-main'
                                    }`}
                            >
                                {tab.label} {count > 0 && <span className="text-[10px] opacity-70">({count})</span>}
                            </button>
                        );
                    })}
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto overscroll-contain">
                    {notifTab === 'calls' && (
                        <div className="px-4 py-3 bg-blue-500/10 text-blue-400 text-xs border-b border-border">
                            Зайдите в Telegram-бот и нажмите «📞 Звонки клиентам», чтобы отметить звонки.
                        </div>
                    )}

                    {filtered.length === 0 ? (
                        <div className="p-8 text-center text-muted text-sm">Нет уведомлений</div>
                    ) : (
                        <div className="divide-y divide-border">
                            {filtered.map(n => {
                                const isNew = lastSeenAt && new Date(n.time) > new Date(lastSeenAt);
                                return (
                                    <div
                                        key={n.id}
                                        className={`px-4 py-3 hover:bg-subtle/50 transition-colors cursor-pointer ${isNew ? 'bg-blue-500/5' : ''}`}
                                        onClick={() => {
                                            if (n.type === 'client') onNavigate('clients');
                                            else if (n.type === 'procurement') onNavigate('procurement');
                                        }}
                                    >
                                        <div className="flex items-start gap-2">
                                            {isNew && <div className="w-2 h-2 rounded-full bg-blue-500 mt-1.5 shrink-0" />}
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm text-main leading-snug">{n.message}</p>
                                                {n.detail && <p className="text-xs text-muted mt-0.5">{n.detail}</p>}
                                                <p className="text-[10px] text-muted mt-1">
                                                    {new Date(n.time).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                                </p>
                                            </div>
                                            {n.status && (
                                                <span className={`text-[10px] px-1.5 py-0.5 rounded-full shrink-0 ${
                                                    n.status === 'pending' ? 'bg-yellow-500/20 text-yellow-500' :
                                                    n.status === 'resolved' ? 'bg-green-500/20 text-green-500' :
                                                    'bg-gray-500/20 text-gray-400'
                                                }`}>
                                                    {n.status === 'pending' ? 'Ожидает' : n.status === 'resolved' ? 'Решено' : n.status}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </>
    );
}

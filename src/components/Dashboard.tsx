import { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import {
    LogOut, Users, Briefcase, FileText, Settings, Search, Sun, Moon, Menu, Bell, X,
    ShoppingBag, CheckSquare, ClipboardCheck, BookUser, MailCheck, Inbox, Newspaper, BookOpen, MessageSquare,
    ChevronDown, MoreHorizontal,
} from 'lucide-react';

import WorkersPanel from './WorkersPanel';
import ObjectsPanel from './ObjectsPanel';
import SettingsPanel from './SettingsPanel';
import MyCabinetPanel from './MyCabinetPanel';
import ClientsPanel from './ClientsPanel';
import ContactsPanel from './ContactsPanel';
import NotificationsDropdown from './NotificationsDropdown';

const ReportsPanel = lazy(() => import('./ReportsPanel'));
const EmailSearchPanel = lazy(() => import('./EmailSearchPanel'));
const ProcurementPanel = lazy(() => import('./ProcurementPanel'));
const QualityControlPanel = lazy(() => import('./QualityControlPanel'));
const EmailTrackingPanel = lazy(() => import('./EmailTrackingPanel'));
const LeadsPanel = lazy(() => import('./LeadsPanel'));
const BlogPanel = lazy(() => import('./BlogPanel'));
const ProceduresPanel = lazy(() => import('./ProceduresPanel'));
const ChatStatsPanel = lazy(() => import('./ChatStatsPanel'));

type Tab = 'leads' | 'blog' | 'workers' | 'objects' | 'reports' | 'settings' | 'email_search' | 'procurement' | 'my_cabinet' | 'clients' | 'quality' | 'contacts' | 'email_tracking' | 'procedures' | 'chat_stats';

type TabDef = {
    id: Tab;
    label: string;
    icon: any;
    group: 'operations' | 'customers' | 'content' | 'comms' | 'system';
    superAdminOnly?: boolean;
    requiredPermission?: string;
    /** Featured in mobile bottom-tab bar */
    mobileFeatured?: boolean;
};

const ALL_TABS: TabDef[] = [
    // Operations
    { id: 'workers',    label: 'Работники',   icon: Users,          group: 'operations', requiredPermission: 'workers_view',    mobileFeatured: true },
    { id: 'objects',    label: 'Объекты',     icon: Briefcase,      group: 'operations', requiredPermission: 'objects_view',    mobileFeatured: true },
    { id: 'my_cabinet', label: 'Мой кабинет', icon: CheckSquare,    group: 'operations', requiredPermission: 'workers_view' },
    { id: 'procurement',label: 'Закупки',     icon: ShoppingBag,    group: 'operations', requiredPermission: 'objects_view' },
    { id: 'quality',    label: 'Контроль',    icon: ClipboardCheck, group: 'operations', requiredPermission: 'objects_view' },
    { id: 'reports',    label: 'Отчёты',      icon: FileText,       group: 'operations', requiredPermission: 'reports_view',    mobileFeatured: true },

    // Customers
    { id: 'leads',      label: 'Лиды',        icon: Inbox,          group: 'customers', superAdminOnly: true },
    { id: 'clients',    label: 'Клиенты',     icon: Users,          group: 'customers', superAdminOnly: true },
    { id: 'contacts',   label: 'Контакты',    icon: BookUser,       group: 'customers', superAdminOnly: true },

    // Content
    { id: 'blog',       label: 'CMS',         icon: Newspaper,      group: 'content',   superAdminOnly: true },
    { id: 'chat_stats', label: 'Чат-бот',     icon: MessageSquare,  group: 'content',   superAdminOnly: true },
    { id: 'procedures', label: 'Процедуры',   icon: BookOpen,       group: 'content',   requiredPermission: 'procedures_view' },

    // Communications
    { id: 'email_search',   label: 'Поиск Email',   icon: Search,    group: 'comms', requiredPermission: 'email_search_view' },
    { id: 'email_tracking', label: 'Трекинг Email', icon: MailCheck, group: 'comms', superAdminOnly: true },

    // System
    { id: 'settings',   label: 'Настройки',   icon: Settings,       group: 'system',    superAdminOnly: true },
];

const GROUP_LABELS: Record<TabDef['group'], string> = {
    operations: 'Операции',
    customers:  'Клиенты',
    content:    'Контент',
    comms:      'Коммуникации',
    system:     'Система',
};

export default function Dashboard() {
    const { signOut, adminUser } = useAuth();
    const { theme, toggleTheme } = useTheme();

    const [activeTab, setActiveTab] = useState<Tab>(() => {
        const saved = localStorage.getItem('activeTab') as Tab | null;
        return saved || 'workers';
    });
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const [moreSheetOpen, setMoreSheetOpen] = useState(false);
    const [userMenuOpen, setUserMenuOpen] = useState(false);
    const [showNotifications, setShowNotifications] = useState(false);
    const [notifications, setNotifications] = useState<any[]>([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [lastSeenAt, setLastSeenAt] = useState<string>(() => localStorage.getItem('notif_last_seen') || '');
    const [notifTab, setNotifTab] = useState<'client' | 'procurement' | 'late' | 'calls'>('client');
    const [, setPendingCallsCount] = useState(0);
    const bellRef = useRef<HTMLButtonElement>(null);
    const userBtnRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        localStorage.setItem('activeTab', activeTab);
    }, [activeTab]);

    // Close user menu on outside click
    useEffect(() => {
        if (!userMenuOpen) return;
        const handler = (e: MouseEvent) => {
            if (userBtnRef.current && !userBtnRef.current.contains(e.target as Node)) {
                setUserMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [userMenuOpen]);

    const loadNotifications = useCallback(async () => {
        const now = new Date();
        const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString();
        const [lateRes, clientRes, procRes, callsRes] = await Promise.all([
            supabase.from('notifications_log').select('id, notification_type, message, sent_at, metadata').gte('sent_at', threeDaysAgo).order('sent_at', { ascending: false }).limit(20),
            supabase.from('client_requests').select('id, message, status, created_at, client_id, object_id, cleaning_objects(name)').gte('created_at', threeDaysAgo).order('created_at', { ascending: false }).limit(20),
            supabase.from('procurement_requests').select('id, item_name, status, created_at, worker_id, object_id, workers:worker_id(first_name, last_name), cleaning_objects:object_id(name)').eq('status', 'pending').order('created_at', { ascending: false }).limit(20),
            supabase.from('admin_users').select('id, name, email, phone, next_courtesy_call_due').eq('role', 'client').lte('next_courtesy_call_due', new Date().toISOString()).order('next_courtesy_call_due', { ascending: true }),
        ]);
        const items: any[] = [];
        (lateRes.data || []).forEach((n: any) => {
            if (n.notification_type?.startsWith('late_')) {
                items.push({ id: `late_${n.id}`, type: 'late', message: n.message, time: n.sent_at, raw: n });
            }
        });
        (clientRes.data || []).forEach((r: any) => {
            const objName = (r.cleaning_objects as any)?.name || '';
            items.push({ id: `client_${r.id}`, type: 'client', message: `Сообщение от клиента: ${r.message?.slice(0, 60)}${r.message?.length > 60 ? '...' : ''}`, detail: objName, time: r.created_at, status: r.status, raw: r });
        });
        (procRes.data || []).forEach((p: any) => {
            const w = p.workers as any;
            const o = p.cleaning_objects as any;
            const workerName = w ? `${w.first_name} ${w.last_name}` : '';
            items.push({ id: `proc_${p.id}`, type: 'procurement', message: `Заявка: ${p.item_name}`, detail: `${workerName} — ${o?.name || ''}`, time: p.created_at, raw: p });
        });
        const dueCallClients = callsRes.data || [];
        setPendingCallsCount(dueCallClients.length);
        dueCallClients.forEach((c: any) => {
            items.push({ id: `call_${c.id}`, type: 'calls', message: `Позвонить: ${c.name || c.email}`, detail: c.phone || 'телефон не указан', time: c.next_courtesy_call_due || new Date().toISOString(), raw: c });
        });
        items.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
        setNotifications(items.slice(0, 50));
        const seen = localStorage.getItem('notif_last_seen') || '';
        if (seen) {
            setUnreadCount(items.filter(i => new Date(i.time) > new Date(seen)).length);
        } else {
            setUnreadCount(items.length);
        }
    }, []);

    useEffect(() => {
        // Pause polling when tab is hidden
        loadNotifications();
        let interval: number | undefined;
        const start = () => {
            interval = window.setInterval(loadNotifications, 60_000);
        };
        const stop = () => {
            if (interval) window.clearInterval(interval);
            interval = undefined;
        };
        if (!document.hidden) start();
        const visHandler = () => (document.hidden ? stop() : (loadNotifications(), start()));
        document.addEventListener('visibilitychange', visHandler);
        return () => { stop(); document.removeEventListener('visibilitychange', visHandler); };
    }, [loadNotifications]);

    const isSuperAdmin = adminUser?.role === 'super_admin';

    const visibleTabs = ALL_TABS.filter(tab => {
        if (tab.superAdminOnly && !isSuperAdmin) return false;
        if (tab.requiredPermission && !isSuperAdmin && adminUser?.permissions && !adminUser.permissions[tab.requiredPermission]) {
            return false;
        }
        return true;
    });

    const activeTabDef = visibleTabs.find(t => t.id === activeTab) || visibleTabs[0];
    const bottomNavTabs = visibleTabs.filter(t => t.mobileFeatured).slice(0, 3);

    // Group visible tabs for sidebar rendering
    const groupedTabs = (Object.keys(GROUP_LABELS) as TabDef['group'][])
        .map(g => ({ group: g, label: GROUP_LABELS[g], items: visibleTabs.filter(t => t.group === g) }))
        .filter(s => s.items.length > 0);

    const handleTabClick = (tabId: Tab) => {
        setActiveTab(tabId);
        setMobileMenuOpen(false);
        setMoreSheetOpen(false);
    };

    const handleSignOut = async () => {
        try { await signOut(); } catch (e) { console.error('signout', e); }
    };

    const handleNotifOpen = () => {
        const opening = !showNotifications;
        setShowNotifications(opening);
        if (opening) {
            const now = new Date().toISOString();
            localStorage.setItem('notif_last_seen', now);
            setLastSeenAt(now);
            setUnreadCount(0);
        }
    };

    const initials = (adminUser?.name || adminUser?.email || '?').slice(0, 1).toUpperCase();
    const roleLabel = adminUser?.role?.replace('_', ' ');

    return (
        <div className="w-full h-full overflow-hidden flex">
            {/* ---------- Mobile drawer overlay ---------- */}
            {mobileMenuOpen && (
                <div
                    className="fixed inset-0 z-40 lg:hidden animate-fadeIn"
                    style={{ background: 'rgba(0,0,0,0.4)' }}
                    onClick={() => setMobileMenuOpen(false)}
                />
            )}

            {/* ---------- Sidebar ---------- */}
            <aside
                className={`
                    fixed inset-y-0 left-0 z-50 w-[260px] flex flex-col
                    bg-card border-r border-border
                    transition-transform duration-200
                    ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
                `}
                aria-label="Главная навигация"
            >
                {/* Brand */}
                <div className="h-14 flex items-center justify-between px-4 border-b border-border shrink-0">
                    <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-md bg-primary flex items-center justify-center">
                            <span className="text-white text-xs font-bold">R</span>
                        </div>
                        <span className="text-sm font-semibold text-main tracking-tight">Reefa</span>
                    </div>
                    <button
                        onClick={() => setMobileMenuOpen(false)}
                        className="btn-icon lg:hidden"
                        aria-label="Закрыть меню"
                        style={{ width: 36, height: 36 }}
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Nav (grouped) */}
                <nav className="flex-1 overflow-y-auto py-3 px-2">
                    {groupedTabs.map((section, idx) => (
                        <div key={section.group} className={idx === 0 ? '' : 'mt-4'}>
                            <div className="px-3 mb-1 text-eyebrow">{section.label}</div>
                            <div className="space-y-0.5">
                                {section.items.map((tab) => {
                                    const Icon = tab.icon;
                                    const isActive = activeTab === tab.id;
                                    return (
                                        <button
                                            key={tab.id}
                                            onClick={() => handleTabClick(tab.id)}
                                            className={`
                                                w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm
                                                transition-colors duration-100 focus-ring
                                                ${isActive
                                                    ? 'bg-subtle text-main font-medium'
                                                    : 'text-muted hover:bg-subtle hover:text-main'}
                                            `}
                                        >
                                            <Icon size={16} className="shrink-0" strokeWidth={isActive ? 2.25 : 2} />
                                            <span className="truncate">{tab.label}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </nav>
            </aside>

            {/* ---------- Main column ---------- */}
            <main className="flex-1 flex flex-col min-w-0 lg:ml-[260px]">
                {/* Top bar */}
                <header className="h-14 flex items-center justify-between px-3 sm:px-4 lg:px-6 border-b border-border bg-card shrink-0">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                        {/* Mobile menu */}
                        <button
                            onClick={() => setMobileMenuOpen(true)}
                            className="btn-icon lg:hidden"
                            aria-label="Открыть меню"
                        >
                            <Menu size={20} />
                        </button>

                        {/* Active page title */}
                        <div className="flex items-center gap-2 min-w-0">
                            {activeTabDef && (
                                <>
                                    <activeTabDef.icon size={18} className="text-muted shrink-0" />
                                    <h1 className="text-base font-semibold text-main truncate">
                                        {activeTabDef.label}
                                    </h1>
                                </>
                            )}
                        </div>
                    </div>

                    {/* Right cluster */}
                    <div className="flex items-center gap-1">
                        {/* Notifications */}
                        <div className="relative">
                            <button
                                ref={bellRef}
                                onClick={handleNotifOpen}
                                className="btn-icon relative"
                                aria-label="Уведомления"
                            >
                                <Bell size={18} />
                                {unreadCount > 0 && (
                                    <span
                                        className="absolute top-1 right-1 min-w-[16px] h-4 px-1 text-[10px] font-semibold rounded-full flex items-center justify-center"
                                        style={{
                                            background: 'var(--danger)',
                                            color: '#fff',
                                            transform: 'translate(40%,-40%)',
                                        }}
                                    >
                                        {unreadCount > 99 ? '99+' : unreadCount}
                                    </span>
                                )}
                            </button>
                            {showNotifications && (
                                <NotificationsDropdown
                                    notifications={notifications}
                                    notifTab={notifTab}
                                    setNotifTab={setNotifTab}
                                    lastSeenAt={lastSeenAt}
                                    onClose={() => setShowNotifications(false)}
                                    onNavigate={(tab: string) => { setActiveTab(tab as Tab); setShowNotifications(false); }}
                                    anchorRef={bellRef}
                                />
                            )}
                        </div>

                        {/* User menu trigger */}
                        <div className="relative">
                            <button
                                ref={userBtnRef}
                                onClick={() => setUserMenuOpen(v => !v)}
                                className="flex items-center gap-1.5 rounded-md px-1.5 py-1 hover:bg-subtle transition-colors focus-ring"
                                aria-haspopup="menu"
                                aria-expanded={userMenuOpen}
                            >
                                <div className="w-7 h-7 rounded-full bg-subtle border border-border flex items-center justify-center text-xs font-semibold text-main">
                                    {initials}
                                </div>
                                <ChevronDown size={14} className="text-muted hidden sm:block" />
                            </button>

                            {userMenuOpen && (
                                <div
                                    className="absolute right-0 top-full mt-1.5 w-60 animate-scaleIn"
                                    role="menu"
                                >
                                    <div className="popover-content">
                                        {/* Profile preview */}
                                        <div className="px-3 py-2.5">
                                            <p className="text-sm font-medium text-main truncate">
                                                {adminUser?.name || adminUser?.email?.split('@')[0]}
                                            </p>
                                            <p className="text-xs text-muted truncate capitalize">{roleLabel}</p>
                                        </div>
                                        <div className="divider" />

                                        {/* Theme toggle */}
                                        <button
                                            onClick={() => { toggleTheme(); }}
                                            className="popover-item"
                                            role="menuitem"
                                        >
                                            {theme === 'dark'
                                                ? <Sun size={16} className="text-muted" />
                                                : <Moon size={16} className="text-muted" />}
                                            <span className="flex-1">
                                                {theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
                                            </span>
                                        </button>

                                        <div className="divider" />

                                        {/* Sign out */}
                                        <button
                                            onClick={handleSignOut}
                                            className="popover-item popover-item-danger"
                                            role="menuitem"
                                        >
                                            <LogOut size={16} />
                                            <span>Выйти</span>
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </header>

                {/* Content */}
                <div className="flex-1 overflow-y-auto pb-20 lg:pb-0">
                    <div className="p-4 sm:p-6 lg:p-8">
                        <Suspense fallback={
                            <div className="flex justify-center items-center h-64">
                                <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                            </div>
                        }>
                            {activeTab === 'leads' && <LeadsPanel searchTerm="" />}
                            {activeTab === 'blog' && <BlogPanel searchTerm="" />}
                            {activeTab === 'workers' && <WorkersPanel searchTerm="" />}
                            {activeTab === 'objects' && <ObjectsPanel searchTerm="" />}
                            {activeTab === 'my_cabinet' && <MyCabinetPanel />}
                            {activeTab === 'reports' && <ReportsPanel />}
                            {activeTab === 'procurement' && <ProcurementPanel searchTerm="" />}
                            {activeTab === 'settings' && <SettingsPanel />}
                            {activeTab === 'email_search' && <EmailSearchPanel />}
                            {activeTab === 'clients' && <ClientsPanel searchTerm="" />}
                            {activeTab === 'quality' && <QualityControlPanel searchTerm="" />}
                            {activeTab === 'procedures' && <ProceduresPanel searchTerm="" />}
                            {activeTab === 'chat_stats' && <ChatStatsPanel />}
                            {activeTab === 'contacts' && <ContactsPanel searchTerm="" />}
                            {activeTab === 'email_tracking' && <EmailTrackingPanel />}
                        </Suspense>
                    </div>
                </div>
            </main>

            {/* ---------- Mobile bottom tab bar ---------- */}
            <nav
                className="fixed bottom-0 left-0 right-0 z-30 lg:hidden border-t border-border bg-card flex items-stretch"
                style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
                aria-label="Мобильная навигация"
            >
                {bottomNavTabs.map((tab) => {
                    const Icon = tab.icon;
                    const isActive = activeTab === tab.id;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => handleTabClick(tab.id)}
                            className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium transition-colors
                                ${isActive ? 'text-main' : 'text-muted'}`}
                            aria-current={isActive ? 'page' : undefined}
                        >
                            <Icon size={20} strokeWidth={isActive ? 2.25 : 2} />
                            <span>{tab.label}</span>
                            {isActive && (
                                <span
                                    className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-b-full"
                                    style={{ background: 'var(--accent)' }}
                                />
                            )}
                        </button>
                    );
                })}
                <button
                    onClick={() => setMoreSheetOpen(true)}
                    className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium text-muted"
                >
                    <MoreHorizontal size={20} />
                    <span>Ещё</span>
                </button>
            </nav>

            {/* ---------- Mobile "More" bottom sheet ---------- */}
            {moreSheetOpen && (
                <>
                    <div
                        className="fixed inset-0 z-40 lg:hidden animate-fadeIn"
                        style={{ background: 'rgba(0,0,0,0.4)' }}
                        onClick={() => setMoreSheetOpen(false)}
                    />
                    <div
                        className="fixed left-0 right-0 bottom-0 z-50 lg:hidden bg-card border-t border-border rounded-t-2xl animate-slideUp"
                        style={{ maxHeight: '80vh', paddingBottom: 'env(safe-area-inset-bottom)' }}
                    >
                        <div className="flex items-center justify-between px-4 h-12 border-b border-border">
                            <span className="text-sm font-semibold text-main">Все разделы</span>
                            <button onClick={() => setMoreSheetOpen(false)} className="btn-icon">
                                <X size={18} />
                            </button>
                        </div>
                        <div className="overflow-y-auto p-3" style={{ maxHeight: 'calc(80vh - 48px)' }}>
                            {groupedTabs.map((section, idx) => (
                                <div key={section.group} className={idx === 0 ? '' : 'mt-4'}>
                                    <div className="px-2 mb-1.5 text-eyebrow">{section.label}</div>
                                    <div className="space-y-0.5">
                                        {section.items.map((tab) => {
                                            const Icon = tab.icon;
                                            const isActive = activeTab === tab.id;
                                            return (
                                                <button
                                                    key={tab.id}
                                                    onClick={() => handleTabClick(tab.id)}
                                                    className={`w-full flex items-center gap-3 px-3 py-3 rounded-md text-sm transition-colors
                                                        ${isActive ? 'bg-subtle text-main font-medium' : 'text-main hover:bg-subtle'}`}
                                                >
                                                    <Icon size={18} className="text-muted shrink-0" />
                                                    <span className="truncate">{tab.label}</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}

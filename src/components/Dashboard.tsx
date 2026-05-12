import { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import {
    LogOut, Users, Briefcase, FileText, Settings,
    X, Search, ChevronLeft, ChevronRight, Sun, Moon, Menu, Bell
} from 'lucide-react';
import WorkersPanel from './WorkersPanel';
import ObjectsPanel from './ObjectsPanel';
import SettingsPanel from './SettingsPanel';
import MyCabinetPanel from './MyCabinetPanel';
import ClientsPanel from './ClientsPanel';
import ContactsPanel from './ContactsPanel';
import NotificationsDropdown from './NotificationsDropdown';

// Heavy panels split into separate chunks (jspdf, leaflet, html2canvas, etc.)
const ReportsPanel = lazy(() => import('./ReportsPanel'));
const EmailSearchPanel = lazy(() => import('./EmailSearchPanel'));
const ProcurementPanel = lazy(() => import('./ProcurementPanel'));
const QualityControlPanel = lazy(() => import('./QualityControlPanel'));
const EmailTrackingPanel = lazy(() => import('./EmailTrackingPanel'));
const LeadsPanel = lazy(() => import('./LeadsPanel'));
const BlogPanel = lazy(() => import('./BlogPanel'));
const ProceduresPanel = lazy(() => import('./ProceduresPanel'));
const ChatStatsPanel = lazy(() => import('./ChatStatsPanel'));
import { ShoppingBag, CheckSquare, ClipboardCheck, BookUser, MailCheck, Inbox, Newspaper, BookOpen, MessageSquare } from 'lucide-react';

type Tab = 'leads' | 'blog' | 'workers' | 'objects' | 'reports' | 'settings' | 'tasks' | 'email_search' | 'procurement' | 'my_cabinet' | 'clients' | 'quality' | 'contacts' | 'email_tracking' | 'procedures' | 'chat_stats';

export default function Dashboard() {
    const { signOut, adminUser } = useAuth();
    const { theme, toggleTheme } = useTheme();

    // Initialize activeTab from localStorage or default to 'workers'
    const [activeTab, setActiveTab] = useState<Tab>(() => {
        const saved = localStorage.getItem('activeTab');
        return (saved as Tab) || 'workers';
    });

    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const [globalSearch, setGlobalSearch] = useState('');
    const [showNotifications, setShowNotifications] = useState(false);
    const [notifications, setNotifications] = useState<any[]>([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [lastSeenAt, setLastSeenAt] = useState<string>(() => localStorage.getItem('notif_last_seen') || '');
    const [notifTab, setNotifTab] = useState<'client' | 'procurement' | 'late' | 'calls'>('client');
    const [, setPendingCallsCount] = useState(0);
    const bellRef = useRef<HTMLButtonElement>(null);

    // Save activeTab to localStorage whenever it changes
    useEffect(() => {
        localStorage.setItem('activeTab', activeTab);
        setGlobalSearch('');
    }, [activeTab]);

    // Load notifications
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

        // Count new items since last seen
        const seen = localStorage.getItem('notif_last_seen') || '';
        if (seen) {
            const newCount = items.filter(i => new Date(i.time) > new Date(seen)).length;
            setUnreadCount(newCount);
        } else {
            setUnreadCount(items.length);
        }
    }, []);

    useEffect(() => {
        loadNotifications();
        const interval = setInterval(loadNotifications, 60000);
        return () => clearInterval(interval);
    }, [loadNotifications]);

    const handleSignOut = async () => {
        try {
            await signOut();
        } catch (error) {
            console.error('Error signing out:', error);
        }
    };

    const isSuperAdmin = adminUser?.role === 'super_admin';

    const tabs: { id: Tab; label: string; icon: any; superAdminOnly?: boolean; requiredPermission?: string }[] = [
        { id: 'leads', label: 'Лиды', icon: Inbox, superAdminOnly: true },
        { id: 'blog', label: 'CMS', icon: Newspaper, superAdminOnly: true },
        { id: 'chat_stats', label: 'Чат-бот', icon: MessageSquare, superAdminOnly: true },
        { id: 'workers', label: 'Работники', icon: Users, requiredPermission: 'workers_view' },
        { id: 'objects', label: 'Объекты', icon: Briefcase, requiredPermission: 'objects_view' },
        { id: 'my_cabinet', label: 'Мой кабинет', icon: CheckSquare, requiredPermission: 'workers_view' },
        { id: 'procurement', label: 'Закупки', icon: ShoppingBag, requiredPermission: 'objects_view' }, // Assuming objects_view implies access to object supplies
        { id: 'quality', label: 'Контроль', icon: ClipboardCheck, requiredPermission: 'objects_view' },
        { id: 'procedures', label: 'Процедуры', icon: BookOpen, requiredPermission: 'procedures_view' },
        { id: 'reports', label: 'Отчеты', icon: FileText, requiredPermission: 'reports_view' },
        { id: 'clients', label: 'Клиенты', icon: Users, superAdminOnly: true },
        { id: 'contacts', label: 'Контакты', icon: BookUser, superAdminOnly: true },
        { id: 'email_search', label: 'Поиск Email', icon: Search, requiredPermission: 'email_search_view' },
        { id: 'email_tracking', label: 'Трекинг Email', icon: MailCheck, superAdminOnly: true },
        { id: 'settings', label: 'Настройки', icon: Settings, superAdminOnly: true },

    ];

    const visibleTabs = tabs.filter(tab => {
        if (tab.superAdminOnly && !isSuperAdmin) return false;
        if (tab.requiredPermission && !isSuperAdmin && adminUser?.permissions && !adminUser.permissions[tab.requiredPermission]) {
            return false;
        }
        return true;
    });

    const handleTabClick = (tabId: Tab) => {
        setActiveTab(tabId);
        setMobileMenuOpen(false);
    };

    return (
        <div className="w-full h-full bg-app text-main overflow-hidden font-sans flex">
            {/* Mobile Overlay */}
            {mobileMenuOpen && (
                <div
                    className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm lg:hidden"
                    onClick={() => setMobileMenuOpen(false)}
                />
            )}

            {/* Sidebar */}
            <aside className={`
                fixed inset-y-0 left-0 z-50 bg-card border-r border-border transition-all duration-300 flex flex-col
                ${mobileMenuOpen ? 'translate-x-0 w-64' : '-translate-x-full lg:translate-x-0'}
                ${sidebarOpen ? 'lg:w-60' : 'lg:w-[70px]'}
            `}>
                {/* Sidebar Header */}
                <div className="h-14 flex items-center justify-between px-3 border-b border-border">
                    {sidebarOpen ? (
                        <div className="flex items-center gap-2 px-1">
                            <span className="text-sm font-semibold tracking-tight text-main">
                                Reefa
                            </span>
                        </div>
                    ) : (
                        <div className="w-full flex justify-center">
                            <span className="text-lg font-bold text-main">R</span>
                        </div>
                    )}

                    {/* Desktop Toggle */}
                    <button
                        onClick={() => setSidebarOpen(!sidebarOpen)}
                        className="hidden lg:flex p-1.5 hover:bg-subtle rounded-md text-muted hover:text-main transition-colors"
                    >
                        {sidebarOpen ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
                    </button>

                    {/* Mobile Close */}
                    <button
                        onClick={() => setMobileMenuOpen(false)}
                        className="lg:hidden p-1 hover:bg-subtle rounded text-muted"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Navigation */}
                <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-0.5">
                    {visibleTabs.map((tab) => {
                        const Icon = tab.icon;
                        const isActive = activeTab === tab.id;
                        return (
                            <button
                                key={tab.id}
                                onClick={() => handleTabClick(tab.id)}
                                className={`
                                    w-full flex items-center rounded-md px-3 py-2 text-sm transition-all duration-200 group
                                    ${isActive
                                        ? 'bg-subtle text-main font-medium'
                                        : 'text-muted hover:text-main hover:bg-subtle/50'}
                                    ${!sidebarOpen && 'justify-center px-2'}
                                `}
                                title={!sidebarOpen ? tab.label : undefined}
                            >
                                <Icon
                                    size={18}
                                    className={`
                                        transition-colors
                                        ${sidebarOpen ? "mr-3" : ""}
                                        ${isActive ? "text-main" : "text-muted group-hover:text-main"}
                                    `}
                                    strokeWidth={2}
                                />
                                {sidebarOpen && <span className="truncate">{tab.label}</span>}
                            </button>
                        );
                    })}
                </nav>

                {/* User Profile */}
                <div className="p-3 border-t border-border mt-auto">
                    <div className={`flex items-center ${!sidebarOpen && 'justify-center'} gap-3 mb-3 px-1`}>
                        <div className="w-8 h-8 rounded-full bg-subtle flex items-center justify-center text-xs font-semibold text-main border border-border">
                            {adminUser?.email?.[0].toUpperCase()}
                        </div>
                        {sidebarOpen && (
                            <div className="flex-1 overflow-hidden">
                                <p className="text-sm font-medium truncate text-main">{adminUser?.email?.split('@')[0]}</p>
                                <p className="text-xs text-muted truncate capitalize">{adminUser?.role.replace('_', ' ')}</p>
                            </div>
                        )}
                    </div>

                    <div className="flex flex-col gap-1">
                        <div
                            onClick={toggleTheme}
                            className={`
                                w-full flex items-center rounded-md px-2 py-1.5 cursor-pointer group transition-colors
                                ${!sidebarOpen && 'justify-center'}
                            `}
                            title={!sidebarOpen ? (theme === 'dark' ? "Светлая тема" : "Темная тема") : undefined}
                        >
                            {/* Switch Container */}
                            <div className={`relative w-10 h-5 rounded-full transition-colors duration-300 ${theme === 'dark' ? 'bg-[#0B0E14] border border-white/5' : 'bg-zinc-200'}`}>
                                {/* Thumb */}
                                <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-sm transform transition-transform duration-300 flex items-center justify-center ${theme === 'dark' ? 'translate-x-5' : 'translate-x-0'}`}>
                                    {theme === 'dark' && <Moon size={10} className="text-blue-600" />}
                                    {theme !== 'dark' && <Sun size={10} className="text-orange-400" />}
                                </div>
                            </div>

                            {sidebarOpen && (
                                <span className="ml-3 text-xs font-medium text-muted group-hover:text-main transition-colors">
                                    {theme === 'dark' ? 'Темная тема' : 'Светлая тема'}
                                </span>
                            )}
                        </div>

                        <button
                            onClick={handleSignOut}
                            className={`
                                w-full flex items-center rounded-md px-2 py-1.5 text-xs font-medium text-muted hover:bg-red-500/10 hover:text-danger transition-colors
                                ${!sidebarOpen && 'justify-center'}
                            `}
                            title={!sidebarOpen ? "Выйти" : undefined}
                        >
                            <LogOut size={16} className={sidebarOpen ? "mr-2" : ""} />
                            {sidebarOpen && <span>Выйти</span>}
                        </button>
                    </div>
                </div>
            </aside>

            {/* Main Content */}
            <main className={`
                flex-1 flex flex-col min-w-0 transition-all duration-300 bg-app
                ${sidebarOpen ? 'lg:ml-60' : 'lg:ml-[70px]'}
            `}>
                {/* Top Header */}
                <header className="h-14 bg-card border-b border-border flex items-center justify-between px-4 shrink-0 gap-3">
                    <div className="flex items-center gap-3 flex-1">
                        {/* Mobile menu button */}
                        <button
                            onClick={() => setMobileMenuOpen(true)}
                            className="lg:hidden p-1.5 hover:bg-subtle rounded-md text-muted hover:text-main transition-colors"
                        >
                            <Menu size={20} />
                        </button>

                        {/* Global Search */}
                        <div className="relative flex-1 max-w-lg">
                            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                            <input
                                type="text"
                                value={globalSearch}
                                onChange={(e) => setGlobalSearch(e.target.value)}
                                placeholder={`Поиск${tabs.find(t => t.id === activeTab)?.label ? ' — ' + tabs.find(t => t.id === activeTab)?.label : ''}...`}
                                className="w-full pl-9 pr-3 py-2 bg-subtle border border-border rounded-lg text-sm text-main placeholder-muted focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/50 transition-all"
                            />
                        </div>
                    </div>

                    {/* Notifications Bell */}
                    <div className="relative">
                        <button
                            ref={bellRef}
                            onClick={() => {
                                const opening = !showNotifications;
                                setShowNotifications(opening);
                                if (opening) {
                                    // Mark as seen
                                    const now = new Date().toISOString();
                                    localStorage.setItem('notif_last_seen', now);
                                    setLastSeenAt(now);
                                    setUnreadCount(0);
                                }
                            }}
                            className="relative p-2 hover:bg-subtle rounded-lg text-muted hover:text-main transition-colors"
                        >
                            <Bell size={20} />
                            {unreadCount > 0 && (
                                <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
                                    {unreadCount > 99 ? '99+' : unreadCount}
                                </span>
                            )}
                        </button>

                        {/* Notifications Dropdown */}
                        {showNotifications && <NotificationsDropdown
                            notifications={notifications}
                            notifTab={notifTab}
                            setNotifTab={setNotifTab}
                            lastSeenAt={lastSeenAt}
                            onClose={() => setShowNotifications(false)}
                            onNavigate={(tab: string) => { setActiveTab(tab as Tab); setShowNotifications(false); }}
                            anchorRef={bellRef}
                        />}
                    </div>
                </header>

                {/* Content Area */}
                <div className="flex-1 overflow-y-auto p-4 lg:p-8 pb-20 lg:pb-8">
                    <Suspense fallback={
                        <div className="flex justify-center items-center h-64">
                            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                        </div>
                    }>
                        {activeTab === 'leads' && <LeadsPanel searchTerm={globalSearch} />}
                        {activeTab === 'blog' && <BlogPanel searchTerm={globalSearch} />}
                        {activeTab === 'workers' && <WorkersPanel searchTerm={globalSearch} />}
                        {activeTab === 'objects' && <ObjectsPanel searchTerm={globalSearch} />}
                        {activeTab === 'my_cabinet' && <MyCabinetPanel />}
                        {activeTab === 'reports' && <ReportsPanel />}
                        {activeTab === 'procurement' && <ProcurementPanel searchTerm={globalSearch} />}
                        {activeTab === 'settings' && <SettingsPanel />}
                        {activeTab === 'email_search' && <EmailSearchPanel />}

                        {activeTab === 'clients' && <ClientsPanel searchTerm={globalSearch} />}
                        {activeTab === 'quality' && <QualityControlPanel searchTerm={globalSearch} />}
                        {activeTab === 'procedures' && <ProceduresPanel searchTerm={globalSearch} />}
                        {activeTab === 'chat_stats' && <ChatStatsPanel />}
                        {activeTab === 'contacts' && <ContactsPanel searchTerm={globalSearch} />}
                        {activeTab === 'email_tracking' && <EmailTrackingPanel />}
                    </Suspense>
                </div>
            </main>
        </div>
    );
}

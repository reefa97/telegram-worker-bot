import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import {
    LogOut, Users, Briefcase, FileText, Settings, UserCog, UserPlus2,
    Calendar, X, Trash2, ScrollText, Search, ChevronLeft, ChevronRight, Sun, Moon, Menu, User, Bell
} from 'lucide-react';
import WorkersPanel from './WorkersPanel';
import ObjectsPanel from './ObjectsPanel';
import ReportsPanel from './ReportsPanel';
import SettingsPanel from './SettingsPanel';
import UsersPanel from './UsersPanel';
import SubAdminsPanel from './SubAdminsPanel';
import ShiftPlanningPanel from './ShiftPlanningPanel';
import LogsPanel from './LogsPanel';
import TrashPanel from './TrashPanel';
import EmailSearchPanel from './EmailSearchPanel';
import RolesPanel from './RolesPanel';

import ProcurementPanel from './ProcurementPanel';
import MyFinancesPanel from './MyFinancesPanel';
import MyCabinetPanel from './MyCabinetPanel';
import ClientsPanel from './ClientsPanel';
import QualityControlPanel from './QualityControlPanel';
import ContactsPanel from './ContactsPanel';
import EmailTrackingPanel from './EmailTrackingPanel';
import { Shield, ShoppingBag, CheckSquare, ClipboardCheck, BookUser, MailCheck } from 'lucide-react';

type Tab = 'workers' | 'objects' | 'reports' | 'superadmins' | 'subadmins' | 'settings' | 'shifts' | 'tasks' | 'logs' | 'trash' | 'email_search' | 'roles' | 'procurement' | 'my_finances' | 'my_cabinet' | 'clients' | 'quality' | 'contacts' | 'email_tracking';

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
    const [notifTab, setNotifTab] = useState<'client' | 'procurement' | 'late'>('client');

    // Save activeTab to localStorage whenever it changes
    useEffect(() => {
        localStorage.setItem('activeTab', activeTab);
        setGlobalSearch('');
    }, [activeTab]);

    // Load notifications
    const loadNotifications = useCallback(async () => {
        const now = new Date();
        const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString();

        const [lateRes, clientRes, procRes] = await Promise.all([
            supabase.from('notifications_log').select('id, notification_type, message, sent_at, metadata').gte('sent_at', threeDaysAgo).order('sent_at', { ascending: false }).limit(20),
            supabase.from('client_requests').select('id, message, status, created_at, client_id, object_id, cleaning_objects(name)').gte('created_at', threeDaysAgo).order('created_at', { ascending: false }).limit(20),
            supabase.from('procurement_requests').select('id, item_name, status, created_at, worker_id, object_id, workers:worker_id(first_name, last_name), cleaning_objects:object_id(name)').eq('status', 'pending').order('created_at', { ascending: false }).limit(20),
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
        { id: 'workers', label: 'Работники', icon: Users, requiredPermission: 'workers_view' },
        { id: 'objects', label: 'Объекты', icon: Briefcase, requiredPermission: 'objects_view' },
        { id: 'my_finances', label: 'Мои финансы', icon: User, requiredPermission: 'workers_view' },
        { id: 'my_cabinet', label: 'Мой кабинет', icon: CheckSquare, requiredPermission: 'workers_view' },
        { id: 'shifts', label: 'Смены', icon: Calendar, requiredPermission: 'shifts_view' },
        { id: 'procurement', label: 'Закупки', icon: ShoppingBag, requiredPermission: 'objects_view' }, // Assuming objects_view implies access to object supplies
        { id: 'quality', label: 'Контроль', icon: ClipboardCheck, requiredPermission: 'objects_view' },
        { id: 'reports', label: 'Отчеты', icon: FileText, requiredPermission: 'reports_view' },
        { id: 'logs', label: 'Логи', icon: ScrollText, superAdminOnly: true },
        { id: 'superadmins', label: 'Super Admins', icon: UserCog, superAdminOnly: true },
        { id: 'subadmins', label: 'Sub Admins', icon: UserPlus2, superAdminOnly: true },
        { id: 'clients', label: 'Клиенты', icon: Users, superAdminOnly: true },
        { id: 'contacts', label: 'Контакты', icon: BookUser, superAdminOnly: true },
        { id: 'email_search', label: 'Поиск Email', icon: Search, requiredPermission: 'email_search_view' },
        { id: 'email_tracking', label: 'Трекинг Email', icon: MailCheck, superAdminOnly: true },
        { id: 'roles', label: 'Роли', icon: Shield, requiredPermission: 'roles_view' },
        { id: 'trash', label: 'Корзина', icon: Trash2, superAdminOnly: true },
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
                        {showNotifications && (() => {
                            const clientNotifs = notifications.filter(n => n.type === 'client');
                            const procNotifs = notifications.filter(n => n.type === 'procurement');
                            const lateNotifs = notifications.filter(n => n.type === 'late');
                            const tabNotifs = notifTab === 'client' ? clientNotifs : notifTab === 'procurement' ? procNotifs : lateNotifs;

                            return (
                            <>
                                <div className="fixed inset-0 z-40" onClick={() => setShowNotifications(false)} />
                                <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 bg-card border border-border rounded-lg shadow-xl z-50 max-h-[70vh] flex flex-col">
                                    <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                                        <h3 className="font-semibold text-main text-sm">Уведомления</h3>
                                        <button onClick={() => setShowNotifications(false)} className="p-1 hover:bg-subtle rounded text-muted">
                                            <X size={16} />
                                        </button>
                                    </div>

                                    {/* Tabs */}
                                    <div className="flex border-b border-border">
                                        {([
                                            { key: 'client' as const, label: 'Клиенты', icon: '💬', count: clientNotifs.length },
                                            { key: 'procurement' as const, label: 'Закупки', icon: '📦', count: procNotifs.length },
                                            { key: 'late' as const, label: 'Опоздания', icon: '🔴', count: lateNotifs.length },
                                        ]).map(tab => (
                                            <button
                                                key={tab.key}
                                                onClick={() => setNotifTab(tab.key)}
                                                className={`flex-1 px-2 py-2.5 text-xs font-medium border-b-2 -mb-px transition-colors flex items-center justify-center gap-1.5 ${notifTab === tab.key ? 'border-blue-500 text-main' : 'border-transparent text-muted hover:text-main'}`}
                                            >
                                                <span>{tab.icon}</span>
                                                <span>{tab.label}</span>
                                                {tab.count > 0 && (
                                                    <span className="ml-0.5 text-[10px] bg-subtle px-1.5 py-0.5 rounded-full">{tab.count}</span>
                                                )}
                                            </button>
                                        ))}
                                    </div>

                                    <div className="overflow-y-auto flex-1">
                                        {tabNotifs.length === 0 ? (
                                            <div className="p-6 text-center text-muted text-sm">Нет уведомлений</div>
                                        ) : (
                                            tabNotifs.map((n) => {
                                                const isNew = lastSeenAt ? new Date(n.time) > new Date(lastSeenAt) : false;
                                                return (
                                                <div
                                                    key={n.id}
                                                    className={`px-4 py-3 border-b border-border/50 hover:bg-subtle/50 transition-colors cursor-pointer ${isNew ? 'bg-blue-500/5' : ''}`}
                                                    onClick={() => {
                                                        if (n.type === 'client') { setActiveTab('clients'); }
                                                        else if (n.type === 'procurement') { setActiveTab('procurement'); }
                                                        setShowNotifications(false);
                                                    }}
                                                >
                                                    <div className="flex items-start gap-2">
                                                        {isNew && <span className="w-2 h-2 rounded-full bg-blue-500 mt-1.5 shrink-0" />}
                                                        <div className="flex-1 min-w-0">
                                                            <p className="text-sm text-main leading-snug">{n.message}</p>
                                                            {n.detail && <p className="text-xs text-muted mt-0.5">{n.detail}</p>}
                                                            <p className="text-[11px] text-muted mt-1">
                                                                {new Date(n.time).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                                            </p>
                                                        </div>
                                                    </div>
                                                </div>
                                                );
                                            })
                                        )}
                                    </div>
                                </div>
                            </>
                            );
                        })()}
                    </div>
                </header>

                {/* Content Area */}
                <div className="flex-1 overflow-y-auto p-4 lg:p-8 pb-20 lg:pb-8">
                    {activeTab === 'workers' && <WorkersPanel searchTerm={globalSearch} />}
                    {activeTab === 'objects' && <ObjectsPanel searchTerm={globalSearch} />}
                    {activeTab === 'my_finances' && <MyFinancesPanel />}
                    {activeTab === 'my_cabinet' && <MyCabinetPanel />}
                    {activeTab === 'shifts' && <ShiftPlanningPanel />}
                    {activeTab === 'reports' && <ReportsPanel />}
                    {activeTab === 'procurement' && <ProcurementPanel searchTerm={globalSearch} />}
                    {activeTab === 'superadmins' && isSuperAdmin && <UsersPanel />}
                    {activeTab === 'subadmins' && <SubAdminsPanel />}
                    {activeTab === 'settings' && <SettingsPanel />}
                    {activeTab === 'logs' && <LogsPanel />}
                    {activeTab === 'email_search' && <EmailSearchPanel />}

                    {activeTab === 'roles' && <RolesPanel />}
                    {activeTab === 'trash' && <TrashPanel />}
                    {activeTab === 'clients' && <ClientsPanel searchTerm={globalSearch} />}
                    {activeTab === 'quality' && <QualityControlPanel searchTerm={globalSearch} />}
                    {activeTab === 'contacts' && <ContactsPanel searchTerm={globalSearch} />}
                    {activeTab === 'email_tracking' && <EmailTrackingPanel />}
                </div>
            </main>
        </div>
    );
}

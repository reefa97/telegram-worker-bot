import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import {
    LogOut, Users, Briefcase, FileText, Settings, UserCog, UserPlus2,
    Calendar, X, Trash2, ScrollText, Search, ChevronLeft, ChevronRight, Sun, Moon, Mail, Menu, User
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
import { EmailLayout } from './email/EmailLayout';
import ProcurementPanel from './ProcurementPanel';
import MyFinancesPanel from './MyFinancesPanel';
import MyCabinetPanel from './MyCabinetPanel';
import ClientsPanel from './ClientsPanel';
import { Shield, ShoppingBag, CheckSquare } from 'lucide-react';

type Tab = 'workers' | 'objects' | 'reports' | 'superadmins' | 'subadmins' | 'settings' | 'shifts' | 'tasks' | 'logs' | 'trash' | 'email_search' | 'roles' | 'procurement' | 'emails' | 'my_finances' | 'my_cabinet' | 'clients';

export default function Dashboard() {
    const { signOut, adminUser } = useAuth();
    const { theme, toggleTheme } = useTheme();

    // Initialize activeTab from localStorage or default to 'workers'
    const [activeTab, setActiveTab] = useState<Tab>(() => {
        const saved = localStorage.getItem('activeTab');
        return (saved as Tab) || 'workers';
    });

    const [sidebarOpen, setSidebarOpen] = useState(true); // Default open on desktop
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

    // Save activeTab to localStorage whenever it changes
    useEffect(() => {
        localStorage.setItem('activeTab', activeTab);
    }, [activeTab]);

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
        { id: 'reports', label: 'Отчеты', icon: FileText, requiredPermission: 'reports_view' },
        { id: 'logs', label: 'Логи', icon: ScrollText, superAdminOnly: true },
        { id: 'superadmins', label: 'Super Admins', icon: UserCog, superAdminOnly: true },
        { id: 'subadmins', label: 'Sub Admins', icon: UserPlus2, superAdminOnly: true },
        { id: 'clients', label: 'Клиенты', icon: Users, superAdminOnly: true },
        { id: 'email_search', label: 'Поиск Email', icon: Search, requiredPermission: 'email_search_view' },
        { id: 'roles', label: 'Роли', icon: Shield, requiredPermission: 'roles_view' },
        { id: 'trash', label: 'Корзина', icon: Trash2, superAdminOnly: true },
        { id: 'settings', label: 'Настройки', icon: Settings, superAdminOnly: true },
        { id: 'emails', label: 'Почта', icon: Mail, requiredPermission: 'email_search_view' },
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
                {/* Mobile Header */}
                <header className="lg:hidden h-14 bg-card border-b border-border flex items-center justify-between px-4 shrink-0">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => setMobileMenuOpen(true)}
                            className="p-1.5 hover:bg-subtle rounded-md text-muted hover:text-main transition-colors"
                        >
                            <Menu size={20} />
                        </button>
                        <span className="text-sm font-semibold tracking-tight text-main">
                            Reefa
                        </span>
                    </div>
                </header>

                {/* Content Area */}
                <div className="flex-1 overflow-y-auto p-4 lg:p-8">
                    {activeTab === 'workers' && <WorkersPanel />}
                    {activeTab === 'objects' && <ObjectsPanel />}
                    {activeTab === 'my_finances' && <MyFinancesPanel />}
                    {activeTab === 'my_cabinet' && <MyCabinetPanel />}
                    {activeTab === 'shifts' && <ShiftPlanningPanel />}
                    {activeTab === 'reports' && <ReportsPanel />}
                    {activeTab === 'procurement' && <ProcurementPanel />}
                    {activeTab === 'superadmins' && isSuperAdmin && <UsersPanel />}
                    {activeTab === 'subadmins' && <SubAdminsPanel />}
                    {activeTab === 'settings' && <SettingsPanel />}
                    {activeTab === 'logs' && <LogsPanel />}
                    {activeTab === 'email_search' && <EmailSearchPanel />}
                    {activeTab === 'emails' && <EmailLayout />}
                    {activeTab === 'roles' && <RolesPanel />}
                    {activeTab === 'trash' && <TrashPanel />}
                    {activeTab === 'clients' && <ClientsPanel />}
                </div>
            </main>
        </div>
    );
}

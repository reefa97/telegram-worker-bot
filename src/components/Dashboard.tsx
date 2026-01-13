import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
    LogOut, Users, Briefcase, FileText, Settings, UserCog, UserPlus2,
    Calendar, Menu, X, Trash2, ScrollText
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

type Tab = 'workers' | 'objects' | 'reports' | 'superadmins' | 'subadmins' | 'settings' | 'shifts' | 'tasks' | 'logs' | 'trash';

export default function Dashboard() {
    const { signOut, adminUser } = useAuth();
    const [activeTab, setActiveTab] = useState<Tab>('workers');
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

    const handleSignOut = async () => {
        try {
            await signOut();
        } catch (error) {
            console.error('Error signing out:', error);
        }
    };

    const isSuperAdmin = adminUser?.role === 'super_admin';

    const tabs: { id: Tab; label: string; icon: any; superAdminOnly?: boolean; requiredPermission?: string }[] = [
        { id: 'workers', label: 'Работники', icon: Users, requiredPermission: 'workers_read' },
        { id: 'objects', label: 'Объекты', icon: Briefcase, requiredPermission: 'objects_read' },
        { id: 'shifts', label: 'Смены', icon: Calendar, requiredPermission: 'shifts_read' },
        { id: 'reports', label: 'Отчеты', icon: FileText, requiredPermission: 'reports_read' },
        { id: 'logs', label: 'Логи', icon: ScrollText, superAdminOnly: true },
        { id: 'superadmins', label: 'Super Admins', icon: UserCog, superAdminOnly: true },
        { id: 'subadmins', label: 'Sub Admins', icon: UserPlus2, superAdminOnly: true },
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
        <div className="min-h-screen bg-[#121212]">
            {/* Header */}
            <header className="sticky top-0 z-40 backdrop-blur-lg bg-white/80 dark:bg-gray-800/80 border-b border-gray-200 dark:border-gray-700">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
                    <div className="flex items-center justify-between">
                        {/* Logo & User Info */}
                        <div className="flex items-center gap-4">
                            {/* Mobile menu button */}
                            <button
                                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                                className="lg:hidden btn-icon"
                            >
                                {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
                            </button>

                            <div>
                                <h1 className="text-lg sm:text-xl font-bold text-gradient">
                                    Worker Tracking
                                </h1>
                                <p className="text-xs text-gray-500 dark:text-gray-400 hidden sm:block">
                                    {adminUser?.email} • {adminUser?.role === 'super_admin' ? 'Super Admin' : 'Sub Admin'}
                                </p>
                            </div>
                        </div>

                        {/* Right side actions */}
                        <div className="flex items-center gap-2">
                            <button
                                onClick={handleSignOut}
                                className="btn-secondary text-sm flex items-center gap-2 px-4 py-2"
                            >
                                <LogOut className="w-4 h-4" />
                                <span className="hidden sm:inline">Выход</span>
                            </button>
                        </div>
                    </div>
                </div>
            </header>

            {/* Mobile Navigation Overlay */}
            {
                mobileMenuOpen && (
                    <div
                        className="lg:hidden fixed inset-0 z-30 bg-black/50 backdrop-blur-sm"
                        onClick={() => setMobileMenuOpen(false)}
                    />
                )
            }

            {/* Mobile Navigation Drawer */}
            <div className={`
                lg:hidden fixed top-0 left-0 z-40 h-full w-64 
                bg-white dark:bg-gray-800 shadow-xl
                transform transition-transform duration-300 ease-out
                ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}
            `}>
                <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                    <div className="flex items-center justify-between">
                        <h2 className="font-bold text-lg text-gradient">Меню</h2>
                        <button onClick={() => setMobileMenuOpen(false)} className="btn-icon">
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        {adminUser?.email}
                    </p>
                </div>
                <nav className="p-2">
                    {visibleTabs.map((tab) => {
                        const Icon = tab.icon;
                        const isActive = activeTab === tab.id;
                        return (
                            <button
                                key={tab.id}
                                onClick={() => handleTabClick(tab.id)}
                                className={`
                                    w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left
                                    transition-all duration-200
                                    ${isActive
                                        ? 'bg-primary-500 text-white shadow-lg'
                                        : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                                    }
                                `}
                            >
                                <Icon className="w-5 h-5" />
                                {tab.label}
                            </button>
                        );
                    })}
                </nav>
            </div>

            {/* Desktop Tabs */}
            <div className="hidden lg:block bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <nav className="flex justify-center gap-4 overflow-x-auto py-2">
                        {visibleTabs.map((tab) => {
                            const Icon = tab.icon;
                            const isActive = activeTab === tab.id;

                            return (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id)}
                                    className={`nav-tab ${isActive ? 'nav-tab-active' : ''}`}
                                >
                                    <Icon className="w-4 h-4" />
                                    {tab.label}
                                </button>
                            );
                        })}
                    </nav>
                </div>
            </div>

            {/* Mobile Tab Indicator */}
            <div className="lg:hidden bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-2">
                <div className="flex items-center gap-2 text-sm font-medium text-gray-900 dark:text-white">
                    {(() => {
                        const currentTab = visibleTabs.find(t => t.id === activeTab);
                        if (!currentTab) return null;
                        const Icon = currentTab.icon;
                        return (
                            <>
                                <Icon className="w-4 h-4 text-primary-500" />
                                {currentTab.label}
                            </>
                        );
                    })()}
                </div>
            </div>

            {/* Content */}
            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                <div className="animate-fade-in">
                    {activeTab === 'workers' && <WorkersPanel />}
                    {activeTab === 'objects' && <ObjectsPanel />}
                    {activeTab === 'shifts' && <ShiftPlanningPanel />}
                    {activeTab === 'reports' && <ReportsPanel />}
                    {activeTab === 'superadmins' && isSuperAdmin && <UsersPanel />}
                    {activeTab === 'subadmins' && <SubAdminsPanel />}
                    {activeTab === 'settings' && <SettingsPanel />}
                    {activeTab === 'logs' && <LogsPanel />}
                    {activeTab === 'trash' && <TrashPanel />}
                </div>
            </main>
        </div >
    );
}

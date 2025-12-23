import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { LogOut, Users, Briefcase, FileText, Settings, UserCog, UserPlus2 } from 'lucide-react';
import WorkersPanel from './WorkersPanel';
import ObjectsPanel from './ObjectsPanel';
import ReportsPanel from './ReportsPanel';
import SettingsPanel from './SettingsPanel';
import UsersPanel from './UsersPanel';
import SubAdminsPanel from './SubAdminsPanel';
import ShiftPlanningPanel from './ShiftPlanningPanel';
import RolesPanel from './RolesPanel';
import { Calendar, Shield } from 'lucide-react';

type Tab = 'workers' | 'objects' | 'reports' | 'superadmins' | 'subadmins' | 'settings' | 'shifts' | 'tasks' | 'roles';

export default function Dashboard() {
    const { signOut, adminUser } = useAuth();
    const [activeTab, setActiveTab] = useState<Tab>('workers');

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
        { id: 'superadmins', label: 'Super Admins', icon: UserCog, superAdminOnly: true },
        { id: 'subadmins', label: 'Sub Admins', icon: UserPlus2, superAdminOnly: true },
        { id: 'roles', label: 'Роли', icon: Shield, requiredPermission: 'roles_read' },
        { id: 'settings', label: 'Настройки', icon: Settings, superAdminOnly: true },
    ];

    return (
        <div className="min-h-screen bg-gray-900">
            {/* Header */}
            <header className="bg-gray-800 border-b border-gray-700">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <h1 className="text-2xl font-bold text-white">Worker Tracking System</h1>
                            <p className="text-sm text-gray-400 mt-1">
                                {adminUser?.email} • {adminUser?.role === 'super_admin' ? 'Super Admin' : 'Sub Admin'}
                            </p>
                        </div>
                        <button
                            onClick={handleSignOut}
                            className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
                        >
                            <LogOut className="w-4 h-4" />
                            Выход
                        </button>
                    </div>
                </div>
            </header>

            {/* Tabs */}
            <div className="bg-gray-800 border-b border-gray-700">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <nav className="flex gap-1 overflow-x-auto">
                        {tabs.map((tab) => {
                            if (tab.superAdminOnly && !isSuperAdmin) return null;
                            if (tab.requiredPermission && !isSuperAdmin && adminUser?.permissions && !adminUser.permissions[tab.requiredPermission]) {
                                return null;
                            }

                            const Icon = tab.icon;
                            const isActive = activeTab === tab.id;

                            return (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id)}
                                    className={`flex items-center gap-2 px-4 py-3 border-b-2 transition-colors whitespace-nowrap ${isActive
                                        ? 'border-primary-500 text-primary-400'
                                        : 'border-transparent text-gray-400 hover:text-gray-300'
                                        }`}
                                >
                                    <Icon className="w-4 h-4" />
                                    {tab.label}
                                </button>
                            );
                        })}
                    </nav>
                </div>
            </div>

            {/* Content */}
            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {activeTab === 'workers' && <WorkersPanel />}
                {activeTab === 'objects' && <ObjectsPanel />}
                {activeTab === 'shifts' && <ShiftPlanningPanel />}

                {activeTab === 'reports' && <ReportsPanel />}
                {activeTab === 'superadmins' && isSuperAdmin && <UsersPanel />}
                {activeTab === 'subadmins' && <SubAdminsPanel />}
                {activeTab === 'roles' && <RolesPanel />}
                {activeTab === 'settings' && <SettingsPanel />}
            </main>
        </div>
    );
}

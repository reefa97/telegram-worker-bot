import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { LogOut, Calendar, Menu, X, Moon, Sun, Phone, Send, FileText, ClipboardList } from 'lucide-react';
import ClientCalendar from './ClientCalendar';
import ClientRequests from './ClientRequests';
import ClientContact from './ClientContact';
import ClientDocuments from './ClientDocuments';
import ClientTasks from './ClientTasks';

type ClientTab = 'calendar' | 'tasks' | 'requests' | 'documents' | 'contact';

export default function ClientDashboard() {
    const { signOut, adminUser } = useAuth();
    const { theme, toggleTheme } = useTheme();
    const [activeTab, setActiveTab] = useState<ClientTab>('calendar');
    const [sidebarOpen, setSidebarOpen] = useState(false);

    const handleSignOut = async () => {
        try {
            await signOut();
        } catch (error) {
            console.error('Error signing out:', error);
        }
    };

    const tabs: { id: ClientTab; label: string; icon: any }[] = [
        { id: 'calendar', label: 'Harmonogram', icon: Calendar },
        { id: 'tasks', label: 'Zakres prac', icon: ClipboardList },
        { id: 'requests', label: 'Wiadomości', icon: Send },
        { id: 'documents', label: 'Dokumenty', icon: FileText },
        { id: 'contact', label: 'Kontakt', icon: Phone },
    ];

    return (
        <div className="min-h-screen bg-surface text-main flex font-sans">
            {/* Mobile Sidebar Overlay */}
            {sidebarOpen && (
                <div
                    className="fixed inset-0 bg-black/50 z-40 lg:hidden"
                    onClick={() => setSidebarOpen(false)}
                />
            )}

            {/* Sidebar */}
            <aside className={`
                fixed inset-y-0 left-0 z-50 w-64 bg-card border-r border-border transform transition-transform duration-300 lg:translate-x-0 lg:static
                ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
            `}>
                <div className="h-16 flex items-center justify-between px-6 border-b border-border">
                    <span className="text-xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                        Reefa Klient
                    </span>
                    <button
                        onClick={() => setSidebarOpen(false)}
                        className="lg:hidden text-muted hover:text-main"
                    >
                        <X size={20} />
                    </button>
                </div>

                <nav className="p-4 space-y-1">
                    {tabs.map(tab => {
                        const Icon = tab.icon;
                        return (
                            <button
                                key={tab.id}
                                onClick={() => {
                                    setActiveTab(tab.id);
                                    setSidebarOpen(false);
                                }}
                                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-medium ${activeTab === tab.id
                                    ? 'bg-primary/10 text-primary'
                                    : 'text-muted hover:bg-subtle'
                                    }`}
                            >
                                <Icon size={20} />
                                {tab.label}
                            </button>
                        );
                    })}
                </nav>

                <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-border">
                    <div className="flex items-center gap-3 px-4 py-3 mb-2">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs border border-primary/20">
                            {adminUser?.email?.[0].toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate text-main">
                                {adminUser?.email}
                            </p>
                            <p className="text-xs text-muted truncate">
                                Klient
                            </p>
                        </div>
                    </div>

                    <button
                        onClick={toggleTheme}
                        className="w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium text-muted hover:bg-subtle transition-colors"
                    >
                        {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
                        {theme === 'dark' ? 'Jasny motyw' : 'Ciemny motyw'}
                    </button>

                    <button
                        onClick={handleSignOut}
                        className="w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors mt-1"
                    >
                        <LogOut size={18} />
                        Wyloguj się
                    </button>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 min-w-0 flex flex-col h-screen overflow-hidden">
                <header className="h-16 bg-card border-b border-border flex items-center justify-between px-4 lg:px-8 shrink-0">
                    <button
                        onClick={() => setSidebarOpen(true)}
                        className="lg:hidden p-2 text-muted"
                    >
                        <Menu size={24} />
                    </button>
                    <h1 className="text-lg font-semibold text-main">
                        {tabs.find(t => t.id === activeTab)?.label}
                    </h1>
                    <div /> {/* Spacer */}
                </header>

                <div className="flex-1 overflow-auto p-4 lg:p-8">
                    <div className="max-w-6xl mx-auto">
                        {activeTab === 'calendar' && <ClientCalendar />}
                        {activeTab === 'tasks' && <ClientTasks />}
                        {activeTab === 'requests' && <ClientRequests />}
                        {activeTab === 'documents' && <ClientDocuments />}
                        {activeTab === 'contact' && <ClientContact />}
                    </div>
                </div>
            </main>
        </div>
    );
}

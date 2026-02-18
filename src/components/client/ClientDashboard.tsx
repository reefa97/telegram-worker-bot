
import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { LogOut, Calendar, Menu, X, Moon, Sun, FileText, Phone, Mail } from 'lucide-react';
import ClientCalendar from './ClientCalendar';

type ClientTab = 'calendar' | 'documents' | 'contact';

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
        { id: 'calendar', label: 'Календарь уборок', icon: Calendar },
        { id: 'documents', label: 'Документы', icon: FileText },
        { id: 'contact', label: 'Связь с нами', icon: Phone },
    ];

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 flex font-sans">
            {/* Mobile Sidebar Overlay */}
            {sidebarOpen && (
                <div
                    className="fixed inset-0 bg-black/50 z-40 lg:hidden"
                    onClick={() => setSidebarOpen(false)}
                />
            )}

            {/* Sidebar */}
            <aside className={`
                fixed inset-y-0 left-0 z-50 w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 transform transition-transform duration-300 lg:translate-x-0 lg:static
                ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
            `}>
                <div className="h-16 flex items-center justify-between px-6 border-b border-gray-200 dark:border-gray-700">
                    <span className="text-xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                        Reefa Client
                    </span>
                    <button
                        onClick={() => setSidebarOpen(false)}
                        className="lg:hidden text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
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
                                    ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400'
                                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                                    }`}
                            >
                                <Icon size={20} />
                                {tab.label}
                            </button>
                        );
                    })}
                </nav>

                <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-gray-200 dark:border-gray-700">
                    <div className="flex items-center gap-3 px-4 py-3 mb-2">
                        <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center text-blue-600 dark:text-blue-300 font-bold text-xs border border-blue-200 dark:border-blue-800">
                            {adminUser?.email?.[0].toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate text-gray-900 dark:text-white">
                                {adminUser?.email}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                                Клиент
                            </p>
                        </div>
                    </div>

                    <button
                        onClick={toggleTheme}
                        className="w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                    >
                        {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
                        {theme === 'dark' ? 'Светлая тема' : 'Темная тема'}
                    </button>

                    <button
                        onClick={handleSignOut}
                        className="w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors mt-1"
                    >
                        <LogOut size={18} />
                        Выйти
                    </button>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 min-w-0 flex flex-col h-screen overflow-hidden">
                <header className="h-16 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between px-4 lg:px-8 shrink-0">
                    <button
                        onClick={() => setSidebarOpen(true)}
                        className="lg:hidden p-2 text-gray-600 dark:text-gray-400"
                    >
                        <Menu size={24} />
                    </button>
                    <h1 className="text-lg font-semibold text-gray-900 dark:text-white">
                        {tabs.find(t => t.id === activeTab)?.label}
                    </h1>
                </header>

                <div className="flex-1 overflow-auto p-4 lg:p-8">
                    <div className="max-w-6xl mx-auto">
                        {activeTab === 'calendar' && <ClientCalendar />}

                        {activeTab === 'documents' && (
                            <div className="flex flex-col items-center justify-center py-20 text-center bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm">
                                <FileText className="w-16 h-16 text-gray-300 dark:text-gray-600 mb-4" />
                                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">Документы пока недоступны</h3>
                                <p className="text-gray-500 dark:text-gray-400 max-w-md">
                                    В этом разделе будут отображаться ваши счета, акты и договоры.
                                </p>
                            </div>
                        )}

                        {activeTab === 'contact' && (
                            <div className="grid md:grid-cols-2 gap-6">
                                <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm">
                                    <h3 className="text-lg font-bold mb-4">Связь с менеджером</h3>
                                    <p className="text-gray-600 dark:text-gray-300 mb-4">
                                        Если у вас возникли вопросы по уборке или вы хотите изменить график, свяжитесь с нами:
                                    </p>
                                    <div className="space-y-3">
                                        <div className="flex items-center gap-3 text-gray-700 dark:text-gray-300">
                                            <Phone className="w-5 h-5 text-blue-500" />
                                            <a href="tel:+48123456789" className="hover:text-blue-500 transition-colors">+48 123 456 789</a>
                                        </div>
                                        <div className="flex items-center gap-3 text-gray-700 dark:text-gray-300">
                                            <Mail className="w-5 h-5 text-blue-500" />
                                            <a href="mailto:support@reefa.pl" className="hover:text-blue-500 transition-colors">support@reefa.pl</a>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </main>
        </div>
    );
}

import { useState, useEffect } from 'react';
import { supabase } from './lib/supabase';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { UndoProvider } from './contexts/UndoContext';
import AuthForm from './components/AuthForm';
import Dashboard from './components/Dashboard';
import ClientDashboard from './components/client/ClientDashboard';
import ErrorBoundary from './components/ErrorBoundary';

function App() {
    return (
        <ErrorBoundary>
            <AuthProvider>
                <UndoProvider>
                    <AppContent />
                </UndoProvider>
            </AuthProvider>
        </ErrorBoundary>
    );
}

function AppContent() {
    const { user, adminUser, loading, refreshAdminUser } = useAuth();
    console.log('AppContent render: loading=', loading, 'user=', user?.email, 'adminUser=', adminUser?.role);
    const [showForceReload, setShowForceReload] = useState(false);

    const [localLoadingOverride, setLocalLoadingOverride] = useState(false);
    const [showProfileError, setShowProfileError] = useState(false);

    // ESC closes the topmost open .modal-overlay by simulating a click on it.
    // Existing onClick={onClose} handlers on overlays handle the rest.
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== 'Escape') return;
            const overlays = document.querySelectorAll<HTMLElement>('.modal-overlay');
            const top = overlays[overlays.length - 1];
            if (top) {
                e.preventDefault();
                top.click();
            }
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, []);

    useEffect(() => {
        let timer: NodeJS.Timeout;
        if (loading) {
            timer = setTimeout(() => setShowForceReload(true), 5000);
        }
        return () => clearTimeout(timer);
    }, [loading]);

    useEffect(() => {
        let timer: NodeJS.Timeout;
        if (!adminUser && !loading && user) {
            // Delay showing the error screen to avoid flashes during rapid auth state changes
            timer = setTimeout(() => setShowProfileError(true), 1500);
        } else {
            setShowProfileError(false);
        }
        return () => clearTimeout(timer);
    }, [adminUser, loading, user]);

    // Single unified loading screen: show while auth is loading OR while waiting for admin profile to load
    if ((loading || (user && !adminUser && !showProfileError)) && !localLoadingOverride) {
        return (
            <div className="min-h-screen bg-white dark:bg-[#0B0E14] flex flex-col items-center justify-center gap-4">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                <div className="text-gray-800 dark:text-white text-xl">Загрузка...</div>
                {showForceReload && (
                    <div className="flex flex-col items-center gap-2 mt-4 animate-fadeIn">
                        <p className="text-gray-400 text-sm">Все еще грузится?</p>
                        <div className="flex gap-2">
                            <button
                                onClick={() => window.location.reload()}
                                className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition"
                            >
                                Перезагрузить
                            </button>
                            {user ? (
                                <button
                                    onClick={() => setLocalLoadingOverride(true)}
                                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition"
                                >
                                    Войти (Данные есть)
                                </button>
                            ) : (
                                <button
                                    onClick={() => setLocalLoadingOverride(true)}
                                    className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition"
                                >
                                    Отменить загрузку
                                </button>
                            )}
                        </div>
                    </div>
                )}
            </div>
        );
    }

    if (!user) {
        return <AuthForm />;
    }

    // Safety check: User is logged in, but adminUser data is missing AND timeout fired.
    // The unified loading screen above handles the waiting state.
    if (!adminUser && !loading && showProfileError) {
        return (
            <div className="min-h-screen bg-app flex flex-col items-center justify-center p-4 text-center">
                <div className="bg-card p-8 rounded-lg border border-border max-w-md w-full shadow-lg">
                    <h2 className="text-xl font-bold text-danger mb-4">Ошибка профиля</h2>
                    <p className="text-muted mb-6">
                        Вы успешно вошли ({user.email}), но не удалось загрузить данные вашего профиля.
                        Возможно, проблема с соединением или правами доступа.
                    </p>
                    <div className="flex flex-col gap-3">
                        <button
                            onClick={() => refreshAdminUser()}
                            className="btn-primary w-full justify-center"
                        >
                            Попробовать снова
                        </button>
                        <button
                            onClick={async () => {
                                const { error } = await supabase.auth.signOut();
                                if (error) alert('Error signing out');
                                window.location.reload();
                            }}
                            className="btn-secondary w-full justify-center"
                        >
                            Выйти и зайти заново
                        </button>
                    </div>
                    <div className="mt-6 pt-4 border-t border-border">
                        <p className="text-xs text-muted font-mono">
                            ID: {user.id}<br />
                            Role: {adminUser ? 'Loaded' : 'Missing'}
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    if (adminUser?.role === 'client') {
        return <ClientDashboard />;
    }

    return (
        <div className="min-h-screen bg-app text-main transition-colors duration-200 overflow-hidden flex flex-col">
            <Dashboard />
        </div>
    );
}

export default App;

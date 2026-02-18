import { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import AuthForm from './components/AuthForm';
import Dashboard from './components/Dashboard';
import ClientDashboard from './components/client/ClientDashboard';
import ErrorBoundary from './components/ErrorBoundary';

function App() {
    return (
        <ErrorBoundary>
            <AuthProvider>
                <AppContent />
            </AuthProvider>
        </ErrorBoundary>
    );
}

function AppContent() {
    const { user, adminUser, loading } = useAuth();
    const [showForceReload, setShowForceReload] = useState(false);

    useEffect(() => {
        let timer: NodeJS.Timeout;
        if (loading) {
            timer = setTimeout(() => setShowForceReload(true), 5000);
        }
        return () => clearTimeout(timer);
    }, [loading]);

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center gap-4">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                <div className="text-white text-xl">Загрузка...</div>
                {showForceReload && (
                    <div className="flex flex-col items-center gap-2 mt-4 animate-fadeIn">
                        <p className="text-gray-400 text-sm">Все еще грузится?</p>
                        <button
                            onClick={() => window.location.reload()}
                            className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition"
                        >
                            Перезагрузить страницу
                        </button>
                    </div>
                )}
            </div>
        );
    }

    if (!user) {
        return <AuthForm />;
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

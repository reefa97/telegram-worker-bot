import { AuthProvider, useAuth } from './contexts/AuthContext';
import AuthForm from './components/AuthForm';
import Dashboard from './components/Dashboard';

function App() {
    return (
        <AuthProvider>
            <AppContent />
        </AuthProvider>
    );
}

function AppContent() {
    const { user, loading } = useAuth();

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-900 flex items-center justify-center">
                <div className="text-white text-xl">Загрузка...</div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-900">
            {user ? <Dashboard /> : <AuthForm />}
        </div>
    );
}

export default App;

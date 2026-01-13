import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { ensureFirstUserIsSuperAdmin } from '../lib/adminSync';
import { LogIn, Lock, Mail } from 'lucide-react';

export default function AuthForm() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const { signIn } = useAuth();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            await signIn(email, password);

            // Get current user
            const { data: { user } } = await (await import('../lib/supabase')).supabase.auth.getUser();
            if (user) {
                await ensureFirstUserIsSuperAdmin(user.id, user.email || '');
            }
        } catch (err: any) {
            setError(err.message || 'Ошибка входа');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50 dark:bg-gray-900 transition-colors duration-300">
            <div className="card w-full max-w-md p-8 shadow-2xl dark:shadow-none border-t-4 border-primary-500">
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center w-20 h-20 bg-primary-100 dark:bg-primary-900/30 rounded-full mb-6 ring-8 ring-primary-50 dark:ring-primary-900/10">
                        <LogIn className="w-10 h-10 text-primary-600 dark:text-primary-400 ml-1" />
                    </div>
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2 tracking-tight">
                        Worker Tracking
                    </h1>
                    <p className="text-gray-500 dark:text-gray-400 text-sm">Вход в панель администратора</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                    {error && (
                        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 px-4 py-3 rounded-xl text-sm font-medium flex items-center gap-2">
                            <span className="block w-1.5 h-1.5 rounded-full bg-red-500"></span>
                            {error}
                        </div>
                    )}

                    <div className="space-y-4">
                        <div>
                            <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                                Email
                            </label>
                            <div className="relative">
                                <input
                                    id="email"
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="input pl-10"
                                    placeholder="admin@example.com"
                                    required
                                />
                                <Mail className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                            </div>
                        </div>

                        <div>
                            <label htmlFor="password" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                                Пароль
                            </label>
                            <div className="relative">
                                <input
                                    id="password"
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="input pl-10"
                                    placeholder="••••••••"
                                    required
                                />
                                <Lock className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                            </div>
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="btn-primary w-full py-2.5 text-base shadow-lg shadow-primary-500/20 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
                    >
                        {loading ? 'Вход...' : 'Войти'}
                    </button>
                </form>

                <div className="mt-8 pt-6 border-t border-gray-100 dark:border-gray-800 text-center">
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                        Первый пользователь автоматически становится <span className="font-medium text-primary-600 dark:text-primary-400">Super Admin</span>
                    </p>
                </div>
            </div>
        </div>
    );
}

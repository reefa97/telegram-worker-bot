import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { ensureFirstUserIsSuperAdmin } from '../lib/adminSync';
import { Eye, EyeOff, Loader2, AlertCircle } from 'lucide-react';

export default function AuthForm() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const { signIn } = useAuth();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            await signIn(email, password);
            const { data: { user } } = await (await import('../lib/supabase')).supabase.auth.getUser();
            if (user) {
                await ensureFirstUserIsSuperAdmin(user.id, user.email || '');
            }
        } catch (err: any) {
            setError(err.message || 'Nie udało się zalogować');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen w-full flex items-center justify-center px-4 py-8 bg-app">
            <div className="w-full max-w-[400px]">
                {/* Logo + brand */}
                <div className="flex flex-col items-center mb-8">
                    <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center mb-4 shadow-sm">
                        <img src="/reefa-logo.png" alt="" className="w-7 h-7 object-contain" />
                    </div>
                    <h1 className="text-h2 mb-1">Reefa</h1>
                    <p className="page-subtitle">Panel zarządzania</p>
                </div>

                {/* Card */}
                <div className="card p-6 sm:p-8">
                    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
                        {error && (
                            <div
                                role="alert"
                                className="flex items-start gap-2.5 p-3 rounded-md text-sm animate-fadeIn"
                                style={{
                                    background: 'var(--danger-soft)',
                                    color: 'var(--danger-fg)',
                                }}
                            >
                                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                                <span>{error}</span>
                            </div>
                        )}

                        <div>
                            <label htmlFor="email" className="label">Email</label>
                            <input
                                id="email"
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="input"
                                placeholder="ty@firma.pl"
                                autoComplete="email"
                                inputMode="email"
                                autoCapitalize="off"
                                autoCorrect="off"
                                spellCheck={false}
                                required
                                disabled={loading}
                            />
                        </div>

                        <div>
                            <label htmlFor="password" className="label">Hasło</label>
                            <div className="relative">
                                <input
                                    id="password"
                                    type={showPassword ? 'text' : 'password'}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="input pr-11"
                                    placeholder="••••••••"
                                    autoComplete="current-password"
                                    required
                                    disabled={loading}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(v => !v)}
                                    className="absolute right-1 top-1/2 -translate-y-1/2 btn-icon"
                                    style={{ width: 36, height: 36 }}
                                    aria-label={showPassword ? 'Ukryj hasło' : 'Pokaż hasło'}
                                    tabIndex={-1}
                                >
                                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={loading || !email || !password}
                            className="btn-primary btn-lg w-full"
                        >
                            {loading ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Logowanie...
                                </>
                            ) : (
                                'Zaloguj się'
                            )}
                        </button>
                    </form>
                </div>

                {/* Footer */}
                <p className="text-center text-xs mt-6" style={{ color: 'var(--text-faint)' }}>
                    Bezpieczne logowanie · app.reefa.pl
                </p>
            </div>
        </div>
    );
}

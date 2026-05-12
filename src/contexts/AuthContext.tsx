import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { User, Session } from '@supabase/supabase-js';

interface AdminUser {
    id: string;
    email: string;
    role: 'super_admin' | 'sub_admin' | 'client';
    created_by: string | null;
    permissions?: Record<string, boolean>;
}

interface AuthContextType {
    user: User | null;
    session: Session | null;
    adminUser: AdminUser | null;
    loading: boolean;
    signIn: (email: string, password: string) => Promise<void>;
    signOut: () => Promise<void>;
    refreshAdminUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [session, setSession] = useState<Session | null>(null);
    const [adminUser, setAdminUser] = useState<AdminUser | null>(null);
    const [loading, setLoading] = useState(true);

    const fetchAdminUser = async (userId: string, accessToken?: string) => {
        try {
            console.log('AuthContext: fetchAdminUser START for', userId, 'Token present:', !!accessToken);

            // Strategies to try
            const strategies: Array<() => Promise<AdminUser | null>> = [];

            // 1. REST API Strategy (Priority if token exists)
            if (accessToken) {
                strategies.push(async () => {
                    try {
                        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
                        const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
                        const res = await fetch(`${supabaseUrl}/rest/v1/admin_users?id=eq.${userId}&select=*`, {
                            headers: {
                                'apikey': supabaseKey,
                                'Authorization': `Bearer ${accessToken}`,
                                'Content-Type': 'application/json'
                            }
                        });
                        if (!res.ok) throw new Error(`REST Error: ${res.status}`);
                        const json = await res.json();
                        if (json && json.length > 0) {
                            console.log('AuthContext: REST API fetch SUCCESS');
                            return json[0] as AdminUser;
                        }
                        return null;
                    } catch (e) {
                        console.warn('AuthContext: REST attempt failed', e);
                        return null;
                    }
                });
            }

            // 2. Client Strategy (Standard)
            strategies.push(async () => {
                try {
                    const { data, error } = await supabase
                        .from('admin_users')
                        .select('*')
                        .eq('id', userId)
                        .maybeSingle();
                    if (error) throw error;
                    return data as AdminUser;
                } catch (e) {
                    console.warn('AuthContext: Client attempt failed', e);
                    return null;
                }
            });

            // Try strategies sequentially: first one that returns a user wins.
            // (Old forEach(async) had a race-condition where setState could fire
            // on an unmounted component after we already resolved with null.)
            const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 6000));
            const sequential = (async () => {
                for (const strat of strategies) {
                    try {
                        const result = await strat();
                        if (result) return result;
                    } catch (e) {
                        console.warn('AuthContext: strategy threw', e);
                    }
                }
                return null;
            })();

            const adminData = await Promise.race([sequential, timeout]);

            if (adminData) {
                console.log('AuthContext: Admin user found:', adminData.role);
                setAdminUser(adminData);
            } else {
                console.warn('AuthContext: No admin_users record found for:', userId);
                setAdminUser(null);
            }
        } catch (err) {
            console.error('Exception in fetchAdminUser:', err);
        }
    };

    const refreshAdminUser = async () => {
        if (user && session) {
            console.log('AuthContext: Manual refresh of admin user');
            await fetchAdminUser(user.id, session.access_token);
        }
    };

    useEffect(() => {
        // Debug Mode: Simulate Super Admin
        if (localStorage.getItem('debug_super_admin') === 'true') {
            setUser({ id: 'debug-user', email: 'admin@debug.com', app_metadata: {}, user_metadata: {}, aud: 'authenticated', created_at: '' });
            setSession({ access_token: 'debug', refresh_token: 'debug', expires_in: 3600, token_type: 'bearer', user: { id: 'debug-user', email: 'admin@debug.com', app_metadata: {}, user_metadata: {}, aud: 'authenticated', created_at: '' } });
            setAdminUser({
                id: 'debug-user',
                email: 'admin@debug.com',
                role: 'super_admin',
                created_by: null,
                permissions: {}
            });
            setLoading(false);
            return;
        }

        // Debug Mode: Simulate Client
        if (localStorage.getItem('debug_client') === 'true') {
            setUser({ id: 'debug-client', email: 'client@debug.com', app_metadata: {}, user_metadata: {}, aud: 'authenticated', created_at: '' });
            setSession({ access_token: 'debug-client', refresh_token: 'debug-client', expires_in: 3600, token_type: 'bearer', user: { id: 'debug-client', email: 'client@debug.com', app_metadata: {}, user_metadata: {}, aud: 'authenticated', created_at: '' } });
            setAdminUser({
                id: 'debug-client',
                email: 'client@debug.com',
                role: 'client',
                created_by: null,
                permissions: {}
            });
            setLoading(false);
            return;
        }

        // mounted flag in the effect closure (not in initAuth body) so the
        // cleanup function below actually sets the same variable that the
        // async paths read.
        let mounted = true;

        const initAuth = async () => {
            try {
                const { data: { session }, error } = await supabase.auth.getSession();
                if (error) throw error;
                if (!mounted) return;
                setSession(session);
                setUser(session?.user ?? null);
                if (session?.user && session?.access_token) {
                    await fetchAdminUser(session.user.id, session.access_token);
                }
            } catch (err) {
                console.error('AuthContext: Error initializing auth', err);
            } finally {
                if (mounted) setLoading(false);
            }
        };

        // 7-second safety net for hung auth
        const safetyTimer = setTimeout(() => {
            if (mounted) {
                console.warn('AuthContext: auth init took >7s, releasing loading');
                setLoading(false);
            }
        }, 7000);

        initAuth().finally(() => clearTimeout(safetyTimer));

        // Listen for auth changes (skip INITIAL_SESSION — already handled by initAuth)
        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange(async (_event: any, session: any) => {
            if (_event === 'INITIAL_SESSION') return;
            if (!mounted) return;
            setSession(session);
            setUser(session?.user ?? null);

            if (session?.user && session?.access_token) {
                await fetchAdminUser(session.user.id, session.access_token);
            } else {
                setAdminUser(null);
            }
            if (mounted) setLoading(false);
        });

        return () => {
            mounted = false;
            clearTimeout(safetyTimer);
            subscription.unsubscribe();
        };
    }, []);

    const signIn = async (email: string, password: string) => {
        const { error } = await supabase.auth.signInWithPassword({
            email,
            password,
        });

        if (error) throw error;
    };

    const signOut = async () => {
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
        setAdminUser(null);
    };

    return (
        <AuthContext.Provider
            value={{
                user,
                session,
                adminUser,
                loading,
                signIn,
                signOut,
                refreshAdminUser,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}

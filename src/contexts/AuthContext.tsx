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

    const fetchAdminUser = async (userId: string) => {
        try {
            console.log('AuthContext: fetchAdminUser START for', userId);
            const { data, error } = await supabase
                .from('admin_users')
                .select('*')
                .eq('id', userId)
                .maybeSingle();

            if (error) {
                console.error('Error fetching admin user:', error);
                throw error;
            }

            if (data) {
                console.log('AuthContext: Admin user found:', data.role);
                setAdminUser(data);
            } else {
                console.warn('AuthContext: No admin_users record found for:', userId);
                setAdminUser(null);
            }
        } catch (err) {
            console.error('Exception in fetchAdminUser:', err);
            // Don't set adminUser to null here, maybe keep previous? 
            // Or set null to indicate failure?
            // If we set null, the UI might show empty dashboard.
            // But we have no data.
        }
    };

    const refreshAdminUser = async () => {
        if (user) {
            console.log('AuthContext: Manual refresh of admin user');
            await fetchAdminUser(user.id);
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

        // Get initial session
        const initAuth = async () => {
            console.log('AuthContext: initAuth starting');
            let mounted = true;

            const authPromise = async () => {
                try {
                    console.log('AuthContext: Getting session...');
                    const { data: { session }, error } = await supabase.auth.getSession();
                    if (error) throw error;

                    if (!mounted) return;

                    console.log('AuthContext: Session retrieved', session?.user?.email);
                    setSession(session);
                    setUser(session?.user ?? null);

                    if (session?.user) {
                        console.log('AuthContext: Fetching admin user...');
                        await fetchAdminUser(session.user.id);
                    }
                } catch (err) {
                    console.error('AuthContext: Error initializing auth', err);
                }
            };

            // Race between auth and timeout
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('Auth timeout')), 7000);
            });

            try {
                await Promise.race([authPromise(), timeoutPromise]);
            } catch (err) {
                console.error('AuthContext: Initialization error/timeout', err);
            } finally {
                if (mounted) {
                    console.log('AuthContext: Setting loading false (finally)');
                    setLoading(false);
                }
            }

            return () => { mounted = false; };
        };

        initAuth();

        // Listen for auth changes
        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange(async (_event, session) => {
            console.log('AuthContext: Auth change', _event, session?.user?.email);
            setSession(session);
            setUser(session?.user ?? null);

            if (session?.user) {
                // If we already have the correct adminUser, skip fetch to avoid loops if needed, 
                // but usually fine to refetch.
                await fetchAdminUser(session.user.id);
            } else {
                setAdminUser(null);
            }
            // Ensure loading is false if auth change happens (e.g. sign out)
            setLoading(false);
        });

        return () => subscription.unsubscribe();
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

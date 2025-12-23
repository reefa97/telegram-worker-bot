import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { User, Session } from '@supabase/supabase-js';

interface AdminUser {
    id: string;
    email: string;
    role: 'super_admin' | 'sub_admin';
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
        const { data } = await supabase
            .from('admin_users')
            .select('*')
            .eq('id', userId)
            .maybeSingle();

        if (data) {
            setAdminUser(data);
        }
    };

    const refreshAdminUser = async () => {
        if (user) {
            await fetchAdminUser(user.id);
        }
    };

    useEffect(() => {
        // Get initial session
        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session);
            setUser(session?.user ?? null);
            if (session?.user) {
                fetchAdminUser(session.user.id);
            }
            setLoading(false);
        });

        // Listen for auth changes
        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange((_event, session) => {
            setSession(session);
            setUser(session?.user ?? null);
            if (session?.user) {
                fetchAdminUser(session.user.id);
            } else {
                setAdminUser(null);
            }
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

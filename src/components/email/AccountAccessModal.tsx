import { useState, useEffect } from 'react';
import { EMAIL_SERVICE_URL } from './config';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { X, User, Check } from 'lucide-react';
import { EmailAccount } from './types';

interface AccountAccessModalProps {
    account: EmailAccount;
    onClose: () => void;
}

interface AdminUser {
    id: string;
    email: string;
    name?: string;
    role: string;
}

export const AccountAccessModal: React.FC<AccountAccessModalProps> = ({ account, onClose }) => {
    const { adminUser } = useAuth();
    const [users, setUsers] = useState<AdminUser[]>([]);
    const [accessList, setAccessList] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const loadData = async () => {
            setLoading(true);
            try {
                // 1. Load users
                const { data: userData } = await supabase
                    .from('admin_users')
                    .select('id, email, name, role')
                    .neq('role', 'super_admin');

                if (userData) setUsers(userData);

                // 2. Load current access
                const res = await fetch(`${EMAIL_SERVICE_URL}/api/mail/accounts/${account.id}/access`, {
                    headers: {
                        'X-User-Id': adminUser?.id || '',
                        'X-User-Role': adminUser?.role || ''
                    }
                });
                if (res.ok) {
                    const data = await res.json();
                    setAccessList(data.map((a: any) => a.user_id));
                }
            } catch (e) {
                console.error('Failed to load access data:', e);
            }
            setLoading(false);
        };
        loadData();
    }, [account.id]);

    const toggleAccess = async (userId: string) => {
        const hasAccess = accessList.includes(userId);
        try {
            if (hasAccess) {
                const res = await fetch(`${EMAIL_SERVICE_URL}/api/mail/accounts/${account.id}/access/${userId}`, {
                    method: 'DELETE',
                    headers: {
                        'X-User-Id': adminUser?.id || '',
                        'X-User-Role': adminUser?.role || ''
                    }
                });
                if (res.ok) {
                    setAccessList(accessList.filter(id => id !== userId));
                }
            } else {
                const res = await fetch(`${EMAIL_SERVICE_URL}/api/mail/accounts/${account.id}/access`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-User-Id': adminUser?.id || '',
                        'X-User-Role': adminUser?.role || ''
                    },
                    body: JSON.stringify({ user_id: userId })
                });
                if (res.ok) {
                    setAccessList([...accessList, userId]);
                }
            }
        } catch (e) {
            console.error('Toggle access failed:', e);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-[60] animate-fadeIn">
            <div className="bg-white dark:bg-zinc-950 rounded-2xl shadow-xl border border-zinc-200 dark:border-zinc-800 max-w-md w-full animate-scaleIn">
                <div className="p-6">
                    <div className="flex justify-between items-center mb-6">
                        <div>
                            <h3 className="text-xl font-bold text-zinc-900 dark:text-white">Доступ к почте</h3>
                            <p className="text-sm text-zinc-500">{account.email_address}</p>
                        </div>
                        <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200">
                            <X className="w-6 h-6" />
                        </button>
                    </div>

                    <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                        {loading ? (
                            <div className="flex justify-center py-8">
                                <div className="w-6 h-6 border-2 border-zinc-300 border-t-zinc-600 rounded-full animate-spin"></div>
                            </div>
                        ) : users.length === 0 ? (
                            <p className="text-center text-zinc-500 py-4">Суб-админы не найдены</p>
                        ) : (
                            users.map(user => {
                                const hasAccess = accessList.includes(user.id);
                                return (
                                    <button
                                        key={user.id}
                                        onClick={() => toggleAccess(user.id)}
                                        className={`w-full flex items-center justify-between p-3 rounded-xl border transition-all ${hasAccess
                                            ? 'bg-primary-50 border-primary-200 dark:bg-primary-900/20 dark:border-primary-800'
                                            : 'bg-zinc-50 border-zinc-100 hover:border-zinc-300 dark:bg-zinc-900 dark:border-zinc-800 dark:hover:border-zinc-700'
                                            }`}
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className={`p-2 rounded-full ${hasAccess ? 'bg-primary-100 text-primary-600 dark:bg-primary-900/40' : 'bg-zinc-200 text-zinc-500 dark:bg-zinc-800'}`}>
                                                <User className="w-4 h-4" />
                                            </div>
                                            <div className="text-left">
                                                <div className="text-sm font-semibold text-zinc-900 dark:text-white">{user.name || 'Без имени'}</div>
                                                <div className="text-xs text-zinc-500">{user.email}</div>
                                            </div>
                                        </div>
                                        {hasAccess ? (
                                            <Check className="w-5 h-5 text-primary-600" />
                                        ) : (
                                            <div className="w-5 h-5 rounded-full border border-zinc-300 dark:border-zinc-700"></div>
                                        )}
                                    </button>
                                );
                            })
                        )}
                    </div>

                    <button
                        onClick={onClose}
                        className="w-full mt-6 btn-primary"
                    >
                        Готово
                    </button>
                </div>
            </div>
        </div>
    );
};

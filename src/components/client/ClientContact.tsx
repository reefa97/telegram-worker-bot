import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { User, Phone, Mail, MapPin, Building2 } from 'lucide-react';

interface GuardianInfo {
    object_id: string;
    object_name: string;
    object_address: string;
    guardian_name: string | null;
    guardian_email: string | null;
    guardian_phone: string | null;
}

export default function ClientContact() {
    const { adminUser } = useAuth();
    const [guardians, setGuardians] = useState<GuardianInfo[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (adminUser?.id) loadGuardians();
    }, [adminUser]);

    const loadGuardians = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase.rpc('get_client_guardians', {
                p_client_id: adminUser!.id
            });
            if (error) throw error;
            if (data) setGuardians(data);
        } catch (err) {
            console.error('Error loading guardians:', err);
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="flex justify-center items-center h-64">
                <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    if (guardians.length === 0) {
        return (
            <div className="card flex flex-col items-center justify-center py-16 text-center">
                <User className="w-16 h-16 text-muted opacity-30 mb-4" />
                <h3 className="text-lg font-medium text-main mb-2">Brak przypisanych obiektów</h3>
                <p className="text-muted max-w-sm">
                    Nie masz jeszcze przypisanych obiektów. Skontaktuj się z administratorem.
                </p>
            </div>
        );
    }

    // Group by object (multiple guardians possible per object)
    const objectMap = new Map<string, { name: string; address: string; guardians: GuardianInfo[] }>();
    for (const g of guardians) {
        if (!objectMap.has(g.object_id)) {
            objectMap.set(g.object_id, { name: g.object_name, address: g.object_address, guardians: [] });
        }
        if (g.guardian_name) {
            objectMap.get(g.object_id)!.guardians.push(g);
        }
    }

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-2xl font-bold text-main">Kontakt z opiekunem</h2>
                <p className="text-sm text-muted mt-1">Dane kontaktowe opiekunów Twoich obiektów</p>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
                {Array.from(objectMap.entries()).map(([objectId, obj]) => (
                    <div key={objectId} className="card p-6">
                        <div className="flex items-center gap-3 mb-5 pb-4 border-b border-border">
                            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                                <Building2 className="w-5 h-5 text-primary" />
                            </div>
                            <div>
                                <h3 className="font-bold text-main">{obj.name}</h3>
                                {obj.address && (
                                    <div className="flex items-center gap-1 text-xs text-muted mt-0.5">
                                        <MapPin className="w-3 h-3" />
                                        {obj.address}
                                    </div>
                                )}
                            </div>
                        </div>

                        {obj.guardians.length > 0 ? (
                            <div className="space-y-4">
                                {obj.guardians.map((g, i) => (
                                    <div key={i} className="flex items-start gap-3">
                                        <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center flex-shrink-0">
                                            <User className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                                        </div>
                                        <div className="space-y-1.5 min-w-0">
                                            <p className="font-semibold text-main">{g.guardian_name}</p>
                                            {g.guardian_email && (
                                                <a href={`mailto:${g.guardian_email}`} className="flex items-center gap-2 text-sm text-muted hover:text-primary transition-colors">
                                                    <Mail className="w-4 h-4 flex-shrink-0" />
                                                    <span className="truncate">{g.guardian_email}</span>
                                                </a>
                                            )}
                                            {g.guardian_phone && (
                                                <a href={`tel:${g.guardian_phone}`} className="flex items-center gap-2 text-sm text-muted hover:text-primary transition-colors">
                                                    <Phone className="w-4 h-4 flex-shrink-0" />
                                                    {g.guardian_phone}
                                                </a>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-sm text-muted italic">Brak przypisanego opiekuna</p>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}

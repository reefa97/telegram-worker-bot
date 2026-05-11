import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { FileText, Download, Building2 } from 'lucide-react';

interface ObjectDocument {
    id: string;
    file_name: string;
    file_path: string;
    file_size: number;
    created_at: string;
    object_name: string;
}

export default function ClientDocuments() {
    const { adminUser } = useAuth();
    const [documents, setDocuments] = useState<ObjectDocument[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (adminUser?.id) loadDocuments();
    }, [adminUser]);

    const loadDocuments = async () => {
        setLoading(true);
        try {
            // Get client's objects
            const { data: clientObjects } = await supabase
                .from('client_objects')
                .select('object_id, cleaning_objects(name)')
                .eq('client_id', adminUser!.id);

            if (!clientObjects || clientObjects.length === 0) {
                setDocuments([]);
                setLoading(false);
                return;
            }

            const objectIds = clientObjects.map((co: any) => co.object_id);
            const objectNames: Record<string, string> = {};
            clientObjects.forEach((co: any) => {
                objectNames[co.object_id] = co.cleaning_objects?.name || 'Obiekt';
            });

            // Get documents for these objects
            const { data: docs } = await supabase
                .from('object_documents')
                .select('id, file_name, file_path, file_size, created_at, object_id')
                .in('object_id', objectIds)
                .order('created_at', { ascending: false });

            if (docs) {
                setDocuments(docs.map((d: any) => ({
                    ...d,
                    object_name: objectNames[d.object_id] || 'Obiekt',
                })));
            }
        } catch (err) {
            console.error('Error loading documents:', err);
        } finally {
            setLoading(false);
        }
    };

    const openDocument = (filePath: string) => {
        const { data } = supabase.storage.from('object-documents').getPublicUrl(filePath);
        window.open(data.publicUrl, '_blank');
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
        );
    }

    if (documents.length === 0) {
        return (
            <div className="text-center py-20">
                <FileText className="w-12 h-12 text-muted mx-auto mb-3" />
                <p className="text-muted">Brak dokumentów</p>
            </div>
        );
    }

    // Group by object
    const grouped: Record<string, ObjectDocument[]> = {};
    documents.forEach(doc => {
        if (!grouped[doc.object_name]) grouped[doc.object_name] = [];
        grouped[doc.object_name].push(doc);
    });

    return (
        <div className="space-y-6">
            {Object.entries(grouped).map(([objectName, docs]) => (
                <div key={objectName} className="bg-card rounded-xl border border-border overflow-hidden">
                    <div className="px-4 py-3 bg-subtle border-b border-border flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-primary" />
                        <h3 className="font-semibold text-main">{objectName}</h3>
                        <span className="text-xs text-muted ml-auto">{docs.length} dok.</span>
                    </div>
                    <div className="divide-y divide-border">
                        {docs.map(doc => (
                            <div key={doc.id} className="flex items-center justify-between px-4 py-3 hover:bg-subtle transition-colors">
                                <div className="flex items-center gap-3 min-w-0">
                                    <FileText className="w-5 h-5 text-blue-500 shrink-0" />
                                    <div className="min-w-0">
                                        <p className="text-sm font-medium text-main truncate">{doc.file_name}</p>
                                        <p className="text-xs text-muted">
                                            {doc.file_size ? `${(doc.file_size / 1024).toFixed(0)} KB` : ''}
                                            {doc.created_at && ` · ${new Date(doc.created_at).toLocaleDateString('pl-PL')}`}
                                        </p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => openDocument(doc.file_path)}
                                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-primary hover:bg-primary/10 rounded-lg transition-colors shrink-0"
                                >
                                    <Download className="w-4 h-4" />
                                    Pobierz
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
}

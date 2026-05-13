import { useState, useEffect } from 'react';
import { Plus, Search, User } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import LeadModal from './LeadModal';

interface Lead {
    id: string;
    title: string;
    status: string; // 'new', 'contacted', 'proposal', 'negotiation', 'won', 'lost'
    value: number;
    description: string;
    contact_info: any;
    assigned_to: string;
    updated_at: string;
}

const COLUMNS = [
    { id: 'new', title: 'Новый', color: 'bg-blue-500' },
    { id: 'contacted', title: 'Связались', color: 'bg-indigo-500' },
    { id: 'proposal', title: 'КП', color: 'bg-purple-500' },
    { id: 'negotiation', title: 'Переговоры', color: 'bg-orange-500' },
    { id: 'won', title: 'Выиграно', color: 'bg-emerald-500' },
    { id: 'lost', title: 'Проиграно', color: 'bg-rose-500' },
];

export default function CrmPipeline() {
    const { adminUser } = useAuth();
    const [leads, setLeads] = useState<Lead[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [isLeadModalOpen, setIsLeadModalOpen] = useState(false);
    const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
    const [draggedLead, setDraggedLead] = useState<Lead | null>(null);

    useEffect(() => {
        loadLeads();
    }, [adminUser]);

    const loadLeads = async () => {
        try {
            const { data, error } = await supabase
                .from('crm_leads')
                .select('*')
                .order('updated_at', { ascending: false });

            if (error) throw error;
            if (data) setLeads(data);
        } catch (error) {
            console.error('Error loading leads:', error);
        }
    };

    const handleDragStart = (e: React.DragEvent, lead: Lead) => {
        setDraggedLead(lead);
        e.dataTransfer.effectAllowed = 'move';
        // Hide ghost image a bit or style it? Native behavior is usually fine.
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    };

    const handleDrop = async (e: React.DragEvent, status: string) => {
        e.preventDefault();
        if (!draggedLead || draggedLead.status === status) return;

        // Optimistic update
        const updatedLeads = leads.map(l =>
            l.id === draggedLead.id ? { ...l, status } : l
        );
        setLeads(updatedLeads);
        setDraggedLead(null);

        try {
            const { error } = await supabase
                .from('crm_leads')
                .update({ status })
                .eq('id', draggedLead.id);

            if (error) throw error;
        } catch (error) {
            console.error('Error updating lead status:', error);
            // Revert on error
            loadLeads();
        }
    };

    const filteredLeads = leads.filter(lead =>
        lead.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        lead.contact_info?.name?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const getColumnLeads = (status: string) => filteredLeads.filter(l => l.status === status);

    const totalValue = filteredLeads.reduce((sum, l) => sum + (l.status !== 'lost' ? l.value : 0), 0);
    const wonValue = filteredLeads.filter(l => l.status === 'won').reduce((sum, l) => sum + l.value, 0);

    return (
        <div className="h-[600px] flex flex-col space-y-4">
            {/* Header / Stats */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-card p-4 rounded-xl border border-border shadow-sm">
                <div>
                    <h2 className="text-xl font-bold text-main">Воронка продаж</h2>
                    <div className="flex gap-4 mt-1 text-sm text-muted">
                        <span>Всего сделок: <b className="text-main">{filteredLeads.length}</b></span>
                        <span>Потенциал: <b className="text-main">{totalValue.toLocaleString()} zł</b></span>
                        <span>Выиграно: <b className="text-emerald-500">{wonValue.toLocaleString()} zł</b></span>
                    </div>
                </div>
                <div className="flex items-center gap-3 w-full md:w-auto">
                    <div className="relative flex-1 md:w-64">
                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                        <input
                            type="text"
                            placeholder="Поиск..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="input w-full pl-9 py-1.5 text-sm"
                        />
                    </div>
                    <button
                        onClick={() => { setSelectedLead(null); setIsLeadModalOpen(true); }}
                        className="btn-primary py-1.5 px-3 flex items-center gap-2 text-sm whitespace-nowrap"
                    >
                        <Plus size={16} /> Новая сделка
                    </button>
                </div>
            </div>

            {/* Kanban Board */}
            <div className="flex-1 overflow-x-auto overflow-y-hidden">
                <div className="flex h-full gap-4 min-w-[1200px] mb-2">
                    {COLUMNS.map(column => {
                        const columnLeads = getColumnLeads(column.id);
                        const columnTotal = columnLeads.reduce((sum, l) => sum + l.value, 0);

                        return (
                            <div
                                key={column.id}
                                className="flex-1 flex flex-col min-w-[200px] h-full"
                                onDragOver={handleDragOver}
                                onDrop={(e) => handleDrop(e, column.id)}
                            >
                                {/* Column Header */}
                                <div className={`p-3 rounded-t-lg border-b-2 ${column.color.replace('bg-', 'border-')} bg-subtle/50 flex justify-between items-center`}>
                                    <div>
                                        <h3 className="font-bold text-sm text-main uppercase tracking-wide">{column.title}</h3>
                                        <span className="text-xs text-muted font-medium">{columnLeads.length} • {columnTotal.toLocaleString()} zł</span>
                                    </div>
                                </div>

                                {/* Drop Area */}
                                <div className="flex-1 bg-subtle/30 rounded-b-lg p-2 overflow-y-auto space-y-2 border border-t-0 border-border">
                                    {columnLeads.map(lead => (
                                        <div
                                            key={lead.id}
                                            draggable
                                            onDragStart={(e) => handleDragStart(e, lead)}
                                            onClick={() => { setSelectedLead(lead); setIsLeadModalOpen(true); }}
                                            className={`
                                                bg-card p-3 rounded-lg border border-border shadow-sm cursor-grab active:cursor-grabbing hover:shadow-md transition-all
                                                ${draggedLead?.id === lead.id ? 'opacity-50' : 'opacity-100'}
                                            `}
                                        >
                                            <div className="mb-2">
                                                <h4 className="font-bold text-main text-sm line-clamp-2">{lead.title}</h4>
                                                {lead.contact_info?.name && (
                                                    <div className="flex items-center gap-1.5 text-xs text-muted mt-1">
                                                        <User size={12} /> {lead.contact_info.name}
                                                    </div>
                                                )}
                                            </div>

                                            <div className="flex justify-between items-end mt-2 pt-2 border-t border-gray-100 dark:border-gray-700/50">
                                                <span className="font-bold text-sm text-primary">{lead.value > 0 ? `${lead.value.toLocaleString()} zł` : '-'}</span>
                                                <div className="text-[10px] text-muted-foreground bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded">
                                                    {new Date(lead.updated_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                    {columnLeads.length === 0 && (
                                        <div className="h-24 flex items-center justify-center text-xs text-muted/50 italic border-2 border-dashed border-border/50 rounded-lg">
                                            Пусто
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            <LeadModal
                isOpen={isLeadModalOpen}
                onClose={() => setIsLeadModalOpen(false)}
                onSave={loadLeads}
                leadToEdit={selectedLead}
            />
        </div>
    );
}

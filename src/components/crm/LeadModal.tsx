import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Save, User as UserIcon, Phone, Mail, FileText, DollarSign, Briefcase } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

interface ContactInfo {
    name: string;
    email: string;
    phone: string;
    role: string;
}

interface Lead {
    id?: string;
    title: string;
    status: string;
    value: number;
    description: string;
    contact_info: ContactInfo;
}

interface LeadModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: () => void;
    leadToEdit?: Lead | null;
}

export default function LeadModal({ isOpen, onClose, onSave, leadToEdit }: LeadModalProps) {
    const { adminUser } = useAuth();
    const [loading, setLoading] = useState(false);

    const [formData, setFormData] = useState<Lead>({
        title: '',
        status: 'new',
        value: 0,
        description: '',
        contact_info: {
            name: '',
            email: '',
            phone: '',
            role: ''
        }
    });

    useEffect(() => {
        if (leadToEdit) {
            setFormData(leadToEdit);
        } else {
            // Reset form for new lead
            setFormData({
                title: '',
                status: 'new',
                value: 0,
                description: '',
                contact_info: {
                    name: '',
                    email: '',
                    phone: '',
                    role: ''
                }
            });
        }
    }, [leadToEdit, isOpen]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            const dataToSave = {
                title: formData.title,
                status: formData.status,
                value: formData.value,
                description: formData.description,
                contact_info: formData.contact_info,
                assigned_to: adminUser?.id, // Default to current user
                created_by: leadToEdit ? undefined : adminUser?.id // Set creator only on insert
            };

            if (leadToEdit?.id) {
                const { error } = await supabase
                    .from('crm_leads')
                    .update(dataToSave)
                    .eq('id', leadToEdit.id);
                if (error) throw error;
            } else {
                const { error } = await supabase
                    .from('crm_leads')
                    .insert(dataToSave);
                if (error) throw error;
            }

            onSave();
            onClose();
        } catch (error) {
            console.error('Error saving lead:', error);
            alert('Ошибка при сохранении лида');
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fadeIn">
            <div className="bg-card w-full max-w-2xl rounded-xl shadow-xl border border-border overflow-hidden animate-scaleIn flex flex-col max-h-[90vh]">

                {/* Header */}
                <div className="p-4 border-b border-border flex justify-between items-center bg-subtle shrink-0">
                    <h3 className="font-bold text-lg text-main flex items-center gap-2">
                        {leadToEdit ? <Briefcase size={20} className="text-primary" /> : <Briefcase size={20} className="text-primary" />}
                        {leadToEdit ? 'Редактировать сделку' : 'Новая сделка'}
                    </h3>
                    <button onClick={onClose} className="text-muted hover:text-main transition-colors">
                        <X size={20} />
                    </button>
                </div>

                {/* Body */}
                <div className="overflow-y-auto p-6">
                    <form id="lead-form" onSubmit={handleSubmit} className="space-y-6">

                        {/* Main Info */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="col-span-2">
                                <label className="block text-xs font-bold text-muted uppercase tracking-wider mb-1.5">Название сделки / Клиент</label>
                                <input
                                    type="text" required
                                    value={formData.title}
                                    onChange={e => setFormData({ ...formData, title: e.target.value })}
                                    className="input w-full text-lg font-medium"
                                    placeholder="Напр: Закупка оборудования для офиса"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-muted uppercase tracking-wider mb-1.5">Статус</label>
                                <select
                                    value={formData.status}
                                    onChange={e => setFormData({ ...formData, status: e.target.value })}
                                    className="input w-full"
                                >
                                    <option value="new">🆕 Новый</option>
                                    <option value="contacted">📞 Связались</option>
                                    <option value="proposal">📄 КП отправлено</option>
                                    <option value="negotiation">🤝 Переговоры</option>
                                    <option value="won">✅ Выиграно</option>
                                    <option value="lost">❌ Проиграно</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-muted uppercase tracking-wider mb-1.5">Сумма (PLN)</label>
                                <div className="relative">
                                    <DollarSign size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                                    <input
                                        type="number" min="0"
                                        value={formData.value}
                                        onChange={e => setFormData({ ...formData, value: Number(e.target.value) })}
                                        className="input w-full pl-9 font-bold"
                                        placeholder="0.00"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Contact Info Section */}
                        <div className="bg-subtle/30 rounded-lg p-4 border border-border">
                            <h4 className="text-sm font-bold text-main mb-3 flex items-center gap-2">
                                <UserIcon size={16} /> Контактное лицо
                            </h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="text-xs text-muted mb-1 block">Имя</label>
                                    <input
                                        type="text"
                                        value={formData.contact_info.name}
                                        onChange={e => setFormData({ ...formData, contact_info: { ...formData.contact_info, name: e.target.value } })}
                                        className="input w-full text-sm"
                                        placeholder="Иван Иванов"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs text-muted mb-1 block">Должность</label>
                                    <input
                                        type="text"
                                        value={formData.contact_info.role}
                                        onChange={e => setFormData({ ...formData, contact_info: { ...formData.contact_info, role: e.target.value } })}
                                        className="input w-full text-sm"
                                        placeholder="Менеджер"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs text-muted mb-1 block">Email</label>
                                    <div className="relative">
                                        <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                                        <input
                                            type="email"
                                            value={formData.contact_info.email}
                                            onChange={e => setFormData({ ...formData, contact_info: { ...formData.contact_info, email: e.target.value } })}
                                            className="input w-full pl-8 text-sm"
                                            placeholder="email@example.com"
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="text-xs text-muted mb-1 block">Телефон</label>
                                    <div className="relative">
                                        <Phone size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                                        <input
                                            type="tel"
                                            value={formData.contact_info.phone}
                                            onChange={e => setFormData({ ...formData, contact_info: { ...formData.contact_info, phone: e.target.value } })}
                                            className="input w-full pl-8 text-sm"
                                            placeholder="+48 123 456 789"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Description */}
                        <div>
                            <label className="block text-xs font-bold text-muted uppercase tracking-wider mb-1.5 flex items-center gap-2">
                                <FileText size={14} /> Заметки / Описание
                            </label>
                            <textarea
                                value={formData.description}
                                onChange={e => setFormData({ ...formData, description: e.target.value })}
                                className="input w-full min-h-[100px]"
                                placeholder="Дополнительная информация о сделке, основные требования..."
                            />
                        </div>

                    </form>
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-border bg-subtle shrink-0 flex justify-end gap-3 transparent">
                    <button type="button" onClick={onClose} className="btn-secondary">Отмена</button>
                    <button type="submit" form="lead-form" disabled={loading} className="btn-primary flex items-center gap-2">
                        <Save size={16} />
                        {loading ? 'Сохранение...' : 'Сохранить'}
                    </button>
                </div>
            </div>
        </div>
    , document.body);
}

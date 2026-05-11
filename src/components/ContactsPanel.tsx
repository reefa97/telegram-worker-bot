import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import {
    Plus, Trash2, X, Phone, Mail, Building2, Save, Loader2, Edit2, StickyNote
} from 'lucide-react';

interface Contact {
    id: string;
    name: string;
    phone: string | null;
    email: string | null;
    company: string | null;
    category: string | null;
    notes: string | null;
    created_at: string;
}

const DEFAULT_CATEGORIES = [
    'Уборка снега',
    'Полимерные полы',
    'Электрика',
    'Сантехника',
    'Клининг',
    'Транспорт',
    'Стройматериалы',
    'Другое',
];

export default function ContactsPanel({ searchTerm = '' }: { searchTerm?: string }) {
    const { adminUser } = useAuth();
    const [contacts, setContacts] = useState<Contact[]>([]);
    const [loading, setLoading] = useState(true);
    // searchTerm comes from prop
    const [categoryFilter, setCategoryFilter] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [editingContact, setEditingContact] = useState<Contact | null>(null);
    const [saving, setSaving] = useState(false);
    const [formData, setFormData] = useState({
        name: '',
        phone: '',
        email: '',
        company: '',
        category: '',
        customCategory: '',
        notes: '',
    });

    const isSuperAdmin = adminUser?.role === 'super_admin';

    useEffect(() => {
        loadContacts();
    }, []);

    const loadContacts = async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from('contacts')
            .select('*')
            .order('name');

        if (error) {
            console.error('Error loading contacts:', error);
        } else {
            setContacts(data || []);
        }
        setLoading(false);
    };

    const openCreateModal = () => {
        setEditingContact(null);
        setFormData({ name: '', phone: '', email: '', company: '', category: '', customCategory: '', notes: '' });
        setShowModal(true);
    };

    const openEditModal = (contact: Contact) => {
        setEditingContact(contact);
        const isCustom = contact.category && !DEFAULT_CATEGORIES.includes(contact.category);
        setFormData({
            name: contact.name,
            phone: contact.phone || '',
            email: contact.email || '',
            company: contact.company || '',
            category: isCustom ? 'Другое' : (contact.category || ''),
            customCategory: isCustom ? contact.category! : '',
            notes: contact.notes || '',
        });
        setShowModal(true);
    };

    const handleSave = async () => {
        if (!formData.name.trim()) return;
        setSaving(true);

        const category = formData.category === 'Другое' && formData.customCategory.trim()
            ? formData.customCategory.trim()
            : formData.category || null;

        const payload = {
            name: formData.name.trim(),
            phone: formData.phone.trim() || null,
            email: formData.email.trim() || null,
            company: formData.company.trim() || null,
            category,
            notes: formData.notes.trim() || null,
        };

        if (editingContact) {
            const { error } = await supabase
                .from('contacts')
                .update(payload)
                .eq('id', editingContact.id);
            if (error) console.error('Error updating contact:', error);
        } else {
            const { error } = await supabase
                .from('contacts')
                .insert({ ...payload, created_by: adminUser?.id });
            if (error) console.error('Error creating contact:', error);
        }

        setSaving(false);
        setShowModal(false);
        loadContacts();
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Удалить контакт?')) return;
        const { error } = await supabase.from('contacts').delete().eq('id', id);
        if (error) console.error('Error deleting contact:', error);
        else setContacts(prev => prev.filter(c => c.id !== id));
    };

    // Get unique categories from contacts
    const usedCategories = Array.from(new Set(contacts.map(c => c.category).filter(Boolean))) as string[];

    const filtered = contacts.filter(c => {
        const matchesSearch = !searchTerm ||
            c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            c.company?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            c.phone?.includes(searchTerm) ||
            c.notes?.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesCategory = !categoryFilter || c.category === categoryFilter;
        return matchesSearch && matchesCategory;
    });

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-main">Контакты</h2>
                <button onClick={openCreateModal} className="btn-primary flex items-center gap-2">
                    <Plus size={16} />
                    Добавить
                </button>
            </div>

            {/* Category Filter */}
            {usedCategories.length > 0 && (
                <div>
                    <select
                        value={categoryFilter}
                        onChange={e => setCategoryFilter(e.target.value)}
                        className="input w-full sm:w-48"
                    >
                        <option value="">Все категории</option>
                        {usedCategories.map(cat => (
                            <option key={cat} value={cat}>{cat}</option>
                        ))}
                    </select>
                </div>
            )}

            {/* Contacts List */}
            {loading ? (
                <div className="flex justify-center py-12">
                    <Loader2 className="animate-spin text-muted" size={24} />
                </div>
            ) : filtered.length === 0 ? (
                <div className="text-center py-12 text-muted">
                    {contacts.length === 0 ? 'Нет контактов' : 'Ничего не найдено'}
                </div>
            ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {filtered.map(contact => (
                        <div
                            key={contact.id}
                            className="bg-card border border-border rounded-lg p-4 hover:border-blue-500/30 transition-colors group"
                        >
                            <div className="flex items-start justify-between mb-2">
                                <div className="flex-1 min-w-0">
                                    <h3 className="font-medium text-main truncate">{contact.name}</h3>
                                    {contact.company && (
                                        <p className="text-xs text-muted flex items-center gap-1 mt-0.5">
                                            <Building2 size={12} />
                                            {contact.company}
                                        </p>
                                    )}
                                </div>
                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button
                                        onClick={() => openEditModal(contact)}
                                        className="p-1.5 hover:bg-subtle rounded text-muted hover:text-main"
                                        title="Редактировать"
                                    >
                                        <Edit2 size={14} />
                                    </button>
                                    {isSuperAdmin && (
                                        <button
                                            onClick={() => handleDelete(contact.id)}
                                            className="p-1.5 hover:bg-red-500/10 rounded text-muted hover:text-danger"
                                            title="Удалить"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    )}
                                </div>
                            </div>

                            {contact.category && (
                                <span className="inline-block text-[11px] font-medium bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded-full mb-2">
                                    {contact.category}
                                </span>
                            )}

                            <div className="space-y-1 text-sm">
                                {contact.phone && (
                                    <a href={`tel:${contact.phone.replace(/[^0-9+]/g, '')}`} className="flex items-center gap-2 text-muted hover:text-main transition-colors">
                                        <Phone size={13} />
                                        <span>{contact.phone}</span>
                                    </a>
                                )}
                                {contact.email && (
                                    <a href={`mailto:${contact.email}`} className="flex items-center gap-2 text-muted hover:text-main transition-colors">
                                        <Mail size={13} />
                                        <span className="truncate">{contact.email}</span>
                                    </a>
                                )}
                                {contact.notes && (
                                    <p className="flex items-start gap-2 text-muted text-xs mt-2">
                                        <StickyNote size={13} className="shrink-0 mt-0.5" />
                                        <span className="line-clamp-2">{contact.notes}</span>
                                    </p>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Create/Edit Modal */}
            {showModal && createPortal(
                <div className="fixed inset-0 z-[9999] bg-black/50 flex items-center justify-center p-4" onClick={() => setShowModal(false)}>
                    <div className="bg-card border border-border rounded-lg w-full max-w-md shadow-xl" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between p-4 border-b border-border">
                            <h3 className="font-semibold text-main">
                                {editingContact ? 'Редактировать контакт' : 'Новый контакт'}
                            </h3>
                            <button onClick={() => setShowModal(false)} className="p-1 hover:bg-subtle rounded text-muted">
                                <X size={18} />
                            </button>
                        </div>
                        <div className="p-4 space-y-3">
                            <div>
                                <label className="text-xs font-medium text-muted mb-1 block">Имя *</label>
                                <input
                                    type="text"
                                    value={formData.name}
                                    onChange={e => setFormData(f => ({ ...f, name: e.target.value }))}
                                    className="input w-full"
                                    placeholder="Иван Петров"
                                />
                            </div>
                            <div>
                                <label className="text-xs font-medium text-muted mb-1 block">Телефон</label>
                                <input
                                    type="tel"
                                    value={formData.phone}
                                    onChange={e => setFormData(f => ({ ...f, phone: e.target.value }))}
                                    className="input w-full"
                                    placeholder="+48 123 456 789"
                                />
                            </div>
                            <div>
                                <label className="text-xs font-medium text-muted mb-1 block">Email</label>
                                <input
                                    type="email"
                                    value={formData.email}
                                    onChange={e => setFormData(f => ({ ...f, email: e.target.value }))}
                                    className="input w-full"
                                    placeholder="email@example.com"
                                />
                            </div>
                            <div>
                                <label className="text-xs font-medium text-muted mb-1 block">Компания</label>
                                <input
                                    type="text"
                                    value={formData.company}
                                    onChange={e => setFormData(f => ({ ...f, company: e.target.value }))}
                                    className="input w-full"
                                    placeholder="ООО Пример"
                                />
                            </div>
                            <div>
                                <label className="text-xs font-medium text-muted mb-1 block">Категория</label>
                                <select
                                    value={formData.category}
                                    onChange={e => setFormData(f => ({ ...f, category: e.target.value }))}
                                    className="input w-full"
                                >
                                    <option value="">Без категории</option>
                                    {DEFAULT_CATEGORIES.map(cat => (
                                        <option key={cat} value={cat}>{cat}</option>
                                    ))}
                                </select>
                                {formData.category === 'Другое' && (
                                    <input
                                        type="text"
                                        value={formData.customCategory}
                                        onChange={e => setFormData(f => ({ ...f, customCategory: e.target.value }))}
                                        className="input w-full mt-2"
                                        placeholder="Своя категория..."
                                    />
                                )}
                            </div>
                            <div>
                                <label className="text-xs font-medium text-muted mb-1 block">Заметки</label>
                                <textarea
                                    value={formData.notes}
                                    onChange={e => setFormData(f => ({ ...f, notes: e.target.value }))}
                                    className="input w-full"
                                    rows={3}
                                    placeholder="Дополнительная информация..."
                                />
                            </div>
                        </div>
                        <div className="flex justify-end gap-2 p-4 border-t border-border">
                            <button onClick={() => setShowModal(false)} className="btn-secondary">
                                Отмена
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={!formData.name.trim() || saving}
                                className="btn-primary flex items-center gap-2"
                            >
                                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                                {editingContact ? 'Сохранить' : 'Создать'}
                            </button>
                        </div>
                    </div>
                </div>
            , document.body)}
        </div>
    );
}

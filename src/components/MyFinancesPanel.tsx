import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import {
    Wallet, Receipt, Plus, Trash2, Clock,
    Coins, Briefcase, TrendingDown,
    Camera, CheckCircle2, FileText,
    Building2, X, ChevronLeft, ChevronRight, Calendar,
    Minus
} from 'lucide-react';

interface ManagedObject {
    id: string;
    name: string;
    address: string;
    monthly_rate: number;
}

interface Expense {
    id: string;
    title: string;
    amount: number;
    expense_date: string;
    description: string;
    is_reimbursement: boolean;
    receipt_url?: string;
}

interface ExtraHours {
    id: string;
    hours: number;
    rate: number;
    work_date: string;
    description: string;
    object_id?: string;
    object_name?: string;
}

interface ExtraIncome {
    id: string;
    title: string;
    amount: number;
    income_date: string;
}

interface AdminUser {
    id: string;
    name: string;
    email: string;
}

interface CreditTransaction {
    id: string;
    amount: number;
    transaction_date: string;
    description: string;
    created_at: string;
}

export default function MyFinancesPanel() {
    const { adminUser } = useAuth();
    const [selectedAdminId, setSelectedAdminId] = useState(adminUser?.id || '');
    const [adminsList, setAdminsList] = useState<AdminUser[]>([]);

    const [objects, setObjects] = useState<ManagedObject[]>([]);
    const [expenses, setExpenses] = useState<Expense[]>([]);
    const [extraHours, setExtraHours] = useState<ExtraHours[]>([]);
    const [extraIncomes, setExtraIncomes] = useState<ExtraIncome[]>([]);

    // Credit System State
    const [creditTransactions, setCreditTransactions] = useState<CreditTransaction[]>([]);
    const [openingBalance, setOpeningBalance] = useState(0);
    const [showAddCreditModal, setShowAddCreditModal] = useState(false);
    const [showDeductCreditModal, setShowDeductCreditModal] = useState(false);
    const [creditForm, setCreditForm] = useState({
        amount: 0,
        transaction_date: new Date().toISOString().split('T')[0],
        description: ''
    });

    const [loading, setLoading] = useState(true);
    const [showExpenseModal, setShowExpenseModal] = useState(false);
    const [showHoursModal, setShowHoursModal] = useState(false);
    const [showIncomeModal, setShowIncomeModal] = useState(false);
    const [deleteConfirm, setDeleteConfirm] = useState<{ id: string, type: 'expense' | 'income' | 'hours', title: string } | null>(null);

    // Form states
    const [expenseForm, setExpenseForm] = useState({
        title: '',
        amount: 0,
        expense_date: new Date().toISOString().split('T')[0],
        description: '',
        is_reimbursement: false
    });
    const [receiptFile, setReceiptFile] = useState<File | null>(null);
    const [uploadingReceipt, setUploadingReceipt] = useState(false);

    const [hoursForm, setHoursForm] = useState({
        object_id: '',
        hours: 0,
        rate: 0,
        work_date: new Date().toISOString().split('T')[0],
        description: ''
    });

    const [incomeForm, setIncomeForm] = useState({
        title: '',
        amount: 0,
        income_date: new Date().toISOString().split('T')[0]
    });

    const [currentDate, setCurrentDate] = useState(new Date());

    useEffect(() => {
        if (adminUser?.id && !selectedAdminId) {
            setSelectedAdminId(adminUser.id);
        }
    }, [adminUser, selectedAdminId]);

    useEffect(() => {
        if (adminUser?.role === 'super_admin') {
            loadAdmins();
        }
    }, [adminUser]);

    useEffect(() => {
        if (selectedAdminId) {
            loadAllData(selectedAdminId);
        } else if (adminUser === null) {
            setLoading(false);
        }
    }, [selectedAdminId, adminUser, currentDate]);

    const getMonthRange = (date: Date) => {
        const start = new Date(date.getFullYear(), date.getMonth(), 1);
        const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);
        return {
            startStr: start.toISOString().split('T')[0],
            endStr: end.toISOString().split('T')[0]
        };
    };

    const loadAdmins = async () => {
        const { data } = await supabase.from('admin_users').select('id, email, name').order('email');
        if (data) setAdminsList(data.map((u: any) => ({ id: u.id, email: u.email, name: u.name || u.email })));
    };

    const loadAllData = async (adminId: string) => {
        setLoading(true);
        try {
            await Promise.all([
                loadObjects(adminId),
                loadExpenses(adminId),
                loadExtraHours(adminId),
                loadExtraIncome(adminId),
                loadCreditData(adminId)
            ]);
        } catch (e) {
            console.error('Error loading data:', e);
        } finally {
            setLoading(false);
        }
    };

    const loadObjects = async (adminId: string) => {
        const { data: objectsData } = await supabase.from('cleaning_objects').select('*');
        const { data: ratesData } = await supabase.from('admin_object_rates').select('object_id, monthly_rate').eq('admin_id', adminId);

        if (objectsData && ratesData) {
            const assignedObjects = ratesData.map((rate: any) => {
                const obj = objectsData.find((o: any) => o.id === rate.object_id);
                return obj ? { ...obj, monthly_rate: rate.monthly_rate } : null;
            }).filter(Boolean) as ManagedObject[];
            setObjects(assignedObjects);
        }
    };

    const loadExpenses = async (adminId: string) => {
        const { startStr, endStr } = getMonthRange(currentDate);
        const { data } = await supabase.from('admin_expenses')
            .select('*')
            .eq('admin_id', adminId)
            .gte('expense_date', startStr)
            .lte('expense_date', endStr)
            .order('expense_date', { ascending: false });
        if (data) setExpenses(data);
    };

    const loadExtraIncome = async (adminId: string) => {
        const { startStr, endStr } = getMonthRange(currentDate);
        const { data } = await supabase.from('admin_extra_income')
            .select('*')
            .eq('admin_id', adminId)
            .gte('income_date', startStr)
            .lte('income_date', endStr)
            .order('income_date', { ascending: false });
        if (data) setExtraIncomes(data);
    };

    const loadExtraHours = async (adminId: string) => {
        const { startStr, endStr } = getMonthRange(currentDate);
        const { data } = await supabase.from('admin_extra_hours')
            .select('*, cleaning_objects(name)')
            .eq('admin_id', adminId)
            .gte('work_date', startStr)
            .lte('work_date', endStr)
            .order('work_date', { ascending: false });
        if (data) setExtraHours(data.map((h: any) => ({ ...h, object_name: h.cleaning_objects?.name })));
    };

    const loadCreditData = async (adminId: string) => {
        const { startStr, endStr } = getMonthRange(currentDate);

        // 1. Get Opening Balance (All transactions + All firm expenses BEFORE start of this month)

        // Sum of all PREVIOUS credit transactions


        // Actually, simpler logic: Fetch ALL expenses and ALL credits up to End of Month. Filter locally.
        // Optimization: Fetch previous balance? For now, fetch ALL relevant history is safer but heavier.
        // Let's implement optimized approach:

        // Fetch all credits EVER (Assuming not thousands)
        const { data: allCredits } = await supabase.from('admin_corporate_credits')
            .select('*')
            .eq('admin_id', adminId)
            .lte('transaction_date', endStr);

        // Fetch all firm expenses EVER (to calculate historical spent)
        // Optimization: This might be heavy. Ideally we need a 'balance_snapshots' table.
        // For MVP: Fetch all history. Expenses table isn't that distinct from 'firm credits'.
        const { data: allFirmExpenses } = await supabase.from('admin_expenses')
            .select('amount, expense_date')
            .eq('admin_id', adminId)
            .eq('is_reimbursement', false)
            .lte('expense_date', endStr);

        if (allCredits && allFirmExpenses) {
            const startStrDate = new Date(startStr);

            // Calculate Opening Balance
            const pastCreditSum = allCredits
                .filter((c: any) => new Date(c.transaction_date) < startStrDate)
                .reduce((sum: number, c: any) => sum + Number(c.amount), 0);

            const pastSpentSum = allFirmExpenses
                .filter((e: any) => new Date(e.expense_date) < startStrDate)
                .reduce((sum: number, e: any) => sum + Number(e.amount), 0);

            setOpeningBalance(pastCreditSum - pastSpentSum);

            // Current Month Transactions
            const currentMonthCredits = allCredits.filter((c: any) => {
                const d = new Date(c.transaction_date);
                return d >= startStrDate && d <= new Date(endStr);
            });
            setCreditTransactions(currentMonthCredits);
        }
    };

    const handleTransaction = async (isDeduct: boolean) => {
        const amount = isDeduct ? -Math.abs(creditForm.amount) : Math.abs(creditForm.amount);

        const { error } = await supabase.from('admin_corporate_credits').insert({
            admin_id: selectedAdminId,
            amount: amount,
            transaction_date: creditForm.transaction_date,
            description: creditForm.description,
            created_by: adminUser?.id
        });

        if (!error) {
            setShowAddCreditModal(false);
            setShowDeductCreditModal(false);
            setCreditForm({ amount: 0, transaction_date: new Date().toISOString().split('T')[0], description: '' });
            loadCreditData(selectedAdminId);
        } else {
            alert('Ошибка при сохранении транзакции');
        }
    };

    const handleAddExpense = async (e: React.FormEvent) => {
        e.preventDefault();
        setUploadingReceipt(true);
        try {
            let receipt_url = '';
            if (receiptFile) {
                const fileExt = receiptFile.name.split('.').pop();
                const fileName = `${selectedAdminId}/${Math.random()}.${fileExt}`;

                // Direct REST upload to bypass SES/lockdown.js issues with supabase-js
                const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
                const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

                // Get auth token from localStorage
                const projectRef = new URL(supabaseUrl).hostname.split('.')[0];
                const storageKey = `sb-${projectRef}-auth-token`;
                const raw = localStorage.getItem(storageKey);
                const token = raw ? JSON.parse(raw)?.access_token : null;

                const uploadRes = await window.fetch(
                    `${supabaseUrl}/storage/v1/object/receipts/${fileName}`,
                    {
                        method: 'POST',
                        headers: {
                            'apikey': supabaseKey,
                            'Authorization': `Bearer ${token || supabaseKey}`,
                        },
                        body: receiptFile,
                    }
                );

                if (!uploadRes.ok) {
                    const errData = await uploadRes.text();
                    throw new Error(`Upload failed: ${errData}`);
                }

                receipt_url = `${supabaseUrl}/storage/v1/object/public/receipts/${fileName}`;
            }
            const { error } = await supabase.from('admin_expenses').insert({ ...expenseForm, receipt_url, admin_id: selectedAdminId });
            if (!error) {
                setShowExpenseModal(false);
                setExpenseForm({ title: '', amount: 0, expense_date: new Date().toISOString().split('T')[0], description: '', is_reimbursement: false });
                setReceiptFile(null);
                loadExpenses(selectedAdminId);
                loadCreditData(selectedAdminId); // Update credit spent too
            }
        } catch (error) {
            console.error('Error adding expense:', error);
            alert('Ошибка при сохранении расхода');
        } finally {
            setUploadingReceipt(false);
        }
    };

    const handleAddIncome = async (e: React.FormEvent) => {
        e.preventDefault();
        const { error } = await supabase.from('admin_extra_income').insert({ ...incomeForm, admin_id: selectedAdminId, created_by: adminUser?.id });
        if (!error) {
            setShowIncomeModal(false);
            setIncomeForm({ title: '', amount: 0, income_date: new Date().toISOString().split('T')[0] });
            loadExtraIncome(selectedAdminId);
        }
    };

    const handleAddHours = async (e: React.FormEvent) => {
        e.preventDefault();
        const { error } = await supabase.from('admin_extra_hours').insert({ ...hoursForm, admin_id: selectedAdminId });
        if (!error) {
            setShowHoursModal(false);
            setHoursForm({ object_id: '', hours: 0, rate: 0, work_date: new Date().toISOString().split('T')[0], description: '' });
            loadExtraHours(selectedAdminId);
        }
    };

    const handleDeleteExpense = (id: string) => {
        setDeleteConfirm({ id, type: 'expense', title: 'Удалить расход?' });
    };

    const handleDeleteIncome = (id: string) => {
        setDeleteConfirm({ id, type: 'income', title: 'Удалить доход?' });
    };

    const handleDeleteHours = (id: string) => {
        setDeleteConfirm({ id, type: 'hours', title: 'Удалить запись о часах?' });
    };

    const executeDelete = async () => {
        if (!deleteConfirm) return;
        const { id, type } = deleteConfirm;

        setDeleteConfirm(null); // Close modal immediately for snappy UI

        switch (type) {
            case 'expense':
                await supabase.from('admin_expenses').delete().eq('id', id);
                loadExpenses(selectedAdminId);
                loadCreditData(selectedAdminId);
                break;
            case 'income':
                await supabase.from('admin_extra_income').delete().eq('id', id);
                loadExtraIncome(selectedAdminId);
                break;
            case 'hours':
                await supabase.from('admin_extra_hours').delete().eq('id', id);
                loadExtraHours(selectedAdminId);
                break;
        }
    };

    // Calculations
    const totalObjectSalary = objects.reduce((sum, obj) => sum + obj.monthly_rate, 0);
    const totalExtraIncome = extraIncomes.reduce((sum, inc) => sum + Number(inc.amount), 0);
    const totalExtraHoursPay = extraHours.reduce((sum, h) => sum + (h.hours * h.rate), 0);
    const totalExpenses = expenses.reduce((sum, exp) => sum + Number(exp.amount), 0);
    const reimbursements = expenses.filter(exp => exp.is_reimbursement).reduce((sum, exp) => sum + Number(exp.amount), 0);

    // Credit Logic
    const currentAdded = creditTransactions.filter(t => t.amount > 0).reduce((sum, t) => sum + Number(t.amount), 0);
    const currentDeducted = creditTransactions.filter(t => t.amount < 0).reduce((sum, t) => sum + Math.abs(Number(t.amount)), 0);
    const spentFromFirm = expenses.filter(exp => !exp.is_reimbursement).reduce((sum, exp) => sum + Number(exp.amount), 0);
    const availableCredit = openingBalance + currentAdded - currentDeducted - spentFromFirm;

    const netPayout = totalObjectSalary + totalExtraIncome + totalExtraHoursPay + reimbursements;

    if (loading && !objects.length) return <div className="flex justify-center items-center h-64"><div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin"></div></div>;

    return (
        <div className="space-y-6 pb-20 md:pb-0">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Мои финансы</h2>
                    <p className="text-muted text-sm mt-1">Финансовая статистика и управление</p>
                </div>
                <div className="flex items-center gap-4 w-full md:w-auto">
                    <div className="flex items-center bg-white dark:bg-gray-800 rounded-lg p-1 border border-border shadow-sm flex-1 md:flex-none justify-between md:justify-start">
                        <button onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1))} className="p-1.5 hover:bg-subtle rounded-md text-muted hover:text-main">
                            <ChevronLeft size={20} />
                        </button>
                        <div className="px-4 py-1 flex items-center gap-2 min-w-[140px] justify-center font-bold text-main whitespace-nowrap">
                            <Calendar size={16} className="text-primary hidden sm:block" />
                            {currentDate.toLocaleString('default', { month: 'long', year: 'numeric' })}
                        </div>
                        <button onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1))} className="p-1.5 hover:bg-subtle rounded-md text-muted hover:text-main">
                            <ChevronRight size={20} />
                        </button>
                    </div>
                    {adminUser?.role === 'super_admin' && (
                        <div className="flex items-center gap-2 bg-white dark:bg-gray-800 p-2 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm hidden md:flex">
                            <span className="text-xs font-bold text-muted uppercase px-2">Пользователь:</span>
                            <select value={selectedAdminId} onChange={(e) => setSelectedAdminId(e.target.value)} className="bg-transparent border-none text-sm font-medium focus:ring-0 cursor-pointer min-w-[150px] outline-none text-main">
                                {adminsList.map(a => <option key={a.id} value={a.id}>{a.id === adminUser.id ? 'Мой (Я)' : a.name}</option>)}
                            </select>
                        </div>
                    )}
                </div>
                {adminUser?.role === 'super_admin' && (
                    <div className="md:hidden w-full">
                        <select value={selectedAdminId} onChange={(e) => setSelectedAdminId(e.target.value)} className="w-full bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 rounded-lg p-2 text-sm text-main">
                            {adminsList.map(a => <option key={a.id} value={a.id}>{a.id === adminUser.id ? 'Мой (Я)' : a.name}</option>)}
                        </select>
                    </div>
                )}
            </div>

            {/* Stats Overview */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Corporate Credit Limit - UPDATED */}
                <div className="card p-5 flex flex-col justify-between border-l-4 border-l-blue-500">
                    <div className="flex justify-between items-start mb-2">
                        <div>
                            <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-1">Баланс фирмы</p>
                            <div className="flex items-center gap-2">
                                <h3 className={`text-2xl font-bold ${availableCredit < 0 ? 'text-red-500' : 'text-main'}`}>
                                    {availableCredit.toLocaleString()} <span className="text-sm font-normal text-muted">zł</span>
                                </h3>
                            </div>
                        </div>
                        <div className="flex gap-2">
                            {adminUser?.role === 'super_admin' && (
                                <>
                                    <button onClick={() => setShowAddCreditModal(true)} className="p-1.5 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition-colors" title="Пополнить">
                                        <Plus size={16} />
                                    </button>
                                    <button onClick={() => setShowDeductCreditModal(true)} className="p-1.5 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors" title="Списать">
                                        <Minus size={16} />
                                    </button>
                                </>
                            )}
                        </div>
                    </div>

                    <div className="mt-2 pt-3 border-t border-border space-y-1">
                        <div className="flex justify-between text-[10px] text-muted">
                            <span>Начало месяца:</span>
                            <span className="font-medium">{openingBalance.toLocaleString()} zł</span>
                        </div>
                        <div className="flex justify-between text-[10px] text-muted">
                            <span>Пополнения:</span>
                            <span className="text-green-600 font-medium">+{currentAdded.toLocaleString()} zł</span>
                        </div>
                        {currentDeducted > 0 && (
                            <div className="flex justify-between text-[10px] text-muted">
                                <span>Списания:</span>
                                <span className="text-red-500 font-medium">-{currentDeducted.toLocaleString()} zł</span>
                            </div>
                        )}
                        <div className="flex justify-between text-[10px] text-muted">
                            <span>Расходы:</span>
                            <span className="text-rose-500 font-medium">-{spentFromFirm.toLocaleString()} zł</span>
                        </div>
                    </div>
                </div>

                {/* Net Payout */}
                <div className="card p-5 flex items-start justify-between border-l-4 border-l-violet-500 sm:col-span-1">
                    <div>
                        <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-1">К выплате</p>
                        <h3 className="text-2xl font-bold text-violet-600 dark:text-violet-400">{netPayout.toLocaleString()} <span className="text-sm font-normal text-muted">zł</span></h3>
                        <p className="text-[10px] text-muted mt-1">Зп + Бонусы + Возвраты</p>
                    </div>
                    <div className="p-2 bg-violet-50 dark:bg-violet-900/10 rounded-lg text-violet-600 dark:text-violet-400"><Wallet size={20} /></div>
                </div>

                {/* Object Salary */}
                <div className="card p-5 flex items-start justify-between">
                    <div>
                        <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-1">Зарплата (Объекты)</p>
                        <h3 className="text-2xl font-bold text-main">{totalObjectSalary.toLocaleString()} <span className="text-sm font-normal text-muted">zł</span></h3>
                    </div>
                    <div className="p-2 bg-blue-50 dark:bg-blue-900/10 rounded-lg text-blue-600 dark:text-blue-400"><Briefcase size={20} /></div>
                </div>

                {/* Expenses */}
                <div className="card p-5 flex items-start justify-between">
                    <div>
                        <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-1">Расходы (Всего)</p>
                        <h3 className="text-2xl font-bold text-main">{totalExpenses.toLocaleString()} <span className="text-sm font-normal text-muted">zł</span></h3>
                        {reimbursements > 0 && <div className="mt-1 text-xs font-medium text-green-600 dark:text-green-400">+ {reimbursements.toLocaleString()} zł (Возврат)</div>}
                    </div>
                    <div className="p-2 bg-rose-50 dark:bg-rose-900/10 rounded-lg text-rose-600 dark:text-rose-400"><TrendingDown size={20} /></div>
                </div>
            </div>

            {/* Main Content Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* Left Column: Objects */}
                <div className="space-y-6 lg:col-span-1">
                    <div className="card flex flex-col h-full">
                        <div className="p-4 border-b border-border flex items-center justify-between bg-subtle/30">
                            <h3 className="font-bold text-main flex items-center gap-2"><Building2 size={16} className="text-muted" /> Мои объекты</h3>
                        </div>
                        <div className="p-4 space-y-3">
                            {objects.map(obj => (
                                <div key={obj.id} className="p-3 rounded-lg border border-border hover:bg-subtle transition-colors group">
                                    <div className="flex justify-between items-start">
                                        <div><h4 className="font-bold text-main text-sm">{obj.name}</h4><p className="text-xs text-muted truncate max-w-[150px]">{obj.address}</p></div>
                                        <div className="text-right"><span className="text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">{obj.monthly_rate} zł</span></div>
                                    </div>
                                </div>
                            ))}
                            {objects.length === 0 && <div className="text-center py-6 text-muted text-sm italic">Нет назначенных объектов</div>}
                        </div>
                    </div>
                </div>

                {/* Right Column: Expenses & Hours */}
                <div className="space-y-6 lg:col-span-2">
                    {/* Expenses Table */}
                    <div className="card overflow-hidden">
                        <div className="p-4 border-b border-border flex items-center justify-between bg-subtle/30">
                            <h3 className="font-bold text-main flex items-center gap-2"><Receipt size={16} className="text-rose-500" /> Расходы и закупки</h3>
                            <button onClick={() => setShowExpenseModal(true)} className="btn-secondary text-xs px-3 py-1.5 flex items-center gap-1.5"><Plus size={14} /> <span className="hidden sm:inline">Добавить</span></button>
                        </div>
                        {/* Mobile cards */}
                        <div className="flex flex-col gap-2 p-3 sm:hidden">
                            {expenses.map(exp => (
                                <div key={exp.id} className="flex items-center justify-between p-3 bg-subtle/30 rounded-lg border border-border">
                                    <div className="min-w-0 flex-1">
                                        <div className="font-medium text-main text-sm flex items-center gap-1.5 truncate">
                                            {exp.title}
                                            {exp.receipt_url && <a href={exp.receipt_url} target="_blank" rel="noopener noreferrer" className="text-primary shrink-0"><FileText size={12} /></a>}
                                        </div>
                                        <div className="text-xs text-muted mt-0.5 flex items-center gap-2">
                                            <span>{new Date(exp.expense_date).toLocaleDateString()}</span>
                                            {exp.is_reimbursement
                                                ? <span className="text-green-600 font-medium">Возврат</span>
                                                : <span className="text-slate-500">Фирма</span>}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 ml-3 shrink-0">
                                        <span className="font-bold text-rose-500 text-sm">-{exp.amount} zł</span>
                                        <button onClick={() => handleDeleteExpense(exp.id)} className="text-muted hover:text-red-500 p-1"><Trash2 size={14} /></button>
                                    </div>
                                </div>
                            ))}
                            {expenses.length === 0 && <p className="text-center text-muted italic text-sm py-4">Нет записанных расходов</p>}
                        </div>
                        {/* Desktop table */}
                        <div className="hidden sm:block overflow-x-auto touch-pan-x">
                            <table className="w-full text-left min-w-[600px]">
                                <thead className="bg-subtle/50 text-xs font-bold text-muted uppercase tracking-wider border-b border-border">
                                    <tr>
                                        <th className="px-4 py-3">Описание</th>
                                        <th className="px-4 py-3">Дата</th>
                                        <th className="px-4 py-3">Тип</th>
                                        <th className="px-4 py-3 text-right">Сумма</th>
                                        <th className="px-4 py-3 w-10"></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border text-sm">
                                    {expenses.map(exp => (
                                        <tr key={exp.id} className="hover:bg-subtle/50 transition-colors group">
                                            <td className="px-4 py-3">
                                                <div className="font-medium text-main flex items-center gap-2">{exp.title} {exp.receipt_url && <a href={exp.receipt_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline p-1"><FileText size={14} /></a>}</div>
                                                {exp.description && <div className="text-xs text-muted truncate max-w-[200px]">{exp.description}</div>}
                                            </td>
                                            <td className="px-4 py-3 text-muted text-xs whitespace-nowrap">{new Date(exp.expense_date).toLocaleDateString()}</td>
                                            <td className="px-4 py-3">
                                                {exp.is_reimbursement ?
                                                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-green-600 bg-green-100 dark:bg-green-900/30 px-2 py-0.5 rounded-full"><CheckCircle2 size={10} /> Возврат</span> :
                                                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full"><Building2 size={10} /> Фирма</span>
                                                }
                                            </td>
                                            <td className="px-4 py-3 text-right font-bold text-rose-500">-{exp.amount} zł</td>
                                            <td className="px-4 py-3 text-right"><button onClick={() => handleDeleteExpense(exp.id)} className="text-muted hover:text-red-500 md:opacity-0 md:group-hover:opacity-100 transition-all p-1"><Trash2 size={14} /></button></td>
                                        </tr>
                                    ))}
                                    {expenses.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-muted italic">Нет записанных расходов</td></tr>}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Extra Hours Table */}
                    <div className="card overflow-hidden">
                        <div className="p-4 border-b border-border flex items-center justify-between bg-subtle/30">
                            <h3 className="font-bold text-main flex items-center gap-2"><Clock size={16} className="text-violet-500" /> Переработки</h3>
                            <button onClick={() => setShowHoursModal(true)} className="btn-secondary text-xs px-3 py-1.5 flex items-center gap-1.5"><Plus size={14} /> <span className="hidden sm:inline">Лог работы</span></button>
                        </div>
                        {/* Mobile cards */}
                        <div className="flex flex-col gap-2 p-3 sm:hidden">
                            {extraHours.map(h => (
                                <div key={h.id} className="flex items-center justify-between p-3 bg-subtle/30 rounded-lg border border-border">
                                    <div className="min-w-0 flex-1">
                                        <div className="font-medium text-main text-sm truncate">{h.object_name || 'Без объекта'}</div>
                                        <div className="text-xs text-muted mt-0.5 flex items-center gap-2">
                                            <span>{new Date(h.work_date).toLocaleDateString()}</span>
                                            <span className="text-zinc-400">{h.hours}ч · {h.rate} zł/ч</span>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 ml-3 shrink-0">
                                        <span className="font-bold text-emerald-500 text-sm">{(h.hours * h.rate).toLocaleString()} zł</span>
                                        <button onClick={() => handleDeleteHours(h.id)} className="text-muted hover:text-red-500 p-1"><Trash2 size={14} /></button>
                                    </div>
                                </div>
                            ))}
                            {extraHours.length === 0 && <p className="text-center text-muted italic text-sm py-4">Нет записей о часах</p>}
                        </div>
                        {/* Desktop table */}
                        <div className="hidden sm:block overflow-x-auto touch-pan-x">
                            <table className="w-full text-left min-w-[600px]">
                                <thead className="bg-subtle/50 text-xs font-bold text-muted uppercase tracking-wider border-b border-border">
                                    <tr>
                                        <th className="px-4 py-3">Объект / Инфо</th>
                                        <th className="px-4 py-3">Дата</th>
                                        <th className="px-4 py-3">Часы</th>
                                        <th className="px-4 py-3">Ставка</th>
                                        <th className="px-4 py-3 text-right">Итого</th>
                                        <th className="px-4 py-3 w-10"></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border text-sm">
                                    {extraHours.map(h => (
                                        <tr key={h.id} className="hover:bg-subtle/50 transition-colors group">
                                            <td className="px-4 py-3"><div className="font-medium text-main">{h.object_name || 'Без объекта'}</div>{h.description && <div className="text-xs text-muted truncate max-w-[200px]">{h.description}</div>}</td>
                                            <td className="px-4 py-3 text-muted text-xs whitespace-nowrap">{new Date(h.work_date).toLocaleDateString()}</td>
                                            <td className="px-4 py-3 font-medium text-main">{h.hours} ч.</td>
                                            <td className="px-4 py-3 text-muted">{h.rate} zł/ч</td>
                                            <td className="px-4 py-3 text-right font-bold text-emerald-500">{(h.hours * h.rate).toLocaleString()} zł</td>
                                            <td className="px-4 py-3 text-right"><button onClick={() => handleDeleteHours(h.id)} className="text-muted hover:text-red-500 md:opacity-0 md:group-hover:opacity-100 transition-all p-1"><Trash2 size={14} /></button></td>
                                        </tr>
                                    ))}
                                    {extraHours.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-muted italic">Нет записей о часах</td></tr>}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Extra Income Table */}
                    <div className="card overflow-hidden">
                        <div className="p-4 border-b border-border flex items-center justify-between bg-subtle/30">
                            <h3 className="font-bold text-main flex items-center gap-2">
                                <Coins size={16} className="text-emerald-500" /> Доходы
                            </h3>
                            {adminUser?.role === 'super_admin' && (
                                <button onClick={() => setShowIncomeModal(true)} className="btn-secondary text-xs px-3 py-1.5 flex items-center gap-1.5">
                                    <Plus size={14} /> Добавить
                                </button>
                            )}
                        </div>
                        {/* Mobile cards */}
                        <div className="flex flex-col gap-2 p-3 sm:hidden">
                            {extraIncomes.map((inc) => (
                                <div key={inc.id} className="flex items-center justify-between p-3 bg-subtle/30 rounded-lg border border-border">
                                    <div className="min-w-0 flex-1">
                                        <div className="font-medium text-main text-sm truncate">{inc.title}</div>
                                        <div className="text-xs text-muted mt-0.5">{new Date(inc.income_date).toLocaleDateString()}</div>
                                    </div>
                                    <div className="flex items-center gap-2 ml-3 shrink-0">
                                        <span className="font-bold text-emerald-500 text-sm">+{inc.amount} zł</span>
                                        {adminUser?.role === 'super_admin' && (
                                            <button onClick={() => handleDeleteIncome(inc.id)} className="text-muted hover:text-red-500 p-1"><Trash2 size={14} /></button>
                                        )}
                                    </div>
                                </div>
                            ))}
                            {extraIncomes.length === 0 && <p className="text-center text-muted italic text-sm py-4">Нет дополнительных начислений</p>}
                        </div>
                        {/* Desktop table */}
                        <div className="hidden sm:block overflow-x-auto touch-pan-x">
                            <table className="w-full text-left min-w-[500px]">
                                <thead className="bg-subtle/50 text-xs font-bold text-muted uppercase tracking-wider border-b border-border">
                                    <tr>
                                        <th className="px-4 py-3">Название</th>
                                        <th className="px-4 py-3">Дата</th>
                                        <th className="px-4 py-3 text-right">Сумма</th>
                                        <th className="px-4 py-3 w-10"></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border text-sm">
                                    {extraIncomes.map((inc) => (
                                        <tr key={inc.id} className="hover:bg-subtle/50 transition-colors group">
                                            <td className="px-4 py-3 font-medium text-main">{inc.title}</td>
                                            <td className="px-4 py-3 text-muted text-xs whitespace-nowrap">{new Date(inc.income_date).toLocaleDateString()}</td>
                                            <td className="px-4 py-3 text-right font-bold text-emerald-500">+{inc.amount} zł</td>
                                            <td className="px-4 py-3 text-right">
                                                {adminUser?.role === 'super_admin' && (
                                                    <button onClick={() => handleDeleteIncome(inc.id)} className="text-muted hover:text-red-500 md:opacity-0 md:group-hover:opacity-100 transition-all p-1">
                                                        <Trash2 size={14} />
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                    {extraIncomes.length === 0 && (
                                        <tr><td colSpan={4} className="p-8 text-center text-muted italic">Нет дополнительных начислений</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>

            {/* Modals */}
            {(showExpenseModal || showHoursModal || showIncomeModal || showAddCreditModal || showDeductCreditModal || deleteConfirm) && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fadeIn">

                    {/* Delete Confirmation Modal */}
                    {deleteConfirm && (
                        <div className="bg-white dark:bg-gray-900 w-full max-w-sm rounded-xl shadow-xl border border-gray-200 dark:border-gray-800 overflow-hidden animate-scaleIn">
                            <div className="p-4 border-b border-border flex justify-between items-center bg-red-50 dark:bg-red-900/20">
                                <h3 className="font-bold text-lg text-red-700 dark:text-red-400">Подтверждение</h3>
                                <button onClick={() => setDeleteConfirm(null)} className="text-muted hover:text-main"><X size={20} /></button>
                            </div>
                            <div className="p-6">
                                <p className="text-gray-700 dark:text-gray-300 mb-6">{deleteConfirm.title}</p>
                                <div className="flex justify-end gap-3 font-medium">
                                    <button onClick={() => setDeleteConfirm(null)} className="btn-secondary">Отмена</button>
                                    <button onClick={executeDelete} className="btn-primary bg-red-600 hover:bg-red-700 px-6">Удалить</button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Add Credit Modal */}
                    {showAddCreditModal && (
                        <div className="bg-white dark:bg-gray-900 w-full max-w-md rounded-xl shadow-xl border border-gray-200 dark:border-gray-800 overflow-hidden animate-scaleIn">
                            <div className="p-4 border-b border-border flex justify-between items-center bg-green-50 dark:bg-green-900/20">
                                <h3 className="font-bold text-lg text-green-700 dark:text-green-400">Пополнить баланс</h3>
                                <button onClick={() => setShowAddCreditModal(false)} className="text-muted hover:text-main"><X size={20} /></button>
                            </div>
                            <div className="p-6 space-y-4">
                                <div>
                                    <label className="block text-xs font-bold text-muted uppercase tracking-wider mb-1.5">Сумма пополнения (PLN)</label>
                                    <input type="number" autoFocus required min="1" step="0.01" value={creditForm.amount} onChange={e => setCreditForm({ ...creditForm, amount: Number(e.target.value) })} className="input w-full font-bold text-2xl text-green-600" />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-muted uppercase tracking-wider mb-1.5">Дата</label>
                                    <input type="date" required value={creditForm.transaction_date} onChange={e => setCreditForm({ ...creditForm, transaction_date: e.target.value })} className="input w-full" />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-muted uppercase tracking-wider mb-1.5">Комментарий</label>
                                    <input type="text" placeholder="Напр: Лимит на Февраль" value={creditForm.description} onChange={e => setCreditForm({ ...creditForm, description: e.target.value })} className="input w-full" />
                                </div>
                                <div className="flex justify-end gap-3 pt-2">
                                    <button onClick={() => setShowAddCreditModal(false)} className="btn-secondary">Отмена</button>
                                    <button onClick={() => handleTransaction(false)} className="btn-primary bg-green-600 hover:bg-green-700">Пополнить</button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Deduct Credit Modal */}
                    {showDeductCreditModal && (
                        <div className="bg-white dark:bg-gray-900 w-full max-w-md rounded-xl shadow-xl border border-gray-200 dark:border-gray-800 overflow-hidden animate-scaleIn">
                            <div className="p-4 border-b border-border flex justify-between items-center bg-red-50 dark:bg-red-900/20">
                                <h3 className="font-bold text-lg text-red-700 dark:text-red-400">Списать с баланса</h3>
                                <button onClick={() => setShowDeductCreditModal(false)} className="text-muted hover:text-main"><X size={20} /></button>
                            </div>
                            <div className="p-6 space-y-4">
                                <div>
                                    <label className="block text-xs font-bold text-muted uppercase tracking-wider mb-1.5">Сумма списания (PLN)</label>
                                    <input type="number" autoFocus required min="1" step="0.01" value={creditForm.amount} onChange={e => setCreditForm({ ...creditForm, amount: Number(e.target.value) })} className="input w-full font-bold text-2xl text-red-600" />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-muted uppercase tracking-wider mb-1.5">Дата</label>
                                    <input type="date" required value={creditForm.transaction_date} onChange={e => setCreditForm({ ...creditForm, transaction_date: e.target.value })} className="input w-full" />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-muted uppercase tracking-wider mb-1.5">Причина</label>
                                    <input type="text" placeholder="Напр: Корректировка" value={creditForm.description} onChange={e => setCreditForm({ ...creditForm, description: e.target.value })} className="input w-full" />
                                </div>
                                <div className="flex justify-end gap-3 pt-2">
                                    <button onClick={() => setShowDeductCreditModal(false)} className="btn-secondary">Отмена</button>
                                    <button onClick={() => handleTransaction(true)} className="btn-primary bg-red-600 hover:bg-red-700">Списать</button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Expense Modal (Existing) */}
                    {showExpenseModal && (
                        <div className="bg-white dark:bg-gray-900 w-full max-w-md rounded-xl shadow-xl border border-gray-200 dark:border-gray-800 overflow-hidden animate-scaleIn">
                            <div className="p-4 border-b border-border flex justify-between items-center bg-subtle">
                                <h3 className="font-bold text-lg text-main">Новый расход</h3>
                                <button onClick={() => setShowExpenseModal(false)} className="text-muted hover:text-main"><X size={20} /></button>
                            </div>
                            <form onSubmit={handleAddExpense} className="p-6 space-y-4">
                                <div><label className="block text-xs font-bold text-muted uppercase tracking-wider mb-1.5">Название</label><input type="text" required placeholder="Напр: Моющие средства" value={expenseForm.title} onChange={e => setExpenseForm({ ...expenseForm, title: e.target.value })} className="input w-full" /></div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div><label className="block text-xs font-bold text-muted uppercase tracking-wider mb-1.5">Сумма (PLN)</label><input type="number" required min="0.01" step="0.01" value={expenseForm.amount} onChange={e => setExpenseForm({ ...expenseForm, amount: Number(e.target.value) })} className="input w-full font-bold" /></div>
                                    <div><label className="block text-xs font-bold text-muted uppercase tracking-wider mb-1.5">Дата</label><input type="date" required value={expenseForm.expense_date} onChange={e => setExpenseForm({ ...expenseForm, expense_date: e.target.value })} className="input w-full" /></div>
                                </div>
                                <div className="p-3 rounded-lg border border-border bg-subtle/50">
                                    <label className="flex items-center gap-3 cursor-pointer">
                                        <input type="checkbox" checked={expenseForm.is_reimbursement} onChange={e => setExpenseForm({ ...expenseForm, is_reimbursement: e.target.checked })} className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary" />
                                        <div><div className="font-medium text-sm text-main">Купил за свои (Вернуть)</div><div className="text-xs text-muted">Деньги будут добавлены к выплате</div></div>
                                    </label>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-muted uppercase tracking-wider mb-1.5">Фото чека</label>
                                    <label className="flex items-center justify-center gap-2 w-full p-3 rounded-lg border-2 border-dashed border-border hover:border-primary/50 cursor-pointer transition-all hover:bg-subtle">
                                        <Camera size={18} className="text-muted" /><span className="text-sm font-medium text-muted truncate">{receiptFile ? receiptFile.name : "Загрузить фото"}</span>
                                        <input type="file" accept="image/*" className="hidden" onChange={e => setReceiptFile(e.target.files?.[0] || null)} />
                                    </label>
                                </div>
                                <div><label className="block text-xs font-bold text-muted uppercase tracking-wider mb-1.5">Описание</label><textarea value={expenseForm.description} onChange={e => setExpenseForm({ ...expenseForm, description: e.target.value })} className="input w-full min-h-[80px]" placeholder="Детали расхода..." /></div>
                                <div className="flex justify-end gap-3 pt-2"><button type="button" onClick={() => setShowExpenseModal(false)} className="btn-secondary">Отмена</button><button type="submit" disabled={uploadingReceipt} className="btn-primary">{uploadingReceipt ? 'Загрузка...' : 'Сохранить'}</button></div>
                            </form>
                        </div>
                    )}

                    {/* Hours Modal (Existing) */}
                    {showHoursModal && (
                        <div className="bg-white dark:bg-gray-900 w-full max-w-md rounded-xl shadow-xl border border-gray-200 dark:border-gray-800 overflow-hidden animate-scaleIn">
                            <div className="p-4 border-b border-border flex justify-between items-center bg-subtle">
                                <h3 className="font-bold text-lg text-main">Лог работы</h3>
                                <button onClick={() => setShowHoursModal(false)} className="text-muted hover:text-main"><X size={20} /></button>
                            </div>
                            <form onSubmit={handleAddHours} className="p-6 space-y-4">
                                <div>
                                    <label className="block text-xs font-bold text-muted uppercase tracking-wider mb-1.5">Объект (опционально)</label>
                                    <select value={hoursForm.object_id} onChange={e => setHoursForm({ ...hoursForm, object_id: e.target.value })} className="input w-full">
                                        <option value="">Без привязки к объекту</option>
                                        {objects.map(obj => <option key={obj.id} value={obj.id}>{obj.name}</option>)}
                                    </select>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div><label className="block text-xs font-bold text-muted uppercase tracking-wider mb-1.5">Часы</label><input type="number" required step="0.5" value={hoursForm.hours} onChange={e => setHoursForm({ ...hoursForm, hours: Number(e.target.value) })} className="input w-full" /></div>
                                    <div><label className="block text-xs font-bold text-muted uppercase tracking-wider mb-1.5">Ставка (PLN/ч)</label><input type="number" required value={hoursForm.rate} onChange={e => setHoursForm({ ...hoursForm, rate: Number(e.target.value) })} className="input w-full" /></div>
                                </div>
                                <div><label className="block text-xs font-bold text-muted uppercase tracking-wider mb-1.5">Дата</label><input type="date" required value={hoursForm.work_date} onChange={e => setHoursForm({ ...hoursForm, work_date: e.target.value })} className="input w-full" /></div>
                                <div><label className="block text-xs font-bold text-muted uppercase tracking-wider mb-1.5">Описание работ</label><textarea required value={hoursForm.description} onChange={e => setHoursForm({ ...hoursForm, description: e.target.value })} className="input w-full min-h-[80px]" placeholder="Что именно делали..." /></div>
                                <div className="flex justify-end gap-3 pt-2"><button type="button" onClick={() => setShowHoursModal(false)} className="btn-secondary">Отмена</button><button type="submit" className="btn-primary">Сохранить</button></div>
                            </form>
                        </div>
                    )}

                    {/* Income Modal (Existing) */}
                    {showIncomeModal && (
                        <div className="bg-white dark:bg-gray-900 w-full max-w-md rounded-xl shadow-xl border border-gray-200 dark:border-gray-800 overflow-hidden animate-scaleIn">
                            <div className="p-4 border-b border-border flex justify-between items-center bg-subtle">
                                <h3 className="font-bold text-lg text-main">Начисление бонуса</h3>
                                <button onClick={() => setShowIncomeModal(false)} className="text-muted hover:text-main"><X size={20} /></button>
                            </div>
                            <form onSubmit={handleAddIncome} className="p-6 space-y-4">
                                <div><label className="block text-xs font-bold text-muted uppercase tracking-wider mb-1.5">Название / Причина</label><input type="text" required value={incomeForm.title} onChange={e => setIncomeForm({ ...incomeForm, title: e.target.value })} className="input w-full" placeholder="Напр: Бонус за качество" /></div>
                                <div><label className="block text-xs font-bold text-muted uppercase tracking-wider mb-1.5">Сумма (PLN)</label><input type="number" required value={incomeForm.amount} onChange={e => setIncomeForm({ ...incomeForm, amount: Number(e.target.value) })} className="input w-full font-bold" /></div>
                                <div><label className="block text-xs font-bold text-muted uppercase tracking-wider mb-1.5">Дата</label><input type="date" required value={incomeForm.income_date} onChange={e => setIncomeForm({ ...incomeForm, income_date: e.target.value })} className="input w-full" /></div>
                                <div className="flex justify-end gap-3 pt-2"><button type="button" onClick={() => setShowIncomeModal(false)} className="btn-secondary">Отмена</button><button type="submit" className="btn-primary">Сохранить</button></div>
                            </form>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

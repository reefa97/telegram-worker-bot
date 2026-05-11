import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../lib/supabase';
import { Plus, Trash2, Calendar, Star, X, ScanText, RotateCw } from 'lucide-react';
import { useUndo } from '../contexts/UndoContext';

interface Task {
    id: string;
    object_id: string;
    title: string;
    description: string;
    is_active: boolean;
    is_special_task: boolean;
    scheduled_days: number[] | null;
    scheduled_dates: string[] | null;
    is_recurring: boolean;
    frequency: 'weekly' | 'monthly' | 'one_time';
}

interface TaskManagementModalProps {
    objectId: string;
    objectName: string;
    onClose: () => void;
}

// Days of week starting from Monday (1) to Sunday (0) for display order
const orderedDays = [1, 2, 3, 4, 5, 6, 7];
const dayNames: { [key: number]: string } = {
    1: 'Понедельник',
    2: 'Вторник',
    3: 'Среда',
    4: 'Четверг',
    5: 'Пятница',
    6: 'Суббота',
    7: 'Воскресенье'
};

export default function TaskManagementModal({ objectId, objectName, onClose }: TaskManagementModalProps) {
    const { pushUndo } = useUndo();
    const [tasks, setTasks] = useState<Task[]>([]);
    const [loading, setLoading] = useState(true);
    const [showAddForm, setShowAddForm] = useState(false);
    const [editingTask, setEditingTask] = useState<Task | null>(null);

    // Drag and Drop state
    const [draggedTask, setDraggedTask] = useState<{ task: Task, fromContainer: string } | null>(null);

    // Form State
    const [formData, setFormData] = useState({
        title: '',
        description: '',
        is_special_task: false,
        is_recurring: true,
        frequency: 'weekly' as 'weekly' | 'monthly' | 'one_time',
        scheduled_days: [] as number[], // 0-6 for weekly, 1-31 for monthly
        scheduled_dates: [] as string[],
    });

    // Date picker state
    const [dateInput, setDateInput] = useState('');

    useEffect(() => {
        loadTasks();
    }, [objectId]);

    const loadTasks = async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from('object_tasks')
            .select('*')
            .eq('object_id', objectId)
            .is('deleted_at', null)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error loading tasks:', error);
            alert('Ошибка загрузки задач');
        } else {
            // Map legacy tasks without frequency
            const mappedTasks = (data || []).map((t: any) => ({
                ...t,
                frequency: t.frequency || (t.is_recurring ? 'weekly' : 'one_time')
            }));
            setTasks(mappedTasks);
        }
        setLoading(false);
    };

    const handleSaveTask = async (e: React.FormEvent) => {
        e.preventDefault();

        // Validation based on frequency
        if (formData.frequency === 'weekly' && formData.scheduled_days.length === 0) {
            alert('Выберите хотя бы один день недели');
            return;
        }
        if (formData.frequency === 'monthly' && formData.scheduled_days.length === 0) {
            alert('Выберите хотя бы один день месяца');
            return;
        }
        if (formData.frequency === 'one_time' && formData.scheduled_dates.length === 0) {
            alert('Добавьте хотя бы одну дату');
            return;
        }

        const titles = formData.title.split('\n').map(t => t.trim()).filter(t => t.length > 0);
        if (titles.length === 0) {
            alert('Введите название задачи');
            return;
        }

        const isRecurring = formData.frequency !== 'one_time';

        try {
            if (editingTask) {
                // Update existing task
                const { error } = await supabase
                    .from('object_tasks')
                    .update({
                        title: titles[0], // Only update with first line content for edits
                        description: formData.description,
                        is_special_task: formData.is_special_task,
                        is_recurring: isRecurring,
                        frequency: formData.frequency,
                        scheduled_days: isRecurring ? formData.scheduled_days : null,
                        scheduled_dates: !isRecurring ? formData.scheduled_dates : null,
                    })
                    .eq('id', editingTask.id);

                if (error) throw error;
            } else {
                // Create new tasks
                const tasksToInsert = titles.map(title => ({
                    object_id: objectId,
                    title: title,
                    description: formData.description,
                    is_special_task: formData.is_special_task,
                    is_recurring: isRecurring,
                    frequency: formData.frequency,
                    scheduled_days: isRecurring ? formData.scheduled_days : null,
                    scheduled_dates: !isRecurring ? formData.scheduled_dates : null,
                    is_active: true
                }));

                const { error } = await supabase
                    .from('object_tasks')
                    .insert(tasksToInsert);

                if (error) throw error;
            }

            loadTasks();
            closeForm();
        } catch (error) {
            console.error('Error saving task:', error);
            alert('Ошибка при сохранении задачи');
        }
    };

    const handleDeleteTask = async (id: string, e?: React.MouseEvent) => {
        e?.stopPropagation(); // Prevent opening edit modal
        if (!confirm('Переместить задачу в корзину?')) return;

        const deletedTask = tasks.find(t => t.id === id);
        const { error } = await supabase.rpc('soft_delete_task', { task_id: id });

        if (error) {
            // Fallback to update if RPC fails (backward compatibility)
            const { error: updateError } = await supabase
                .from('object_tasks')
                .update({ deleted_at: new Date().toISOString() })
                .eq('id', id);

            if (updateError) {
                console.error('Error deleting task:', updateError);
                alert('Ошибка при удалении задачи');
                return;
            }
        }

        setTasks(prev => prev.filter(t => t.id !== id));
        if (editingTask?.id === id) closeForm();
        pushUndo(`Задача «${deletedTask?.title || ''}» удалена`, async () => {
            await supabase.rpc('restore_from_trash', { item_type: 'tasks', item_id: id });
            loadTasks();
        });
    };

    const closeForm = () => {
        setShowAddForm(false);
        setEditingTask(null);
        setFormData({
            title: '',
            description: '',
            is_special_task: false,
            is_recurring: true,
            frequency: 'weekly',
            scheduled_days: [],
            scheduled_dates: [],
        });
    };

    const openEditForm = (task: Task) => {
        setEditingTask(task);
        setFormData({
            title: task.title,
            description: task.description || '',
            is_special_task: task.is_special_task,
            is_recurring: task.is_recurring,
            frequency: task.frequency || (task.is_recurring ? 'weekly' : 'one_time'),
            scheduled_days: task.scheduled_days || [],
            scheduled_dates: task.scheduled_dates || [],
        });
        setShowAddForm(true);
    };

    const toggleDay = (day: number) => { // used for both weekly (0-6) and monthly (1-31)
        if (formData.scheduled_days.includes(day)) {
            setFormData({ ...formData, scheduled_days: formData.scheduled_days.filter(d => d !== day) });
        } else {
            setFormData({ ...formData, scheduled_days: [...formData.scheduled_days, day].sort((a, b) => a - b) });
        }
    };

    const addDate = () => {
        if (!dateInput) return;
        if (formData.scheduled_dates.includes(dateInput)) return;
        setFormData({ ...formData, scheduled_dates: [...formData.scheduled_dates, dateInput].sort() });
        setDateInput('');
    };

    const removeDate = (date: string) => {
        setFormData({ ...formData, scheduled_dates: formData.scheduled_dates.filter(d => d !== date) });
    };

    // Drag and Drop Handlers
    const handleDragStart = (e: React.DragEvent, task: Task, fromContainer: string) => {
        setDraggedTask({ task, fromContainer });
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    };

    const handleDrop = async (e: React.DragEvent, targetContainer: string) => {
        e.preventDefault();
        if (!draggedTask) return;

        const { task, fromContainer } = draggedTask;
        if (fromContainer === targetContainer) return;

        // Determine drop action based on containers
        // Containers: 'day-{0-6}', 'unscheduled', 'monthly', 'specific'

        // We only support dragging Weekly tasks between Days and Unscheduled for now.
        // Dragging Monthly <-> Weekly is complex due to different day values.

        // Parsing target
        let targetDay_Weekly: number | null = null;
        if (targetContainer.startsWith('day-')) {
            targetDay_Weekly = parseInt(targetContainer.split('-')[1]);
        }

        // Logic for Weekly Tasks
        if (task.frequency === 'weekly') {
            if (targetContainer === 'unscheduled' || targetDay_Weekly !== null) {
                // Allow move
                let updatedDays = task.scheduled_days ? [...task.scheduled_days] : [];

                // Parse source
                let sourceDay_Weekly: number | null = null;
                if (fromContainer.startsWith('day-')) {
                    sourceDay_Weekly = parseInt(fromContainer.split('-')[1]);
                }

                // Remove from source if it was a specific day column
                if (sourceDay_Weekly !== null) {
                    updatedDays = updatedDays.filter(d => d !== sourceDay_Weekly);
                }

                // Add to target if it's a specific day column
                if (targetDay_Weekly !== null) {
                    if (!updatedDays.includes(targetDay_Weekly)) {
                        updatedDays.push(targetDay_Weekly);
                    }
                }

                updatedDays.sort();

                // Optimistic update
                const updatedTask = { ...task, scheduled_days: updatedDays };
                setTasks(prev => prev.map(t => t.id === task.id ? updatedTask : t));
                setDraggedTask(null);

                try {
                    const { error } = await supabase
                        .from('object_tasks')
                        .update({ scheduled_days: updatedDays })
                        .eq('id', task.id);
                    if (error) throw error;
                } catch (error) {
                    console.error('Error moving task:', error);
                    alert('Ошибка перемещения задачи');
                    loadTasks();
                }
            }
        }
    };

    // OCR Logic...
    const handleOcrUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;
        const file = files[0];
        if (file.size > 4 * 1024 * 1024) {
            alert('Файл слишком большой. Максимум 4МБ');
            return;
        }

        setLoading(true);
        try {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = async () => {
                const base64Image = reader.result as string;
                try {
                    const { data, error } = await supabase.functions.invoke('ocr-tasks', {
                        body: { image: base64Image, objectId }
                    });

                    if (error) {
                        // Extract real error message from response body
                        let detail = error.message;
                        try {
                            const ctx: any = (error as any).context;
                            if (ctx?.json) detail = (await ctx.json()).error || detail;
                            else if (ctx?.text) detail = await ctx.text();
                        } catch {}
                        throw new Error(detail);
                    }
                    if (data.error) throw new Error(data.error);

                    const extractedTasks = data.tasks;
                    if (!extractedTasks || extractedTasks.length === 0) {
                        alert('Задачи не найдены');
                        setLoading(false);
                        return;
                    }

                    const tasksToInsert = extractedTasks.map((t: any) => ({
                        object_id: objectId,
                        title: t.title || 'Новая задача',
                        description: t.description || '',
                        is_recurring: t.is_recurring ?? true,
                        frequency: 'weekly', // Default OCR tasks to weekly for now
                        scheduled_days: t.scheduled_days || [],
                        scheduled_dates: t.scheduled_dates || null,
                        is_active: true,
                        is_special_task: false
                    }));

                    const { error: insertError } = await supabase.from('object_tasks').insert(tasksToInsert);
                    if (insertError) throw insertError;

                    alert(`Импортировано задач: ${tasksToInsert.length}`);
                    loadTasks();

                } catch (err: any) {
                    console.error('OCR Error:', err);
                    let msg = err.message || String(err);
                    if (/credit balance is too low/i.test(msg)) {
                        msg = 'Закончились кредиты Anthropic API. Пополните баланс в console.anthropic.com → Plans & Billing.';
                    } else if (/ANTHROPIC_API_KEY not configured/i.test(msg)) {
                        msg = 'Не настроен ANTHROPIC_API_KEY в Supabase Edge Function.';
                    } else if (/rate.?limit/i.test(msg)) {
                        msg = 'Превышен лимит запросов Anthropic API. Подождите минуту и попробуйте снова.';
                    }
                    alert(`Ошибка OCR: ${msg}`);
                    setLoading(false);
                }
            };
        } catch (error) {
            console.error('Error:', error);
            setLoading(false);
        }
    };

    // Filter tasks for Board
    const getTasksForDay = (day: number) => tasks.filter(t => t.frequency === 'weekly' && t.scheduled_days?.includes(day));
    const getUnscheduledRecurringTasks = () => tasks.filter(t => t.frequency === 'weekly' && (!t.scheduled_days || t.scheduled_days.length === 0));
    const getSpecificDateTasks = () => tasks.filter(t => t.frequency === 'one_time');
    const getMonthlyTasks = () => tasks.filter(t => t.frequency === 'monthly');

    return createPortal(
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content max-h-[95vh] sm:max-w-[95vw] sm:h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="modal-header">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                        <span className="bg-primary/10 text-primary p-1.5 rounded-lg shrink-0">
                            <Calendar className="w-5 h-5" />
                        </span>
                        <div className="min-w-0">
                            <h3 className="text-base sm:text-xl font-bold text-main leading-tight">Планировщик задач</h3>
                            <p className="text-xs sm:text-sm text-muted truncate">
                                <span className="font-semibold text-main">{objectName}</span>
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <label className="btn-secondary flex items-center gap-1.5 cursor-pointer relative px-2.5 py-1.5 text-sm">
                            {loading ? <span className="animate-pulse text-xs">...</span> : <><ScanText className="w-4 h-4" /><span className="hidden sm:inline">OCR</span></>}
                            <input type="file" accept="image/*,application/pdf" className="hidden" onChange={handleOcrUpload} disabled={loading} />
                        </label>
                        <button
                            onClick={() => { closeForm(); setShowAddForm(true); }}
                            className="btn-primary flex items-center gap-1.5 px-3 py-1.5 text-sm"
                        >
                            <Plus className="w-4 h-4" /><span className="hidden sm:inline">Добавить</span><span className="sm:hidden">Задача</span>
                        </button>
                        <button onClick={onClose} className="btn-icon shrink-0">
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-hidden flex flex-col relative">
                    {showAddForm && (
                        <div className="absolute inset-0 z-50 bg-white/95 dark:bg-gray-900/95 backdrop-blur-md flex items-center justify-center p-4 animate-fadeIn">
                            <div className="w-full max-w-2xl bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 p-6 max-h-full overflow-y-auto custom-scrollbar">
                                <div className="flex justify-between items-center mb-6">
                                    <h4 className="text-xl font-bold text-gray-900 dark:text-white">
                                        {editingTask ? 'Редактирование задачи' : 'Новая задача'}
                                    </h4>
                                    <button onClick={closeForm} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-gray-500">
                                        <X className="w-5 h-5" />
                                    </button>
                                </div>
                                <form onSubmit={handleSaveTask} className="space-y-6">
                                    {/* Form Content */}
                                    <div className="space-y-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Название</label>
                                            <textarea
                                                value={formData.title}
                                                onChange={e => setFormData({ ...formData, title: e.target.value })}
                                                className="input min-h-[80px]"
                                                rows={3}
                                                placeholder={editingTask ? '' : 'Введите название задачи...'}
                                                required
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Описание</label>
                                            <textarea
                                                value={formData.description}
                                                onChange={e => setFormData({ ...formData, description: e.target.value })}
                                                className="input"
                                                rows={2}
                                            />
                                        </div>

                                        <div className="flex items-center gap-4">
                                            <label className="flex items-center gap-2 cursor-pointer p-3 rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-900/10 hover:bg-amber-100 dark:hover:bg-amber-900/20 transition-colors flex-1">
                                                <input
                                                    type="checkbox"
                                                    checked={formData.is_special_task}
                                                    onChange={e => setFormData({ ...formData, is_special_task: e.target.checked })}
                                                    className="w-4 h-4 rounded border-amber-300 text-amber-600 focus:ring-amber-500"
                                                />
                                                <span className="font-medium text-amber-900 dark:text-amber-400 flex items-center gap-2">
                                                    <Star className="w-4 h-4" fill={formData.is_special_task ? "currentColor" : "none"} />
                                                    Спец. услуга
                                                </span>
                                            </label>
                                        </div>

                                        <div className="pt-4 border-t border-gray-100 dark:border-gray-700">
                                            <div className="flex bg-gray-100 dark:bg-gray-800 rounded-lg p-1 mb-4">
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setFormData({ ...formData, frequency: 'weekly', scheduled_days: [] });
                                                    }}
                                                    className={`flex-1 py-1.5 px-3 rounded-md text-sm font-medium transition-all ${formData.frequency === 'weekly' ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}
                                                >
                                                    Еженедельно
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setFormData({ ...formData, frequency: 'monthly', scheduled_days: [] });
                                                    }}
                                                    className={`flex-1 py-1.5 px-3 rounded-md text-sm font-medium transition-all ${formData.frequency === 'monthly' ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}
                                                >
                                                    Ежемесячно
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setFormData({ ...formData, frequency: 'one_time', scheduled_days: [] });
                                                    }}
                                                    className={`flex-1 py-1.5 px-3 rounded-md text-sm font-medium transition-all ${formData.frequency === 'one_time' ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}
                                                >
                                                    Точные даты
                                                </button>
                                            </div>

                                            {formData.frequency === 'weekly' && (
                                                <div className="flex flex-wrap gap-2">
                                                    {orderedDays.map((day) => (
                                                        <button
                                                            key={day}
                                                            type="button"
                                                            onClick={() => toggleDay(day)}
                                                            className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold transition-all ${formData.scheduled_days.includes(day)
                                                                ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30 ring-2 ring-blue-600 ring-offset-2 dark:ring-offset-gray-800'
                                                                : 'bg-gray-100 dark:bg-gray-700/50 text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700'
                                                                }`}
                                                        >
                                                            {(dayNames[day] || '?').substring(0, 2)}
                                                        </button>
                                                    ))}
                                                </div>
                                            )}

                                            {formData.frequency === 'monthly' && (
                                                <div className="space-y-3">
                                                    <p className="text-sm text-gray-500 dark:text-gray-400">Выберите числа месяца, когда выполнять задачу:</p>
                                                    <div className="grid grid-cols-7 gap-2">
                                                        {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                                                            <button
                                                                key={day}
                                                                type="button"
                                                                onClick={() => toggleDay(day)}
                                                                className={`h-8 rounded-lg flex items-center justify-center text-xs font-semibold transition-all ${formData.scheduled_days.includes(day)
                                                                    ? 'bg-purple-600 text-white shadow-md'
                                                                    : 'bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-purple-300'
                                                                    }`}
                                                            >
                                                                {day}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                            {formData.frequency === 'one_time' && (
                                                <div className="space-y-3">
                                                    <div className="flex gap-2">
                                                        <input type="date" value={dateInput} onChange={e => setDateInput(e.target.value)} className="input py-2" />
                                                        <button type="button" onClick={addDate} className="btn-secondary py-2">Добавить</button>
                                                    </div>
                                                    <div className="flex flex-wrap gap-2">
                                                        {formData.scheduled_dates.map(date => (
                                                            <span key={date} className="px-3 py-1 bg-gray-100 dark:bg-gray-700 rounded-full text-sm flex items-center gap-2">
                                                                {new Date(date).toLocaleDateString()}
                                                                <button type="button" onClick={() => removeDate(date)}><X className="w-3 h-3" /></button>
                                                            </span>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div className="flex gap-3 pt-6">
                                        <button type="button" onClick={closeForm} className="btn-ghost flex-1">Отмена</button>
                                        <button type="submit" className="btn-primary flex-1">Сохранить</button>
                                    </div>
                                </form>
                            </div>
                        </div>
                    )}

                    {loading ? (
                        <div className="flex-1 flex items-center justify-center">
                            <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin"></div>
                        </div>
                    ) : (
                        <>
                        {/* Mobile: simple task list */}
                        <div className="sm:hidden flex-1 overflow-y-auto p-4 space-y-2">
                            {tasks.length === 0 ? (
                                <div className="text-center py-12 text-muted text-sm italic">
                                    <Calendar className="w-10 h-10 mx-auto mb-3 opacity-20" />
                                    Нет задач — нажмите «Задача» чтобы добавить
                                </div>
                            ) : (
                                tasks.map(task => {
                                    const scheduleLabel = task.frequency === 'weekly' && task.scheduled_days?.length
                                        ? task.scheduled_days.map(d => (dayNames[d] || '?').substring(0, 2)).join(', ')
                                        : task.frequency === 'monthly' && task.scheduled_days?.length
                                        ? `${task.scheduled_days.join(', ')}-е число`
                                        : task.frequency === 'one_time' && task.scheduled_dates?.length
                                        ? task.scheduled_dates.slice(0, 2).map(d => new Date(d).toLocaleDateString('ru', { day: 'numeric', month: 'short' })).join(', ')
                                        : 'Без расписания';
                                    return (
                                        <div
                                            key={task.id}
                                            onClick={() => openEditForm(task)}
                                            className="card p-3 flex items-start gap-3 cursor-pointer"
                                        >
                                            {task.is_special_task && <Star className="w-4 h-4 text-amber-500 fill-current shrink-0 mt-0.5" />}
                                            <div className="flex-1 min-w-0">
                                                <div className="font-medium text-main text-sm">{task.title}</div>
                                                <div className="text-xs text-muted mt-0.5">{scheduleLabel}</div>
                                            </div>
                                            <button
                                                onClick={(e) => handleDeleteTask(task.id, e)}
                                                className="p-1.5 text-muted hover:text-danger hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors shrink-0"
                                            >
                                                <Trash2 size={15} />
                                            </button>
                                        </div>
                                    );
                                })
                            )}
                        </div>

                        {/* Desktop: Kanban board */}
                        <div className="hidden sm:block flex-1 overflow-x-auto overflow-y-hidden custom-scrollbar bg-gray-50/50 dark:bg-black/20 p-4">
                            <div className="flex h-full gap-4 min-w-max pb-2">
                                {/* Unscheduled Column (Weekly only) */}
                                <div
                                    className="w-72 flex flex-col bg-gray-100/50 dark:bg-gray-800/30 rounded-xl border border-gray-200/50 dark:border-gray-700/50 backdrop-blur-sm transition-colors hover:bg-gray-100 dark:hover:bg-gray-800/50"
                                    onDragOver={handleDragOver}
                                    onDrop={(e) => handleDrop(e, 'unscheduled')}
                                >
                                    <div className="p-3 border-b border-gray-200/50 dark:border-gray-700/50 font-medium text-gray-500 dark:text-gray-400 text-sm flex justify-between items-center sticky top-0 bg-inherit rounded-t-xl z-20">
                                        <span>Нераспределенные</span>
                                        <span className="bg-gray-200 dark:bg-gray-700 px-2 py-0.5 rounded-full text-xs text-gray-700 dark:text-gray-300">
                                            {getUnscheduledRecurringTasks().length}
                                        </span>
                                    </div>
                                    <div className="p-2 flex-1 overflow-y-auto custom-scrollbar space-y-2">
                                        {getUnscheduledRecurringTasks().map(task => (
                                            <TaskCard
                                                key={task.id}
                                                task={task}
                                                onDragStart={(e, task, _from) => handleDragStart(e, task, 'unscheduled')}
                                                onClick={() => openEditForm(task)}
                                                onDelete={(e) => handleDeleteTask(task.id, e)}
                                                showDelete={true}
                                            />
                                        ))}
                                        {getUnscheduledRecurringTasks().length === 0 && (
                                            <div className="text-center py-10 text-gray-400 text-sm italic">
                                                Перетащите сюда задачи, чтобы убрать из расписания
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Days Columns (Weekly) */}
                                {orderedDays.map(day => {
                                    const dayTasks = getTasksForDay(day);
                                    return (
                                        <div
                                            key={day}
                                            className="w-72 flex flex-col bg-white dark:bg-gray-800/80 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm transition-colors hover:border-primary-200 dark:hover:border-primary-800"
                                            onDragOver={handleDragOver}
                                            onDrop={(e) => handleDrop(e, `day-${day}`)}
                                        >
                                            <div className={`p-3 border-b border-gray-100 dark:border-gray-700 font-semibold text-gray-700 dark:text-gray-200 text-sm flex justify-between items-center sticky top-0 bg-white dark:bg-gray-800 rounded-t-xl z-20 
                                                ${day === (new Date().getDay() || 7) ? 'text-primary-600 dark:text-primary-400' : ''}`}>
                                                <span>{dayNames[day]}</span>
                                                <span className={`px-2 py-0.5 rounded-full text-xs ${day === (new Date().getDay() || 7) ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/50 dark:text-primary-300' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'}`}>
                                                    {dayTasks.length}
                                                </span>
                                            </div>
                                            <div className="p-2 flex-1 overflow-y-auto custom-scrollbar space-y-2 min-h-[100px]">
                                                {dayTasks.map(task => (
                                                    <TaskCard
                                                        key={`${task.id}-${day}`}
                                                        task={task}
                                                        onDragStart={(e, task, _from) => handleDragStart(e, task, `day-${day}`)}
                                                        onClick={() => openEditForm(task)}
                                                        onDelete={(e) => handleDeleteTask(task.id, e)}
                                                    />
                                                ))}
                                            </div>
                                        </div>
                                    );
                                })}

                                {/* Monthly Tasks Column */}
                                <div className="w-72 flex flex-col bg-purple-50/50 dark:bg-purple-900/10 rounded-xl border border-purple-100 dark:border-purple-800/30">
                                    <div className="p-3 border-b border-purple-100 dark:border-purple-800/30 font-medium text-purple-700 dark:text-purple-400 text-sm flex justify-between items-center sticky top-0 bg-inherit rounded-t-xl z-20">
                                        <span className="flex items-center gap-2"><RotateCw className="w-4 h-4" /> Ежемесячные</span>
                                        <span className="bg-purple-100 dark:bg-purple-900/50 px-2 py-0.5 rounded-full text-xs text-purple-800 dark:text-purple-300">
                                            {getMonthlyTasks().length}
                                        </span>
                                    </div>
                                    <div className="p-2 flex-1 overflow-y-auto custom-scrollbar space-y-2">
                                        {getMonthlyTasks().map(task => (
                                            <div key={task.id} onClick={() => openEditForm(task)} className="bg-white dark:bg-gray-700 p-3 rounded-lg border border-purple-100 dark:border-gray-600 shadow-sm cursor-pointer hover:shadow-md transition-all group relative">
                                                <div className="flex justify-between items-start mb-2">
                                                    <span className="font-medium text-gray-800 dark:text-gray-200 text-sm line-clamp-2">{task.title}</span>
                                                    <button onClick={(e) => handleDeleteTask(task.id, e)} className="md:opacity-0 md:group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-opacity p-0.5">
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                                <div className="flex flex-wrap gap-1">
                                                    {task.scheduled_days?.sort((a, b) => a - b).map(d => (
                                                        <span key={d} className="text-[10px] bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 px-1.5 py-0.5 rounded border border-purple-100 dark:border-purple-800/50">
                                                            {d}-е число
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                        {getMonthlyTasks().length === 0 && (
                                            <div className="text-center py-10 text-gray-400 text-sm italic">
                                                Нет ежемесячных задач
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Specific Dates (Optional view) */}
                                {getSpecificDateTasks().length > 0 && (
                                    <div className="w-72 flex flex-col bg-amber-50/50 dark:bg-amber-900/10 rounded-xl border border-amber-100 dark:border-amber-800/30">
                                        <div className="p-3 border-b border-amber-100 dark:border-amber-800/30 font-medium text-amber-700 dark:text-amber-400 text-sm flex justify-between items-center">
                                            <span>Точные даты</span>
                                            <span className="bg-amber-100 dark:bg-amber-900/50 px-2 py-0.5 rounded-full text-xs text-amber-800 dark:text-amber-300">
                                                {getSpecificDateTasks().length}
                                            </span>
                                        </div>
                                        <div className="p-2 flex-1 overflow-y-auto custom-scrollbar space-y-2">
                                            {getSpecificDateTasks().map(task => (
                                                <div key={task.id} onClick={() => openEditForm(task)} className="bg-white dark:bg-gray-700 p-3 rounded-lg border border-amber-100 dark:border-gray-600 shadow-sm cursor-pointer hover:shadow-md transition-all group relative">
                                                    <div className="flex justify-between items-start mb-2">
                                                        <span className="font-medium text-gray-800 dark:text-gray-200 text-sm line-clamp-2">{task.title}</span>
                                                        <button onClick={(e) => handleDeleteTask(task.id, e)} className="md:opacity-0 md:group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-opacity p-0.5">
                                                            <Trash2 className="w-3.5 h-3.5" />
                                                        </button>
                                                    </div>
                                                    <div className="flex flex-wrap gap-1">
                                                        {task.scheduled_dates?.slice(0, 3).map(d => (
                                                            <span key={d} className="text-[10px] bg-gray-50 dark:bg-gray-600 px-1.5 py-0.5 rounded text-gray-500 dark:text-gray-400">
                                                                {new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'numeric' })}
                                                            </span>
                                                        ))}
                                                        {(task.scheduled_dates?.length || 0) > 3 && (
                                                            <span className="text-[10px] text-gray-400">+{task.scheduled_dates!.length - 3}</span>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                        </>
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
}

function TaskCard({ task, onDragStart, onClick, onDelete, showDelete = false }: {
    task: Task,
    onDragStart: (e: React.DragEvent, task: Task, fromContainer: string) => void,
    onClick: () => void,
    onDelete?: (e: React.MouseEvent) => void,
    showDelete?: boolean
}) {
    return (
        <div
            draggable
            onDragStart={(e) => onDragStart(e, task, showDelete ? 'unscheduled' : 'day-associated')}
            onClick={onClick}
            className={`
                group bg-white dark:bg-gray-700 p-3 rounded-lg border border-gray-100 dark:border-gray-600 shadow-sm cursor-grab active:cursor-grabbing hover:shadow-md hover:border-primary-300 dark:hover:border-gray-500 transition-all relative
                ${task.is_special_task ? 'border-l-4 border-l-amber-400 dark:border-l-amber-500' : 'border-l-4 border-l-transparent'}
            `}
        >
            <div className="flex justify-between items-start gap-2">
                <p className="text-sm font-medium text-gray-800 dark:text-gray-200 line-clamp-3 leading-snug">
                    {task.title}
                </p>
                {onDelete && (
                    <button
                        onClick={onDelete}
                        className="md:opacity-0 md:group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-opacity p-0.5"
                    >
                        <Trash2 className="w-3.5 h-3.5" />
                    </button>
                )}
            </div>
            {task.is_special_task && (
                <div className="mt-2 flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 font-medium">
                    <Star className="w-3 h-3 fill-current" />
                    <span>Спец. услуга</span>
                </div>
            )}
            {task.description && (
                <div className="mt-2 pt-2 border-t border-gray-50 dark:border-gray-600/50">
                    <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">{task.description}</p>
                </div>
            )}
        </div>
    );
}

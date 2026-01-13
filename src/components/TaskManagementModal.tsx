import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Plus, Trash2, Calendar, Star, X, CheckSquare, Clock } from 'lucide-react';

interface Task {
    id: string;
    title: string;
    description: string;
    is_active: boolean;
    is_special_task: boolean;
    scheduled_days: number[] | null;
    scheduled_dates: string[] | null;
    is_recurring: boolean;
}

interface TaskManagementModalProps {
    objectId: string;
    objectName: string;
    onClose: () => void;
}

export default function TaskManagementModal({ objectId, objectName, onClose }: TaskManagementModalProps) {
    const [tasks, setTasks] = useState<Task[]>([]);
    const [loading, setLoading] = useState(true);
    const [showAddForm, setShowAddForm] = useState(false);

    // Form State
    const [newTask, setNewTask] = useState({
        title: '',
        description: '',
        is_special_task: false,
        is_recurring: true,
        scheduled_days: [] as number[], // 0-6
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
            setTasks(data || []);
        }
        setLoading(false);
    };

    const handleAddTask = async (e: React.FormEvent) => {
        e.preventDefault();

        // Validation
        if (newTask.is_recurring && newTask.scheduled_days.length === 0) {
            alert('Выберите хотя бы один день недели');
            return;
        }
        if (!newTask.is_recurring && newTask.scheduled_dates.length === 0) {
            alert('Добавьте хотя бы одну дату');
            return;
        }

        const titles = newTask.title.split('\n').map(t => t.trim()).filter(t => t.length > 0);
        if (titles.length === 0) {
            alert('Введите название задачи');
            return;
        }

        try {
            const tasksToInsert = titles.map(title => ({
                object_id: objectId,
                title: title,
                description: newTask.description,
                is_special_task: newTask.is_special_task,
                is_recurring: newTask.is_recurring,
                scheduled_days: newTask.is_recurring ? newTask.scheduled_days : null,
                scheduled_dates: !newTask.is_recurring ? newTask.scheduled_dates : null,
                is_active: true
            }));

            const { error } = await supabase
                .from('object_tasks')
                .insert(tasksToInsert);

            if (error) throw error;

            loadTasks();
            setShowAddForm(false);
            setNewTask({
                title: '',
                description: '',
                is_special_task: false,
                is_recurring: true,
                scheduled_days: [],
                scheduled_dates: [],
            });
        } catch (error) {
            console.error('Error adding task:', error);
            alert('Ошибка при добавлении задачи');
        }
    };

    const handleDeleteTask = async (id: string) => {
        if (!confirm('Переместить задачу в корзину?')) return;
        const { error } = await supabase.rpc('soft_delete_task', { task_id: id });
        if (error) {
            console.error('Error deleting task:', error);
            alert('Ошибка при удалении задачи');
        } else {
            // Update local state to remove the deleted task immediately
            setTasks(prev => prev.filter(t => t.id !== id));
        }
    };

    const toggleDay = (day: number) => {
        if (newTask.scheduled_days.includes(day)) {
            setNewTask({ ...newTask, scheduled_days: newTask.scheduled_days.filter(d => d !== day) });
        } else {
            setNewTask({ ...newTask, scheduled_days: [...newTask.scheduled_days, day].sort() });
        }
    };

    const addDate = () => {
        if (!dateInput) return;
        if (newTask.scheduled_dates.includes(dateInput)) return;
        setNewTask({ ...newTask, scheduled_dates: [...newTask.scheduled_dates, dateInput].sort() });
        setDateInput('');
    };

    const removeDate = (date: string) => {
        setNewTask({ ...newTask, scheduled_dates: newTask.scheduled_dates.filter(d => d !== date) });
    };

    const daysOfWeek = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

    const formatSchedule = (task: Task) => {
        if (task.is_recurring) {
            if (!task.scheduled_days || task.scheduled_days.length === 0) return 'Без расписания';
            if (task.scheduled_days.length === 7) return 'Каждый день';
            return task.scheduled_days.map(d => daysOfWeek[d]).join(', ');
        } else {
            if (!task.scheduled_dates || task.scheduled_dates.length === 0) return 'Нет дат';
            return `${task.scheduled_dates.length} дат(ы)`;
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto animate-fadeIn">
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-4xl w-full my-8 max-h-[90vh] flex flex-col animate-scaleIn border border-gray-100 dark:border-gray-700">
                <div className="p-6 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-gray-50/50 dark:bg-gray-800/50 rounded-t-2xl">
                    <div>
                        <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                            Управление задачами
                        </h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                            Объект: <span className="font-medium text-primary-600 dark:text-primary-400">{objectName}</span>
                        </p>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors">
                        <X className="w-6 h-6" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                    {!showAddForm ? (
                        <>
                            <div className="flex justify-between items-center mb-6">
                                <p className="text-gray-500 dark:text-gray-400 text-sm">Список задач для персонала, которые будут отображаться в боте.</p>
                                <button
                                    onClick={() => setShowAddForm(true)}
                                    className="btn-primary flex items-center gap-2 shadow-lg shadow-primary-500/20"
                                >
                                    <Plus className="w-4 h-4" /> Добавить задачу
                                </button>
                            </div>

                            {loading ? (
                                <div className="flex justify-center py-12">
                                    <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin"></div>
                                </div>
                            ) : tasks.length === 0 ? (
                                <div className="text-center py-16 bg-gray-50 dark:bg-gray-700/30 rounded-2xl border border-dashed border-gray-200 dark:border-gray-600">
                                    <div className="mx-auto w-12 h-12 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mb-4">
                                        <CheckSquare className="w-6 h-6 text-gray-400" />
                                    </div>
                                    <h4 className="text-gray-900 dark:text-white font-medium mb-1">Задач пока нет</h4>
                                    <p className="text-gray-500 dark:text-gray-400 text-sm">Создайте первую задачу для этого объекта</p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {tasks.map(task => (
                                        <div key={task.id} className="bg-white dark:bg-gray-700/50 rounded-xl p-4 flex items-start gap-4 border border-gray-100 dark:border-gray-600 hover:border-primary-500/30 dark:hover:border-primary-500/30 transition-all shadow-sm hover:shadow-md">
                                            <div className={`mt-1 p-2 rounded-lg flex-shrink-0 ${task.is_special_task ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400' : 'bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400'}`}>
                                                {task.is_special_task ? <Star className="w-5 h-5" /> : <CheckSquare className="w-5 h-5" />}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-start justify-between">
                                                    <div>
                                                        <h4 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2 flex-wrap">
                                                            {task.title}
                                                            {task.is_special_task && (
                                                                <span className="text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-2 py-0.5 rounded-full border border-amber-200 dark:border-amber-800 font-medium">
                                                                    Спец. услуга
                                                                </span>
                                                            )}
                                                        </h4>
                                                        {task.description && (
                                                            <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">{task.description}</p>
                                                        )}
                                                    </div>
                                                    <button
                                                        onClick={() => handleDeleteTask(task.id)}
                                                        className="text-gray-400 hover:text-red-500 dark:hover:text-red-400 p-1.5 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                                                        title="Удалить задачу"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>
                                                <div className="flex items-center gap-4 mt-3 pt-3 border-t border-gray-100 dark:border-gray-700 text-sm text-gray-500 dark:text-gray-400">
                                                    <div className="flex items-center gap-1.5">
                                                        <Calendar className="w-3.5 h-3.5" />
                                                        {formatSchedule(task)}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </>
                    ) : (
                        <form onSubmit={handleAddTask} className="space-y-6">
                            <div className="flex items-center justify-between">
                                <h4 className="text-lg font-bold text-gray-900 dark:text-white">Новая задача</h4>
                                <button type="button" onClick={() => setShowAddForm(false)} className="text-sm text-primary-600 dark:text-primary-400 hover:underline font-medium">
                                    Назад к списку
                                </button>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div className="space-y-5">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                            Название задачи (каждая с новой строки)
                                        </label>
                                        <textarea
                                            value={newTask.title}
                                            onChange={e => setNewTask({ ...newTask, title: e.target.value })}
                                            className="input min-h-[120px]"
                                            rows={5}
                                            placeholder={'Помыть окна\nПомыть полы\nВынести мусор'}
                                            required
                                        />
                                        <p className="text-xs text-gray-500 mt-1.5">Каждая строка создаст отдельную задачу</p>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Описание (опционально)</label>
                                        <textarea
                                            value={newTask.description}
                                            onChange={e => setNewTask({ ...newTask, description: e.target.value })}
                                            className="input"
                                            rows={3}
                                            placeholder="Дополнительные инструкции для работника..."
                                        />
                                    </div>

                                    <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-xl p-4">
                                        <label className="flex items-start gap-3 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={newTask.is_special_task}
                                                onChange={e => setNewTask({ ...newTask, is_special_task: e.target.checked })}
                                                className="mt-1 w-4 h-4 rounded border-amber-300 text-amber-600 focus:ring-amber-500"
                                            />
                                            <div>
                                                <span className="text-amber-900 dark:text-amber-400 font-semibold flex items-center gap-2">
                                                    <Star className="w-4 h-4" />
                                                    Специальная услуга
                                                </span>
                                                <p className="text-xs text-amber-700 dark:text-amber-500/80 mt-1">
                                                    Для спец. услуг приходят отдельные напоминания (вечером накануне и утром).
                                                </p>
                                            </div>
                                        </label>
                                    </div>
                                </div>

                                <div className="space-y-5">
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Расписание выполнения</label>

                                    <div className="grid grid-cols-2 gap-3 mb-4">
                                        <label className={`
                                            flex items-center justify-center gap-2 cursor-pointer p-3 rounded-xl border transition-all text-sm font-medium text-center
                                            ${newTask.is_recurring
                                                ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-400 shadow-sm'
                                                : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'}
                                        `}>
                                            <input
                                                type="radio"
                                                className="sr-only"
                                                checked={newTask.is_recurring}
                                                onChange={() => setNewTask({ ...newTask, is_recurring: true })}
                                            />
                                            <Calendar className="w-4 h-4" />
                                            Еженедельно
                                        </label>
                                        <label className={`
                                            flex items-center justify-center gap-2 cursor-pointer p-3 rounded-xl border transition-all text-sm font-medium text-center
                                            ${!newTask.is_recurring
                                                ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-400 shadow-sm'
                                                : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'}
                                        `}>
                                            <input
                                                type="radio"
                                                className="sr-only"
                                                checked={!newTask.is_recurring}
                                                onChange={() => setNewTask({ ...newTask, is_recurring: false })}
                                            />
                                            <Clock className="w-4 h-4" />
                                            Точные даты
                                        </label>
                                    </div>

                                    {newTask.is_recurring ? (
                                        <div className="bg-gray-50 dark:bg-gray-800/50 p-4 rounded-xl border border-gray-100 dark:border-gray-700/50">
                                            <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-4">Выберите дни недели:</p>
                                            <div className="flex flex-wrap gap-2">
                                                {daysOfWeek.map((day, index) => (
                                                    <button
                                                        key={index}
                                                        type="button"
                                                        onClick={() => toggleDay(index)}
                                                        className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium transition-all ${newTask.scheduled_days.includes(index)
                                                            ? 'bg-blue-600 text-white shadow-md shadow-blue-500/30 scale-105'
                                                            : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-600 hover:border-blue-400 hover:text-blue-500'
                                                            }`}
                                                    >
                                                        {day}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="bg-gray-50 dark:bg-gray-800/50 p-4 rounded-xl border border-gray-100 dark:border-gray-700/50">
                                            <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Выберите даты:</p>
                                            <div className="flex gap-2 mb-4">
                                                <input
                                                    type="date"
                                                    value={dateInput}
                                                    onChange={e => setDateInput(e.target.value)}
                                                    className="input py-2 px-3 text-sm flex-1"
                                                    min={new Date().toISOString().split('T')[0]}
                                                />
                                                <button
                                                    type="button"
                                                    onClick={addDate}
                                                    className="btn-secondary py-2 px-4 text-sm"
                                                >
                                                    Добавить
                                                </button>
                                            </div>
                                            <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto">
                                                {newTask.scheduled_dates.length === 0 && (
                                                    <span className="text-gray-400 text-sm italic py-2">Даты не выбраны</span>
                                                )}
                                                {newTask.scheduled_dates.map(date => (
                                                    <span key={date} className="bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 px-3 py-1.5 rounded-lg text-sm border border-gray-200 dark:border-gray-600 flex items-center gap-2 shadow-sm">
                                                        {new Date(date).toLocaleDateString()}
                                                        <button
                                                            type="button"
                                                            onClick={() => removeDate(date)}
                                                            className="text-gray-400 hover:text-red-500"
                                                        >
                                                            <X className="w-3.5 h-3.5" />
                                                        </button>
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="flex gap-3 pt-6 border-t border-gray-100 dark:border-gray-700">
                                <button type="button" onClick={() => setShowAddForm(false)} className="btn-ghost flex-1 py-2.5">
                                    Отмена
                                </button>
                                <button type="submit" className="btn-primary flex-1 py-2.5 shadow-lg shadow-primary-500/20">
                                    Сохранить задачу
                                </button>
                            </div>
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
}

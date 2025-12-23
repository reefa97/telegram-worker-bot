import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Plus, Trash2, Calendar, Star, X, CheckSquare } from 'lucide-react';

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
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error loading tasks:', error);
            alert('Ошибка загрузки задач');
        } else {
            // Parse schedule if needed (though Supabase returns JSON/Array correctly usually)
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
        if (!confirm('Удалить эту задачу?')) return;
        const { error } = await supabase.from('object_tasks').delete().eq('id', id);
        if (error) {
            console.error('Error deleting task:', error);
            alert('Ошибка удаления');
        } else {
            loadTasks();
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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 overflow-y-auto">
            <div className="bg-gray-800 rounded-lg max-w-4xl w-full my-8 max-h-[90vh] flex flex-col">
                <div className="p-6 border-b border-gray-700 flex justify-between items-center">
                    <h3 className="text-xl font-bold text-white">
                        Задачи: <span className="text-primary-400">{objectName}</span>
                    </h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-white">
                        <X className="w-6 h-6" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6">
                    {!showAddForm ? (
                        <>
                            <div className="flex justify-between items-center mb-6">
                                <p className="text-gray-300">Список задач для персонала</p>
                                <button
                                    onClick={() => setShowAddForm(true)}
                                    className="btn-primary flex items-center gap-2"
                                >
                                    <Plus className="w-4 h-4" /> Добавить задачу
                                </button>
                            </div>

                            {loading ? (
                                <div className="text-center py-8">Загрузка...</div>
                            ) : tasks.length === 0 ? (
                                <div className="text-center py-12 text-gray-400 bg-gray-700/30 rounded-lg">
                                    <CheckSquare className="w-12 h-12 mx-auto mb-4 opacity-50" />
                                    <p>Задач пока нет</p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {tasks.map(task => (
                                        <div key={task.id} className="bg-gray-700 rounded-lg p-4 flex items-start gap-4">
                                            <div className={`p-2 rounded-lg ${task.is_special_task ? 'bg-yellow-500/20 text-yellow-400' : 'bg-blue-500/20 text-blue-400'}`}>
                                                {task.is_special_task ? <Star className="w-5 h-5" /> : <CheckSquare className="w-5 h-5" />}
                                            </div>
                                            <div className="flex-1">
                                                <div className="flex items-start justify-between">
                                                    <div>
                                                        <h4 className="font-semibold text-white flex items-center gap-2">
                                                            {task.title}
                                                            {task.is_special_task && (
                                                                <span className="text-xs bg-yellow-400/10 text-yellow-400 px-2 py-0.5 rounded border border-yellow-400/20">
                                                                    Спец. услуга
                                                                </span>
                                                            )}
                                                        </h4>
                                                        {task.description && (
                                                            <p className="text-sm text-gray-300 mt-1">{task.description}</p>
                                                        )}
                                                    </div>
                                                    <button
                                                        onClick={() => handleDeleteTask(task.id)}
                                                        className="text-gray-400 hover:text-red-400 p-1"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>
                                                <div className="flex items-center gap-4 mt-3 text-sm text-gray-400">
                                                    <div className="flex items-center gap-1">
                                                        <Calendar className="w-3 h-3" />
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
                                <h4 className="text-lg font-semibold text-white">Новая задача</h4>
                                <button type="button" onClick={() => setShowAddForm(false)} className="text-sm text-gray-400 hover:text-white">
                                    Назад к списку
                                </button>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-300 mb-2">
                                            Название задачи (можно несколько, каждая с новой строки)
                                        </label>
                                        <textarea
                                            value={newTask.title}
                                            onChange={e => setNewTask({ ...newTask, title: e.target.value })}
                                            className="input"
                                            rows={5}
                                            placeholder={'Помыть окна\nПомыть полы\nВынести мусор'}
                                            required
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-300 mb-2">Описание</label>
                                        <textarea
                                            value={newTask.description}
                                            onChange={e => setNewTask({ ...newTask, description: e.target.value })}
                                            className="input"
                                            rows={3}
                                            placeholder="Дополнительные инструкции..."
                                        />
                                    </div>
                                    <label className="flex items-center gap-3 cursor-pointer p-3 bg-gray-700 rounded-lg border border-gray-600">
                                        <input
                                            type="checkbox"
                                            checked={newTask.is_special_task}
                                            onChange={e => setNewTask({ ...newTask, is_special_task: e.target.checked })}
                                            className="rounded border-gray-500 bg-gray-600 text-yellow-500 focus:ring-yellow-500"
                                        />
                                        <div>
                                            <span className="text-white font-medium flex items-center gap-2">
                                                <Star className="w-4 h-4 text-yellow-400" />
                                                Специальная услуга
                                            </span>
                                            <p className="text-xs text-gray-400 mt-1">
                                                Для спец. услуг приходят отдельные напоминания (вечером накануне и утром).
                                            </p>
                                        </div>
                                    </label>
                                </div>

                                <div className="space-y-4">
                                    <label className="block text-sm font-medium text-gray-300 mb-2">Расписание</label>

                                    <div className="flex gap-4 mb-4">
                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <input
                                                type="radio"
                                                checked={newTask.is_recurring}
                                                onChange={() => setNewTask({ ...newTask, is_recurring: true })}
                                                className="text-blue-500 bg-gray-700 border-gray-600"
                                            />
                                            <span className="text-white">По дням недели</span>
                                        </label>
                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <input
                                                type="radio"
                                                checked={!newTask.is_recurring}
                                                onChange={() => setNewTask({ ...newTask, is_recurring: false })}
                                                className="text-blue-500 bg-gray-700 border-gray-600"
                                            />
                                            <span className="text-white">По конкретным датам</span>
                                        </label>
                                    </div>

                                    {newTask.is_recurring ? (
                                        <div className="bg-gray-700 p-4 rounded-lg">
                                            <p className="text-sm text-gray-400 mb-3">Выберите дни недели:</p>
                                            <div className="flex flex-wrap gap-2">
                                                {daysOfWeek.map((day, index) => (
                                                    <button
                                                        key={index}
                                                        type="button"
                                                        onClick={() => toggleDay(index)}
                                                        className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${newTask.scheduled_days.includes(index)
                                                            ? 'bg-blue-600 text-white'
                                                            : 'bg-gray-600 text-gray-300 hover:bg-gray-500'
                                                            }`}
                                                    >
                                                        {day}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="bg-gray-700 p-4 rounded-lg">
                                            <p className="text-sm text-gray-400 mb-3">Выберите даты:</p>
                                            <div className="flex gap-2 mb-3">
                                                <input
                                                    type="date"
                                                    value={dateInput}
                                                    onChange={e => setDateInput(e.target.value)}
                                                    className="input py-1 px-2 text-sm"
                                                    min={new Date().toISOString().split('T')[0]}
                                                />
                                                <button
                                                    type="button"
                                                    onClick={addDate}
                                                    className="btn-primary py-1 px-3 text-sm"
                                                >
                                                    Добавить
                                                </button>
                                            </div>
                                            <div className="flex flex-wrap gap-2">
                                                {newTask.scheduled_dates.map(date => (
                                                    <span key={date} className="bg-gray-600 text-white px-2 py-1 rounded text-sm flex items-center gap-2">
                                                        {new Date(date).toLocaleDateString()}
                                                        <button
                                                            type="button"
                                                            onClick={() => removeDate(date)}
                                                            className="hover:text-red-400"
                                                        >
                                                            <X className="w-3 h-3" />
                                                        </button>
                                                    </span>
                                                ))}
                                                {newTask.scheduled_dates.length === 0 && (
                                                    <span className="text-gray-500 text-sm italic">Даты не выбраны</span>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="flex gap-3 pt-4 border-t border-gray-700">
                                <button type="submit" className="btn-primary flex-1">
                                    Сохранить задачу
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setShowAddForm(false)}
                                    className="btn-secondary flex-1"
                                >
                                    Отмена
                                </button>
                            </div>
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
}



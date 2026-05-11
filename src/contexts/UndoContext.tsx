import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react';

interface UndoAction {
    id: string;
    label: string;
    undo: () => Promise<void> | void;
    timestamp: number;
}

interface UndoContextType {
    pushUndo: (label: string, undoFn: () => Promise<void> | void) => void;
}

const UndoContext = createContext<UndoContextType>({ pushUndo: () => {} });

export function useUndo() {
    return useContext(UndoContext);
}

const TOAST_DURATION = 7000;

export function UndoProvider({ children }: { children: ReactNode }) {
    const [stack, setStack] = useState<UndoAction[]>([]);
    const [toast, setToast] = useState<UndoAction | null>(null);
    const [fading, setFading] = useState(false);
    const timerRef = useRef<ReturnType<typeof setTimeout>>();

    const pushUndo = useCallback((label: string, undoFn: () => Promise<void> | void) => {
        const action: UndoAction = {
            id: crypto.randomUUID(),
            label,
            undo: undoFn,
            timestamp: Date.now(),
        };
        setStack(prev => [...prev, action]);
        setToast(action);
        setFading(false);

        clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
            setFading(true);
            setTimeout(() => {
                setToast(prev => prev?.id === action.id ? null : prev);
                setFading(false);
            }, 300);
        }, TOAST_DURATION);
    }, []);

    const executeUndo = useCallback(async () => {
        const last = stack[stack.length - 1];
        if (!last) return;

        setStack(prev => prev.slice(0, -1));
        setToast(null);
        setFading(false);
        clearTimeout(timerRef.current);

        try {
            await last.undo();
        } catch (e) {
            console.error('Undo failed:', e);
        }
    }, [stack]);

    // Ctrl+Z / Cmd+Z handler
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
                // Don't intercept if user is typing in an input/textarea
                const tag = (e.target as HTMLElement)?.tagName;
                if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) return;

                if (stack.length > 0) {
                    e.preventDefault();
                    executeUndo();
                }
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [stack, executeUndo]);

    return (
        <UndoContext.Provider value={{ pushUndo }}>
            {children}
            {/* Undo Toast */}
            {toast && (
                <div
                    className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-3 px-4 py-3 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded-xl shadow-2xl transition-all duration-300 ${fading ? 'opacity-0 translate-y-2' : 'opacity-100 translate-y-0'}`}
                >
                    <span className="text-sm font-medium">{toast.label}</span>
                    <button
                        onClick={executeUndo}
                        className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors"
                    >
                        Отменить
                    </button>
                    <span className="text-xs text-gray-400 dark:text-gray-500">⌘Z</span>
                </div>
            )}
        </UndoContext.Provider>
    );
}

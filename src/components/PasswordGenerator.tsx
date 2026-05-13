import { useState } from 'react';
import { RefreshCw, Eye, EyeOff } from 'lucide-react';

function generate(length = 12): string {
    const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const lower = 'abcdefghjkmnpqrstuvwxyz';
    const digits = '23456789';
    const symbols = '!@#$%&*';
    const all = upper + lower + digits + symbols;

    // Ensure at least one of each type
    let pwd = [
        upper[Math.floor(Math.random() * upper.length)],
        lower[Math.floor(Math.random() * lower.length)],
        digits[Math.floor(Math.random() * digits.length)],
        symbols[Math.floor(Math.random() * symbols.length)],
    ];

    for (let i = pwd.length; i < length; i++) {
        pwd.push(all[Math.floor(Math.random() * all.length)]);
    }

    // Shuffle
    for (let i = pwd.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pwd[i], pwd[j]] = [pwd[j], pwd[i]];
    }

    return pwd.join('');
}

interface Props {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    required?: boolean;
    label?: string;
}

export default function PasswordGenerator({ value, onChange, placeholder, required, label }: Props) {
    const [visible, setVisible] = useState(false);

    return (
        <div>
            {label && (
                <label className="block text-sm font-medium text-main mb-1.5">
                    {label}
                </label>
            )}
            <div className="flex gap-1.5">
                <div className="relative flex-1">
                    <input
                        type={visible ? 'text' : 'password'}
                        value={value}
                        onChange={(e) => onChange(e.target.value)}
                        className="input font-mono text-sm pr-9"
                        placeholder={placeholder || '••••••'}
                        required={required}
                        minLength={6}
                    />
                    <button
                        type="button"
                        onClick={() => setVisible(!visible)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
                        title={visible ? 'Скрыть' : 'Показать'}
                    >
                        {visible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                </div>
                <button
                    type="button"
                    onClick={() => {
                        const pwd = generate();
                        onChange(pwd);
                        setVisible(true);
                    }}
                    className="px-3 py-2 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-300 rounded-lg border border-zinc-200 dark:border-zinc-700 transition-colors flex items-center gap-1.5 text-sm shrink-0"
                    title="Сгенерировать пароль"
                >
                    <RefreshCw className="w-4 h-4" />
                    <span className="hidden sm:inline">Генерировать</span>
                </button>
            </div>
        </div>
    );
}

/** @type {import('tailwindcss').Config} */
export default {
    darkMode: 'class',
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            fontFamily: {
                sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
                mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
            },
            colors: {
                // Neutrals (mapped to CSS variables)
                app:        'var(--bg-app)',
                background: 'var(--bg-app)',
                card:       'var(--bg-card)',
                surface:    'var(--bg-card)',
                subtle:     'var(--bg-subtle)',
                emphasis:   'var(--bg-emphasis)',
                main:       'var(--text-main)',
                muted:      'var(--text-muted)',
                faint:      'var(--text-faint)',
                border:     'var(--border-color)',

                // Brand accent
                primary: {
                    DEFAULT: 'var(--accent)',
                    hover:   'var(--accent-hover)',
                    soft:    'var(--accent-soft)',
                    50:  '#eff6ff',
                    100: '#dbeafe',
                    200: '#bfdbfe',
                    300: '#93c5fd',
                    400: '#60a5fa',
                    500: '#3b82f6',
                    600: '#2563eb',
                    700: '#1d4ed8',
                    800: '#1e40af',
                    900: '#1e3a8a',
                },

                // Semantic
                success: 'var(--success)',
                warning: 'var(--warning)',
                danger:  'var(--danger)',
            },
            borderRadius: {
                'sm':  '6px',
                DEFAULT: '8px',
                'md':  '8px',
                'lg':  '12px',
                'xl':  '16px',
            },
        },
    },
    plugins: [],
}

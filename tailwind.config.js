/** @type {import('tailwindcss').Config} */
export default {
    darkMode: 'class',
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                // Map to our CSS variables for consistency if needed in utility classes
                background: 'var(--bg-app)',
                surface: 'var(--bg-card)',
                primary: 'var(--primary)',
            }
        },
    },
    plugins: [],
}

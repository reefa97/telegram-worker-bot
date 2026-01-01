import React, { createContext, useContext } from 'react';

type Theme = 'dark';

interface ThemeContextType {
    theme: Theme;
    toggleTheme: () => void;
    setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
    // Theme is now handled purely by CSS variables in index.css
    // We keep the context API for compatibility but make it static

    // Force dark mode on mount
    React.useEffect(() => {
        document.documentElement.classList.add('dark');
        document.documentElement.style.backgroundColor = '#121212'; // fallback
    }, []);

    const toggleTheme = () => {
        // Force dark mode if somehow toggled
        document.documentElement.classList.add('dark');
    };
    const setTheme = () => {
        document.documentElement.classList.add('dark');
    };

    return (
        <ThemeContext.Provider value={{ theme: 'dark', toggleTheme, setTheme }}>
            {children}
        </ThemeContext.Provider>
    );
}

export function useTheme() {
    const context = useContext(ThemeContext);
    if (context === undefined) {
        throw new Error('useTheme must be used within a ThemeProvider');
    }
    return context;
}

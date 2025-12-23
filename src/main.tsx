import React, { Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import { isSupabaseConfigured } from './lib/supabase';

// Use Lazy loading to prevent App crash from breaking the error screen
const App = React.lazy(() => import('./App'));

if (!isSupabaseConfigured) {
    ReactDOM.createRoot(document.getElementById('root')!).render(
        <React.StrictMode>
            <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white p-4">
                <div className="max-w-md w-full bg-gray-800 rounded-lg shadow-xl p-6 border border-red-500/20">
                    <div className="flex items-center justify-center w-12 h-12 bg-red-900/30 rounded-full mb-4 mx-auto">
                        <svg className="w-6 h-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                    </div>
                    <h1 className="text-xl font-bold text-center mb-2">Настройка не завершена</h1>
                    <p className="text-gray-400 text-center text-sm mb-6">
                        Приложению не хватает переменных окружения для связи с базой данных.
                    </p>

                    <div className="bg-gray-900 rounded p-4 mb-4 text-xs font-mono overflow-x-auto text-gray-300 border border-gray-700">
                        <div className="mb-2 text-gray-500">Добавьте в Vercel Settings:</div>
                        <div className="mb-1"><span className="text-yellow-500">VITE_SUPABASE_URL</span>=...</div>
                        <div><span className="text-yellow-500">VITE_SUPABASE_ANON_KEY</span>=...</div>
                    </div>

                    <div className="text-center text-xs text-gray-500">
                        После сохранения настроек в Vercel, перейдите в <b>Deployments</b> и нажмите <b>Redeploy</b>.
                    </div>
                </div>
            </div>
        </React.StrictMode>,
    );
} else {
    ReactDOM.createRoot(document.getElementById('root')!).render(
        <React.StrictMode>
            <Suspense fallback={
                <div className="min-h-screen bg-gray-900 flex items-center justify-center">
                    <div className="text-white">Загрузка приложения...</div>
                </div>
            }>
                <App />
            </Suspense>
        </React.StrictMode>,
    );
}

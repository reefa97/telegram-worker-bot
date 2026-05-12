import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
    plugins: [react()],
    build: {
        chunkSizeWarningLimit: 1000,
        // Strip console.* in production builds to avoid leaking PII (emails, ids).
        // Errors still surface via thrown exceptions / ErrorBoundary.
        minify: 'esbuild',
        // esbuild drop_console equivalent:
        rollupOptions: {
            output: {
                // Pull heavy libs into their own chunks so the app shell stays small
                manualChunks: {
                    'vendor-pdf': ['jspdf', 'jspdf-autotable', 'html2canvas'],
                    'vendor-leaflet': ['leaflet', 'react-leaflet'],
                    'vendor-image': ['browser-image-compression'],
                },
            },
        },
    },
    esbuild: {
        // drop console.log/info/debug/warn in production; keep console.error
        drop: mode === 'production' ? ['debugger'] : [],
        pure: mode === 'production' ? ['console.log', 'console.info', 'console.debug', 'console.warn'] : [],
    },
}))

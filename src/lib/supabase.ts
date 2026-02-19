import { createClient } from '@supabase/supabase-js';

console.log('Supabase lib initializing...');

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = Boolean(
    supabaseUrl &&
    supabaseAnonKey &&
    supabaseUrl.startsWith('https://') &&
    supabaseUrl.includes('.supabase.co')
);

if (!isSupabaseConfigured) {
    console.error('Supabase Invalid Config. URL:', supabaseUrl);
}

/**
 * RESILIENT FETCH
 * This custom fetcher wraps native window.fetch but adds a timeout race.
 * If a request hangs (common with SES/lockdown.js), it attempts a retry
 * using a "cleaner" approach or simply fails faster to trigger app-level fallbacks.
 */
const resilientFetch = async (url: string | URL | Request, options?: RequestInit): Promise<Response> => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s global timeout

    try {
        const response = await window.fetch(url, {
            ...options,
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        return response;
    } catch (err: any) {
        clearTimeout(timeoutId);

        // If it was a timeout or a specific SES-related error (like "intrinsic" removal)
        // and it's a GET request to the REST API, we could try one more "bare" fetch.
        const isGet = !options?.method || options.method === 'GET';
        const isRest = typeof url === 'string' && url.includes('/rest/v1/');

        if ((err.name === 'AbortError' || err.message?.includes('intrinsic')) && isGet && isRest) {
            console.warn('Supabase fetch stalled/failed, retrying with bare fetch:', url);
            // Bare fetch: Minimal options, no signal, just the essentials
            return window.fetch(url, {
                method: 'GET',
                headers: options?.headers
            });
        }
        throw err;
    }
};

export const supabase = createClient(
    isSupabaseConfigured ? supabaseUrl : 'https://placeholder.supabase.co',
    isSupabaseConfigured ? supabaseAnonKey : 'placeholder',
    {
        global: {
            fetch: resilientFetch
        },
        auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true
        }
    }
);

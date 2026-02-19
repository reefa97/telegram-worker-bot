import { createClient } from '@supabase/supabase-js';
import { from as restFrom, rpc as restRpc } from './restClient';

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
 * Real Supabase client — used ONLY for auth, storage, and realtime.
 * Data queries (from/rpc) are routed through our REST client to bypass
 * SES/lockdown.js browser extension issues.
 */
const realSupabase = createClient(
    isSupabaseConfigured ? supabaseUrl : 'https://placeholder.supabase.co',
    isSupabaseConfigured ? supabaseAnonKey : 'placeholder',
    {
        auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true,
        }
    }
);

/**
 * Exported supabase client.
 * - .auth, .storage, .channel, .removeChannel → real supabase client
 * - .from() → REST-based query builder (bypasses supabase-js PostgREST)
 * - .rpc() → REST-based RPC call
 */
export const supabase = {
    auth: realSupabase.auth,
    storage: realSupabase.storage,
    functions: realSupabase.functions,
    channel: realSupabase.channel.bind(realSupabase),
    removeChannel: realSupabase.removeChannel.bind(realSupabase),
    removeAllChannels: realSupabase.removeAllChannels.bind(realSupabase),
    from: restFrom,
    rpc: restRpc,
    // Keep realtime access available
    realtime: realSupabase.realtime,
} as any; // 'as any' because this is not a full SupabaseClient, but components only use these methods

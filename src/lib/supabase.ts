import { createClient } from '@supabase/supabase-js';

// Create .env file in project root with:
// VITE_SUPABASE_URL=https://mxjfqszjpnlmagsikqfk.supabase.co
// VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im14amZxc3pqcG5sbWFnc2lrcWZrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQwNzk0NTMsImV4cCI6MjA3OTY1NTQ1M30.Um6doL5HLQ6WsmJ5uOLOViax8u1EH1YMZOUyblWipn0

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

// Fallback to avoid crash. If invalid, the App won't mount anyway due to main.tsx check.
export const supabase = createClient(
    isSupabaseConfigured ? supabaseUrl : 'https://placeholder.supabase.co',
    isSupabaseConfigured ? supabaseAnonKey : 'placeholder'
);

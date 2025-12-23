import { createClient } from '@supabase/supabase-js';

// Create .env file in project root with:
// VITE_SUPABASE_URL=https://mxjfqszjpnlmagsikqfk.supabase.co
// VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im14amZxc3pqcG5sbWFnc2lrcWZrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQwNzk0NTMsImV4cCI6MjA3OTY1NTQ1M30.Um6doL5HLQ6WsmJ5uOLOViax8u1EH1YMZOUyblWipn0

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

if (!isSupabaseConfigured) {
    console.error('Missing Supabase environment variables. Please check your .env file or Vercel configuration.');
}

// Fallback to avoid crash, but client will not work if keys are missing
export const supabase = createClient(
    supabaseUrl || 'https://placeholder.supabase.co',
    supabaseAnonKey || 'placeholder'
);

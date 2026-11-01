
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Database } from '../types/database.types';

// User-provided Supabase URL and Anon Key
export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
export const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

console.log('Supabase URL configured as:', supabaseUrl ? supabaseUrl : 'EMPTY');

if (!supabaseUrl || !supabaseAnonKey) {
    // This check is kept for robustness, although the values are hardcoded now.
    throw new Error("Supabase URL and Anon Key must be provided.");
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey) as SupabaseClient<Database> & { auth: any };

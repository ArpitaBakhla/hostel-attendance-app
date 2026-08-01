import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { isDemoMode } from '@/lib/store';

let supabase: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (isDemoMode()) return null;

  const url = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;

  if (!supabase) {
    supabase = createClient(url, anonKey);
  }

  return supabase;
}

export function isSupabaseConfigured(): boolean {
  return !isDemoMode();
}

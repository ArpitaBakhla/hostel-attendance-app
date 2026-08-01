import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { useDemoMode } from '@/lib/store';

let supabase: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (useDemoMode()) return null;

  if (!supabase) {
    supabase = createClient(
      import.meta.env.VITE_SUPABASE_URL,
      import.meta.env.VITE_SUPABASE_ANON_KEY,
    );
  }

  return supabase;
}

export function isSupabaseConfigured(): boolean {
  return !useDemoMode();
}

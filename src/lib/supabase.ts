import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export function isSupabaseConfigured(): boolean {
  return Boolean(url && anonKey && !url.includes('your-project'));
}

let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient {
  if (!isSupabaseConfigured()) {
    throw new Error(
      'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.',
    );
  }
  if (!client) {
    client = createClient(url!, anonKey!);
  }
  return client;
}

/** Invokes an edge function, surfacing its `error` payload as an exception. */
export async function callFunction<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase().functions.invoke(name, { body });

  if (error) {
    const context = (error as any).context;
    if (context && typeof context.json === 'function') {
      const payload = await context.json().catch(() => null);
      if (payload?.error) throw new Error(payload.error);
    } else if (context && typeof context === 'object' && context.error) {
       throw new Error(context.error);
    }
    throw error;
  }

  return data as T;
}

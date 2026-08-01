import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const createClient = vi.fn<(url: string, key: string) => { client: boolean }>(() => ({
  client: true,
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: (url: string, key: string) => createClient(url, key),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

function configure(url: string, key: string) {
  vi.stubEnv('VITE_SUPABASE_URL', url);
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', key);
  return import('@/lib/supabase');
}

describe('getSupabase', () => {
  it('returns null and creates no client in demo mode', async () => {
    const { getSupabase, isSupabaseConfigured } = await configure('', '');
    expect(getSupabase()).toBeNull();
    expect(isSupabaseConfigured()).toBe(false);

    expect(createClient).not.toHaveBeenCalled();
  });

  it('stays in demo mode for a placeholder project url', async () => {
    const { getSupabase } = await configure('https://your-project.supabase.co', 'anon-key');
    expect(getSupabase()).toBeNull();
  });

  it('creates the client once and reuses it when configured', async () => {
    const { getSupabase, isSupabaseConfigured } = await configure(
      'https://real.supabase.co',
      'anon-key',
    );

    const client = getSupabase();
    expect(client).not.toBeNull();
    expect(getSupabase()).toBe(client);
    expect(createClient).toHaveBeenCalledTimes(1);
    expect(createClient).toHaveBeenCalledWith('https://real.supabase.co', 'anon-key');
    expect(isSupabaseConfigured()).toBe(true);
  });
});

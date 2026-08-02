import { createClient, type SupabaseClient } from './deps.ts';

export function adminClient(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );
}

/** Resolves the caller from the request's Authorization header. */
export async function callerUserId(req: Request): Promise<string | null> {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '');
  if (!token) return null;

  const { data } = await adminClient().auth.getUser(token);
  return data.user?.id ?? null;
}

export interface Student {
  id: string;
  user_id: string | null;
  hostel_id: string;
  name: string;
  room_no: string;
  roll_number: string;
  email: string;
  secondary_email: string | null;
  registered_device_id: string | null;
  webauthn_credential_id: string | null;
  webauthn_public_key: string | null;
  webauthn_counter: number;
  phone_verified: boolean;
  override_count: number;
}

export interface HostelCenter {
  id: string;
  name: string;
  center_lat: number;
  center_lng: number;
  radius_meters: number;
  timezone: string;
}

export async function requireStudentForCaller(req: Request): Promise<Student> {
  const userId = await callerUserId(req);
  if (!userId) throw new Error('Not authenticated');

  const { data, error } = await adminClient()
    .from('students')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error('No student is linked to this account');
  return data as Student;
}

/** Resolves the caller's warden profile, throwing if they are not a warden. */
export async function requireWarden(req: Request): Promise<{ id: string; hostel_id: string }> {
  const userId = await callerUserId(req);
  if (!userId) throw new Error('Not authenticated');

  const { data, error } = await adminClient()
    .from('profiles')
    .select('id, hostel_id, role')
    .eq('id', userId)
    .maybeSingle();

  if (error) throw error;
  if (!data || !['warden', 'super_admin'].includes(data.role)) {
    throw new Error('Warden access required');
  }
  return { id: data.id, hostel_id: data.hostel_id };
}

export async function getHostel(hostelId: string): Promise<HostelCenter> {
  const { data, error } = await adminClient()
    .from('hostel_center')
    .select('*')
    .eq('id', hostelId)
    .single();

  if (error) throw error;
  return data as HostelCenter;
}

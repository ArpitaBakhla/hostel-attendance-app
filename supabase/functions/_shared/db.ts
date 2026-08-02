import { createClient, type SupabaseClient } from './deps.ts';
import { decryptField } from './crypto.ts';

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
  phone_number: string;
  secondary_contact_number: string | null;
  registered_device_id: string | null;
  webauthn_credential_id: string | null;
  webauthn_public_key: string | null;
  webauthn_counter: number;
  phone_verified: boolean;
  override_count: number;
  // Encrypted PII fields
  encrypted_phone: string | null;
  encrypted_name: string | null;
  encryption_key_id: string | null;
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

/**
 * Decrypt PII fields on a student record, falling back to plaintext if
 * no encrypted version exists (backward compatibility during migration).
 */
export async function decryptStudentPii(student: Student): Promise<Student> {
  const result = { ...student };

  try {
    if (student.encrypted_name) {
      result.name = await decryptField(student.encrypted_name);
    }
    if (student.encrypted_phone) {
      result.phone_number = await decryptField(student.encrypted_phone);
    }
  } catch (err) {
    // If decryption fails (key rotation, corruption), fall back to plaintext
    console.warn(`[db] PII decryption failed for student ${student.id}:`, err);
  }

  return result;
}

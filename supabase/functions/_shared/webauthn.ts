import { adminClient } from './db.ts';

export function rpConfig(): { rpID: string; origin: string } {
  const origin = Deno.env.get('WEBAUTHN_ORIGIN') ?? 'http://localhost:5173';
  const rpID = Deno.env.get('WEBAUTHN_RP_ID') ?? new URL(origin).hostname;
  return { rpID, origin };
}

const TTL_MS = 2 * 60 * 1000;

export async function storeChallenge(
  studentId: string,
  challenge: string,
  kind: 'registration' | 'authentication',
): Promise<void> {
  const { error } = await adminClient().from('webauthn_challenges').insert({
    student_id: studentId,
    challenge,
    kind,
    expires_at: new Date(Date.now() + TTL_MS).toISOString(),
  });
  if (error) throw error;
}

/** Returns the newest unconsumed challenge and marks it consumed. */
export async function takeChallenge(
  studentId: string,
  kind: 'registration' | 'authentication',
): Promise<string> {
  const db = adminClient();
  const { data, error } = await db
    .from('webauthn_challenges')
    .select('id, challenge, expires_at')
    .eq('student_id', studentId)
    .eq('kind', kind)
    .is('consumed_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error('No pending WebAuthn challenge. Start again.');

  await db
    .from('webauthn_challenges')
    .update({ consumed_at: new Date().toISOString() })
    .eq('id', data.id);

  if (new Date(data.expires_at).getTime() < Date.now()) {
    throw new Error('WebAuthn challenge expired. Start again.');
  }

  return data.challenge;
}

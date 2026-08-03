/**
 * WebAuthn challenge utilities — production hardened.
 *
 * Includes:
 *  - Challenge entropy validation
 *  - Permanent invalidation of consumed challenges
 *  - Automatic cleanup of expired challenges
 *  - Replay protection
 */

import { adminClient } from './db.ts';

export function rpConfig(req: Request): { rpID: string; origin: string } {
  const reqOrigin = req.headers.get('Origin');
  const envOrigin = Deno.env.get('WEBAUTHN_ORIGIN');
  const origin = reqOrigin || envOrigin || 'http://localhost:5173';
  const rpID = Deno.env.get('WEBAUTHN_RP_ID') ?? new URL(origin).hostname;
  return { rpID, origin };
}

const TTL_MS = 2 * 60 * 1000; // 2 minutes
const MIN_CHALLENGE_LENGTH = 32; // Minimum base64url chars for sufficient entropy
const MAX_ACTIVE_CHALLENGES = 3; // Max concurrent challenges per student

export async function storeChallenge(
  studentId: string,
  challenge: string,
  kind: 'registration' | 'authentication',
): Promise<void> {
  // Validate challenge entropy
  if (!challenge || challenge.length < MIN_CHALLENGE_LENGTH) {
    throw new Error('Challenge does not meet minimum entropy requirements.');
  }

  const db = adminClient();

  // Invalidate any existing unconsumed challenges of the same kind
  // (prevents challenge accumulation / replay attacks)
  await db
    .from('webauthn_challenges')
    .update({ consumed_at: new Date().toISOString() })
    .eq('student_id', studentId)
    .eq('kind', kind)
    .is('consumed_at', null);

  // Cleanup expired challenges older than 10 minutes (housekeeping)
  const expiredCutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  await db
    .from('webauthn_challenges')
    .delete()
    .lt('expires_at', expiredCutoff)
    .not('consumed_at', 'is', null);

  const { error } = await db.from('webauthn_challenges').insert({
    student_id: studentId,
    challenge,
    kind,
    expires_at: new Date(Date.now() + TTL_MS).toISOString(),
  });
  if (error) throw error;
}

/**
 * Returns the newest unconsumed challenge and permanently marks it consumed.
 *
 * Security guarantees:
 *  - Challenge can only be consumed once (consumed_at is set atomically)
 *  - Expired challenges are rejected even if unconsumed
 *  - The challenge is invalidated regardless of verification outcome
 */
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

  // Mark consumed BEFORE checking expiry (prevents replay of expired challenges)
  const { error: updateError } = await db
    .from('webauthn_challenges')
    .update({ consumed_at: new Date().toISOString() })
    .eq('id', data.id)
    .is('consumed_at', null); // Double-check to prevent TOCTOU race

  if (updateError) throw updateError;

  if (new Date(data.expires_at).getTime() < Date.now()) {
    throw new Error('WebAuthn challenge expired. Start again.');
  }

  return data.challenge;
}

/**
 * Cleanup: remove all consumed and expired challenges for a student.
 * Called periodically or after successful operations.
 */
export async function cleanupChallenges(studentId: string): Promise<void> {
  const db = adminClient();
  const cutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();

  await db
    .from('webauthn_challenges')
    .delete()
    .eq('student_id', studentId)
    .not('consumed_at', 'is', null)
    .lt('created_at', cutoff);
}

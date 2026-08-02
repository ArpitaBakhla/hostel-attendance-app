import { adminClient, type Student } from './db.ts';

export type OtpPurpose =
  | 'registration'
  | 'login'
  | 'tier1_self_report'
  | 'tier2_secondary_contact'
  | 'device_change';

const TTL_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 5;

async function hashCode(code: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(code));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * The destination is derived from the purpose, never supplied by the caller:
 * everything except an explicit tier-2 fallback goes to the primary number, so
 * no third party can have a code delivered to themselves.
 */
export function destinationFor(student: Student, purpose: OtpPurpose): string {
  if (purpose === 'tier2_secondary_contact') {
    if (!student.secondary_email) {
      throw new Error('No secondary email is registered for this student.');
    }
    return student.secondary_email;
  }
  return student.email;
}

export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return email;
  const maskedLocal = local.length > 2 ? `${local.slice(0, 2)}***` : `${local.slice(0, 1)}***`;
  return `${maskedLocal}@${domain}`;
}

export async function issueOtp(
  student: Student,
  purpose: OtpPurpose,
): Promise<{ id: string; sentTo: string; code: string }> {
  const sentTo = destinationFor(student, purpose);
  const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, '0');

  const db = adminClient();
  await db
    .from('otp_challenges')
    .update({ consumed_at: new Date().toISOString() })
    .eq('student_id', student.id)
    .eq('purpose', purpose)
    .is('consumed_at', null);

  const { data, error } = await db
    .from('otp_challenges')
    .insert({
      student_id: student.id,
      purpose,
      sent_to: sentTo,
      code_hash: await hashCode(code),
      expires_at: new Date(Date.now() + TTL_MS).toISOString(),
    })
    .select('id')
    .single();

  if (error) throw error;
  return { id: data.id, sentTo, code };
}

export interface OtpVerification {
  ok: boolean;
  message: string;
  studentId?: string;
  purpose?: OtpPurpose;
  sentTo?: string;
}

export async function consumeOtp(challengeId: string, code: string): Promise<OtpVerification> {
  const db = adminClient();
  const { data: challenge, error } = await db
    .from('otp_challenges')
    .select('*')
    .eq('id', challengeId)
    .maybeSingle();

  if (error) throw error;
  if (!challenge || challenge.consumed_at) {
    return { ok: false, message: 'This code is no longer valid. Request a new one.' };
  }
  if (new Date(challenge.expires_at).getTime() < Date.now()) {
    return { ok: false, message: 'Code expired. Request a new one.' };
  }
  if (challenge.attempts >= MAX_ATTEMPTS) {
    return { ok: false, message: 'Too many attempts. Request a new code.' };
  }
  if (challenge.code_hash !== (await hashCode(code.trim()))) {
    await db
      .from('otp_challenges')
      .update({ attempts: challenge.attempts + 1 })
      .eq('id', challengeId);
    return { ok: false, message: 'Incorrect code.' };
  }

  await db
    .from('otp_challenges')
    .update({ consumed_at: new Date().toISOString() })
    .eq('id', challengeId);

  return {
    ok: true,
    message: 'Verified.',
    studentId: challenge.student_id,
    purpose: challenge.purpose,
    sentTo: challenge.sent_to,
  };
}

/** Demo projects expose the code to the client so the flow can be exercised. */
export function shouldEchoCode(): boolean {
  return Deno.env.get('OTP_ECHO') === 'true';
}

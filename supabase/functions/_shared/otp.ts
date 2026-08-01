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
    if (!student.secondary_contact_number) {
      throw new Error('No secondary contact number is registered for this student.');
    }
    return student.secondary_contact_number;
  }
  return student.phone_number;
}

export function maskNumber(phone: string): string {
  return phone.length > 4 ? `${'•'.repeat(phone.length - 4)}${phone.slice(-4)}` : phone;
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
  await deliverSms(sentTo, `NightCheck code: ${code}. Valid for 5 minutes.`);
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

/**
 * Sends the SMS through the configured provider. With no provider configured
 * the code is logged instead, which keeps the flow usable in a demo project.
 */
async function deliverSms(to: string, body: string): Promise<void> {
  const sid = Deno.env.get('TWILIO_ACCOUNT_SID');
  const token = Deno.env.get('TWILIO_AUTH_TOKEN');
  const from = Deno.env.get('TWILIO_FROM_NUMBER');

  if (!sid || !token || !from) {
    console.log(`[otp] no SMS provider configured; would send to ${maskNumber(to)}: ${body}`);
    return;
  }

  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${btoa(`${sid}:${token}`)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ To: to, From: from, Body: body }),
  });

  if (!response.ok) {
    throw new Error(`SMS delivery failed: ${await response.text()}`);
  }
}

/** Demo projects expose the code to the client so the flow can be exercised. */
export function shouldEchoCode(): boolean {
  return Deno.env.get('OTP_ECHO') === 'true';
}

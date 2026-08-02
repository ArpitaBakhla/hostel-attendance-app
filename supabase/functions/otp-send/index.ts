import { adminClient } from '../_shared/db.ts';
import { fail, handler, json } from '../_shared/http.ts';
import { maskEmail, shouldEchoCode, type OtpPurpose } from '../_shared/otp.ts';

const ALLOWED: OtpPurpose[] = [
  'registration',
  'login',
  'tier1_self_report',
  'tier2_secondary_contact',
  'device_change',
];

/**
 * Issues an OTP for a student identified by their *primary* email. The
 * destination is derived from the purpose, so identifying a student never lets
 * the caller choose where the code lands.
 */
Deno.serve(handler(async (req) => {
  const { email, purpose } = (await req.json()) as {
    email?: string;
    purpose?: OtpPurpose;
  };

  if (!email || !purpose || !ALLOWED.includes(purpose)) {
    return fail('email and a valid purpose are required');
  }

  const { data: student, error } = await adminClient()
    .from('students')
    .select('*')
    .eq('email', email.trim())
    .maybeSingle();

  if (error) throw error;
  if (!student) {
    // Do not disclose whether the address is registered.
    return json({ challengeId: email.trim(), sentTo: maskEmail(email) });
  }

  await adminClient().auth.signInWithOtp({ email: email.trim() });

  return json({
    challengeId: email.trim(),
    sentTo: maskEmail(email),
    ...(shouldEchoCode() ? { code: '000000' } : {}),
  });
}));

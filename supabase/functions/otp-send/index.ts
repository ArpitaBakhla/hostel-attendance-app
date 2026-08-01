import { adminClient } from '../_shared/db.ts';
import { fail, handler, json } from '../_shared/http.ts';
import { issueOtp, maskNumber, shouldEchoCode, type OtpPurpose } from '../_shared/otp.ts';

const ALLOWED: OtpPurpose[] = [
  'registration',
  'login',
  'tier1_self_report',
  'tier2_secondary_contact',
  'device_change',
];

/**
 * Issues an OTP for a student identified by their *primary* number. The
 * destination is derived from the purpose, so identifying a student never lets
 * the caller choose where the code lands.
 */
Deno.serve(handler(async (req) => {
  const { phoneNumber, purpose } = (await req.json()) as {
    phoneNumber?: string;
    purpose?: OtpPurpose;
  };

  if (!phoneNumber || !purpose || !ALLOWED.includes(purpose)) {
    return fail('phoneNumber and a valid purpose are required');
  }

  const { data: student, error } = await adminClient()
    .from('students')
    .select('*')
    .eq('phone_number', phoneNumber.trim())
    .maybeSingle();

  if (error) throw error;
  if (!student) {
    // Do not disclose whether the number is registered.
    return json({ sentTo: maskNumber(phoneNumber) });
  }

  const challenge = await issueOtp(student, purpose);
  return json({
    challengeId: challenge.id,
    sentTo: maskNumber(challenge.sentTo),
    ...(shouldEchoCode() ? { code: challenge.code } : {}),
  });
}));

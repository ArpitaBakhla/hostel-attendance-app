import { adminClient } from '../_shared/db.ts';
import { fail, handler, json } from '../_shared/http.ts';
import { consumeOtp } from '../_shared/otp.ts';

/**
 * Requests a device replacement. The request is only ever queued — approval by
 * a warden is what clears the old binding, so a student can never self-register
 * a new device. Callable unauthenticated because the student may be locked out
 * of their old device (and therefore their session).
 */
Deno.serve(handler(async (req) => {
  const { challengeId, code, newDeviceId, reason } = (await req.json()) as {
    challengeId?: string;
    code?: string;
    newDeviceId?: string;
    reason?: string;
  };

  if (!challengeId || !code || !newDeviceId || !reason?.trim()) {
    return fail('challengeId, code, newDeviceId and reason are required');
  }

  const result = await consumeOtp(challengeId, code);
  if (!result.ok) return fail(result.message, 401);
  if (result.purpose !== 'device_change' && result.purpose !== 'tier2_secondary_contact') {
    return fail('This code was not issued for a device change.', 400);
  }

  const db = adminClient();
  const { data: student, error } = await db
    .from('students')
    .select('id, hostel_id, registered_device_id')
    .eq('id', result.studentId!)
    .single();
  if (error) throw error;

  const { data: request, error: insertError } = await db
    .from('device_change_requests')
    .insert({
      student_id: student.id,
      hostel_id: student.hostel_id,
      otp_verified: true,
      otp_sent_to: result.sentTo,
      old_device_id: student.registered_device_id,
      new_device_id: newDeviceId,
      reason: reason.trim(),
    })
    .select('id')
    .single();
  if (insertError) throw insertError;

  return json({
    requestId: request.id,
    message: 'Request submitted. Your warden must approve it before you can enroll this device.',
  });
}));

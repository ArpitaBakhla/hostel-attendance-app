import { adminClient } from '../_shared/db.ts';
import { fail, handler, json } from '../_shared/http.ts';
import { consumeOtp } from '../_shared/otp.ts';

/** Students have no inbox; the synthetic address only backs the auth user. */
function studentEmail(studentId: string): string {
  return `student+${studentId}@nightcheck.invalid`;
}

/**
 * Verifies a registration/login OTP. On success the student's phone is marked
 * verified and a one-time token is returned that the client exchanges for a
 * Supabase session via `auth.verifyOtp({ token_hash, type: 'email' })`.
 */
Deno.serve(handler(async (req) => {
  const { challengeId, code } = (await req.json()) as { challengeId?: string; code?: string };
  if (!challengeId || !code) return fail('challengeId and code are required');

  const result = await consumeOtp(challengeId, code);
  if (!result.ok) return fail(result.message, 401);
  if (result.purpose !== 'registration' && result.purpose !== 'login') {
    return fail('This code is not valid for sign-in.', 400);
  }

  const db = adminClient();
  const { data: student, error } = await db
    .from('students')
    .select('*')
    .eq('id', result.studentId!)
    .single();
  if (error) throw error;

  if (!student.phone_verified) {
    await db.from('students').update({ phone_verified: true }).eq('id', student.id);
  }

  let userId = student.user_id;
  if (!userId) {
    const { data: created, error: createError } = await db.auth.admin.createUser({
      email: studentEmail(student.id),
      email_confirm: true,
      user_metadata: { student_id: student.id, role: 'student' },
    });
    if (createError) throw createError;

    userId = created.user.id;
    await db.from('students').update({ user_id: userId }).eq('id', student.id);
    await db.from('profiles').insert({
      id: userId,
      hostel_id: student.hostel_id,
      role: 'student',
      full_name: student.name,
      phone: student.phone_number,
    });
  }

  const { data: link, error: linkError } = await db.auth.admin.generateLink({
    type: 'magiclink',
    email: studentEmail(student.id),
  });
  if (linkError) throw linkError;

  return json({
    tokenHash: link.properties.hashed_token,
    student: { id: student.id, name: student.name, hostelId: student.hostel_id },
  });
}));

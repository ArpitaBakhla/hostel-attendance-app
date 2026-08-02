import { adminClient } from '../_shared/db.ts';
import { fail, handler, json } from '../_shared/http.ts';

/**
 * Verifies a registration/login OTP using Supabase Auth's built-in email OTP
 * support and returns the resulting auth session tokens for the client.
 */
Deno.serve(handler(async (req) => {
  const { email, code } = (await req.json()) as { email?: string; code?: string };
  if (!email || !code) return fail('email and code are required');

  const db = adminClient();
  const { data: student, error } = await db
    .from('students')
    .select('*')
    .eq('email', email.trim())
    .maybeSingle();
  if (error) throw error;
  if (!student) return fail('No matching student found for that email.', 404);

  const { data: verified, error: verifyError } = await db.auth.verifyOtp({
    email: email.trim(),
    token: code.trim(),
    type: 'email',
  });

  if (verifyError) throw verifyError;
  if (!verified.session?.access_token || !verified.session?.refresh_token) {
    return fail('Email verification did not produce a session.', 400);
  }

  if (!student.phone_verified) {
    await db.from('students').update({ phone_verified: true }).eq('id', student.id);
  }

  let userId = student.user_id;
  if (!userId) {
    const { data: created, error: createError } = await db.auth.admin.createUser({
      email: email.trim(),
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
      email: student.email,
    });
  }

  return json({
    accessToken: verified.session.access_token,
    refreshToken: verified.session.refresh_token,
    student: { id: student.id, name: student.name, hostelId: student.hostel_id },
  });
}));

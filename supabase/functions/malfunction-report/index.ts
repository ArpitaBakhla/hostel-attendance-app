import { adminClient, getHostel, requireStudentForCaller } from '../_shared/db.ts';
import { fail, handler, json } from '../_shared/http.ts';
import { localDate } from '../_shared/attendance.ts';
import { consumeOtp } from '../_shared/otp.ts';

/**
 * Three-tier device malfunction fallback.
 *
 *  tier1 — device semi-works: the student self-reports with an OTP that was
 *          sent to their primary number only.
 *  tier2 — device dead or lost: OTP to the pre-registered secondary contact.
 *  tier3 — the student cannot reach the warden: a floor-mate may only *inform*
 *          the warden. No OTP, no attendance effect — the warden must verify
 *          the student physically and then use Mark Present.
 *
 * No tier marks attendance by itself: reports land in the warden queue.
 */
Deno.serve(handler(async (req) => {
  const body = (await req.json()) as {
    tier?: 'tier1' | 'tier2' | 'tier3';
    reason?: string;
    challengeId?: string;
    code?: string;
    studentRollNumber?: string;
  };

  if (!body.tier || !body.reason?.trim()) return fail('tier and reason are required');
  const db = adminClient();

  if (body.tier === 'tier3') {
    // The reporter must be a signed-in student of the same hostel; they are
    // recorded as the informant, never as evidence of presence.
    const reporter = await requireStudentForCaller(req);
    if (!body.studentRollNumber) return fail('studentRollNumber is required for a tier 3 report');

    const { data: subject, error } = await db
      .from('students')
      .select('id, hostel_id')
      .eq('hostel_id', reporter.hostel_id)
      .eq('roll_number', body.studentRollNumber.trim())
      .maybeSingle();
    if (error) throw error;
    if (!subject) return fail('No student in your hostel has that roll number.', 404);
    if (subject.id === reporter.id) return fail('Use a tier 1 or tier 2 report for yourself.');

    const hostel = await getHostel(subject.hostel_id);
    const { error: insertError } = await db.from('malfunction_reports').insert({
      student_id: subject.id,
      hostel_id: subject.hostel_id,
      report_date: localDate(hostel.timezone),
      tier: 'tier3',
      reason: body.reason.trim(),
      reported_by_student_id: reporter.id,
    });
    if (insertError) throw insertError;

    return json({
      queued: true,
      message:
        'The warden has been informed. They must verify the student in person before anything is marked.',
    });
  }

  if (!body.challengeId || !body.code) {
    return fail('challengeId and code are required for tier 1 and tier 2 reports');
  }

  const expectedPurpose =
    body.tier === 'tier1' ? 'tier1_self_report' : 'tier2_secondary_contact';

  const result = await consumeOtp(body.challengeId, body.code);
  if (!result.ok) return fail(result.message, 401);
  if (result.purpose !== expectedPurpose) {
    return fail('This code was not issued for that kind of report.', 400);
  }

  const { data: student, error } = await db
    .from('students')
    .select('id, hostel_id')
    .eq('id', result.studentId!)
    .single();
  if (error) throw error;

  const hostel = await getHostel(student.hostel_id);
  const { error: insertError } = await db.from('malfunction_reports').insert({
    student_id: student.id,
    hostel_id: student.hostel_id,
    report_date: localDate(hostel.timezone),
    tier: body.tier,
    reason: body.reason.trim(),
    otp_verified: true,
    otp_sent_to: result.sentTo,
  });
  if (insertError) throw insertError;

  return json({
    queued: true,
    message: 'Reported. Your warden will confirm your attendance for tonight.',
  });
}));

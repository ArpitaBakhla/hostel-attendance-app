import { adminClient, getHostel, requireWarden } from '../_shared/db.ts';
import { fail, handler, json, checkRateLimit, getClientIp } from '../_shared/http.ts';
import { localDate } from '../_shared/attendance.ts';
import { encryptField } from '../_shared/crypto.ts';

function datesBetween(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  const current = new Date(`${startDate}T12:00:00Z`);
  const end = new Date(`${endDate}T12:00:00Z`);

  while (current <= end) {
    dates.push(current.toISOString().slice(0, 10));
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return dates;
}

/**
 * Checks if encryption is configured (graceful fallback if not).
 */
function isEncryptionEnabled(): boolean {
  const key = Deno.env.get('ENCRYPTION_MASTER_KEY');
  return Boolean(key && key.length === 64);
}

/** All warden-only mutations. */
Deno.serve(handler(async (req) => {
  const warden = await requireWarden(req);
  const db = adminClient();
  const clientIp = getClientIp(req);
  const body = (await req.json()) as {
    action?: string;
    studentId?: string;
    date?: string;
    reason?: string;
    requestId?: string;
    decision?: 'approved' | 'rejected';
  };

  // Rate limiting for warden actions: 30 actions per minute
  if (!checkRateLimit(`warden:${warden.id}`, 30, 60_000)) {
    return fail('Too many requests. Please wait.', 429);
  }

  switch (body.action) {
    /**
     * Usable at any time (in-person cases outside the check-in window).
     * Requires a reason and is always attributed to the deciding warden.
     */
    case 'mark-present': {
      if (!body.studentId) return fail('studentId is required');
      if (!body.reason?.trim()) return fail('A reason is required for a manual override.');

      const { data: student, error } = await db
        .from('students')
        .select('id, hostel_id, override_count')
        .eq('id', body.studentId)
        .eq('hostel_id', warden.hostel_id)
        .maybeSingle();
      if (error) throw error;
      if (!student) return fail('Student not found in your hostel.', 404);

      const hostel = await getHostel(student.hostel_id);
      const date = body.date ?? localDate(hostel.timezone);

      const { error: logError } = await db.from('attendance_logs').upsert(
        {
          student_id: student.id,
          hostel_id: student.hostel_id,
          log_date: date,
          timestamp: new Date().toISOString(),
          status: 'manual_override',
          fail_reason: body.reason.trim(),
          marked_by: warden.id,
        },
        { onConflict: 'student_id,log_date' },
      );
      if (logError) throw logError;

      // Frequent overrides are surfaced for review by the dashboard.
      await db
        .from('students')
        .update({ override_count: student.override_count + 1 })
        .eq('id', student.id);

      console.log(`[warden] MARK-PRESENT student=${body.studentId} by=${warden.id} ip=${clientIp}`);
      return json({ marked: true, overrideCount: student.override_count + 1 });
    }

    case 'mark-absent': {
      if (!body.studentId) return fail('studentId is required');

      const { data: student, error } = await db
        .from('students')
        .select('id, hostel_id')
        .eq('id', body.studentId)
        .eq('hostel_id', warden.hostel_id)
        .maybeSingle();
      if (error) throw error;
      if (!student) return fail('Student not found in your hostel.', 404);

      const hostel = await getHostel(student.hostel_id);
      const date = body.date ?? localDate(hostel.timezone);

      const { error: logError } = await db.from('attendance_logs').upsert(
        {
          student_id: student.id,
          hostel_id: student.hostel_id,
          log_date: date,
          timestamp: new Date().toISOString(),
          status: 'absent',
          fail_reason: body.reason?.trim() || null,
          marked_by: warden.id,
        },
        { onConflict: 'student_id,log_date' },
      );
      if (logError) throw logError;

      console.log(`[warden] MARK-ABSENT student=${body.studentId} by=${warden.id} ip=${clientIp}`);
      return json({ marked: true });
    }

    case 'mark-late': {
      if (!body.studentId) return fail('studentId is required');

      const { data: student, error } = await db
        .from('students')
        .select('id, hostel_id, override_count')
        .eq('id', body.studentId)
        .eq('hostel_id', warden.hostel_id)
        .maybeSingle();
      if (error) throw error;
      if (!student) return fail('Student not found in your hostel.', 404);

      const hostel = await getHostel(student.hostel_id);
      const date = body.date ?? localDate(hostel.timezone);

      const { error: logError } = await db.from('attendance_logs').upsert(
        {
          student_id: student.id,
          hostel_id: student.hostel_id,
          log_date: date,
          timestamp: new Date().toISOString(),
          status: 'late',
          fail_reason: body.reason?.trim() || null,
          marked_by: warden.id,
        },
        { onConflict: 'student_id,log_date' },
      );
      if (logError) throw logError;

      // Frequent overrides/lates might be surfaced, we can increment override_count if we want, but late is typical
      console.log(`[warden] MARK-LATE student=${body.studentId} by=${warden.id} ip=${clientIp}`);
      return json({ marked: true });
    }

    case 'mark-all-present':
    case 'mark-all-absent': {
      const hostel = await getHostel(warden.hostel_id);
      const date = body.date ?? localDate(hostel.timezone);
      const targetStatus = body.action === 'mark-all-present' ? 'manual_override' : 'absent';

      // Get all students for this hostel
      const { data: students, error: studentsError } = await db
        .from('students')
        .select('id')
        .eq('hostel_id', warden.hostel_id);
      if (studentsError) throw studentsError;

      // Get existing attendance logs for today
      const { data: logs, error: logsError } = await db
        .from('attendance_logs')
        .select('student_id')
        .eq('hostel_id', warden.hostel_id)
        .eq('log_date', date);
      if (logsError) throw logsError;

      const checkedInStudentIds = new Set((logs || []).map(l => l.student_id));
      const studentsToMark = (students || []).filter(s => !checkedInStudentIds.has(s.id));

      if (studentsToMark.length > 0) {
        const rows = studentsToMark.map(s => ({
          student_id: s.id,
          hostel_id: warden.hostel_id,
          log_date: date,
          timestamp: new Date().toISOString(),
          status: targetStatus,
          fail_reason: body.reason?.trim() || 'Bulk Action',
          marked_by: warden.id,
        }));

        const { error: upsertError } = await db
          .from('attendance_logs')
          .upsert(rows, { onConflict: 'student_id,log_date' });
        if (upsertError) throw upsertError;
      }

      console.log(`[warden] ${body.action.toUpperCase()} count=${studentsToMark.length} by=${warden.id} ip=${clientIp}`);
      return json({ markedCount: studentsToMark.length });
    }

    case 'review-malfunction': {
      if (!body.requestId || !body.decision) return fail('requestId and decision are required');

      const { error } = await db
        .from('malfunction_reports')
        .update({
          status: body.decision,
          warden_id: warden.id,
          decided_at: new Date().toISOString(),
        })
        .eq('id', body.requestId)
        .eq('hostel_id', warden.hostel_id);
      if (error) throw error;

      // Resolving a report never marks attendance on its own — the warden must
      // physically verify the student and use mark-present.
      console.log(`[warden] REVIEW-MALFUNCTION req=${body.requestId} decision=${body.decision} by=${warden.id}`);
      return json({ reviewed: true });
    }

    case 'review-device-change': {
      if (!body.requestId || !body.decision) return fail('requestId and decision are required');

      const { data: request, error } = await db
        .from('device_change_requests')
        .select('*')
        .eq('id', body.requestId)
        .eq('hostel_id', warden.hostel_id)
        .maybeSingle();
      if (error) throw error;
      if (!request) return fail('Request not found.', 404);

      await db
        .from('device_change_requests')
        .update({
          status: body.decision,
          warden_id: warden.id,
          decided_at: new Date().toISOString(),
        })
        .eq('id', request.id);

      if (body.decision === 'approved') {
        // Clearing the binding lets the student enroll once on the new device.
        await db
          .from('students')
          .update({
            registered_device_id: null,
            webauthn_credential_id: null,
            webauthn_public_key: null,
            webauthn_counter: 0,
          })
          .eq('id', request.student_id);
      }

      console.log(`[warden] REVIEW-DEVICE-CHANGE req=${body.requestId} decision=${body.decision} by=${warden.id}`);
      return json({ reviewed: true });
    }

    /**
     * Only this decision puts a student on leave. Approval backfills every
     * night in the range — including past nights already logged as `failed`,
     * which is the retroactive-emergency case — but never overwrites a night
     * the student actually checked in for.
     */
    case 'review-leave': {
      if (!body.requestId || !body.decision) return fail('requestId and decision are required');

      const { data: leave, error } = await db
        .from('leave_requests')
        .select('*')
        .eq('id', body.requestId)
        .eq('hostel_id', warden.hostel_id)
        .maybeSingle();
      if (error) throw error;
      if (!leave) return fail('Leave request not found.', 404);

      await db
        .from('leave_requests')
        .update({
          status: body.decision,
          warden_id: warden.id,
          decided_at: new Date().toISOString(),
        })
        .eq('id', leave.id);

      if (body.decision === 'approved') {
        const dates = datesBetween(leave.start_date, leave.end_date);
        const { data: existing } = await db
          .from('attendance_logs')
          .select('log_date, status')
          .eq('student_id', leave.student_id)
          .in('log_date', dates);

        const checkedIn = new Set(
          (existing ?? []).filter((log) => log.status === 'success').map((log) => log.log_date),
        );

        const rows = dates
          .filter((date) => !checkedIn.has(date))
          .map((date) => ({
            student_id: leave.student_id,
            hostel_id: leave.hostel_id,
            log_date: date,
            timestamp: new Date().toISOString(),
            status: 'on_leave' as const,
            fail_reason: null,
            marked_by: warden.id,
          }));

        if (rows.length > 0) {
          const { error: upsertError } = await db
            .from('attendance_logs')
            .upsert(rows, { onConflict: 'student_id,log_date' });
          if (upsertError) throw upsertError;
        }
      }

      console.log(`[warden] REVIEW-LEAVE req=${body.requestId} decision=${body.decision} by=${warden.id}`);
      return json({ reviewed: true });
    }

    case 'add-student': {
      const input = body as unknown as {
        name?: string;
        rollNumber?: string;
        roomNo?: string;
        phoneNumber?: string;
        email?: string;
        secondaryContactNumber?: string;
      };
      if (!input.name || !input.rollNumber || !input.roomNo || !input.phoneNumber) {
        return fail('name, rollNumber, roomNo and phoneNumber are required');
      }

      // Encrypt PII fields if encryption is configured
      let encryptedPhone: string | null = null;
      let encryptedName: string | null = null;

      if (isEncryptionEnabled()) {
        try {
          encryptedPhone = await encryptField(input.phoneNumber.trim());
          encryptedName = await encryptField(input.name.trim());
        } catch (err) {
          console.warn('[warden] PII encryption failed, storing plaintext:', err);
        }
      }

      const { data, error } = await db
        .from('students')
        .insert({
          hostel_id: warden.hostel_id,
          name: input.name.trim(),
          roll_number: input.rollNumber.trim(),
          room_no: input.roomNo.trim(),
          phone_number: input.phoneNumber.trim(),
          email: input.email?.trim() || null,
          secondary_contact_number: input.secondaryContactNumber?.trim() || null,
          onboarded_by: warden.id,
          encrypted_phone: encryptedPhone,
          encrypted_name: encryptedName,
          encryption_key_id: isEncryptionEnabled() ? 'v1' : null,
        })
        .select('id')
        .single();

      if (error) {
        return fail(
          error.code === '23505'
            ? 'A student with that roll number or phone number already exists.'
            : error.message,
        );
      }
      console.log(`[warden] ADD-STUDENT id=${data.id} by=${warden.id} ip=${clientIp}`);
      return json({ studentId: data.id });
    }

    default:
      return fail(`Unknown action: ${body.action}`);
  }
}));

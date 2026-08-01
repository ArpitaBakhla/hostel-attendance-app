import { adminClient, getHostel, requireWarden } from '../_shared/db.ts';
import { fail, handler, json } from '../_shared/http.ts';
import { localDate } from '../_shared/attendance.ts';

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

/** All warden-only mutations. */
Deno.serve(handler(async (req) => {
  const warden = await requireWarden(req);
  const db = adminClient();
  const body = (await req.json()) as {
    action?: string;
    studentId?: string;
    date?: string;
    reason?: string;
    requestId?: string;
    decision?: 'approved' | 'rejected';
  };

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

      return json({ marked: true, overrideCount: student.override_count + 1 });
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

      return json({ reviewed: true });
    }

    case 'add-student': {
      const input = body as unknown as {
        name?: string;
        rollNumber?: string;
        roomNo?: string;
        phoneNumber?: string;
        secondaryContactNumber?: string;
      };
      if (!input.name || !input.rollNumber || !input.roomNo || !input.phoneNumber) {
        return fail('name, rollNumber, roomNo and phoneNumber are required');
      }

      const { data, error } = await db
        .from('students')
        .insert({
          hostel_id: warden.hostel_id,
          name: input.name.trim(),
          roll_number: input.rollNumber.trim(),
          room_no: input.roomNo.trim(),
          phone_number: input.phoneNumber.trim(),
          secondary_contact_number: input.secondaryContactNumber?.trim() || null,
          onboarded_by: warden.id,
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
      return json({ studentId: data.id });
    }

    default:
      return fail(`Unknown action: ${body.action}`);
  }
}));

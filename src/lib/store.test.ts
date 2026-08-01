import { beforeEach, describe, expect, it, vi } from 'vitest';
import { demoStore, useDemoMode } from '@/lib/store';
import { getDeviceFingerprint } from '@/lib/geo';
import { todayInTimezone } from '@/lib/time-window';

const HOSTEL_ID = 'hostel-1';
const WARDEN_ID = 'warden-1';
const ENROLLED_STUDENT = 'student-2';
const UNENROLLED_STUDENT = 'student-1';
const INSIDE = { lat: 28.6139, lon: 77.209 };
const OUTSIDE = { lat: 28.7, lon: 77.3 };

function today(): string {
  return todayInTimezone('Asia/Kolkata');
}

/** Enrols a student on the current device so check-in passes the device check. */
function enroll(studentId: string) {
  return demoStore.enrollStudent(studentId, `cred-${studentId}`, 'public-key');
}

beforeEach(() => {
  localStorage.clear();
  demoStore.resetDemo();
});

describe('seed data', () => {
  it('exposes the default hostel and its students', () => {
    expect(demoStore.getHostel(HOSTEL_ID)).toMatchObject({
      id: HOSTEL_ID,
      geofenceRadiusM: 150,
      timezone: 'Asia/Kolkata',
    });
    expect(demoStore.getStudentsByHostel(HOSTEL_ID)).toHaveLength(3);
    expect(demoStore.getStudentsByHostel('other-hostel')).toEqual([]);
  });

  it('throws for an unknown hostel', () => {
    expect(() => demoStore.getHostel('nope')).toThrow('Hostel not found');
  });

  it('looks up students by id and by phone, ignoring whitespace', () => {
    expect(demoStore.getStudentById(UNENROLLED_STUDENT)?.rollNumber).toBe('CS2024001');
    expect(demoStore.getStudentById('nope')).toBeUndefined();
    expect(demoStore.findStudentByPhone('+91 98765 43210')?.id).toBe(UNENROLLED_STUDENT);
    expect(demoStore.findStudentByPhone('+910000000000')).toBeUndefined();
  });
});

describe('sessions', () => {
  it('creates and restores a student session', () => {
    const session = demoStore.loginStudent('+919876543210');
    expect(session?.profile).toMatchObject({ role: 'student', userId: UNENROLLED_STUDENT });
    expect(demoStore.getStudentSession()?.student.id).toBe(UNENROLLED_STUDENT);

    demoStore.logoutStudent();
    expect(demoStore.getStudentSession()).toBeNull();
  });

  it('returns null when logging in with an unknown phone', () => {
    expect(demoStore.loginStudent('+910000000000')).toBeNull();
  });

  it('drops a session whose student no longer exists', () => {
    demoStore.loginStudent('+919876543210');
    localStorage.setItem(
      'nightcheck-session',
      JSON.stringify({ profile: {}, student: { id: 'ghost' } }),
    );
    expect(demoStore.getStudentSession()).toBeNull();
  });

  it('authenticates the warden only with the seeded credentials', () => {
    expect(demoStore.loginWarden('warden@nightcheck.demo', 'wrong')).toBeNull();
    expect(demoStore.loginWarden('someone@else.demo', 'warden123')).toBeNull();

    const session = demoStore.loginWarden('warden@nightcheck.demo', 'warden123');
    expect(session?.hostel.id).toBe(HOSTEL_ID);
    expect(demoStore.getWardenSession()?.profile.role).toBe('warden');

    demoStore.logoutWarden();
    expect(demoStore.getWardenSession()).toBeNull();
  });

  it('accepts the demo OTP', () => {
    expect(demoStore.verifyOtp('+919876543210', '123456')).toBe(true);
  });
});

describe('enrollStudent', () => {
  it('binds the credential and the current device fingerprint', () => {
    const student = enroll(UNENROLLED_STUDENT);
    expect(student).toMatchObject({
      enrolled: true,
      webauthnCredentialId: `cred-${UNENROLLED_STUDENT}`,
      webauthnPublicKey: 'public-key',
      deviceFingerprint: getDeviceFingerprint(),
    });
    expect(demoStore.getStudentById(UNENROLLED_STUDENT)?.enrolled).toBe(true);
  });

  it('throws for an unknown student', () => {
    expect(() => enroll('ghost')).toThrow('Student not found');
  });
});

describe('checkIn', () => {
  it('marks the student present when every check passes', () => {
    enroll(UNENROLLED_STUDENT);
    const result = demoStore.checkIn(UNENROLLED_STUDENT, INSIDE.lat, INSIDE.lon, true);

    expect(result.success).toBe(true);
    expect(result.record).toMatchObject({
      status: 'present',
      latitude: INSIDE.lat,
      longitude: INSIDE.lon,
      date: today(),
    });
    expect(result.record?.checkedInAt).toBeTruthy();
    expect(demoStore.getDashboardStats(HOSTEL_ID).present).toBe(1);
  });

  it('requires enrollment', () => {
    const result = demoStore.checkIn(UNENROLLED_STUDENT, INSIDE.lat, INSIDE.lon, true);
    expect(result).toMatchObject({ success: false });
    expect(result.message).toContain('enrollment');
  });

  it('requires a verified fingerprint', () => {
    enroll(UNENROLLED_STUDENT);
    expect(demoStore.checkIn(UNENROLLED_STUDENT, INSIDE.lat, INSIDE.lon, false)).toMatchObject({
      success: false,
      message: 'Fingerprint verification failed.',
    });
  });

  it('rejects a device other than the registered one', () => {
    // student-2 is seeded with a foreign device fingerprint.
    const result = demoStore.checkIn(ENROLLED_STUDENT, INSIDE.lat, INSIDE.lon, true);
    expect(result.success).toBe(false);
    expect(result.message).toContain('not your registered device');
  });

  it('rejects a location outside the geofence', () => {
    enroll(UNENROLLED_STUDENT);
    const result = demoStore.checkIn(UNENROLLED_STUDENT, OUTSIDE.lat, OUTSIDE.lon, true);
    expect(result.success).toBe(false);
    expect(result.message).toContain('outside the hostel boundary');
  });

  it('refuses to check in a student who is on approved leave', () => {
    enroll(UNENROLLED_STUDENT);
    const leave = demoStore.submitLeave(UNENROLLED_STUDENT, today(), today(), 'family');
    demoStore.reviewLeave(leave.id, 'approved', WARDEN_ID);

    const result = demoStore.checkIn(UNENROLLED_STUDENT, INSIDE.lat, INSIDE.lon, true);
    expect(result.success).toBe(false);
    expect(result.record?.status).toBe('on_leave');
  });
});

describe('leave applications', () => {
  it('records a pending leave visible to the student and warden', () => {
    const leave = demoStore.submitLeave(UNENROLLED_STUDENT, '2024-03-10', '2024-03-11', 'wedding');
    expect(leave).toMatchObject({ status: 'pending', hostelId: HOSTEL_ID });
    expect(demoStore.getStudentLeaves(UNENROLLED_STUDENT)).toHaveLength(1);
    expect(demoStore.getPendingLeaves(HOSTEL_ID).map((l) => l.id)).toEqual([leave.id]);
  });

  it('marks every day of an approved leave as on_leave', () => {
    const leave = demoStore.submitLeave(UNENROLLED_STUDENT, '2024-03-10', '2024-03-12', 'wedding');
    demoStore.reviewLeave(leave.id, 'approved', WARDEN_ID, 'ok');

    const statuses = demoStore
      .getStudentAttendance(UNENROLLED_STUDENT)
      .filter((r) => r.date >= '2024-03-10' && r.date <= '2024-03-12')
      .map((r) => r.status);
    expect(statuses).toEqual(['on_leave', 'on_leave', 'on_leave']);
    expect(demoStore.getPendingLeaves(HOSTEL_ID)).toEqual([]);
  });

  it('leaves attendance untouched when denied', () => {
    const leave = demoStore.submitLeave(UNENROLLED_STUDENT, '2024-03-10', '2024-03-10', 'trip');
    const reviewed = demoStore.reviewLeave(leave.id, 'denied', WARDEN_ID);

    expect(reviewed).toMatchObject({ status: 'denied', reviewedBy: WARDEN_ID });
    expect(demoStore.getStudentAttendance(UNENROLLED_STUDENT)).toEqual([]);
  });

  it('does not downgrade a present or excused day', () => {
    enroll(UNENROLLED_STUDENT);
    demoStore.checkIn(UNENROLLED_STUDENT, INSIDE.lat, INSIDE.lon, true);

    const leave = demoStore.submitLeave(UNENROLLED_STUDENT, today(), today(), 'family');
    demoStore.reviewLeave(leave.id, 'approved', WARDEN_ID);

    expect(demoStore.getDashboardStats(HOSTEL_ID)).toMatchObject({ present: 1, onLeave: 0 });
  });

  it('sorts a student\'s leaves newest first', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-03-01T10:00:00Z'));
    const older = demoStore.submitLeave(UNENROLLED_STUDENT, '2024-03-10', '2024-03-10', 'a');
    vi.setSystemTime(new Date('2024-03-02T10:00:00Z'));
    const newer = demoStore.submitLeave(UNENROLLED_STUDENT, '2024-03-11', '2024-03-11', 'b');
    vi.useRealTimers();

    expect(demoStore.getStudentLeaves(UNENROLLED_STUDENT).map((l) => l.id)).toEqual([
      newer.id,
      older.id,
    ]);
  });

  it('throws when reviewing an unknown leave', () => {
    expect(() => demoStore.reviewLeave('ghost', 'approved', WARDEN_ID)).toThrow(
      'Leave application not found',
    );
  });
});

describe('device change requests', () => {
  it('clears the bound device once approved', () => {
    const request = demoStore.submitDeviceChange(ENROLLED_STUDENT, 'lost phone', 'Pixel 8');
    expect(demoStore.getPendingDeviceChanges(HOSTEL_ID).map((r) => r.id)).toEqual([request.id]);

    demoStore.reviewDeviceChange(request.id, 'approved', WARDEN_ID);
    expect(demoStore.getStudentById(ENROLLED_STUDENT)?.deviceFingerprint).toBeUndefined();
    expect(demoStore.getPendingDeviceChanges(HOSTEL_ID)).toEqual([]);
  });

  it('keeps the bound device when denied', () => {
    const request = demoStore.submitDeviceChange(ENROLLED_STUDENT, 'lost phone', 'Pixel 8');
    demoStore.reviewDeviceChange(request.id, 'denied', WARDEN_ID);
    expect(demoStore.getStudentById(ENROLLED_STUDENT)?.deviceFingerprint).toBe('demo-device-2');
  });

  it('throws when reviewing an unknown request', () => {
    expect(() => demoStore.reviewDeviceChange('ghost', 'approved', WARDEN_ID)).toThrow(
      'Device change request not found',
    );
  });
});

describe('device issue reports', () => {
  it('excuses the student for the reported day', () => {
    const report = demoStore.submitDeviceIssue(ENROLLED_STUDENT, 'sensor broken');
    expect(report.date).toBe(today());
    expect(demoStore.getPendingDeviceIssues(HOSTEL_ID).map((r) => r.id)).toEqual([report.id]);

    demoStore.reviewDeviceIssue(report.id, 'excused', WARDEN_ID);
    const record = demoStore.getStudentAttendance(ENROLLED_STUDENT)[0];
    expect(record).toMatchObject({
      status: 'excused',
      overriddenBy: WARDEN_ID,
      overrideReason: 'Device issue: sensor broken',
    });
  });

  it('marks the student absent when the issue is rejected', () => {
    const report = demoStore.submitDeviceIssue(ENROLLED_STUDENT, 'sensor broken');
    demoStore.reviewDeviceIssue(report.id, 'absent', WARDEN_ID);

    expect(demoStore.getStudentAttendance(ENROLLED_STUDENT)[0]).toMatchObject({
      status: 'absent',
      overrideReason: 'Device issue denied: sensor broken',
    });
  });

  it('throws when reviewing an unknown report', () => {
    expect(() => demoStore.reviewDeviceIssue('ghost', 'excused', WARDEN_ID)).toThrow(
      'Device issue report not found',
    );
  });
});

describe('manualOverride', () => {
  it('marks a student present with an audit trail', () => {
    const record = demoStore.manualOverride(
      UNENROLLED_STUDENT,
      today(),
      'present',
      'verified in person',
      WARDEN_ID,
    );
    expect(record).toMatchObject({
      status: 'present',
      overrideReason: 'verified in person',
      overriddenBy: WARDEN_ID,
    });
    expect(record.checkedInAt).toBeTruthy();
  });

  it('refuses to mark a present student absent', () => {
    enroll(UNENROLLED_STUDENT);
    demoStore.checkIn(UNENROLLED_STUDENT, INSIDE.lat, INSIDE.lon, true);

    expect(() =>
      demoStore.manualOverride(UNENROLLED_STUDENT, today(), 'absent', 'no show', WARDEN_ID),
    ).toThrow('Cannot mark absent');
  });

  it('refuses to mark a student on leave absent', () => {
    const leave = demoStore.submitLeave(UNENROLLED_STUDENT, today(), today(), 'family');
    demoStore.reviewLeave(leave.id, 'approved', WARDEN_ID);

    expect(() =>
      demoStore.manualOverride(UNENROLLED_STUDENT, today(), 'absent', 'no show', WARDEN_ID),
    ).toThrow('Cannot mark absent');
  });
});

describe('roll and dashboard', () => {
  it('defaults every student to absent for today', () => {
    const roll = demoStore.getTodayRoll(HOSTEL_ID);
    expect(roll).toHaveLength(3);
    expect(roll.every((r) => r.record.status === 'absent')).toBe(true);
    expect(demoStore.getDashboardStats(HOSTEL_ID)).toEqual({
      total: 3,
      present: 0,
      absent: 3,
      onLeave: 0,
      excused: 0,
    });
  });

  it('aggregates each status for the requested date', () => {
    enroll(UNENROLLED_STUDENT);
    demoStore.checkIn(UNENROLLED_STUDENT, INSIDE.lat, INSIDE.lon, true);

    const leave = demoStore.submitLeave(ENROLLED_STUDENT, today(), today(), 'family');
    demoStore.reviewLeave(leave.id, 'approved', WARDEN_ID);

    const issue = demoStore.submitDeviceIssue('student-3', 'broken sensor');
    demoStore.reviewDeviceIssue(issue.id, 'excused', WARDEN_ID);

    expect(demoStore.getDashboardStats(HOSTEL_ID, today())).toEqual({
      total: 3,
      present: 1,
      absent: 0,
      onLeave: 1,
      excused: 1,
    });
  });

  it('applies approved leaves to a roll generated before approval', () => {
    demoStore.getTodayRoll(HOSTEL_ID);
    const leave = demoStore.submitLeave(UNENROLLED_STUDENT, today(), today(), 'family');
    demoStore.reviewLeave(leave.id, 'approved', WARDEN_ID);

    const entry = demoStore
      .getTodayRoll(HOSTEL_ID)
      .find((r) => r.student.id === UNENROLLED_STUDENT);
    expect(entry?.record.status).toBe('on_leave');
  });
});

describe('roster management', () => {
  it('adds a student who starts unenrolled', () => {
    const student = demoStore.addStudent(HOSTEL_ID, 'New Student', 'CS2024099', '301', '+91999');
    expect(student.enrolled).toBe(false);
    expect(demoStore.getStudentsByHostel(HOSTEL_ID)).toHaveLength(4);
    expect(demoStore.getStudentById(student.id)?.fullName).toBe('New Student');
  });

  it('force-unbinds a device and resets enrollment', () => {
    const student = demoStore.forceUnbindDevice(ENROLLED_STUDENT);
    expect(student).toMatchObject({ enrolled: false });
    expect(student.deviceFingerprint).toBeUndefined();
    expect(student.webauthnCredentialId).toBeUndefined();
    expect(student.webauthnPublicKey).toBeUndefined();
  });
});

describe('resetDemo', () => {
  it('clears sessions and restores the seed data', () => {
    demoStore.loginStudent('+919876543210');
    demoStore.loginWarden('warden@nightcheck.demo', 'warden123');
    demoStore.addStudent(HOSTEL_ID, 'Temp', 'CS999', '999', '+91000');

    demoStore.resetDemo();

    expect(demoStore.getStudentSession()).toBeNull();
    expect(demoStore.getWardenSession()).toBeNull();
    expect(demoStore.getStudentsByHostel(HOSTEL_ID)).toHaveLength(3);
  });
});

describe('useDemoMode', () => {
  it('is enabled when Supabase is unconfigured or still a placeholder', () => {
    vi.stubEnv('VITE_SUPABASE_URL', '');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');
    expect(useDemoMode()).toBe(true);

    vi.stubEnv('VITE_SUPABASE_URL', 'https://your-project.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key');
    expect(useDemoMode()).toBe(true);

    vi.unstubAllEnvs();
  });

  it('is disabled once both Supabase values are set', () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://real.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key');
    expect(useDemoMode()).toBe(false);
    vi.unstubAllEnvs();
  });
});

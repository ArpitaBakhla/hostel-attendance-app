import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { approvedLeaveForDate, demoStore, isDemoMode } from '@/lib/store';
import { getDeviceId } from '@/lib/geo';
import { todayInTimezone } from '@/lib/time-window';
import type { LeaveRequest } from '@/types';

const HOSTEL_ID = 'hostel-1';
const WARDEN_ID = 'warden-1';
/** Seeded, fully enrolled, but bound to a different device. */
const BOUND_STUDENT = 'student-2';
/** Seeded, unverified phone and no device. */
const NEW_STUDENT = 'student-1';
const INSIDE = { lat: 28.6139, lon: 77.209 };
const OUTSIDE = { lat: 28.7, lon: 77.3 };

/** 20:45 in Asia/Kolkata — inside the check-in window. */
const DURING_WINDOW = new Date('2024-03-10T15:15:00Z');
/** 12:00 in Asia/Kolkata — outside the check-in window. */
const BEFORE_WINDOW = new Date('2024-03-10T06:30:00Z');

function today(): string {
  return todayInTimezone('Asia/Kolkata');
}

/** Verifies the phone and binds the current device, so check-in can succeed. */
function enroll(studentId = NEW_STUDENT) {
  const challenge = demoStore.sendOtp(studentId, 'registration');
  demoStore.verifyOtp(challenge.id, challenge.code);
  return demoStore.enrollStudent(studentId, `cred-${studentId}`, 'public-key');
}

function checkInDuringWindow(studentId: string, lat = INSIDE.lat, lon = INSIDE.lon) {
  vi.setSystemTime(DURING_WINDOW);
  return demoStore.checkIn(studentId, lat, lon, true);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(DURING_WINDOW);
  localStorage.clear();
  demoStore.resetDemo();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('seed data', () => {
  it('exposes the default hostel and its students', () => {
    expect(demoStore.getDefaultHostelId()).toBe(HOSTEL_ID);
    expect(demoStore.getHostel(HOSTEL_ID)).toMatchObject({
      id: HOSTEL_ID,
      radiusMeters: 100,
      timezone: 'Asia/Kolkata',
    });
    expect(demoStore.getStudentsByHostel(HOSTEL_ID)).toHaveLength(3);
    expect(demoStore.getStudentsByHostel('other-hostel')).toEqual([]);
  });

  it('throws for an unknown hostel', () => {
    expect(() => demoStore.getHostel('nope')).toThrow('Hostel not found');
  });

  it('looks up students by id and by phone, ignoring spaces and dashes', () => {
    expect(demoStore.getStudentById(NEW_STUDENT)?.rollNumber).toBe('CS2024001');
    expect(demoStore.getStudentById('nope')).toBeUndefined();
    expect(demoStore.findStudentByPhone('+91 98765-43210')?.id).toBe(NEW_STUDENT);
    expect(demoStore.findStudentByPhone('+910000000000')).toBeUndefined();
  });
});

describe('isEnrolled', () => {
  it('requires a verified phone, a credential and a bound device', () => {
    const student = demoStore.getStudentById(NEW_STUDENT)!;
    expect(demoStore.isEnrolled(student)).toBe(false);
    expect(demoStore.isEnrolled(demoStore.getStudentById(BOUND_STUDENT)!)).toBe(true);
    expect(demoStore.isEnrolled({ ...student, phoneVerified: true })).toBe(false);
  });
});

describe('OTP', () => {
  it('sends a registration code to the primary number and verifies the phone', () => {
    const challenge = demoStore.sendOtp(NEW_STUDENT, 'registration');
    expect(challenge).toMatchObject({ sentTo: '+919876543210', consumed: false });
    expect(challenge.code).toMatch(/^\d{6}$/);

    expect(demoStore.verifyOtp(challenge.id, challenge.code)).toEqual({
      ok: true,
      message: 'Phone number verified.',
    });
    expect(demoStore.getStudentById(NEW_STUDENT)?.phoneVerified).toBe(true);
  });

  it('sends a tier-2 code to the secondary contact', () => {
    expect(demoStore.sendOtp(BOUND_STUDENT, 'tier2_secondary_contact').sentTo).toBe(
      '+919812345678',
    );
  });

  it('refuses a tier-2 code when no secondary contact is registered', () => {
    expect(() => demoStore.sendOtp(NEW_STUDENT, 'tier2_secondary_contact')).toThrow(
      'No secondary contact number',
    );
  });

  it('invalidates the previous unconsumed code for the same purpose', () => {
    const first = demoStore.sendOtp(NEW_STUDENT, 'registration');
    demoStore.sendOtp(NEW_STUDENT, 'registration');
    expect(demoStore.verifyOtp(first.id, first.code).ok).toBe(false);
  });

  it('rejects a wrong, reused, expired or unknown code', () => {
    const challenge = demoStore.sendOtp(NEW_STUDENT, 'registration');
    expect(demoStore.verifyOtp(challenge.id, '000000')).toMatchObject({
      ok: false,
      message: 'Incorrect code.',
    });
    expect(demoStore.verifyOtp('ghost', challenge.code).ok).toBe(false);

    expect(demoStore.verifyOtp(challenge.id, challenge.code).ok).toBe(true);
    expect(demoStore.verifyOtp(challenge.id, challenge.code).ok).toBe(false);

    const expiring = demoStore.sendOtp(NEW_STUDENT, 'registration');
    vi.advanceTimersByTime(5 * 60 * 1000 + 1);
    expect(demoStore.verifyOtp(expiring.id, expiring.code)).toMatchObject({
      ok: false,
      message: 'Code expired. Request a new one.',
    });
  });
});

describe('sessions', () => {
  it('creates and restores a student session', () => {
    const session = demoStore.loginStudent('+919876543210');
    expect(session?.profile).toMatchObject({ role: 'student', userId: NEW_STUDENT });
    expect(demoStore.getStudentSession()?.student.id).toBe(NEW_STUDENT);

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

    expect(demoStore.loginWarden('warden@nightcheck.demo', 'warden123')?.hostel.id).toBe(
      HOSTEL_ID,
    );
    expect(demoStore.getWardenSession()?.profile.role).toBe('warden');

    demoStore.logoutWarden();
    expect(demoStore.getWardenSession()).toBeNull();
  });
});

describe('addStudent', () => {
  it('adds an unverified, unbound student', () => {
    const student = demoStore.addStudent({
      hostelId: HOSTEL_ID,
      name: 'New Student',
      rollNumber: 'CS2024099',
      roomNo: '301',
      phoneNumber: '+919999999999',
      onboardedBy: WARDEN_ID,
    });

    expect(student).toMatchObject({ phoneVerified: false, overrideCount: 0 });
    expect(student.registeredDeviceId).toBeUndefined();
    expect(student.secondaryContactNumber).toBeUndefined();
    expect(demoStore.getStudentsByHostel(HOSTEL_ID)).toHaveLength(4);
  });

  it('rejects duplicate phone or roll numbers', () => {
    const base = {
      hostelId: HOSTEL_ID,
      name: 'Duplicate',
      rollNumber: 'CS2024098',
      roomNo: '302',
      phoneNumber: '+919999999998',
      onboardedBy: WARDEN_ID,
    };

    expect(() => demoStore.addStudent({ ...base, phoneNumber: '+91 98765 43210' })).toThrow(
      'phone number already exists',
    );
    expect(() => demoStore.addStudent({ ...base, rollNumber: 'CS2024001' })).toThrow(
      'roll number already exists',
    );
  });
});

describe('enrollStudent', () => {
  it('binds the credential and the current device', () => {
    const student = enroll();
    expect(student).toMatchObject({
      webauthnCredentialId: `cred-${NEW_STUDENT}`,
      webauthnPublicKey: 'public-key',
      registeredDeviceId: getDeviceId(),
    });
    expect(demoStore.isEnrolled(demoStore.getStudentById(NEW_STUDENT)!)).toBe(true);
  });

  it('requires phone verification first', () => {
    expect(() => demoStore.enrollStudent(NEW_STUDENT, 'cred', 'key')).toThrow(
      'Verify your phone number',
    );
  });

  it('refuses to silently replace an already bound device', () => {
    expect(() => demoStore.enrollStudent(BOUND_STUDENT, 'cred', 'key')).toThrow(
      'device is already registered',
    );
  });

  it('throws for an unknown student', () => {
    expect(() => demoStore.enrollStudent('ghost', 'cred', 'key')).toThrow('Student not found');
  });
});

describe('checkIn', () => {
  it('succeeds inside the window, on the bound device, inside the geofence', () => {
    enroll();
    const result = checkInDuringWindow(NEW_STUDENT);

    expect(result.success).toBe(true);
    expect(result.log).toMatchObject({
      status: 'success',
      gpsLat: INSIDE.lat,
      gpsLng: INSIDE.lon,
      date: today(),
    });
    expect(result.log?.failReason).toBeUndefined();
    expect(demoStore.getDashboardStats(HOSTEL_ID).present).toBe(1);
  });

  it.each([
    {
      name: 'not enrolled',
      failReason: 'not_enrolled',
      setup: () => {},
      act: () => checkInDuringWindow(NEW_STUDENT),
    },
    {
      name: 'outside the time window',
      failReason: 'outside_time_window',
      setup: enroll,
      act: () => {
        vi.setSystemTime(BEFORE_WINDOW);
        return demoStore.checkIn(NEW_STUDENT, INSIDE.lat, INSIDE.lon, true);
      },
    },
    {
      name: 'fingerprint not verified',
      failReason: 'webauthn_failed',
      setup: enroll,
      act: () => demoStore.checkIn(NEW_STUDENT, INSIDE.lat, INSIDE.lon, false),
    },
    {
      name: 'unregistered device',
      failReason: 'device_mismatch',
      setup: () => {},
      act: () => checkInDuringWindow(BOUND_STUDENT),
    },
    {
      name: 'outside the geofence',
      failReason: 'outside_geofence',
      setup: enroll,
      act: () => checkInDuringWindow(NEW_STUDENT, OUTSIDE.lat, OUTSIDE.lon),
    },
  ])('fails with $failReason when $name', ({ failReason, setup, act }) => {
    setup();
    const result = act();

    expect(result.success).toBe(false);
    expect(result.log).toMatchObject({ status: 'failed', failReason });
  });

  it('records the failure so the warden can see the attempt', () => {
    enroll();
    checkInDuringWindow(NEW_STUDENT, OUTSIDE.lat, OUTSIDE.lon);

    expect(demoStore.getStudentAttendance(NEW_STUDENT)).toHaveLength(1);
    expect(demoStore.getDashboardStats(HOSTEL_ID)).toMatchObject({ failed: 1, present: 0 });
  });

  it('overwrites a failed attempt when a later attempt succeeds', () => {
    enroll();
    checkInDuringWindow(NEW_STUDENT, OUTSIDE.lat, OUTSIDE.lon);
    checkInDuringWindow(NEW_STUDENT);

    expect(demoStore.getStudentAttendance(NEW_STUDENT)).toHaveLength(1);
    expect(demoStore.getDashboardStats(HOSTEL_ID)).toMatchObject({ failed: 0, present: 1 });
  });
});

describe('leave requests', () => {
  it('records a pending request visible to the student and the warden', () => {
    const leave = demoStore.submitLeave(NEW_STUDENT, today(), today(), 'wedding');
    expect(leave).toMatchObject({ status: 'pending', hostelId: HOSTEL_ID, isRetroactive: false });
    expect(demoStore.getStudentLeaves(NEW_STUDENT)).toHaveLength(1);
    expect(demoStore.getPendingLeaves(HOSTEL_ID).map((l) => l.id)).toEqual([leave.id]);
  });

  it('flags a request that starts in the past as retroactive', () => {
    expect(demoStore.submitLeave(NEW_STUDENT, '2020-01-01', today(), 'sick').isRetroactive).toBe(
      true,
    );
  });

  it('marks every day of an approved leave', () => {
    const leave = demoStore.submitLeave(NEW_STUDENT, '2024-03-10', '2024-03-12', 'wedding');
    demoStore.reviewLeave(leave.id, 'approved', WARDEN_ID);

    const logs = demoStore
      .getStudentAttendance(NEW_STUDENT)
      .filter((l) => l.date >= '2024-03-10' && l.date <= '2024-03-12');
    expect(logs).toHaveLength(3);
    expect(logs.every((l) => l.status === 'on_leave' && l.markedBy === WARDEN_ID)).toBe(true);
    expect(demoStore.getPendingLeaves(HOSTEL_ID)).toEqual([]);
  });

  it('leaves attendance untouched when rejected', () => {
    const leave = demoStore.submitLeave(NEW_STUDENT, today(), today(), 'trip');
    expect(demoStore.reviewLeave(leave.id, 'rejected', WARDEN_ID)).toMatchObject({
      status: 'rejected',
      wardenId: WARDEN_ID,
    });
    expect(demoStore.getStudentAttendance(NEW_STUDENT)).toEqual([]);
  });

  it('never downgrades a successful check-in to on_leave', () => {
    enroll();
    checkInDuringWindow(NEW_STUDENT);

    const leave = demoStore.submitLeave(NEW_STUDENT, today(), today(), 'family');
    demoStore.reviewLeave(leave.id, 'approved', WARDEN_ID);

    expect(demoStore.getDashboardStats(HOSTEL_ID)).toMatchObject({ present: 1, onLeave: 0 });
  });

  it("sorts a student's requests newest first", () => {
    vi.setSystemTime(new Date('2024-03-01T10:00:00Z'));
    const older = demoStore.submitLeave(NEW_STUDENT, '2024-03-10', '2024-03-10', 'a');
    vi.setSystemTime(new Date('2024-03-02T10:00:00Z'));
    const newer = demoStore.submitLeave(NEW_STUDENT, '2024-03-11', '2024-03-11', 'b');

    expect(demoStore.getStudentLeaves(NEW_STUDENT).map((l) => l.id)).toEqual([newer.id, older.id]);
  });

  it('throws when reviewing an unknown request', () => {
    expect(() => demoStore.reviewLeave('ghost', 'approved', WARDEN_ID)).toThrow(
      'Leave request not found',
    );
  });
});

describe('approvedLeaveForDate', () => {
  const leave = (overrides: Partial<LeaveRequest> = {}): LeaveRequest => ({
    id: 'leave-1',
    studentId: NEW_STUDENT,
    hostelId: HOSTEL_ID,
    startDate: '2024-03-10',
    endDate: '2024-03-12',
    reason: 'wedding',
    status: 'approved',
    isRetroactive: false,
    submittedAt: '2024-03-09T00:00:00.000Z',
    ...overrides,
  });

  it('matches only approved leaves covering the date', () => {
    const leaves = [leave()];
    expect(approvedLeaveForDate(leaves, NEW_STUDENT, '2024-03-11')?.id).toBe('leave-1');
    expect(approvedLeaveForDate(leaves, NEW_STUDENT, '2024-03-13')).toBeUndefined();
    expect(approvedLeaveForDate(leaves, 'other', '2024-03-11')).toBeUndefined();
    expect(
      approvedLeaveForDate([leave({ status: 'pending' })], NEW_STUDENT, '2024-03-11'),
    ).toBeUndefined();
  });
});

describe('markPresent', () => {
  it('records the override with the warden and reason, and counts it', () => {
    const log = demoStore.markPresent(NEW_STUDENT, today(), 'verified in person', WARDEN_ID);
    expect(log).toMatchObject({
      status: 'manual_override',
      failReason: 'verified in person',
      markedBy: WARDEN_ID,
    });
    expect(demoStore.getStudentById(NEW_STUDENT)?.overrideCount).toBe(1);
    expect(demoStore.getDashboardStats(HOSTEL_ID).manualOverride).toBe(1);
  });

  it('requires a reason and a warden id', () => {
    expect(() => demoStore.markPresent(NEW_STUDENT, today(), '  ', WARDEN_ID)).toThrow(
      'reason is required',
    );
    expect(() => demoStore.markPresent(NEW_STUDENT, today(), 'reason', ' ')).toThrow(
      'warden ID is required',
    );
    expect(demoStore.getStudentById(NEW_STUDENT)?.overrideCount).toBe(0);
  });

  it('flags a student once overrides reach the threshold', () => {
    for (let i = 0; i < 2; i += 1) {
      demoStore.markPresent(NEW_STUDENT, `2024-03-0${i + 1}`, 'reason', WARDEN_ID);
    }
    expect(demoStore.isOverrideFlagged(demoStore.getStudentById(NEW_STUDENT)!)).toBe(false);

    demoStore.markPresent(NEW_STUDENT, '2024-03-03', 'reason', WARDEN_ID);
    expect(demoStore.isOverrideFlagged(demoStore.getStudentById(NEW_STUDENT)!)).toBe(true);
  });
});

describe('device change requests', () => {
  it('rebinds the device and clears the credential once approved', () => {
    const request = demoStore.submitDeviceChange({
      studentId: BOUND_STUDENT,
      reason: 'lost phone',
      newDeviceId: 'new-device',
      otpVerified: true,
      otpSentTo: '+919812345678',
    });
    expect(request).toMatchObject({ status: 'pending', oldDeviceId: 'demo-device-2' });
    expect(demoStore.getPendingDeviceChanges(HOSTEL_ID).map((r) => r.id)).toEqual([request.id]);

    demoStore.reviewDeviceChange(request.id, 'approved', WARDEN_ID);

    const student = demoStore.getStudentById(BOUND_STUDENT)!;
    expect(student.registeredDeviceId).toBe('new-device');
    expect(student.webauthnCredentialId).toBeUndefined();
    expect(student.webauthnPublicKey).toBeUndefined();
    expect(demoStore.getPendingDeviceChanges(HOSTEL_ID)).toEqual([]);
  });

  it('keeps the bound device when rejected', () => {
    const request = demoStore.submitDeviceChange({
      studentId: BOUND_STUDENT,
      reason: 'lost phone',
      newDeviceId: 'new-device',
      otpVerified: false,
    });
    demoStore.reviewDeviceChange(request.id, 'rejected', WARDEN_ID);

    expect(demoStore.getStudentById(BOUND_STUDENT)?.registeredDeviceId).toBe('demo-device-2');
  });

  it('throws when reviewing an unknown request', () => {
    expect(() => demoStore.reviewDeviceChange('ghost', 'approved', WARDEN_ID)).toThrow(
      'Device change request not found',
    );
  });
});

describe('roll and dashboard', () => {
  it('counts students with no log for the day as absent', () => {
    const roll = demoStore.getRoll(HOSTEL_ID);
    expect(roll).toHaveLength(3);
    expect(roll.every((r) => r.log === undefined)).toBe(true);
    expect(demoStore.getDashboardStats(HOSTEL_ID)).toEqual({
      total: 3,
      present: 0,
      failed: 0,
      manualOverride: 0,
      onLeave: 0,
      absent: 3,
    });
  });

  it('aggregates every status for the requested date', () => {
    enroll();
    checkInDuringWindow(NEW_STUDENT);

    const leave = demoStore.submitLeave(BOUND_STUDENT, today(), today(), 'family');
    demoStore.reviewLeave(leave.id, 'approved', WARDEN_ID);

    demoStore.markPresent('student-3', today(), 'phone broken', WARDEN_ID);

    expect(demoStore.getDashboardStats(HOSTEL_ID, today())).toEqual({
      total: 3,
      present: 1,
      failed: 0,
      manualOverride: 1,
      onLeave: 1,
      absent: 0,
    });
  });

  it('sorts a student\'s attendance newest first', () => {
    demoStore.markPresent(NEW_STUDENT, '2024-03-01', 'reason', WARDEN_ID);
    demoStore.markPresent(NEW_STUDENT, '2024-03-05', 'reason', WARDEN_ID);

    expect(demoStore.getStudentAttendance(NEW_STUDENT).map((l) => l.date)).toEqual([
      '2024-03-05',
      '2024-03-01',
    ]);
  });
});

describe('resetDemo', () => {
  it('clears sessions and restores the seed data', () => {
    demoStore.loginStudent('+919876543210');
    demoStore.loginWarden('warden@nightcheck.demo', 'warden123');
    demoStore.addStudent({
      hostelId: HOSTEL_ID,
      name: 'Temp',
      rollNumber: 'CS999',
      roomNo: '999',
      phoneNumber: '+919000000000',
      onboardedBy: WARDEN_ID,
    });

    demoStore.resetDemo();

    expect(demoStore.getStudentSession()).toBeNull();
    expect(demoStore.getWardenSession()).toBeNull();
    expect(demoStore.getStudentsByHostel(HOSTEL_ID)).toHaveLength(3);
  });
});

describe('isDemoMode', () => {
  it('is enabled when Supabase is unconfigured or still a placeholder', () => {
    vi.stubEnv('VITE_SUPABASE_URL', '');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');
    expect(isDemoMode()).toBe(true);

    vi.stubEnv('VITE_SUPABASE_URL', 'https://your-project.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key');
    expect(isDemoMode()).toBe(true);

    vi.unstubAllEnvs();
  });

  it('is disabled once both Supabase values are set', () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://real.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key');
    expect(isDemoMode()).toBe(false);
    vi.unstubAllEnvs();
  });
});

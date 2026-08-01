import type {
  AttendanceLog,
  AttendanceStatus,
  CheckInResult,
  DashboardStats,
  DeviceChangeRequest,
  HostelCenter,
  LeaveRequest,
  OtpChallenge,
  OtpPurpose,
  Profile,
  SessionUser,
  Student,
  WardenSession,
} from '@/types';
import { getDeviceId, isWithinGeofence } from '@/lib/geo';
import {
  datesBetween,
  getTimeWindowStatus,
  isDateInRange,
  nowIso,
  todayInTimezone,
} from '@/lib/time-window';
import { readJson, removeItem, writeJson } from '@/lib/storage';

const STORAGE_KEY = 'nightcheck-data-v2';
const SESSION_KEY = 'nightcheck-session';
const WARDEN_SESSION_KEY = 'nightcheck-warden-session';

const OTP_TTL_MS = 5 * 60 * 1000;
const OVERRIDE_FLAG_THRESHOLD = 3;

function uid(): string {
  return crypto.randomUUID();
}

interface AppData {
  hostels: HostelCenter[];
  profiles: Profile[];
  students: Student[];
  attendance: AttendanceLog[];
  leaves: LeaveRequest[];
  deviceChanges: DeviceChangeRequest[];
  otps: OtpChallenge[];
}

const DEFAULT_HOSTEL: HostelCenter = {
  id: 'hostel-1',
  name: 'Block A — Girls Hostel',
  centerLat: 28.6139,
  centerLng: 77.209,
  radiusMeters: 100,
  timezone: 'Asia/Kolkata',
};

const DEFAULT_WARDEN: Profile = {
  id: 'warden-profile-1',
  userId: 'warden-1',
  hostelId: DEFAULT_HOSTEL.id,
  role: 'warden',
  fullName: 'Dr. Meera Sharma',
  email: 'warden@nightcheck.demo',
};

function seedStudents(): Student[] {
  return [
    {
      id: 'student-1',
      hostelId: DEFAULT_HOSTEL.id,
      name: 'Arpita Bakhla',
      rollNumber: 'CS2024001',
      roomNo: '204',
      phoneNumber: '+919876543210',
      overrideCount: 0,
      onboardedBy: DEFAULT_WARDEN.id,
      phoneVerified: false,
    },
    {
      id: 'student-2',
      hostelId: DEFAULT_HOSTEL.id,
      name: 'Priya Singh',
      rollNumber: 'CS2024002',
      roomNo: '205',
      phoneNumber: '+919876543211',
      secondaryContactNumber: '+919812345678',
      registeredDeviceId: 'demo-device-2',
      webauthnCredentialId: 'demo-student-2',
      webauthnPublicKey: 'demo-public-key',
      overrideCount: 0,
      onboardedBy: DEFAULT_WARDEN.id,
      phoneVerified: true,
    },
    {
      id: 'student-3',
      hostelId: DEFAULT_HOSTEL.id,
      name: 'Ananya Patel',
      rollNumber: 'CS2024003',
      roomNo: '206',
      phoneNumber: '+919876543212',
      secondaryContactNumber: '+919812345679',
      registeredDeviceId: 'demo-device-3',
      webauthnCredentialId: 'demo-student-3',
      webauthnPublicKey: 'demo-public-key',
      overrideCount: 0,
      onboardedBy: DEFAULT_WARDEN.id,
      phoneVerified: true,
    },
  ];
}

function defaultData(): AppData {
  return {
    hostels: [DEFAULT_HOSTEL],
    profiles: [DEFAULT_WARDEN],
    students: seedStudents(),
    attendance: [],
    leaves: [],
    deviceChanges: [],
    otps: [],
  };
}

function loadData(): AppData {
  const data = readJson<AppData>(STORAGE_KEY);
  if (!data) {
    const seeded = defaultData();
    saveData(seeded);
    return seeded;
  }
  return data;
}

function saveData(data: AppData): void {
  writeJson(STORAGE_KEY, data);
}

function findByIdOrThrow<T extends { id: string }>(
  items: T[],
  id: string,
  label: string,
): T {
  const item = items.find((i) => i.id === id);
  if (!item) throw new Error(`${label} not found`);
  return item;
}

function pendingForHostel<T extends { hostelId: string; status: string }>(
  items: T[],
  hostelId: string,
): T[] {
  return items.filter((i) => i.hostelId === hostelId && i.status === 'pending');
}

function applyDecision<T extends { status: string; wardenId?: string; decidedAt?: string }>(
  record: T,
  status: T['status'],
  wardenId: string,
): void {
  record.status = status;
  record.wardenId = wardenId;
  record.decidedAt = nowIso();
}

function getHostel(data: AppData, hostelId: string): HostelCenter {
  return findByIdOrThrow(data.hostels, hostelId, 'Hostel');
}

function getStudent(data: AppData, studentId: string): Student {
  return findByIdOrThrow(data.students, studentId, 'Student');
}

function normalizePhone(phone: string): string {
  return phone.replace(/[\s-]/g, '');
}

function isEnrolled(student: Student): boolean {
  return Boolean(
    student.phoneVerified && student.webauthnCredentialId && student.registeredDeviceId,
  );
}

function findLog(data: AppData, studentId: string, date: string): AttendanceLog | undefined {
  return data.attendance.find((a) => a.studentId === studentId && a.date === date);
}

export function approvedLeaveForDate(
  leaves: LeaveRequest[],
  studentId: string,
  date: string,
): LeaveRequest | undefined {
  return leaves.find(
    (leave) =>
      leave.studentId === studentId &&
      leave.status === 'approved' &&
      isDateInRange(date, leave.startDate, leave.endDate),
  );
}

function writeLog(
  data: AppData,
  student: Student,
  date: string,
  patch: Omit<AttendanceLog, 'id' | 'studentId' | 'hostelId' | 'date'>,
): AttendanceLog {
  const existing = findLog(data, student.id, date);
  if (existing) {
    Object.assign(existing, patch);
    return existing;
  }

  const log: AttendanceLog = {
    id: uid(),
    studentId: student.id,
    hostelId: student.hostelId,
    date,
    ...patch,
  };
  data.attendance.push(log);
  return log;
}

export const demoStore = {
  getHostel(hostelId: string): HostelCenter {
    return getHostel(loadData(), hostelId);
  },

  getDefaultHostelId(): string {
    return DEFAULT_HOSTEL.id;
  },

  getStudentsByHostel(hostelId: string): Student[] {
    return loadData().students.filter((s) => s.hostelId === hostelId);
  },

  getStudentById(studentId: string): Student | undefined {
    return loadData().students.find((s) => s.id === studentId);
  },

  findStudentByPhone(phone: string): Student | undefined {
    const normalized = normalizePhone(phone);
    return loadData().students.find((s) => normalizePhone(s.phoneNumber) === normalized);
  },

  isEnrolled,

  // --- OTP -----------------------------------------------------------------

  /**
   * Issues an OTP for a student. The destination is derived from the purpose so
   * a caller can never redirect a code to an arbitrary number.
   */
  sendOtp(studentId: string, purpose: OtpPurpose): OtpChallenge {
    const data = loadData();
    const student = getStudent(data, studentId);

    const sentTo =
      purpose === 'tier2_secondary_contact'
        ? student.secondaryContactNumber
        : student.phoneNumber;

    if (!sentTo) {
      throw new Error('No secondary contact number is registered for this student.');
    }

    const challenge: OtpChallenge = {
      id: uid(),
      studentId,
      purpose,
      sentTo,
      code: String(Math.floor(100000 + Math.random() * 900000)),
      expiresAt: new Date(Date.now() + OTP_TTL_MS).toISOString(),
      consumed: false,
    };

    data.otps = data.otps.filter(
      (o) => !(o.studentId === studentId && o.purpose === purpose && !o.consumed),
    );
    data.otps.push(challenge);
    saveData(data);
    return challenge;
  },

  verifyOtp(challengeId: string, code: string): { ok: boolean; message: string } {
    const data = loadData();
    const challenge = data.otps.find((o) => o.id === challengeId);

    if (!challenge || challenge.consumed) {
      return { ok: false, message: 'This code is no longer valid. Request a new one.' };
    }
    if (new Date(challenge.expiresAt).getTime() < Date.now()) {
      return { ok: false, message: 'Code expired. Request a new one.' };
    }
    if (challenge.code !== code.trim()) {
      return { ok: false, message: 'Incorrect code.' };
    }

    challenge.consumed = true;
    if (challenge.purpose === 'registration') {
      getStudent(data, challenge.studentId).phoneVerified = true;
    }
    saveData(data);
    return { ok: true, message: 'Phone number verified.' };
  },

  // --- sessions ------------------------------------------------------------

  loginStudent(phone: string): SessionUser | null {
    const student = this.findStudentByPhone(phone);
    if (!student) return null;

    const profile: Profile = {
      id: `profile-${student.id}`,
      userId: student.id,
      hostelId: student.hostelId,
      role: 'student',
      fullName: student.name,
      phone: student.phoneNumber,
    };

    const session: SessionUser = { profile, student };
    writeJson(SESSION_KEY, session);
    return session;
  },

  getStudentSession(): SessionUser | null {
    const session = readJson<SessionUser>(SESSION_KEY);
    if (!session) return null;

    const student = loadData().students.find((s) => s.id === session.student.id);
    if (!student) return null;

    return { profile: session.profile, student };
  },

  logoutStudent(): void {
    removeItem(SESSION_KEY);
  },

  loginWarden(email: string, password: string): WardenSession | null {
    if (email !== DEFAULT_WARDEN.email || password !== 'warden123') return null;

    const data = loadData();
    const session: WardenSession = {
      profile: DEFAULT_WARDEN,
      hostel: getHostel(data, DEFAULT_WARDEN.hostelId),
    };
    writeJson(WARDEN_SESSION_KEY, session);
    return session;
  },

  getWardenSession(): WardenSession | null {
    return readJson<WardenSession>(WARDEN_SESSION_KEY);
  },

  logoutWarden(): void {
    removeItem(WARDEN_SESSION_KEY);
  },

  // --- registration --------------------------------------------------------

  addStudent(input: {
    hostelId: string;
    name: string;
    rollNumber: string;
    roomNo: string;
    phoneNumber: string;
    secondaryContactNumber?: string;
    onboardedBy: string;
  }): Student {
    const data = loadData();
    const normalized = normalizePhone(input.phoneNumber);

    if (data.students.some((s) => normalizePhone(s.phoneNumber) === normalized)) {
      throw new Error('A student with this phone number already exists.');
    }
    if (data.students.some((s) => s.rollNumber === input.rollNumber)) {
      throw new Error('A student with this roll number already exists.');
    }

    const student: Student = {
      id: uid(),
      hostelId: input.hostelId,
      name: input.name,
      rollNumber: input.rollNumber,
      roomNo: input.roomNo,
      phoneNumber: input.phoneNumber,
      secondaryContactNumber: input.secondaryContactNumber || undefined,
      overrideCount: 0,
      onboardedBy: input.onboardedBy,
      phoneVerified: false,
    };

    data.students.push(student);
    saveData(data);
    return student;
  },

  /**
   * Binds a WebAuthn credential and the current device to a student. Only
   * allowed once the phone number is verified and while no device is bound —
   * replacing a device requires warden approval.
   */
  enrollStudent(studentId: string, credentialId: string, publicKey: string): Student {
    const data = loadData();
    const student = getStudent(data, studentId);

    if (!student.phoneVerified) {
      throw new Error('Verify your phone number before enrolling a fingerprint.');
    }
    if (student.registeredDeviceId) {
      throw new Error(
        'A device is already registered. Ask your warden to approve a device change.',
      );
    }

    student.webauthnCredentialId = credentialId;
    student.webauthnPublicKey = publicKey;
    student.registeredDeviceId = getDeviceId();
    saveData(data);
    return student;
  },

  // --- check-in ------------------------------------------------------------

  checkIn(
    studentId: string,
    latitude: number,
    longitude: number,
    fingerprintVerified: boolean,
  ): CheckInResult {
    const data = loadData();
    const student = getStudent(data, studentId);
    const hostel = getHostel(data, student.hostelId);
    const today = todayInTimezone(hostel.timezone);
    const timestamp = nowIso();

    const fail = (failReason: string, message: string): CheckInResult => {
      const log = writeLog(data, student, today, {
        timestamp,
        gpsLat: latitude,
        gpsLng: longitude,
        status: 'failed',
        failReason,
      });
      saveData(data);
      return { success: false, message, log };
    };

    if (!isEnrolled(student)) {
      return fail('not_enrolled', 'Complete phone verification and fingerprint enrollment first.');
    }

    const window = getTimeWindowStatus(new Date(), hostel.timezone);
    if (!window.isOpen) {
      return fail('outside_time_window', window.message);
    }

    if (!fingerprintVerified) {
      return fail('webauthn_failed', 'Fingerprint verification failed.');
    }

    if (student.registeredDeviceId !== getDeviceId()) {
      return fail(
        'device_mismatch',
        'This is not your registered device. Ask your warden to approve a device change.',
      );
    }

    if (
      !isWithinGeofence(latitude, longitude, hostel.centerLat, hostel.centerLng, hostel.radiusMeters)
    ) {
      return fail(
        'outside_geofence',
        `You are outside the ${hostel.radiusMeters}m hostel boundary. Move closer and try again.`,
      );
    }

    // A real check-in wins over an approved leave for that night (returned early).
    const log = writeLog(data, student, today, {
      timestamp,
      gpsLat: latitude,
      gpsLng: longitude,
      status: 'success',
      failReason: undefined,
      markedBy: undefined,
    });

    saveData(data);
    return { success: true, message: 'Check-in successful!', log };
  },

  // --- leave ---------------------------------------------------------------

  submitLeave(studentId: string, startDate: string, endDate: string, reason: string): LeaveRequest {
    const data = loadData();
    const student = getStudent(data, studentId);
    const hostel = getHostel(data, student.hostelId);

    const leave: LeaveRequest = {
      id: uid(),
      studentId,
      hostelId: student.hostelId,
      startDate,
      endDate,
      reason,
      status: 'pending',
      isRetroactive: startDate < todayInTimezone(hostel.timezone),
      submittedAt: nowIso(),
    };

    data.leaves.push(leave);
    saveData(data);
    return leave;
  },

  /** Only a warden decision can put a student on leave. */
  reviewLeave(leaveId: string, status: 'approved' | 'rejected', wardenId: string): LeaveRequest {
    const data = loadData();
    const leave = findByIdOrThrow(data.leaves, leaveId, 'Leave request');

    applyDecision(leave, status, wardenId);

    if (status === 'approved') {
      const student = getStudent(data, leave.studentId);
      for (const date of datesBetween(leave.startDate, leave.endDate)) {
        const existing = findLog(data, student.id, date);
        // A successful check-in for that night always wins over leave.
        if (existing?.status === 'success') continue;

        writeLog(data, student, date, {
          timestamp: nowIso(),
          status: 'on_leave',
          failReason: undefined,
          markedBy: wardenId,
        });
      }
    }

    saveData(data);
    return leave;
  },

  getPendingLeaves(hostelId: string): LeaveRequest[] {
    return pendingForHostel(loadData().leaves, hostelId);
  },

  getStudentLeaves(studentId: string): LeaveRequest[] {
    return loadData()
      .leaves.filter((l) => l.studentId === studentId)
      .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
  },

  // --- warden actions ------------------------------------------------------

  markPresent(
    studentId: string,
    date: string,
    reason: string,
    wardenId: string,
  ): AttendanceLog {
    if (!reason.trim()) throw new Error('A reason is required for a manual override.');
    if (!wardenId.trim()) throw new Error('A warden ID is required for a manual override.');

    const data = loadData();
    const student = getStudent(data, studentId);

    const log = writeLog(data, student, date, {
      timestamp: nowIso(),
      status: 'manual_override',
      failReason: reason,
      markedBy: wardenId,
    });

    student.overrideCount += 1;
    saveData(data);
    return log;
  },

  isOverrideFlagged(student: Student): boolean {
    return student.overrideCount >= OVERRIDE_FLAG_THRESHOLD;
  },

  submitDeviceChange(input: {
    studentId: string;
    reason: string;
    newDeviceId: string;
    otpVerified: boolean;
    otpSentTo?: string;
  }): DeviceChangeRequest {
    const data = loadData();
    const student = getStudent(data, input.studentId);

    const request: DeviceChangeRequest = {
      id: uid(),
      studentId: input.studentId,
      hostelId: student.hostelId,
      otpVerified: input.otpVerified,
      otpSentTo: input.otpSentTo,
      oldDeviceId: student.registeredDeviceId,
      newDeviceId: input.newDeviceId,
      reason: input.reason,
      status: 'pending',
      requestedAt: nowIso(),
    };

    data.deviceChanges.push(request);
    saveData(data);
    return request;
  },

  /** Device replacement always requires warden approval. */
  reviewDeviceChange(
    requestId: string,
    status: 'approved' | 'rejected',
    wardenId: string,
  ): DeviceChangeRequest {
    const data = loadData();
    const request = findByIdOrThrow(data.deviceChanges, requestId, 'Device change request');

    applyDecision(request, status, wardenId);

    if (status === 'approved') {
      const student = getStudent(data, request.studentId);
      student.registeredDeviceId = request.newDeviceId;
      student.webauthnCredentialId = undefined;
      student.webauthnPublicKey = undefined;
    }

    saveData(data);
    return request;
  },

  getPendingDeviceChanges(hostelId: string): DeviceChangeRequest[] {
    return pendingForHostel(loadData().deviceChanges, hostelId);
  },

  // --- reporting -----------------------------------------------------------

  getRoll(hostelId: string, date?: string): Array<{ student: Student; log?: AttendanceLog }> {
    const data = loadData();
    const hostel = getHostel(data, hostelId);
    const targetDate = date ?? todayInTimezone(hostel.timezone);

    return data.students
      .filter((s) => s.hostelId === hostelId)
      .map((student) => ({ student, log: findLog(data, student.id, targetDate) }));
  },

  getDashboardStats(hostelId: string, date?: string): DashboardStats {
    const roll = this.getRoll(hostelId, date);
    const count = (status: AttendanceStatus) =>
      roll.filter((r) => r.log?.status === status).length;

    return {
      total: roll.length,
      present: count('success'),
      failed: count('failed'),
      manualOverride: count('manual_override'),
      onLeave: count('on_leave'),
      absent: roll.filter((r) => !r.log).length,
    };
  },

  getStudentAttendance(studentId: string): AttendanceLog[] {
    return loadData()
      .attendance.filter((a) => a.studentId === studentId)
      .sort((a, b) => b.date.localeCompare(a.date));
  },

  resetDemo(): void {
    removeItem(SESSION_KEY);
    removeItem(WARDEN_SESSION_KEY);
    saveData(defaultData());
  },
};

export function isDemoMode(): boolean {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
  return !url || !key || url.includes('your-project');
}

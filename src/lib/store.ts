import type {
  AttendanceRecord,
  AttendanceStatus,
  CheckInResult,
  DashboardStats,
  DeviceChangeRequest,
  DeviceIssueReport,
  Hostel,
  LeaveApplication,
  Profile,
  SessionUser,
  Student,
  WardenSession,
} from '@/types';
import { getDeviceFingerprint, isWithinGeofence } from '@/lib/geo';
import { datesBetween, isDateInRange, nowIso, todayInTimezone } from '@/lib/time-window';
import { readJson, removeItem, writeJson } from '@/lib/storage';

const STORAGE_KEY = 'nightcheck-data-v1';
const SESSION_KEY = 'nightcheck-session';
const WARDEN_SESSION_KEY = 'nightcheck-warden-session';

function uid(): string {
  return crypto.randomUUID();
}

interface AppData {
  hostels: Hostel[];
  profiles: Profile[];
  students: Student[];
  attendance: AttendanceRecord[];
  leaves: LeaveApplication[];
  deviceChanges: DeviceChangeRequest[];
  deviceIssues: DeviceIssueReport[];
}

const DEFAULT_HOSTEL: Hostel = {
  id: 'hostel-1',
  name: 'Block A — Girls Hostel',
  latitude: 28.6139,
  longitude: 77.209,
  geofenceRadiusM: 150,
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

const SEED_STUDENTS: Student[] = [
  {
    id: 'student-1',
    hostelId: DEFAULT_HOSTEL.id,
    fullName: 'Arpita Bakhla',
    rollNumber: 'CS2024001',
    roomNumber: '204',
    phone: '+919876543210',
    enrolled: false,
  },
  {
    id: 'student-2',
    hostelId: DEFAULT_HOSTEL.id,
    fullName: 'Priya Singh',
    rollNumber: 'CS2024002',
    roomNumber: '205',
    phone: '+919876543211',
    enrolled: true,
    webauthnCredentialId: 'demo-student-2',
    webauthnPublicKey: 'demo-public-key',
    deviceFingerprint: 'demo-device-2',
  },
  {
    id: 'student-3',
    hostelId: DEFAULT_HOSTEL.id,
    fullName: 'Ananya Patel',
    rollNumber: 'CS2024003',
    roomNumber: '206',
    phone: '+919876543212',
    enrolled: true,
    webauthnCredentialId: 'demo-student-3',
    webauthnPublicKey: 'demo-public-key',
    deviceFingerprint: 'demo-device-3',
  },
];

function defaultData(): AppData {
  return {
    hostels: [DEFAULT_HOSTEL],
    profiles: [DEFAULT_WARDEN],
    students: SEED_STUDENTS,
    attendance: [],
    leaves: [],
    deviceChanges: [],
    deviceIssues: [],
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

function applyReview<T extends { status: string; reviewedAt?: string; reviewedBy?: string }>(
  record: T,
  status: T['status'],
  wardenId: string,
): void {
  record.status = status;
  record.reviewedAt = nowIso();
  record.reviewedBy = wardenId;
}

function normalizePhone(phone: string): string {
  return phone.replace(/\s/g, '');
}

function getHostel(data: AppData, hostelId: string): Hostel {
  return findByIdOrThrow(data.hostels, hostelId, 'Hostel');
}

function getStudent(data: AppData, studentId: string): Student {
  return findByIdOrThrow(data.students, studentId, 'Student');
}

function getApprovedLeaveForDate(
  data: AppData,
  studentId: string,
  date: string,
): LeaveApplication | undefined {
  return data.leaves.find(
    (leave) =>
      leave.studentId === studentId &&
      leave.status === 'approved' &&
      isDateInRange(date, leave.fromDate, leave.toDate),
  );
}

function getOrCreateAttendance(
  data: AppData,
  student: Student,
  date: string,
): AttendanceRecord {
  let record = data.attendance.find(
    (a) => a.studentId === student.id && a.date === date,
  );

  if (!record) {
    const approvedLeave = getApprovedLeaveForDate(data, student.id, date);
    record = {
      id: uid(),
      studentId: student.id,
      hostelId: student.hostelId,
      date,
      status: approvedLeave ? 'on_leave' : 'absent',
    };
    data.attendance.push(record);
  }

  return record;
}

function syncLeaveStatuses(data: AppData, studentId: string, date: string): void {
  const record = data.attendance.find((a) => a.studentId === studentId && a.date === date);
  const approvedLeave = getApprovedLeaveForDate(data, studentId, date);

  if (record && record.status !== 'present' && record.status !== 'excused' && approvedLeave) {
    record.status = 'on_leave';
  }
}

export const demoStore = {
  getHostel(hostelId: string): Hostel {
    return getHostel(loadData(), hostelId);
  },

  getStudentsByHostel(hostelId: string): Student[] {
    return loadData().students.filter((s) => s.hostelId === hostelId);
  },

  findStudentByPhone(phone: string): Student | undefined {
    const normalized = normalizePhone(phone);
    return loadData().students.find(
      (s) => normalizePhone(s.phone) === normalized,
    );
  },

  verifyOtp(_phone: string, otp: string): boolean {
    return otp === '123456' || import.meta.env.DEV;
  },

  loginStudent(phone: string): SessionUser | null {
    const student = this.findStudentByPhone(phone);
    if (!student) return null;

    const profile: Profile = {
      id: `profile-${student.id}`,
      userId: student.id,
      hostelId: student.hostelId,
      role: 'student',
      fullName: student.fullName,
      phone: student.phone,
    };

    const session: SessionUser = { profile, student };
    writeJson(SESSION_KEY, session);
    return session;
  },

  getStudentSession(): SessionUser | null {
    const session = readJson<SessionUser>(SESSION_KEY);
    if (!session) return null;

    const data = loadData();
    const student = data.students.find((s) => s.id === session.student?.id);
    if (!student) return null;

    return { profile: session.profile, student };
  },

  logoutStudent(): void {
    removeItem(SESSION_KEY);
  },

  loginWarden(email: string, password: string): WardenSession | null {
    if (email !== DEFAULT_WARDEN.email || password !== 'warden123') {
      return null;
    }

    const data = loadData();
    const hostel = getHostel(data, DEFAULT_WARDEN.hostelId);
    const session: WardenSession = { profile: DEFAULT_WARDEN, hostel };
    writeJson(WARDEN_SESSION_KEY, session);
    return session;
  },

  getWardenSession(): WardenSession | null {
    return readJson<WardenSession>(WARDEN_SESSION_KEY);
  },

  logoutWarden(): void {
    removeItem(WARDEN_SESSION_KEY);
  },

  enrollStudent(studentId: string, credentialId: string, publicKey: string): Student {
    const data = loadData();
    const student = getStudent(data, studentId);
    student.enrolled = true;
    student.webauthnCredentialId = credentialId;
    student.webauthnPublicKey = publicKey;
    student.deviceFingerprint = getDeviceFingerprint();
    saveData(data);
    return student;
  },

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

    if (!student.enrolled) {
      return { success: false, message: 'Complete fingerprint enrollment first.' };
    }

    if (!fingerprintVerified) {
      return { success: false, message: 'Fingerprint verification failed.' };
    }

    const deviceFp = getDeviceFingerprint();
    if (student.deviceFingerprint && student.deviceFingerprint !== deviceFp) {
      return {
        success: false,
        message: 'This is not your registered device. Submit a device change request.',
      };
    }

    if (!isWithinGeofence(latitude, longitude, hostel.latitude, hostel.longitude, hostel.geofenceRadiusM)) {
      return {
        success: false,
        message: 'You are outside the hostel boundary. Move closer and try again.',
      };
    }

    const record = getOrCreateAttendance(data, student, today);

    if (record.status === 'on_leave') {
      return {
        success: false,
        message: 'You are marked on leave today. Cancel leave or contact warden.',
        record,
      };
    }

    record.status = 'present';
    record.checkedInAt = nowIso();
    record.latitude = latitude;
    record.longitude = longitude;

    saveData(data);
    return { success: true, message: 'Check-in successful!', record };
  },

  submitLeave(
    studentId: string,
    fromDate: string,
    toDate: string,
    reason: string,
  ): LeaveApplication {
    const data = loadData();
    const student = getStudent(data, studentId);

    const leave: LeaveApplication = {
      id: uid(),
      studentId,
      hostelId: student.hostelId,
      fromDate,
      toDate,
      reason,
      status: 'pending',
      submittedAt: nowIso(),
    };

    data.leaves.push(leave);
    saveData(data);
    return leave;
  },

  reviewLeave(
    leaveId: string,
    status: 'approved' | 'denied',
    wardenId: string,
    reviewNote?: string,
  ): LeaveApplication {
    const data = loadData();
    const leave = findByIdOrThrow(data.leaves, leaveId, 'Leave application');

    applyReview(leave, status, wardenId);
    leave.reviewNote = reviewNote;

    if (status === 'approved') {
      for (const date of datesBetween(leave.fromDate, leave.toDate)) {
        const record = getOrCreateAttendance(data, getStudent(data, leave.studentId), date);
        if (record.status !== 'present' && record.status !== 'excused') {
          record.status = 'on_leave';
        }
      }
    }

    saveData(data);
    return leave;
  },

  submitDeviceChange(
    studentId: string,
    reason: string,
    newDeviceInfo: string,
  ): DeviceChangeRequest {
    const data = loadData();
    const student = getStudent(data, studentId);

    const request: DeviceChangeRequest = {
      id: uid(),
      studentId,
      hostelId: student.hostelId,
      reason,
      newDeviceInfo,
      status: 'pending',
      submittedAt: nowIso(),
    };

    data.deviceChanges.push(request);
    saveData(data);
    return request;
  },

  reviewDeviceChange(
    requestId: string,
    status: 'approved' | 'denied',
    wardenId: string,
  ): DeviceChangeRequest {
    const data = loadData();
    const request = findByIdOrThrow(data.deviceChanges, requestId, 'Device change request');

    applyReview(request, status, wardenId);

    if (status === 'approved') {
      const student = getStudent(data, request.studentId);
      student.deviceFingerprint = undefined;
    }

    saveData(data);
    return request;
  },

  submitDeviceIssue(studentId: string, reason: string): DeviceIssueReport {
    const data = loadData();
    const student = getStudent(data, studentId);
    const today = todayInTimezone(getHostel(data, student.hostelId).timezone);

    const report: DeviceIssueReport = {
      id: uid(),
      studentId,
      hostelId: student.hostelId,
      reason,
      date: today,
      status: 'pending',
      submittedAt: nowIso(),
    };

    data.deviceIssues.push(report);
    saveData(data);
    return report;
  },

  reviewDeviceIssue(
    reportId: string,
    resolution: AttendanceStatus,
    wardenId: string,
  ): DeviceIssueReport {
    const data = loadData();
    const report = findByIdOrThrow(data.deviceIssues, reportId, 'Device issue report');

    applyReview(report, 'approved', wardenId);
    report.resolution = resolution;

    const student = getStudent(data, report.studentId);
    const record = getOrCreateAttendance(data, student, report.date);

    if (resolution === 'excused' || resolution === 'present') {
      record.status = resolution;
      record.overrideReason = `Device issue: ${report.reason}`;
      record.overriddenBy = wardenId;
    } else if (resolution === 'absent') {
      record.status = 'absent';
      record.overrideReason = `Device issue denied: ${report.reason}`;
      record.overriddenBy = wardenId;
    }

    saveData(data);
    return report;
  },

  manualOverride(
    studentId: string,
    date: string,
    status: AttendanceStatus,
    reason: string,
    wardenId: string,
  ): AttendanceRecord {
    const data = loadData();
    const student = getStudent(data, studentId);
    const record = getOrCreateAttendance(data, student, date);

    if (status === 'absent' && (record.status === 'present' || record.status === 'on_leave')) {
      throw new Error('Cannot mark absent when student is Present or On Leave.');
    }

    record.status = status;
    record.overrideReason = reason;
    record.overriddenBy = wardenId;
    if (status === 'present') {
      record.checkedInAt = nowIso();
    }

    saveData(data);
    return record;
  },

  addStudent(
    hostelId: string,
    fullName: string,
    rollNumber: string,
    roomNumber: string,
    phone: string,
  ): Student {
    const data = loadData();
    const student: Student = {
      id: uid(),
      hostelId,
      fullName,
      rollNumber,
      roomNumber,
      phone,
      enrolled: false,
    };
    data.students.push(student);
    saveData(data);
    return student;
  },

  forceUnbindDevice(studentId: string): Student {
    const data = loadData();
    const student = getStudent(data, studentId);
    student.deviceFingerprint = undefined;
    student.webauthnCredentialId = undefined;
    student.webauthnPublicKey = undefined;
    student.enrolled = false;
    saveData(data);
    return student;
  },

  getTodayRoll(hostelId: string, date?: string): Array<{
    student: Student;
    record: AttendanceRecord;
  }> {
    const data = loadData();
    const hostel = getHostel(data, hostelId);
    const targetDate = date ?? todayInTimezone(hostel.timezone);

    return data.students
      .filter((s) => s.hostelId === hostelId)
      .map((student) => {
        syncLeaveStatuses(data, student.id, targetDate);
        const record = getOrCreateAttendance(data, student, targetDate);
        return { student, record };
      });
  },

  getDashboardStats(hostelId: string, date?: string): DashboardStats {
    const roll = this.getTodayRoll(hostelId, date);
    return {
      total: roll.length,
      present: roll.filter((r) => r.record.status === 'present').length,
      absent: roll.filter((r) => r.record.status === 'absent').length,
      onLeave: roll.filter((r) => r.record.status === 'on_leave').length,
      excused: roll.filter((r) => r.record.status === 'excused').length,
    };
  },

  getPendingLeaves(hostelId: string): LeaveApplication[] {
    return pendingForHostel(loadData().leaves, hostelId);
  },

  getPendingDeviceChanges(hostelId: string): DeviceChangeRequest[] {
    return pendingForHostel(loadData().deviceChanges, hostelId);
  },

  getPendingDeviceIssues(hostelId: string): DeviceIssueReport[] {
    return pendingForHostel(loadData().deviceIssues, hostelId);
  },

  getStudentLeaves(studentId: string): LeaveApplication[] {
    return loadData()
      .leaves.filter((l) => l.studentId === studentId)
      .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
  },

  getStudentAttendance(studentId: string): AttendanceRecord[] {
    return loadData()
      .attendance.filter((a) => a.studentId === studentId)
      .sort((a, b) => b.date.localeCompare(a.date));
  },

  getStudentById(studentId: string): Student | undefined {
    return loadData().students.find((s) => s.id === studentId);
  },

  resetDemo(): void {
    removeItem(STORAGE_KEY);
    removeItem(SESSION_KEY);
    removeItem(WARDEN_SESSION_KEY);
    saveData(defaultData());
  },
};

export function useDemoMode(): boolean {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
  return !url || !key || url.includes('your-project');
}

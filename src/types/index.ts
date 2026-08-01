export type UserRole = 'student' | 'warden' | 'super_admin';

export type AttendanceStatus = 'present' | 'absent' | 'on_leave' | 'excused';

export type LeaveStatus = 'pending' | 'approved' | 'denied';

export type RequestStatus = 'pending' | 'approved' | 'denied';

export interface Hostel {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  geofenceRadiusM: number;
  timezone: string;
}

export interface Profile {
  id: string;
  userId: string;
  hostelId: string;
  role: UserRole;
  fullName: string;
  email?: string;
  phone?: string;
}

export interface Student {
  id: string;
  hostelId: string;
  profileId?: string;
  fullName: string;
  rollNumber: string;
  roomNumber: string;
  phone: string;
  enrolled: boolean;
  webauthnCredentialId?: string;
  webauthnPublicKey?: string;
  deviceFingerprint?: string;
}

export interface AttendanceRecord {
  id: string;
  studentId: string;
  hostelId: string;
  date: string;
  status: AttendanceStatus;
  checkedInAt?: string;
  latitude?: number;
  longitude?: number;
  overrideReason?: string;
  overriddenBy?: string;
}

export interface LeaveApplication {
  id: string;
  studentId: string;
  hostelId: string;
  fromDate: string;
  toDate: string;
  reason: string;
  status: LeaveStatus;
  submittedAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
  reviewNote?: string;
}

export interface DeviceChangeRequest {
  id: string;
  studentId: string;
  hostelId: string;
  reason: string;
  newDeviceInfo: string;
  status: RequestStatus;
  submittedAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
}

export interface DeviceIssueReport {
  id: string;
  studentId: string;
  hostelId: string;
  reason: string;
  date: string;
  status: RequestStatus;
  submittedAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
  resolution?: AttendanceStatus;
}

export interface CheckInResult {
  success: boolean;
  message: string;
  record?: AttendanceRecord;
}

export interface GeoLocation {
  latitude: number;
  longitude: number;
  accuracy?: number;
}

export interface SessionUser {
  profile: Profile;
  student?: Student;
}

export interface WardenSession {
  profile: Profile;
  hostel: Hostel;
}

export interface DashboardStats {
  present: number;
  absent: number;
  onLeave: number;
  excused: number;
  total: number;
}

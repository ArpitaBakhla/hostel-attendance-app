export type UserRole = 'student' | 'warden' | 'super_admin';

/** attendance_logs.status */
export type AttendanceStatus = 'success' | 'failed' | 'manual_override' | 'on_leave';

export type LeaveStatus = 'pending' | 'approved' | 'rejected';

export type RequestStatus = 'pending' | 'approved' | 'rejected';

/** hostel_center */
export interface HostelCenter {
  id: string;
  name: string;
  centerLat: number;
  centerLng: number;
  radiusMeters: number;
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

/** students */
export interface Student {
  id: string;
  hostelId: string;
  name: string;
  roomNo: string;
  rollNumber: string;
  phoneNumber: string;
  secondaryContactNumber?: string;
  registeredDeviceId?: string;
  webauthnCredentialId?: string;
  webauthnPublicKey?: string;
  overrideCount: number;
  onboardedBy?: string;
  phoneVerified: boolean;
}

/** attendance_logs */
export interface AttendanceLog {
  id: string;
  studentId: string;
  hostelId: string;
  /** local date (YYYY-MM-DD) the night belongs to */
  date: string;
  timestamp: string;
  gpsLat?: number;
  gpsLng?: number;
  status: AttendanceStatus;
  failReason?: string;
  markedBy?: string;
}

/** device_change_requests */
export interface DeviceChangeRequest {
  id: string;
  studentId: string;
  hostelId: string;
  otpVerified: boolean;
  otpSentTo?: string;
  oldDeviceId?: string;
  newDeviceId?: string;
  reason: string;
  status: RequestStatus;
  wardenId?: string;
  requestedAt: string;
  decidedAt?: string;
}

/** leave_requests */
export interface LeaveRequest {
  id: string;
  studentId: string;
  hostelId: string;
  startDate: string;
  endDate: string;
  reason: string;
  status: LeaveStatus;
  isRetroactive: boolean;
  submittedAt: string;
  wardenId?: string;
  decidedAt?: string;
}

export interface CheckInResult {
  success: boolean;
  message: string;
  log?: AttendanceLog;
}

export interface GeoLocation {
  latitude: number;
  longitude: number;
  accuracy?: number;
}

export interface SessionUser {
  profile: Profile;
  student: Student;
}

export interface WardenSession {
  profile: Profile;
  hostel: HostelCenter;
}

export interface DashboardStats {
  present: number;
  absent: number;
  failed: number;
  onLeave: number;
  manualOverride: number;
  total: number;
}

/** A pending OTP challenge (registration, self-report, device change). */
export type OtpPurpose =
  | 'registration'
  | 'tier1_self_report'
  | 'tier2_secondary_contact'
  | 'device_change';

export interface OtpChallenge {
  id: string;
  studentId: string;
  purpose: OtpPurpose;
  sentTo: string;
  code: string;
  expiresAt: string;
  consumed: boolean;
}

export type UserRole = 'student' | 'warden' | 'super_admin';

/** attendance_logs.status */
export type AttendanceStatus = 'success' | 'failed' | 'manual_override' | 'on_leave' | 'absent' | 'late' | 'excused';

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
  /** Equals the auth user id. */
  id: string;
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
  hideHistoryLocal?: boolean;
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
  hostel: HostelCenter;
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

export type MalfunctionTier = 'tier1' | 'tier2' | 'tier3';

/** malfunction_reports */
export interface MalfunctionReport {
  id: string;
  studentId: string;
  hostelId: string;
  reportDate: string;
  tier: MalfunctionTier;
  reason: string;
  otpVerified: boolean;
  otpSentTo?: string;
  /** Tier 3 only: the floor-mate who informed the warden. */
  reportedByStudentId?: string;
  status: RequestStatus;
  wardenId?: string;
  createdAt: string;
  decidedAt?: string;
}

export type OtpPurpose =
  | 'registration'
  | 'login'
  | 'tier1_self_report'
  | 'tier2_secondary_contact'
  | 'device_change';

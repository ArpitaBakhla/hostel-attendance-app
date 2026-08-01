import { startAuthentication, startRegistration } from '@simplewebauthn/browser';
import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/browser';
import { callFunction, supabase } from '@/lib/supabase';
import { getDeviceId } from '@/lib/geo';
import type {
  AttendanceLog,
  DeviceChangeRequest,
  HostelCenter,
  LeaveRequest,
  MalfunctionReport,
  OtpPurpose,
  Profile,
  Student,
} from '@/types';

interface OtpSendResponse {
  challengeId?: string;
  sentTo: string;
  /** Only present when the project runs with OTP_ECHO=true. */
  code?: string;
}

export const api = {
  // --- auth ----------------------------------------------------------------

  sendOtp(phoneNumber: string, purpose: OtpPurpose): Promise<OtpSendResponse> {
    return callFunction<OtpSendResponse>('otp-send', { phoneNumber, purpose });
  },

  /** Verifies a registration/login code and starts a Supabase session. */
  async verifyOtpAndSignIn(challengeId: string, code: string): Promise<void> {
    const { tokenHash } = await callFunction<{ tokenHash: string }>('otp-verify', {
      challengeId,
      code,
    });

    const { error } = await supabase().auth.verifyOtp({ token_hash: tokenHash, type: 'email' });
    if (error) throw error;
  },

  async signInWarden(email: string, password: string): Promise<void> {
    const { error } = await supabase().auth.signInWithPassword({ email, password });
    if (error) throw error;
  },

  async signOut(): Promise<void> {
    await supabase().auth.signOut();
  },

  async getProfile(): Promise<Profile | null> {
    const { data: auth } = await supabase().auth.getUser();
    if (!auth.user) return null;

    const { data, error } = await supabase()
      .from('profiles')
      .select('*')
      .eq('id', auth.user.id)
      .maybeSingle();
    if (error) throw error;
    return data ? toProfile(data) : null;
  },

  async getMyStudent(): Promise<Student | null> {
    const { data: auth } = await supabase().auth.getUser();
    if (!auth.user) return null;

    const { data, error } = await supabase()
      .from('students')
      .select('*')
      .eq('user_id', auth.user.id)
      .maybeSingle();
    if (error) throw error;
    return data ? toStudent(data) : null;
  },

  async getHostel(hostelId: string): Promise<HostelCenter> {
    const { data, error } = await supabase()
      .from('hostel_center')
      .select('*')
      .eq('id', hostelId)
      .single();
    if (error) throw error;
    return toHostel(data);
  },

  // --- enrollment ----------------------------------------------------------

  async enrollDevice(): Promise<void> {
    const options = await callFunction<PublicKeyCredentialCreationOptionsJSON>(
      'webauthn-register',
      { step: 'options' },
    );
    const response = await startRegistration({ optionsJSON: options });
    await callFunction('webauthn-register', {
      step: 'verify',
      response,
      deviceId: getDeviceId(),
    });
  },

  // --- check-in ------------------------------------------------------------

  async checkIn(
    gpsLat: number,
    gpsLng: number,
  ): Promise<{ success: boolean; message: string; failReason?: string }> {
    const options = await callFunction<
      PublicKeyCredentialRequestOptionsJSON & { success?: boolean; message?: string }
    >('check-in', { step: 'options' });

    // The server short-circuits (and logs a failure) before issuing options
    // when the window is closed or the student is not enrolled.
    if (options.success === false) {
      return options as { success: boolean; message: string; failReason?: string };
    }

    const response = await startAuthentication({ optionsJSON: options });
    return callFunction('check-in', {
      step: 'verify',
      response,
      deviceId: getDeviceId(),
      gpsLat,
      gpsLng,
    });
  },

  // --- fallback tiers ------------------------------------------------------

  reportMalfunction(input: {
    tier: 'tier1' | 'tier2';
    reason: string;
    challengeId: string;
    code: string;
  }): Promise<{ message: string }> {
    return callFunction('malfunction-report', input);
  },

  /** Tier 3: a floor-mate can only inform the warden. */
  reportOnBehalf(studentRollNumber: string, reason: string): Promise<{ message: string }> {
    return callFunction('malfunction-report', { tier: 'tier3', studentRollNumber, reason });
  },

  requestDeviceChange(input: {
    challengeId: string;
    code: string;
    reason: string;
  }): Promise<{ message: string }> {
    return callFunction('device-change-request', { ...input, newDeviceId: getDeviceId() });
  },

  // --- leave ---------------------------------------------------------------

  async submitLeave(
    student: Student,
    startDate: string,
    endDate: string,
    reason: string,
    today: string,
  ): Promise<void> {
    const { error } = await supabase().from('leave_requests').insert({
      student_id: student.id,
      hostel_id: student.hostelId,
      start_date: startDate,
      end_date: endDate,
      reason,
      is_retroactive: startDate < today,
    });
    if (error) throw error;
  },

  async listMyLeaves(studentId: string): Promise<LeaveRequest[]> {
    const { data, error } = await supabase()
      .from('leave_requests')
      .select('*')
      .eq('student_id', studentId)
      .order('submitted_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(toLeave);
  },

  async listMyAttendance(studentId: string): Promise<AttendanceLog[]> {
    const { data, error } = await supabase()
      .from('attendance_logs')
      .select('*')
      .eq('student_id', studentId)
      .order('log_date', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(toLog);
  },

  // --- warden --------------------------------------------------------------

  async listStudents(hostelId: string): Promise<Student[]> {
    const { data, error } = await supabase()
      .from('students')
      .select('*')
      .eq('hostel_id', hostelId)
      .order('room_no');
    if (error) throw error;
    return (data ?? []).map(toStudent);
  },

  async listAttendanceForDate(hostelId: string, date: string): Promise<AttendanceLog[]> {
    const { data, error } = await supabase()
      .from('attendance_logs')
      .select('*')
      .eq('hostel_id', hostelId)
      .eq('log_date', date);
    if (error) throw error;
    return (data ?? []).map(toLog);
  },

  async listPendingLeaves(hostelId: string): Promise<LeaveRequest[]> {
    const { data, error } = await supabase()
      .from('leave_requests')
      .select('*')
      .eq('hostel_id', hostelId)
      .eq('status', 'pending')
      .order('submitted_at');
    if (error) throw error;
    return (data ?? []).map(toLeave);
  },

  async listPendingMalfunctions(hostelId: string): Promise<MalfunctionReport[]> {
    const { data, error } = await supabase()
      .from('malfunction_reports')
      .select('*')
      .eq('hostel_id', hostelId)
      .eq('status', 'pending')
      .order('created_at');
    if (error) throw error;
    return (data ?? []).map(toMalfunction);
  },

  async listPendingDeviceChanges(hostelId: string): Promise<DeviceChangeRequest[]> {
    const { data, error } = await supabase()
      .from('device_change_requests')
      .select('*')
      .eq('hostel_id', hostelId)
      .eq('status', 'pending')
      .order('requested_at');
    if (error) throw error;
    return (data ?? []).map(toDeviceChange);
  },

  markPresent(studentId: string, reason: string, date?: string): Promise<{ overrideCount: number }> {
    return callFunction('warden-action', { action: 'mark-present', studentId, reason, date });
  },

  reviewLeave(requestId: string, decision: 'approved' | 'rejected'): Promise<unknown> {
    return callFunction('warden-action', { action: 'review-leave', requestId, decision });
  },

  reviewMalfunction(requestId: string, decision: 'approved' | 'rejected'): Promise<unknown> {
    return callFunction('warden-action', { action: 'review-malfunction', requestId, decision });
  },

  reviewDeviceChange(requestId: string, decision: 'approved' | 'rejected'): Promise<unknown> {
    return callFunction('warden-action', { action: 'review-device-change', requestId, decision });
  },

  addStudent(input: {
    name: string;
    rollNumber: string;
    roomNo: string;
    phoneNumber: string;
    secondaryContactNumber?: string;
  }): Promise<{ studentId: string }> {
    return callFunction('warden-action', { action: 'add-student', ...input });
  },
};

// --- row mappers -----------------------------------------------------------

type Row = Record<string, unknown>;

function toProfile(row: Row): Profile {
  return {
    id: row.id as string,
    hostelId: row.hostel_id as string,
    role: row.role as Profile['role'],
    fullName: row.full_name as string,
    email: (row.email as string) ?? undefined,
    phone: (row.phone as string) ?? undefined,
  };
}

function toStudent(row: Row): Student {
  return {
    id: row.id as string,
    hostelId: row.hostel_id as string,
    name: row.name as string,
    roomNo: row.room_no as string,
    rollNumber: row.roll_number as string,
    phoneNumber: row.phone_number as string,
    secondaryContactNumber: (row.secondary_contact_number as string) ?? undefined,
    registeredDeviceId: (row.registered_device_id as string) ?? undefined,
    webauthnCredentialId: (row.webauthn_credential_id as string) ?? undefined,
    overrideCount: row.override_count as number,
    onboardedBy: (row.onboarded_by as string) ?? undefined,
    phoneVerified: row.phone_verified as boolean,
  };
}

function toHostel(row: Row): HostelCenter {
  return {
    id: row.id as string,
    name: row.name as string,
    centerLat: row.center_lat as number,
    centerLng: row.center_lng as number,
    radiusMeters: row.radius_meters as number,
    timezone: row.timezone as string,
  };
}

function toLog(row: Row): AttendanceLog {
  return {
    id: row.id as string,
    studentId: row.student_id as string,
    hostelId: row.hostel_id as string,
    date: row.log_date as string,
    timestamp: row.timestamp as string,
    gpsLat: (row.gps_lat as number) ?? undefined,
    gpsLng: (row.gps_lng as number) ?? undefined,
    status: row.status as AttendanceLog['status'],
    failReason: (row.fail_reason as string) ?? undefined,
    markedBy: (row.marked_by as string) ?? undefined,
  };
}

function toLeave(row: Row): LeaveRequest {
  return {
    id: row.id as string,
    studentId: row.student_id as string,
    hostelId: row.hostel_id as string,
    startDate: row.start_date as string,
    endDate: row.end_date as string,
    reason: row.reason as string,
    status: row.status as LeaveRequest['status'],
    isRetroactive: row.is_retroactive as boolean,
    submittedAt: row.submitted_at as string,
    wardenId: (row.warden_id as string) ?? undefined,
    decidedAt: (row.decided_at as string) ?? undefined,
  };
}

function toMalfunction(row: Row): MalfunctionReport {
  return {
    id: row.id as string,
    studentId: row.student_id as string,
    hostelId: row.hostel_id as string,
    reportDate: row.report_date as string,
    tier: row.tier as MalfunctionReport['tier'],
    reason: row.reason as string,
    otpVerified: row.otp_verified as boolean,
    otpSentTo: (row.otp_sent_to as string) ?? undefined,
    reportedByStudentId: (row.reported_by_student_id as string) ?? undefined,
    status: row.status as MalfunctionReport['status'],
    wardenId: (row.warden_id as string) ?? undefined,
    createdAt: row.created_at as string,
    decidedAt: (row.decided_at as string) ?? undefined,
  };
}

function toDeviceChange(row: Row): DeviceChangeRequest {
  return {
    id: row.id as string,
    studentId: row.student_id as string,
    hostelId: row.hostel_id as string,
    otpVerified: row.otp_verified as boolean,
    otpSentTo: (row.otp_sent_to as string) ?? undefined,
    oldDeviceId: (row.old_device_id as string) ?? undefined,
    newDeviceId: (row.new_device_id as string) ?? undefined,
    reason: row.reason as string,
    status: row.status as DeviceChangeRequest['status'],
    wardenId: (row.warden_id as string) ?? undefined,
    requestedAt: row.requested_at as string,
    decidedAt: (row.decided_at as string) ?? undefined,
  };
}

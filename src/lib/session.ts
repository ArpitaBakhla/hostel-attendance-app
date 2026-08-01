import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import type { SessionUser, WardenSession } from '@/types';

export interface SessionState {
  loading: boolean;
  student: SessionUser | null;
  warden: WardenSession | null;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

export function isEnrolled(student: SessionUser['student']): boolean {
  return Boolean(
    student.phoneVerified && student.webauthnCredentialId && student.registeredDeviceId,
  );
}

export function useSession(): SessionState {
  const [loading, setLoading] = useState(true);
  const [student, setStudent] = useState<SessionUser | null>(null);
  const [warden, setWarden] = useState<WardenSession | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const profile = await api.getProfile();
      if (!profile) {
        setStudent(null);
        setWarden(null);
        return;
      }

      const hostel = await api.getHostel(profile.hostelId);
      if (profile.role === 'student') {
        const record = await api.getMyStudent();
        setWarden(null);
        setStudent(record ? { profile, student: record, hostel } : null);
      } else {
        setStudent(null);
        setWarden({ profile, hostel });
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setLoading(false);
      return;
    }

    refresh();
    const { data } = supabase().auth.onAuthStateChange(() => {
      refresh();
    });
    return () => data.subscription.unsubscribe();
  }, [refresh]);

  const signOut = useCallback(async () => {
    await api.signOut();
    setStudent(null);
    setWarden(null);
  }, []);

  return { loading, student, warden, refresh, signOut };
}

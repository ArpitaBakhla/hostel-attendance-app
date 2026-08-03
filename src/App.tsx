import { Navigate, Route, Routes } from 'react-router-dom';
import { CheckInPage } from '@/pages/student/CheckInPage';
import { EnrollPage } from '@/pages/student/EnrollPage';
import { HistoryPage } from '@/pages/student/HistoryPage';
import { SettingsPage } from '@/pages/student/SettingsPage';
import { MalfunctionPage } from '@/pages/student/MalfunctionPage';
import { StudentLoginPage } from '@/pages/student/StudentLoginPage';
import { AddStudentPage } from '@/pages/warden/AddStudentPage';
import { WardenHomePage } from '@/pages/warden/WardenHomePage';
import { WardenLoginPage } from '@/pages/warden/WardenLoginPage';
import { AlertBanner, PageShell } from '@/components/ui';
import { isEnrolled, useSession } from '@/lib/session';
import { isSupabaseConfigured } from '@/lib/supabase';
import type { SessionUser, WardenSession } from '@/types';

export default function App() {
  const session = useSession();

  if (!isSupabaseConfigured()) {
    return (
      <PageShell>
        <main className="flex flex-grow items-center justify-center p-6">
          <AlertBanner
            type="error"
            message="Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, then reload."
          />
        </main>
      </PageShell>
    );
  }

  if (session.loading) {
    return (
      <PageShell>
        <main className="flex flex-grow items-center justify-center p-6 text-on-surface-variant">
          Loading…
        </main>
      </PageShell>
    );
  }

  const requireStudent = (render: (value: SessionUser) => React.ReactElement) =>
    session.student ? render(session.student) : <Navigate to="/student/login" replace />;

  const requireWarden = (render: (value: WardenSession) => React.ReactElement) =>
    session.warden ? render(session.warden) : <Navigate to="/warden/login" replace />;

  return (
    <Routes>
      <Route path="/" element={<Navigate to={session.warden ? '/warden' : '/student/check-in'} replace />} />
      <Route path="/student" element={<Navigate to="/student/check-in" replace />} />

      <Route
        path="/student/login"
        element={session.student ? <Navigate to="/student/check-in" replace /> : <StudentLoginPage />}
      />
      <Route path="/student/malfunction" element={<MalfunctionPage session={session.student} />} />
      <Route
        path="/student/enroll"
        element={requireStudent((value) => (
          <EnrollPage session={value} onEnrolled={session.refresh} />
        ))}
      />
      <Route
        path="/student/check-in"
        element={requireStudent((value) =>
          isEnrolled(value.student) ? (
            <CheckInPage session={value} />
          ) : (
            <Navigate to="/student/enroll" replace />
          ),
        )}
      />
      <Route
        path="/student/history"
        element={requireStudent(() => <HistoryPage />)}
      />
      <Route
        path="/student/settings"
        element={requireStudent(() => <SettingsPage />)}
      />

      <Route
        path="/warden/login"
        element={session.warden ? <Navigate to="/warden" replace /> : <WardenLoginPage />}
      />
      <Route
        path="/warden"
        element={requireWarden((value) => (
          <WardenHomePage session={value} onSignOut={session.signOut} />
        ))}
      />
      <Route path="/warden/students/new" element={requireWarden(() => <AddStudentPage />)} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

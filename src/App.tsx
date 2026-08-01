import { useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { CheckInPage } from '@/pages/student/CheckInPage';
import { EnrollPage } from '@/pages/student/EnrollPage';
import { StudentLoginPage } from '@/pages/student/StudentLoginPage';
import { AddStudentPage } from '@/pages/warden/AddStudentPage';
import { WardenHomePage } from '@/pages/warden/WardenHomePage';
import { WardenLoginPage } from '@/pages/warden/WardenLoginPage';
import { demoStore } from '@/lib/store';
import type { SessionUser, WardenSession } from '@/types';

export default function App() {
  const [studentSession, setStudentSession] = useState<SessionUser | null>(() =>
    demoStore.getStudentSession(),
  );
  const [wardenSession, setWardenSession] = useState<WardenSession | null>(() =>
    demoStore.getWardenSession(),
  );

  const requireStudent = (render: (session: SessionUser) => React.ReactElement) =>
    studentSession ? render(studentSession) : <Navigate to="/student/login" replace />;

  const requireWarden = (render: (session: WardenSession) => React.ReactElement) =>
    wardenSession ? render(wardenSession) : <Navigate to="/warden/login" replace />;

  return (
    <Routes>
      <Route path="/" element={<Navigate to="/student/check-in" replace />} />
      <Route path="/student" element={<Navigate to="/student/check-in" replace />} />

      <Route
        path="/student/login"
        element={<StudentLoginPage onLogin={setStudentSession} />}
      />
      <Route
        path="/student/enroll"
        element={requireStudent((session) => (
          <EnrollPage session={session} onSessionUpdate={setStudentSession} />
        ))}
      />
      <Route
        path="/student/check-in"
        element={requireStudent((session) =>
          demoStore.isEnrolled(session.student) ? (
            <CheckInPage session={session} />
          ) : (
            <Navigate to="/student/enroll" replace />
          ),
        )}
      />

      <Route path="/warden/login" element={<WardenLoginPage onLogin={setWardenSession} />} />
      <Route
        path="/warden"
        element={requireWarden((session) => (
          <WardenHomePage
            session={session}
            onLogout={() => {
              demoStore.logoutWarden();
              setWardenSession(null);
            }}
          />
        ))}
      />
      <Route
        path="/warden/students/new"
        element={requireWarden((session) => <AddStudentPage session={session} />)}
      />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

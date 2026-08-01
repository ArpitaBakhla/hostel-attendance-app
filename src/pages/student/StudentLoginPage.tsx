import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertBanner, FormField, GlassButton, GlassPanel, PageShell, TextInput } from '@/components/ui';
import { OtpForm } from '@/components/OtpForm';
import { demoStore } from '@/lib/store';
import type { SessionUser, Student } from '@/types';

interface StudentLoginPageProps {
  onLogin: (session: SessionUser) => void;
}

export function StudentLoginPage({ onLogin }: StudentLoginPageProps) {
  const navigate = useNavigate();
  const [phone, setPhone] = useState('');
  const [student, setStudent] = useState<Student | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleContinue = () => {
    const match = demoStore.findStudentByPhone(phone);
    if (!match) {
      setError('No student is registered with this number. Ask your warden to add you.');
      return;
    }
    setError(null);
    setStudent(match);
  };

  const handleVerified = () => {
    const session = demoStore.loginStudent(phone);
    if (!session) {
      setError('Could not start your session. Try again.');
      return;
    }
    onLogin(session);
    navigate(demoStore.isEnrolled(session.student) ? '/student/check-in' : '/student/enroll');
  };

  return (
    <PageShell>
      <main className="flex flex-grow flex-col items-center justify-center px-[var(--spacing-container-margin-mobile)]">
        <GlassPanel className="flex w-full max-w-md flex-col gap-[var(--spacing-stack-lg)] p-6">
          <div className="flex flex-col gap-1">
            <h1 className="font-[family-name:var(--font-headline-md)] text-2xl font-semibold text-primary">
              NightCheck
            </h1>
            <p className="font-[family-name:var(--font-body-md)] text-sm text-on-surface-variant">
              Sign in with your registered phone number.
            </p>
          </div>

          {error && <AlertBanner type="error" message={error} />}

          {!student ? (
            <>
              <FormField label="Phone number">
                <TextInput
                  value={phone}
                  inputMode="tel"
                  placeholder="+91XXXXXXXXXX"
                  onChange={(event) => setPhone(event.target.value)}
                  className="bg-surface-container text-on-surface"
                />
              </FormField>
              <GlassButton onClick={handleContinue} disabled={!phone.trim()}>
                Continue
              </GlassButton>
            </>
          ) : (
            <OtpForm
              studentId={student.id}
              purpose="registration"
              description={`Hi ${student.name}, we'll text a code to your registered number to verify it's you.`}
              onVerified={handleVerified}
            />
          )}

          <Link
            to="/warden/login"
            className="text-center font-[family-name:var(--font-label-md)] text-sm text-primary underline"
          >
            Warden sign in
          </Link>
        </GlassPanel>
      </main>
    </PageShell>
  );
}

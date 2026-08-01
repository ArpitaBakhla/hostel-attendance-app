import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { TopAppBar } from '@/components/student/TopAppBar';
import { AlertBanner, GlassButton, GlassPanel, PageShell } from '@/components/ui';
import { api } from '@/lib/api';
import { getDeviceId } from '@/lib/geo';
import { isEnrolled } from '@/lib/session';
import type { SessionUser } from '@/types';

interface EnrollPageProps {
  session: SessionUser;
  onEnrolled: () => Promise<void>;
}

export function EnrollPage({ session, onEnrolled }: EnrollPageProps) {
  const navigate = useNavigate();
  const student = session.student;
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const deviceBound = Boolean(student.registeredDeviceId);
  const deviceIsThisOne = student.registeredDeviceId === getDeviceId();

  const handleEnroll = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.enrollDevice();
      await onEnrolled();
      navigate('/student/check-in');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fingerprint enrollment failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <PageShell>
      <TopAppBar />
      <main className="flex flex-grow flex-col items-center justify-center px-[var(--spacing-container-margin-mobile)] pt-24">
        <GlassPanel className="flex w-full max-w-md flex-col gap-[var(--spacing-stack-lg)] p-6">
          <div className="flex flex-col gap-1">
            <h1 className="font-[family-name:var(--font-headline-md)] text-2xl font-semibold text-on-surface">
              Finish setup
            </h1>
            <p className="font-[family-name:var(--font-body-md)] text-sm text-on-surface-variant">
              {student.name} · Room {student.roomNo} · {student.rollNumber}
            </p>
          </div>

          {error && <AlertBanner type="error" message={error} />}

          <Step index={1} title="Phone number verified" done={student.phoneVerified} />

          <Step
            index={2}
            title="Enroll fingerprint and bind this device"
            done={deviceBound && deviceIsThisOne}
          >
            {deviceBound ? (
              <AlertBanner
                type={deviceIsThisOne ? 'success' : 'error'}
                message={
                  deviceIsThisOne
                    ? 'This device is registered for check-in.'
                    : 'Another device is already registered. Ask your warden to approve a device change.'
                }
              />
            ) : (
              <GlassButton onClick={handleEnroll} disabled={!student.phoneVerified || busy}>
                {busy ? 'Enrolling…' : 'Enroll fingerprint'}
              </GlassButton>
            )}
          </Step>

          {isEnrolled(student) && (
            <GlassButton onClick={() => navigate('/student/check-in')}>Go to check-in</GlassButton>
          )}
        </GlassPanel>
      </main>
    </PageShell>
  );
}

function Step({
  index,
  title,
  done,
  children,
}: {
  index: number;
  title: string;
  done: boolean;
  children?: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-white/10 p-4">
      <div className="flex items-center gap-3">
        <span
          className={`flex h-7 w-7 items-center justify-center rounded-full border text-sm font-semibold ${
            done
              ? 'border-emerald/30 bg-emerald/10 text-emerald'
              : 'border-white/20 text-on-surface-variant'
          }`}
        >
          {done ? '✓' : index}
        </span>
        <h2 className="font-[family-name:var(--font-label-md)] text-base font-medium text-on-surface">
          {title}
        </h2>
      </div>
      {children}
    </section>
  );
}

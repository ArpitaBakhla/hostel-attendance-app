import { Link } from 'react-router-dom';
import { GlassPanel, PageShell, StatusBadge } from '@/components/ui';
import { demoStore } from '@/lib/store';
import type { WardenSession } from '@/types';

interface WardenHomePageProps {
  session: WardenSession;
  onLogout: () => void;
}

export function WardenHomePage({ session, onLogout }: WardenHomePageProps) {
  const roll = demoStore.getRoll(session.hostel.id);

  return (
    <PageShell>
      <main className="flex flex-grow flex-col items-center px-[var(--spacing-container-margin-mobile)] py-10">
        <div className="flex w-full max-w-3xl flex-col gap-[var(--spacing-stack-lg)]">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="font-[family-name:var(--font-headline-md)] text-2xl font-semibold text-on-surface">
                {session.hostel.name}
              </h1>
              <p className="font-[family-name:var(--font-body-md)] text-sm text-on-surface-variant">
                {session.profile.fullName}
              </p>
            </div>
            <div className="flex items-center gap-4">
              <Link
                to="/warden/students/new"
                className="font-[family-name:var(--font-label-md)] text-sm text-primary underline"
              >
                Add student
              </Link>
              <button
                type="button"
                onClick={onLogout}
                className="font-[family-name:var(--font-label-md)] text-sm text-on-surface-variant underline"
              >
                Sign out
              </button>
            </div>
          </div>

          <GlassPanel className="flex flex-col divide-y divide-white/5 p-2">
            {roll.map(({ student, log }) => (
              <div key={student.id} className="flex items-center justify-between gap-4 p-4">
                <div>
                  <p className="font-[family-name:var(--font-label-md)] text-base text-on-surface">
                    {student.name}
                  </p>
                  <p className="font-[family-name:var(--font-body-md)] text-xs text-on-surface-variant">
                    Room {student.roomNo} · {student.rollNumber} ·{' '}
                    {demoStore.isEnrolled(student) ? 'Enrolled' : 'Enrollment pending'}
                  </p>
                </div>
                <StatusBadge status={log?.status ?? 'absent'} />
              </div>
            ))}
          </GlassPanel>
        </div>
      </main>
    </PageShell>
  );
}

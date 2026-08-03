import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { PageShell, StatusBadge, AlertBanner } from '@/components/ui';
import { TopAppBar } from '@/components/student/TopAppBar';

interface Log {
  log_date: string;
  status: 'success' | 'failed' | 'manual_override' | 'on_leave' | 'absent' | 'late' | 'excused';
}

export function HistoryPage() {
  const [logs, setLogs] = useState<Log[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadLogs() {
      try {
        const student = await api.getMyStudent();
        if (!student) throw new Error('Not logged in as student');
        const data = await api.listMyAttendance(student.id);
        const mappedLogs = data.map(log => ({
          log_date: log.date,
          status: log.status
        }));
        setLogs(mappedLogs);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not load history.');
      } finally {
        setLoading(false);
      }
    }
    loadLogs();
  }, []);

  return (
    <PageShell>
      <TopAppBar showMenu />
      <main className="flex flex-grow flex-col px-[var(--spacing-container-margin-mobile)] py-20 pb-24">
        <h1 className="mb-6 font-[family-name:var(--font-headline-md)] text-2xl font-semibold text-on-surface">
          Attendance History
        </h1>
        {error && <AlertBanner type="error" message={error} />}

        {loading ? (
          <div className="flex justify-center p-10 text-on-surface-variant">Loading...</div>
        ) : (
          <div className="flex flex-col gap-4">
            {logs.length === 0 ? (
              <p className="text-on-surface-variant">No attendance logs found.</p>
            ) : (
              logs.map((log) => (
                <div
                  key={log.log_date}
                  className="flex items-center justify-between rounded-xl border border-white/5 bg-surface-container p-4"
                >
                  <span className="font-[family-name:var(--font-body-lg)] font-medium text-on-surface">
                    {log.log_date}
                  </span>
                  <StatusBadge status={log.status as any} />
                </div>
              ))
            )}
          </div>
        )}
      </main>
    </PageShell>
  );
}

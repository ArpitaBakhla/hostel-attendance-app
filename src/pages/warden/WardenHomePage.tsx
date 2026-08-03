import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertBanner, GlassButton, GlassPanel, PageShell, StatusBadge } from '@/components/ui';
import { api } from '@/lib/api';
import { hostelToday } from '@/lib/time-window';
import type {
  AttendanceLog,
  DeviceChangeRequest,
  LeaveRequest,
  MalfunctionReport,
  Student,
  WardenSession,
} from '@/types';

/** Students with at least this many manual overrides are flagged for review. */
const OVERRIDE_FLAG_THRESHOLD = 3;

interface WardenHomePageProps {
  session: WardenSession;
  onSignOut: () => Promise<void>;
}

export function WardenHomePage({ session, onSignOut }: WardenHomePageProps) {
  const hostelId = session.hostel.id;
  const today = hostelToday(session.hostel.timezone);
  
  // Calculate if it's past 9:00 PM for the alert banner
  const [isPastDeadline, setIsPastDeadline] = useState(false);
  useEffect(() => {
    const checkTime = () => {
      const now = new Date();
      const options: Intl.DateTimeFormatOptions = { timeZone: session.hostel.timezone, hour: 'numeric', minute: 'numeric', hour12: false };
      const formatter = new Intl.DateTimeFormat('en-US', options);
      const parts = formatter.formatToParts(now);
      const hourStr = parts.find(p => p.type === 'hour')?.value;
      const minStr = parts.find(p => p.type === 'minute')?.value;
      if (hourStr && minStr) {
        const h = parseInt(hourStr, 10);
        // Past 9:00 PM (21:00)
        setIsPastDeadline(h >= 21);
      }
    };
    checkTime();
    const interval = setInterval(checkTime, 60000);
    return () => clearInterval(interval);
  }, [session.hostel.timezone]);

  const [students, setStudents] = useState<Student[]>([]);
  const [logs, setLogs] = useState<AttendanceLog[]>([]);
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [malfunctions, setMalfunctions] = useState<MalfunctionReport[]>([]);
  const [deviceChanges, setDeviceChanges] = useState<DeviceChangeRequest[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [studentRows, logRows, leaveRows, malfunctionRows, deviceRows] = await Promise.all([
        api.listStudents(hostelId),
        api.listAttendanceForDate(hostelId, today),
        api.listPendingLeaves(hostelId),
        api.listPendingMalfunctions(hostelId),
        api.listPendingDeviceChanges(hostelId),
      ]);
      setStudents(studentRows);
      setLogs(logRows);
      setLeaves(leaveRows);
      setMalfunctions(malfunctionRows);
      setDeviceChanges(deviceRows);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the dashboard.');
    }
  }, [hostelId, today]);

  useEffect(() => {
    load();
  }, [load]);

  const logFor = (studentId: string) => logs.find((log) => log.studentId === studentId);
  const nameFor = (studentId: string) =>
    students.find((student) => student.id === studentId)?.name ?? 'Unknown student';

  const counts = {
    success: logs.filter((log) => log.status === 'success').length,
    failed: logs.filter((log) => log.status === 'failed').length,
    override: logs.filter((log) => log.status === 'manual_override').length,
    onLeave: logs.filter((log) => log.status === 'on_leave').length,
  };

  const run = async (action: () => Promise<unknown>) => {
    try {
      await action();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed.');
    }
  };

  const handleMarkPresent = (student: Student) => {
    const reason = window.prompt(
      `Mark ${student.name} present. Reason (required — you must have verified them in person):`,
    );
    if (!reason?.trim()) return;
    return run(() => api.markPresent(student.id, reason.trim()));
  };

  const handleMarkAbsent = (student: Student) => {
    if (confirm(`Mark ${student.name} absent?`)) {
      return run(() => api.markAbsent(student.id, 'Marked by warden'));
    }
  };

  const handleMarkLate = (student: Student) => {
    if (confirm(`Mark ${student.name} late?`)) {
      return run(() => api.markLate(student.id, 'Marked by warden'));
    }
  };

  const handleMarkAllPresent = () => {
    const reason = window.prompt('Reason for marking ALL remaining students PRESENT:');
    if (!reason?.trim()) return;
    return run(() => api.markAllPresent(reason.trim()));
  };

  const handleMarkAllAbsent = () => {
    if (confirm('Are you sure you want to mark ALL remaining students ABSENT?')) {
      return run(() => api.markAllAbsent());
    }
  };

  return (
    <PageShell>
      <main className="flex flex-grow flex-col gap-[var(--spacing-stack-lg)] px-[var(--spacing-container-margin-mobile)] py-8">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="font-[family-name:var(--font-headline-md)] text-2xl font-semibold text-on-surface">
              {session.hostel.name}
            </h1>
            <p className="font-[family-name:var(--font-body-md)] text-sm text-on-surface-variant">
              {today} · {students.length} students
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
              onClick={onSignOut}
              className="font-[family-name:var(--font-label-md)] text-sm text-on-surface-variant underline"
            >
              Sign out
            </button>
          </div>
        </header>

        {error && <AlertBanner type="error" message={error} />}
        {isPastDeadline && counts.success + counts.failed + counts.override + counts.onLeave < students.length && (
          <AlertBanner type="error" message="It is past 9:00 PM and some students have not checked in. Please review the roll." />
        )}

        <div className="grid grid-cols-4 gap-3">
          <Stat label="Present" value={counts.success} />
          <Stat label="Failed" value={counts.failed} />
          <Stat label="Override" value={counts.override} />
          <Stat label="On leave" value={counts.onLeave} />
        </div>

        <Section title={`Malfunction queue (${malfunctions.length})`}>
          {malfunctions.length === 0 ? (
            <Empty>No open device reports.</Empty>
          ) : (
            malfunctions.map((report) => (
              <Row key={report.id}>
                <div>
                  <p className="text-sm text-on-surface">
                    {nameFor(report.studentId)} · {report.tier.toUpperCase()}
                  </p>
                  <p className="text-xs text-on-surface-variant">{report.reason}</p>
                  <p className="text-xs text-on-surface-variant">
                    {report.tier === 'tier3'
                      ? `Reported by ${nameFor(report.reportedByStudentId ?? '')} — verify in person before marking.`
                      : `OTP verified to ${report.otpSentTo}`}
                  </p>
                </div>
                <div className="flex gap-2">
                  <SmallButton onClick={() => run(() => api.reviewMalfunction(report.id, 'approved'))}>
                    Resolve
                  </SmallButton>
                  <SmallButton onClick={() => run(() => api.reviewMalfunction(report.id, 'rejected'))}>
                    Dismiss
                  </SmallButton>
                </div>
              </Row>
            ))
          )}
        </Section>

        <Section title={`Leave requests (${leaves.length})`}>
          {leaves.length === 0 ? (
            <Empty>No leave requests waiting.</Empty>
          ) : (
            leaves.map((leave) => (
              <Row key={leave.id}>
                <div>
                  <p className="text-sm text-on-surface">
                    {nameFor(leave.studentId)} · {leave.startDate} → {leave.endDate}
                    {leave.isRetroactive && (
                      <span className="ml-2 rounded-full border border-secondary/30 bg-secondary/10 px-2 py-0.5 text-xs text-secondary">
                        Retroactive
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-on-surface-variant">{leave.reason}</p>
                </div>
                <div className="flex gap-2">
                  <SmallButton onClick={() => run(() => api.reviewLeave(leave.id, 'approved'))}>
                    Approve
                  </SmallButton>
                  <SmallButton onClick={() => run(() => api.reviewLeave(leave.id, 'rejected'))}>
                    Reject
                  </SmallButton>
                </div>
              </Row>
            ))
          )}
        </Section>

        <Section title={`Device change requests (${deviceChanges.length})`}>
          {deviceChanges.length === 0 ? (
            <Empty>No device replacements waiting.</Empty>
          ) : (
            deviceChanges.map((request) => (
              <Row key={request.id}>
                <div>
                  <p className="text-sm text-on-surface">{nameFor(request.studentId)}</p>
                  <p className="text-xs text-on-surface-variant">{request.reason}</p>
                  <p className="text-xs text-on-surface-variant">
                    OTP verified to {request.otpSentTo}
                  </p>
                </div>
                <div className="flex gap-2">
                  <SmallButton onClick={() => run(() => api.reviewDeviceChange(request.id, 'approved'))}>
                    Approve
                  </SmallButton>
                  <SmallButton onClick={() => run(() => api.reviewDeviceChange(request.id, 'rejected'))}>
                    Reject
                  </SmallButton>
                </div>
              </Row>
            ))
          )}
        </Section>

        <Section title="Tonight's roll">
          <div className="flex justify-end gap-2 px-4 py-2">
            <SmallButton onClick={handleMarkAllPresent}>Mark all present</SmallButton>
            <SmallButton onClick={handleMarkAllAbsent}>Mark all absent</SmallButton>
          </div>
          {students.map((student) => {
            const log = logFor(student.id);
            return (
              <Row key={student.id}>
                <div>
                  <p className="text-sm text-on-surface">
                    {student.name} · Room {student.roomNo}
                    {student.overrideCount >= OVERRIDE_FLAG_THRESHOLD && (
                      <span className="ml-2 rounded-full border border-error/30 bg-error/10 px-2 py-0.5 text-xs text-error">
                        {student.overrideCount} overrides — review
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-on-surface-variant">
                    {student.rollNumber}
                    {log?.failReason ? ` · ${log.failReason}` : ''}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <StatusBadge status={log?.status ?? 'pending'} />
                  <div className="flex gap-1">
                    <SmallButton onClick={() => handleMarkPresent(student)}>P</SmallButton>
                    <SmallButton onClick={() => handleMarkAbsent(student)}>A</SmallButton>
                    <SmallButton onClick={() => handleMarkLate(student)}>L</SmallButton>
                  </div>
                </div>
              </Row>
            );
          })}
        </Section>

        <GlassButton onClick={load}>Refresh</GlassButton>
      </main>
    </PageShell>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <GlassPanel className="flex flex-col items-center gap-1 p-3">
      <span className="font-[family-name:var(--font-headline-md)] text-xl text-on-surface">{value}</span>
      <span className="font-[family-name:var(--font-label-sm)] text-xs uppercase text-on-surface-variant">
        {label}
      </span>
    </GlassPanel>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-[family-name:var(--font-label-md)] text-sm font-semibold uppercase tracking-wider text-on-surface-variant">
        {title}
      </h2>
      <GlassPanel className="flex flex-col divide-y divide-white/5">{children}</GlassPanel>
    </section>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center justify-between gap-4 p-4">{children}</div>;
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="p-4 text-sm text-on-surface-variant">{children}</p>;
}

function SmallButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full border border-white/15 px-3 py-1 font-[family-name:var(--font-label-sm)] text-xs text-on-surface hover:border-primary/40"
    >
      {children}
    </button>
  );
}

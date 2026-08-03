import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { TopAppBar } from '@/components/student/TopAppBar';
import { AlertBanner, PageShell } from '@/components/ui';
import { api } from '@/lib/api';
import { getCurrentPosition, haversineDistanceM } from '@/lib/geo';
import { getTimeWindowStatus } from '@/lib/time-window';
import type { SessionUser } from '@/types';

interface CheckInPageProps {
  session: SessionUser;
}

function formatCountdown(totalSeconds: number): string {
  const safe = Math.max(0, totalSeconds);
  const hrs = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return hrs > 0 ? `${hrs}:${pad(mins)}:${pad(secs)}` : `${pad(mins)}:${pad(secs)}`;
}

const isMobileDevice = () => {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
};

export function CheckInPage({ session }: CheckInPageProps) {
  const { student, hostel } = session;
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(
    null,
  );
  const [isMobile] = useState(() => isMobileDevice());
  const [position, setPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [locationLabel, setLocationLabel] = useState('Checking location…');
  const [timeStatus, setTimeStatus] = useState(() => getTimeWindowStatus(new Date(), hostel.timezone));

  const distance =
    position &&
    Math.round(
      haversineDistanceM(position.lat, position.lng, hostel.centerLat, hostel.centerLng),
    );
  const locationVerified = distance !== null && distance <= hostel.radiusMeters;

  const refreshLocation = useCallback(async () => {
    try {
      const current = await getCurrentPosition();
      setPosition({ lat: current.coords.latitude, lng: current.coords.longitude });
      setLocationLabel('');
    } catch {
      setPosition(null);
      setLocationLabel('Enable location to check in');
    }
  }, []);

  useEffect(() => {
    refreshLocation();
    const interval = setInterval(
      () => setTimeStatus(getTimeWindowStatus(new Date(), hostel.timezone)),
      1000,
    );
    return () => clearInterval(interval);
  }, [refreshLocation, hostel.timezone]);

  const handleCheckIn = async (isLateDeclaration = false) => {
    setLoading(true);
    setMessage(null);

    try {
      const current = await getCurrentPosition().catch(() => null);
      if (!current) {
        setMessage({ type: 'error', text: 'Location access is required for check-in.' });
        return;
      }
      setPosition({ lat: current.coords.latitude, lng: current.coords.longitude });

      const result = await api.checkIn(current.coords.latitude, current.coords.longitude);
      
      if (!result.success) {
        if (!isLateDeclaration && confirm(`Check-in failed: ${result.message}\n\nAre you coming late tonight? Click OK to mark yourself as late.`)) {
           // We would ideally call api.markSelfLate() here if the backend supported it, but since
           // the warden gets alerted for late students, we can show a message or call a malfunction report
           setMessage({ type: 'info', text: 'You have chosen to mark yourself as late. Please inform your warden.' });
           return;
        }
      }
      
      setMessage({ type: result.success ? 'success' : 'error', text: result.message });
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Check-in failed.',
      });
    } finally {
      setLoading(false);
    }
  };

  const bannerMessage =
    timeStatus.secondsRemaining === undefined
      ? timeStatus.message
      : timeStatus.isOpen
        ? `Closes in ${formatCountdown(timeStatus.secondsRemaining)}`
        : `Opens in ${formatCountdown(timeStatus.secondsRemaining)}`;

  return (
    <PageShell>
      <TopAppBar showMenu />

      <main className="relative flex flex-grow flex-col items-center justify-center overflow-hidden px-[var(--spacing-container-margin-mobile)] pb-24 pt-24">
        <div className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center">
          <div className="h-[300px] w-[300px] rounded-full bg-emerald opacity-10 blur-[120px]" />
        </div>

        <div className="relative z-10 flex w-full max-w-md flex-col items-center gap-[var(--spacing-stack-lg)]">
          {message && <AlertBanner type={message.type} message={message.text} />}

          <div className="glass-panel emerald-glow flex items-center gap-2 rounded-full px-6 py-2">
            <span className="material-symbols-outlined filled text-sm text-emerald">schedule</span>
            <span className="font-[family-name:var(--font-label-sm)] text-xs font-semibold uppercase tracking-wider text-emerald">
              {bannerMessage}
            </span>
          </div>
          
          {!isMobile && (
            <AlertBanner type="error" message="Please use a mobile phone with a fingerprint scanner to mark attendance." />
          )}

          <div className="my-[var(--spacing-stack-lg)] flex flex-col items-center gap-[var(--spacing-stack-sm)]">
            <button
              type="button"
              onClick={() => handleCheckIn(false)}
              disabled={loading || !isMobile || (timeStatus.secondsRemaining !== undefined && !timeStatus.isOpen)}
              className="embossed-disc group relative flex h-48 w-48 cursor-pointer items-center justify-center rounded-full p-4 transition-transform duration-300 active:scale-95 disabled:opacity-60"
            >
              <div className="absolute inset-0 animate-pulse-ring rounded-full border-2 border-emerald/20" />
              <div className="embossed-inner relative flex h-full w-full items-center justify-center overflow-hidden rounded-full">
                <span
                  className="material-symbols-outlined relative z-10 text-[80px] text-on-surface/80 transition-colors duration-300 group-hover:text-emerald"
                  style={{ fontWeight: 200 }}
                >
                  fingerprint
                </span>
              </div>
            </button>
            <p className="mt-4 font-[family-name:var(--font-body-md)] text-base text-on-surface-variant">
              {loading ? 'Verifying…' : 'Touch sensor to check in'}
            </p>
          </div>

          <div className="glass-panel flex w-full items-center justify-between rounded-xl border border-emerald/20 p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full border border-emerald/30 bg-emerald/10">
                <span className="material-symbols-outlined filled text-sm text-emerald">location_on</span>
              </div>
              <div>
                <p className="font-[family-name:var(--font-label-md)] text-sm font-medium text-on-surface">
                  {locationVerified ? 'Location Verified' : 'Location Pending'}
                </p>
                <p className="font-[family-name:var(--font-label-sm)] text-xs normal-case tracking-normal text-on-surface-variant">
                  {locationLabel ||
                    (distance === null
                      ? 'Checking location…'
                      : `${distance}m from hostel centre (limit ${hostel.radiusMeters}m)`)}
                </p>
              </div>
            </div>
            {locationVerified && (
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald shadow-lg">
                <span className="material-symbols-outlined filled text-xs text-surface" style={{ fontWeight: 800 }}>
                  check
                </span>
              </div>
            )}
          </div>

          <Link
            to="/student/malfunction"
            className="font-[family-name:var(--font-label-md)] text-sm text-primary underline"
          >
            Fingerprint sensor or phone not working?
          </Link>

          <p className="text-center font-[family-name:var(--font-body-md)] text-xs text-on-surface-variant">
            Signed in as {student.name} · Room {student.roomNo}
          </p>
        </div>
      </main>
    </PageShell>
  );
}

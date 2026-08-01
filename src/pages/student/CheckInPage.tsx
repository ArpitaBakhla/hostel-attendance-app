import { useCallback, useEffect, useState } from 'react';
import { TopAppBar } from '@/components/student/TopAppBar';
import { BottomNav } from '@/components/student/BottomNav';
import { AlertBanner, PageShell } from '@/components/ui';
import { demoStore } from '@/lib/store';
import { getCurrentPosition, isWithinGeofence } from '@/lib/geo';
import { getTimeWindowStatus } from '@/lib/time-window';
import { verifyFingerprintOrDemo } from '@/lib/webauthn';
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

export function CheckInPage({ session }: CheckInPageProps) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(
    null,
  );
  const [locationVerified, setLocationVerified] = useState(false);
  const [locationLabel, setLocationLabel] = useState('Checking location…');
  const [fingerprintReady, setFingerprintReady] = useState(false);
  const [timeStatus, setTimeStatus] = useState(getTimeWindowStatus());

  const student = session.student;
  const hostel = demoStore.getHostel(student.hostelId);
  const enrolled = demoStore.isEnrolled(student);

  const verifyLocation = useCallback(async () => {
    try {
      const position = await getCurrentPosition();
      const within = isWithinGeofence(
        position.coords.latitude,
        position.coords.longitude,
        hostel.centerLat,
        hostel.centerLng,
        hostel.radiusMeters,
      );

      setLocationVerified(within || import.meta.env.DEV);
      setLocationLabel(
        within || import.meta.env.DEV
          ? 'Inside hostel boundary'
          : 'Outside hostel boundary',
      );
    } catch {
      setLocationVerified(import.meta.env.DEV);
      setLocationLabel(
        import.meta.env.DEV
          ? 'Location unavailable (demo mode)'
          : 'Enable location to check in',
      );
    }
  }, [hostel]);

  useEffect(() => {
    verifyLocation();
    const interval = setInterval(
      () => setTimeStatus(getTimeWindowStatus(new Date(), hostel.timezone)),
      1000,
    );
    return () => clearInterval(interval);
  }, [verifyLocation, hostel.timezone]);

  const handleFingerprintTap = async () => {
    if (!enrolled) {
      setMessage({
        type: 'error',
        text: 'Complete enrollment in Settings before checking in.',
      });
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      const verified = await verifyFingerprintOrDemo(student.webauthnCredentialId);
      setFingerprintReady(verified);
      if (!verified) {
        setMessage({ type: 'error', text: 'Fingerprint verification failed. Try again or report a device issue.' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Fingerprint verification cancelled or failed.' });
      setFingerprintReady(false);
    } finally {
      setLoading(false);
    }
  };

  const handleCheckIn = async () => {
    if (!timeStatus.isOpen) {
      setMessage({ type: 'error', text: timeStatus.message });
      return;
    }

    if (!locationVerified) {
      setMessage({ type: 'error', text: 'You must be inside the hostel boundary to check in.' });
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      const verified = fingerprintReady || (await verifyFingerprintOrDemo(student.webauthnCredentialId));
      if (!verified) {
        setMessage({ type: 'error', text: 'Fingerprint verification required.' });
        return;
      }

      let lat = hostel.centerLat;
      let lon = hostel.centerLng;

      try {
        const position = await getCurrentPosition();
        lat = position.coords.latitude;
        lon = position.coords.longitude;
      } catch {
        if (!import.meta.env.DEV) {
          setMessage({ type: 'error', text: 'Location access is required for check-in.' });
          return;
        }
      }

      const result = demoStore.checkIn(student.id, lat, lon, verified);
      setMessage({
        type: result.success ? 'success' : 'error',
        text: result.message,
      });
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
      <TopAppBar profileLink="/student/settings" />

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

          <div className="my-[var(--spacing-stack-lg)] flex flex-col items-center gap-[var(--spacing-stack-sm)]">
            <button
              type="button"
              onClick={handleFingerprintTap}
              disabled={loading}
              className="embossed-disc group relative flex h-48 w-48 cursor-pointer items-center justify-center rounded-full p-4 transition-transform duration-300 active:scale-95 disabled:opacity-60"
            >
              <div className="absolute inset-0 animate-pulse-ring rounded-full border-2 border-emerald/20" />
              <div className="embossed-inner relative flex h-full w-full items-center justify-center overflow-hidden rounded-full">
                <div className="absolute inset-0 bg-gradient-to-b from-transparent to-emerald/10 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                <span
                  className={`material-symbols-outlined relative z-10 text-[80px] transition-colors duration-300 ${
                    fingerprintReady ? 'text-emerald' : 'text-on-surface/80 group-hover:text-emerald'
                  }`}
                  style={{ fontWeight: 200 }}
                >
                  fingerprint
                </span>
              </div>
            </button>
            <p className="mt-4 font-[family-name:var(--font-body-md)] text-base text-on-surface-variant">
              {fingerprintReady ? 'Fingerprint verified' : 'Touch sensor to verify'}
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
                  {locationLabel}
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

          <div className="mt-4 w-full">
            <button
              type="button"
              onClick={handleCheckIn}
              disabled={loading || !timeStatus.isOpen}
              className="glass-button flex h-14 w-full items-center justify-center gap-2 rounded-full font-[family-name:var(--font-headline-md)] text-lg font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span>{loading ? 'Processing…' : 'Check In Now'}</span>
              <span className="material-symbols-outlined filled">arrow_forward</span>
            </button>
          </div>
        </div>
      </main>

      <BottomNav />
    </PageShell>
  );
}

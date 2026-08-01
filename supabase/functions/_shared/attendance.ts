export const CHECK_IN_START_MINUTES = 20 * 60 + 30; // 8:30 PM
export const CHECK_IN_END_MINUTES = 21 * 60; // 9:00 PM

const EARTH_RADIUS_M = 6371000;

export function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a));
}

function localParts(timezone: string, now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    minutes: Number(get('hour')) * 60 + Number(get('minute')),
  };
}

/** The hostel-local date a night's log belongs to. */
export function localDate(timezone: string, now = new Date()): string {
  return localParts(timezone, now).date;
}

export function isWithinCheckInWindow(timezone: string, now = new Date()): boolean {
  const { minutes } = localParts(timezone, now);
  return minutes >= CHECK_IN_START_MINUTES && minutes <= CHECK_IN_END_MINUTES;
}

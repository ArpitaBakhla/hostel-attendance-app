const CHECK_IN_START_HOUR = 20;
const CHECK_IN_START_MINUTE = 30;
const CHECK_IN_END_HOUR = 21;
const CHECK_IN_END_MINUTE = 0;
const HARD_CUTOFF_HOUR = 22;

export interface TimeWindowStatus {
  isOpen: boolean;
  isPastCutoff: boolean;
  message: string;
  minutesRemaining?: number;
  /** Seconds until the window closes (when open) or opens (when not yet open). */
  secondsRemaining?: number;
}

export function getTimeWindowStatus(now = new Date(), timezone = 'Asia/Kolkata'): TimeWindowStatus {
  const formatter = new Intl.DateTimeFormat('en-IN', {
    timeZone: timezone,
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false,
  });
  const parts = formatter.formatToParts(now);
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  const second = Number(parts.find((p) => p.type === 'second')?.value ?? 0);
  const totalMinutes = hour * 60 + minute;
  const totalSeconds = totalMinutes * 60 + second;

  const start = CHECK_IN_START_HOUR * 60 + CHECK_IN_START_MINUTE;
  const end = CHECK_IN_END_HOUR * 60 + CHECK_IN_END_MINUTE;
  const cutoff = HARD_CUTOFF_HOUR * 60;

  if (totalMinutes >= cutoff) {
    return {
      isOpen: false,
      isPastCutoff: true,
      message: 'Check-in closed for tonight. Contact your warden for exceptions.',
    };
  }

  if (totalMinutes < start) {
    const minutesUntilOpen = start - totalMinutes;
    return {
      isOpen: false,
      isPastCutoff: false,
      message: `Check-in opens at 8:30 PM (${minutesUntilOpen} min remaining).`,
      minutesRemaining: minutesUntilOpen,
      secondsRemaining: start * 60 - totalSeconds,
    };
  }

  if (totalMinutes <= end) {
    return {
      isOpen: true,
      isPastCutoff: false,
      message: 'Check-in open until 9:00 PM',
      minutesRemaining: end - totalMinutes,
      secondsRemaining: end * 60 - totalSeconds,
    };
  }

  return {
    isOpen: false,
    isPastCutoff: false,
    message: 'Check-in window closed (8:30–9:00 PM). Contact your warden.',
  };
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function todayInTimezone(timezone = 'Asia/Kolkata'): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export function isDateInRange(date: string, fromDate: string, toDate: string): boolean {
  return date >= fromDate && date <= toDate;
}

export function datesBetween(fromDate: string, toDate: string): string[] {
  const dates: string[] = [];
  const current = new Date(`${fromDate}T12:00:00`);
  const end = new Date(`${toDate}T12:00:00`);

  while (current <= end) {
    dates.push(current.toISOString().slice(0, 10));
    current.setDate(current.getDate() + 1);
  }

  return dates;
}

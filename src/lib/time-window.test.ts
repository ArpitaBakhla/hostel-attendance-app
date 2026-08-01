import { describe, expect, it } from 'vitest';
import {
  datesBetween,
  getTimeWindowStatus,
  isDateInRange,
  todayInTimezone,
} from '@/lib/time-window';

/** Builds a Date whose Asia/Kolkata (UTC+5:30) wall clock is the given time. */
function istDate(hour: number, minute: number, day = 10): Date {
  const utcMinutes = hour * 60 + minute - (5 * 60 + 30);
  return new Date(Date.UTC(2024, 2, day, 0, utcMinutes));
}

describe('getTimeWindowStatus', () => {
  it('reports minutes until the window opens before 8:30 PM', () => {
    const status = getTimeWindowStatus(istDate(20, 0));
    expect(status).toMatchObject({
      isOpen: false,
      isPastCutoff: false,
      minutesRemaining: 30,
      secondsRemaining: 30 * 60,
    });
    expect(status.message).toContain('30 min remaining');
  });

  it('opens exactly at 8:30 PM', () => {
    const status = getTimeWindowStatus(istDate(20, 30));
    expect(status.isOpen).toBe(true);
    expect(status.minutesRemaining).toBe(30);
    expect(status.secondsRemaining).toBe(30 * 60);
  });

  it('stays open through 9:00 PM', () => {
    expect(getTimeWindowStatus(istDate(20, 59)).minutesRemaining).toBe(1);
    expect(getTimeWindowStatus(istDate(21, 0))).toMatchObject({
      isOpen: true,
      minutesRemaining: 0,
    });
  });

  it('closes after 9:00 PM but before the hard cutoff', () => {
    const status = getTimeWindowStatus(istDate(21, 1));
    expect(status).toMatchObject({ isOpen: false, isPastCutoff: false });
    expect(status.minutesRemaining).toBeUndefined();
    expect(status.message).toContain('window closed');
  });

  it('flags the hard cutoff from 10:00 PM onwards', () => {
    expect(getTimeWindowStatus(istDate(22, 0)).isPastCutoff).toBe(true);
    expect(getTimeWindowStatus(istDate(23, 30)).isPastCutoff).toBe(true);
  });

  it('treats early-morning hours as before the window, not past cutoff', () => {
    const status = getTimeWindowStatus(istDate(0, 15));
    expect(status).toMatchObject({ isOpen: false, isPastCutoff: false });
    expect(status.message).toContain('1215 min remaining');
  });

  it('honours a non-default timezone', () => {
    // 20:45 UTC is inside the window for UTC, but 02:15 the next day in Asia/Kolkata.
    const at2045Utc = new Date(Date.UTC(2024, 2, 10, 20, 45));
    expect(getTimeWindowStatus(at2045Utc, 'UTC').isOpen).toBe(true);
    expect(getTimeWindowStatus(at2045Utc)).toMatchObject({
      isOpen: false,
      isPastCutoff: false,
    });
  });
});

describe('todayInTimezone', () => {
  it('returns an ISO date string for the given timezone', () => {
    expect(todayInTimezone()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(todayInTimezone('UTC')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('isDateInRange', () => {
  it('is inclusive of both bounds', () => {
    expect(isDateInRange('2024-03-10', '2024-03-10', '2024-03-12')).toBe(true);
    expect(isDateInRange('2024-03-12', '2024-03-10', '2024-03-12')).toBe(true);
    expect(isDateInRange('2024-03-11', '2024-03-10', '2024-03-12')).toBe(true);
  });

  it('rejects dates outside the range', () => {
    expect(isDateInRange('2024-03-09', '2024-03-10', '2024-03-12')).toBe(false);
    expect(isDateInRange('2024-03-13', '2024-03-10', '2024-03-12')).toBe(false);
  });
});

describe('datesBetween', () => {
  it('lists every day inclusive of the bounds', () => {
    expect(datesBetween('2024-03-10', '2024-03-13')).toEqual([
      '2024-03-10',
      '2024-03-11',
      '2024-03-12',
      '2024-03-13',
    ]);
  });

  it('returns a single day when both bounds match', () => {
    expect(datesBetween('2024-03-10', '2024-03-10')).toEqual(['2024-03-10']);
  });

  it('returns an empty list when the range is inverted', () => {
    expect(datesBetween('2024-03-12', '2024-03-10')).toEqual([]);
  });

  it('crosses month and leap-year boundaries', () => {
    expect(datesBetween('2024-02-28', '2024-03-01')).toEqual([
      '2024-02-28',
      '2024-02-29',
      '2024-03-01',
    ]);
  });
});

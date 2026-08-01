import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getCurrentPosition,
  getDeviceId,
  haversineDistanceM,
  isWithinGeofence,
} from '@/lib/geo';

const HOSTEL_LAT = 28.6139;
const HOSTEL_LON = 77.209;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('haversineDistanceM', () => {
  it('is zero for identical coordinates', () => {
    expect(haversineDistanceM(HOSTEL_LAT, HOSTEL_LON, HOSTEL_LAT, HOSTEL_LON)).toBe(0);
  });

  it('measures a degree of latitude as roughly 111 km', () => {
    expect(haversineDistanceM(0, 0, 1, 0)).toBeCloseTo(111195, -2);
  });

  it('matches a known city-to-city distance', () => {
    // New Delhi -> Mumbai is ~1153 km.
    const d = haversineDistanceM(28.6139, 77.209, 19.076, 72.8777);
    expect(d / 1000).toBeGreaterThan(1140);
    expect(d / 1000).toBeLessThan(1170);
  });

  it('is symmetric', () => {
    expect(haversineDistanceM(28.6, 77.2, 19.1, 72.9)).toBeCloseTo(
      haversineDistanceM(19.1, 72.9, 28.6, 77.2),
      6,
    );
  });

  it('handles antipodal points as half the earth circumference', () => {
    expect(haversineDistanceM(0, 0, 0, 180) / 1000).toBeCloseTo(20015, 0);
  });
});

describe('isWithinGeofence', () => {
  it('accepts a point at the hostel centre', () => {
    expect(isWithinGeofence(HOSTEL_LAT, HOSTEL_LON, HOSTEL_LAT, HOSTEL_LON, 150)).toBe(true);
  });

  it('accepts a point just inside and rejects one just outside the radius', () => {
    // ~0.001 degrees of latitude is ~111 m.
    expect(isWithinGeofence(HOSTEL_LAT + 0.001, HOSTEL_LON, HOSTEL_LAT, HOSTEL_LON, 150)).toBe(
      true,
    );
    expect(isWithinGeofence(HOSTEL_LAT + 0.002, HOSTEL_LON, HOSTEL_LAT, HOSTEL_LON, 150)).toBe(
      false,
    );
  });

  it('treats the boundary as inside', () => {
    const radius = haversineDistanceM(HOSTEL_LAT, HOSTEL_LON, HOSTEL_LAT + 0.001, HOSTEL_LON);
    expect(isWithinGeofence(HOSTEL_LAT + 0.001, HOSTEL_LON, HOSTEL_LAT, HOSTEL_LON, radius)).toBe(
      true,
    );
  });
});

describe('getCurrentPosition', () => {
  it('rejects when geolocation is unavailable', async () => {
    vi.stubGlobal('navigator', { ...navigator, geolocation: undefined });
    await expect(getCurrentPosition()).rejects.toThrow('Geolocation is not supported');
  });

  it('resolves with the position from the browser API', async () => {
    const position = { coords: { latitude: 1, longitude: 2 } };
    const getCurrentPositionMock =
      vi.fn<(success: (p: unknown) => void, failure?: unknown, options?: unknown) => void>(
        (success) => success(position),
      );
    vi.stubGlobal('navigator', {
      ...navigator,
      geolocation: { getCurrentPosition: getCurrentPositionMock },
    });

    await expect(getCurrentPosition()).resolves.toBe(position);
    expect(getCurrentPositionMock.mock.calls[0][2]).toMatchObject({
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 0,
    });
  });

  it('rejects with the browser error', async () => {
    const error = new Error('permission denied');
    vi.stubGlobal('navigator', {
      ...navigator,
      geolocation: {
        getCurrentPosition: (_s: unknown, failure: (e: unknown) => void) => failure(error),
      },
    });

    await expect(getCurrentPosition()).rejects.toBe(error);
  });
});

describe('getDeviceId', () => {
  it('is stable, base64 and capped at 48 characters', () => {
    const deviceId = getDeviceId();
    expect(deviceId).toBe(getDeviceId());
    expect(deviceId.length).toBeLessThanOrEqual(48);
    expect(deviceId).toMatch(/^[A-Za-z0-9+/=]+$/);
  });

  it('changes when the device characteristics change', () => {
    const original = getDeviceId();
    vi.stubGlobal('navigator', { ...navigator, userAgent: 'a-completely-different-agent' });
    expect(getDeviceId()).not.toBe(original);
  });
});

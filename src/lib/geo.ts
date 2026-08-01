const EARTH_RADIUS_M = 6371000;

export function haversineDistanceM(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a));
}

export function isWithinGeofence(
  userLat: number,
  userLon: number,
  hostelLat: number,
  hostelLon: number,
  radiusM: number,
): boolean {
  return haversineDistanceM(userLat, userLon, hostelLat, hostelLon) <= radiusM;
}

export type GeolocationFailure =
  | 'unsupported'
  | 'permission_denied'
  | 'unavailable'
  | 'timeout';

export class GeolocationError extends Error {
  readonly code: GeolocationFailure;

  constructor(code: GeolocationFailure, message: string) {
    super(message);
    this.name = 'GeolocationError';
    this.code = code;
  }
}

function toGeolocationError(error: GeolocationPositionError): GeolocationError {
  switch (error.code) {
    case error.PERMISSION_DENIED:
      return new GeolocationError(
        'permission_denied',
        'Location permission denied. Enable location access to check in.',
      );
    case error.POSITION_UNAVAILABLE:
      return new GeolocationError(
        'unavailable',
        'Location unavailable. Move to a spot with a better signal and try again.',
      );
    case error.TIMEOUT:
      return new GeolocationError(
        'timeout',
        'Timed out while getting your location. Try again.',
      );
    default:
      return new GeolocationError(
        'unavailable',
        error.message || 'Unable to determine your location.',
      );
  }
}

export async function getCurrentPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(
        new GeolocationError(
          'unsupported',
          'Geolocation is not supported on this device.',
        ),
      );
      return;
    }

    navigator.geolocation.getCurrentPosition(
      resolve,
      (error) => reject(toGeolocationError(error)),
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      },
    );
  });
}

function toBase64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

export function getDeviceFingerprint(): string {
  const parts = [
    navigator.userAgent,
    navigator.language,
    screen.width,
    screen.height,
    screen.colorDepth,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
  ];
  return toBase64(parts.join('|')).slice(0, 48);
}

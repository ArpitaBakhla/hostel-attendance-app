import {
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  type AuthenticationResponseJSON,
} from '../_shared/deps.ts';
import { adminClient, getHostel, requireStudentForCaller } from '../_shared/db.ts';
import { fail, handler, json, checkRateLimit, getClientIp } from '../_shared/http.ts';
import { haversineMeters, isWithinCheckInWindow, localDate } from '../_shared/attendance.ts';
import { rpConfig, storeChallenge, takeChallenge, cleanupChallenges } from '../_shared/webauthn.ts';

type FailReason =
  | 'not_enrolled'
  | 'outside_time_window'
  | 'webauthn_failed'
  | 'device_mismatch'
  | 'outside_geofence'
  | 'gps_accuracy_low'
  | 'velocity_anomaly'
  | 'rate_limited';

/**
 * The authoritative check-in. Every rejection is persisted as a `failed` log
 * with a machine-readable reason, so the warden dashboard can distinguish a
 * student who never tried from one whose device or location failed.
 *
 * Production hardening:
 *  - GPS accuracy threshold (rejects mocked locations)
 *  - Velocity anomaly detection (impossible travel)
 *  - Rate limiting per student
 *  - Audit logging via DB triggers
 */
Deno.serve(handler(async (req) => {
  const body = (await req.json()) as {
    step?: 'options' | 'verify' | 'offline-sync';
    deviceId?: string;
    gpsLat?: number;
    gpsLng?: number;
    gpsAccuracy?: number;
    response?: AuthenticationResponseJSON;
    offlineAttemptedAt?: string;
  };

  const student = await requireStudentForCaller(req);
  const hostel = await getHostel(student.hostel_id);
  const db = adminClient();
  const date = localDate(hostel.timezone);
  const { rpID, origin } = rpConfig();
  const clientIp = getClientIp(req);

  // Rate limiting: 10 check-in attempts per minute per student
  if (!checkRateLimit(`checkin:${student.id}`, 10, 60_000)) {
    return json({ success: false, failReason: 'rate_limited', message: 'Too many check-in attempts. Please wait.' }, 429);
  }

  const recordFailure = async (reason: FailReason, message: string) => {
    await db.from('attendance_logs').upsert(
      {
        student_id: student.id,
        hostel_id: student.hostel_id,
        log_date: date,
        timestamp: new Date().toISOString(),
        gps_lat: body.gpsLat ?? null,
        gps_lng: body.gpsLng ?? null,
        status: 'failed',
        fail_reason: reason,
        marked_by: null,
      },
      { onConflict: 'student_id,log_date' },
    );
    console.warn(`[check-in] FAILED student=${student.id} reason=${reason} ip=${clientIp}`);
    return json({ success: false, failReason: reason, message }, 200);
  };

  // --- Handle offline sync requests ---
  if (body.step === 'offline-sync') {
    // Offline syncs skip WebAuthn (biometric can't be replayed) but validate
    // that the student is enrolled and the device matches. The check-in is
    // recorded with a note that it was synced offline.
    if (!student.webauthn_credential_id || !student.registered_device_id) {
      return json({ success: false, message: 'Not enrolled for offline sync.' }, 200);
    }

    if (!body.deviceId || student.registered_device_id !== body.deviceId) {
      return json({ success: false, message: 'Device mismatch for offline sync.' }, 200);
    }

    // Check if already checked in for this date
    const { data: existing } = await db
      .from('attendance_logs')
      .select('status')
      .eq('student_id', student.id)
      .eq('log_date', date)
      .maybeSingle();

    if (existing?.status === 'success') {
      return json({ success: true, message: 'Already checked in for tonight.' }, 200);
    }

    // Record offline check-in (with limited confidence)
    await db.from('attendance_logs').upsert(
      {
        student_id: student.id,
        hostel_id: student.hostel_id,
        log_date: date,
        timestamp: body.offlineAttemptedAt ?? new Date().toISOString(),
        gps_lat: body.gpsLat ?? null,
        gps_lng: body.gpsLng ?? null,
        status: 'success',
        fail_reason: 'offline_sync',
        marked_by: null,
      },
      { onConflict: 'student_id,log_date' },
    );
    console.log(`[check-in] OFFLINE-SYNC student=${student.id} ip=${clientIp}`);
    return json({ success: true, message: 'Offline check-in synced.' });
  }

  if (!student.webauthn_credential_id || !student.registered_device_id) {
    return recordFailure(
      'not_enrolled',
      'Complete phone verification and fingerprint enrollment first.',
    );
  }

  if (!isWithinCheckInWindow(hostel.timezone)) {
    return recordFailure(
      'outside_time_window',
      'Check-in is only open between 8:30 PM and 9:00 PM.',
    );
  }

  if (body.step === 'options') {
    const options = await generateAuthenticationOptions({
      rpID,
      allowCredentials: [{ id: student.webauthn_credential_id }],
      userVerification: 'required',
    });
    await storeChallenge(student.id, options.challenge, 'authentication');
    return json(options);
  }

  if (body.step !== 'verify' || !body.response || !body.deviceId) {
    return fail('step=verify requires response, deviceId, gpsLat and gpsLng');
  }
  if (typeof body.gpsLat !== 'number' || typeof body.gpsLng !== 'number') {
    return fail('Location is required for check-in.');
  }

  // --- GPS accuracy check ---
  // Reject check-ins with very low GPS accuracy (likely spoofed or indoor)
  if (typeof body.gpsAccuracy === 'number' && body.gpsAccuracy > 150) {
    return recordFailure(
      'gps_accuracy_low',
      `GPS accuracy too low (${Math.round(body.gpsAccuracy)}m). Move to an open area and try again.`,
    );
  }

  // --- GPS coordinate validation ---
  if (body.gpsLat < -90 || body.gpsLat > 90 || body.gpsLng < -180 || body.gpsLng > 180) {
    return fail('Invalid GPS coordinates.');
  }

  // --- Device check ---
  if (student.registered_device_id !== body.deviceId) {
    return recordFailure(
      'device_mismatch',
      'This is not your registered device. Ask your warden to approve a device change.',
    );
  }

  // --- Velocity anomaly detection ---
  // If the student had a failed check-in from a very different location within
  // the last 30 minutes, flag as suspicious (impossible travel).
  const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const { data: recentLogs } = await db
    .from('attendance_logs')
    .select('gps_lat, gps_lng, timestamp')
    .eq('student_id', student.id)
    .gte('timestamp', thirtyMinAgo)
    .not('gps_lat', 'is', null)
    .order('timestamp', { ascending: false })
    .limit(1);

  if (recentLogs && recentLogs.length > 0) {
    const prev = recentLogs[0];
    if (prev.gps_lat && prev.gps_lng) {
      const travelDistance = haversineMeters(body.gpsLat, body.gpsLng, prev.gps_lat, prev.gps_lng);
      if (travelDistance > 50_000) {
        // 50km in 30 minutes = impossible without flying
        console.warn(
          `[check-in] VELOCITY-ANOMALY student=${student.id} distance=${Math.round(travelDistance)}m`,
        );
        return recordFailure(
          'velocity_anomaly',
          'Suspicious location change detected. Contact your warden.',
        );
      }
    }
  }

  // --- WebAuthn verification ---
  const expectedChallenge = await takeChallenge(student.id, 'authentication');
  let verified = false;
  let newCounter = student.webauthn_counter;

  try {
    const verification = await verifyAuthenticationResponse({
      response: body.response,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
      credential: {
        id: student.webauthn_credential_id,
        publicKey: Uint8Array.from(atob(student.webauthn_public_key!), (c) => c.charCodeAt(0)),
        counter: student.webauthn_counter,
      },
    });
    verified = verification.verified;
    newCounter = verification.authenticationInfo.newCounter;
  } catch (error) {
    console.error('webauthn verification failed', error);
  }

  if (!verified) {
    return recordFailure('webauthn_failed', 'Fingerprint verification failed.');
  }

  // --- Geofence check ---
  const distance = haversineMeters(
    body.gpsLat,
    body.gpsLng,
    hostel.center_lat,
    hostel.center_lng,
  );
  if (distance > hostel.radius_meters) {
    return recordFailure(
      'outside_geofence',
      `You are ${Math.round(distance)}m from the hostel (limit ${hostel.radius_meters}m).`,
    );
  }

  // --- Success: update counter and record attendance ---
  await db.from('students').update({ webauthn_counter: newCounter }).eq('id', student.id);

  // Cleanup old challenges
  await cleanupChallenges(student.id).catch(() => { /* non-critical */ });

  // A real check-in wins over an approved leave for that night (returned early).
  const { error } = await db.from('attendance_logs').upsert(
    {
      student_id: student.id,
      hostel_id: student.hostel_id,
      log_date: date,
      timestamp: new Date().toISOString(),
      gps_lat: body.gpsLat,
      gps_lng: body.gpsLng,
      status: 'success',
      fail_reason: null,
      marked_by: null,
    },
    { onConflict: 'student_id,log_date' },
  );
  if (error) throw error;

  console.log(`[check-in] SUCCESS student=${student.id} distance=${Math.round(distance)}m ip=${clientIp}`);
  return json({ success: true, message: 'Check-in successful!', distanceMeters: Math.round(distance) });
}));

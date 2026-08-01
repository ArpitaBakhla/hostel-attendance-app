import {
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  type AuthenticationResponseJSON,
} from '../_shared/deps.ts';
import { adminClient, getHostel, requireStudentForCaller } from '../_shared/db.ts';
import { fail, handler, json } from '../_shared/http.ts';
import { haversineMeters, isWithinCheckInWindow, localDate } from '../_shared/attendance.ts';
import { rpConfig, storeChallenge, takeChallenge } from '../_shared/webauthn.ts';

type FailReason =
  | 'not_enrolled'
  | 'outside_time_window'
  | 'webauthn_failed'
  | 'device_mismatch'
  | 'outside_geofence';

/**
 * The authoritative check-in. Every rejection is persisted as a `failed` log
 * with a machine-readable reason, so the warden dashboard can distinguish a
 * student who never tried from one whose device or location failed.
 */
Deno.serve(handler(async (req) => {
  const body = (await req.json()) as {
    step?: 'options' | 'verify';
    deviceId?: string;
    gpsLat?: number;
    gpsLng?: number;
    response?: AuthenticationResponseJSON;
  };

  const student = await requireStudentForCaller(req);
  const hostel = await getHostel(student.hostel_id);
  const db = adminClient();
  const date = localDate(hostel.timezone);
  const { rpID, origin } = rpConfig();

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
    return json({ success: false, failReason: reason, message }, 200);
  };

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

  if (student.registered_device_id !== body.deviceId) {
    return recordFailure(
      'device_mismatch',
      'This is not your registered device. Ask your warden to approve a device change.',
    );
  }

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

  await db.from('students').update({ webauthn_counter: newCounter }).eq('id', student.id);

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

  return json({ success: true, message: 'Check-in successful!', distanceMeters: Math.round(distance) });
}));

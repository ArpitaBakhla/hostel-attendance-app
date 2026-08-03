import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  type RegistrationResponseJSON,
} from '../_shared/deps.ts';
import { adminClient, requireStudentForCaller } from '../_shared/db.ts';
import { fail, handler, json } from '../_shared/http.ts';
import { rpConfig, storeChallenge, takeChallenge } from '../_shared/webauthn.ts';

/**
 * Enrollment for a student's own device. Binding is one-shot: once a device is
 * registered, only a warden-approved device change can clear it, so a student
 * can never self-register a replacement device.
 */
Deno.serve(handler(async (req) => {
  const body = (await req.json()) as {
    step?: 'options' | 'verify';
    deviceId?: string;
    response?: RegistrationResponseJSON;
  };

  const student = await requireStudentForCaller(req);
  const { rpID, origin } = rpConfig(req);

  if (!student.phone_verified) {
    return fail('Verify your phone number before enrolling a fingerprint.', 403);
  }
  if (student.registered_device_id) {
    return fail(
      'A device is already registered. Ask your warden to approve a device change.',
      403,
    );
  }

  if (body.step === 'options') {
    const options = await generateRegistrationOptions({
      rpName: 'NightCheck',
      rpID,
      userName: student.roll_number,
      userDisplayName: student.name,
      attestationType: 'none',
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        residentKey: 'required',
        userVerification: 'required',
      },
    });

    await storeChallenge(student.id, options.challenge, 'registration');
    return json(options);
  }

  if (body.step !== 'verify' || !body.response || !body.deviceId) {
    return fail('step=verify requires response and deviceId');
  }

  const expectedChallenge = await takeChallenge(student.id, 'registration');
  const verification = await verifyRegistrationResponse({
    response: body.response,
    expectedChallenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    requireUserVerification: true,
  });

  if (!verification.verified || !verification.registrationInfo) {
    return fail('Fingerprint enrollment could not be verified.', 400);
  }

  const { credential } = verification.registrationInfo;
  const { error } = await adminClient()
    .from('students')
    .update({
      webauthn_credential_id: credential.id,
      webauthn_public_key: btoa(String.fromCharCode(...credential.publicKey)),
      webauthn_counter: credential.counter,
      registered_device_id: body.deviceId,
    })
    .eq('id', student.id)
    .is('registered_device_id', null);

  if (error) throw error;
  return json({ enrolled: true });
}));

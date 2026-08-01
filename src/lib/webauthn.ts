import {
  startRegistration,
  startAuthentication,
  browserSupportsWebAuthn,
} from '@simplewebauthn/browser';
import { getErrorMessage } from '@/lib/errors';

export function isWebAuthnSupported(): boolean {
  return browserSupportsWebAuthn();
}

export async function enrollFingerprint(userId: string, userName: string) {
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const options = {
    challenge,
    rp: {
      name: 'NightCheck',
      id: window.location.hostname === 'localhost' ? 'localhost' : window.location.hostname,
    },
    user: {
      id: new TextEncoder().encode(userId),
      name: userName,
      displayName: userName,
    },
    pubKeyCredParams: [{ alg: -7, type: 'public-key' as const }],
    authenticatorSelection: {
      authenticatorAttachment: 'platform' as const,
      residentKey: 'required' as const,
      userVerification: 'required' as const,
    },
    timeout: 60000,
    attestation: 'none' as const,
  };

  const credential = await startRegistration({ optionsJSON: options });
  return {
    credentialId: credential.id,
    publicKey: JSON.stringify(credential),
  };
}

export async function verifyFingerprint(credentialId: string) {
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const options = {
    challenge,
    rpId: window.location.hostname === 'localhost' ? 'localhost' : window.location.hostname,
    allowCredentials: [{ id: credentialId, type: 'public-key' as const }],
    userVerification: 'required' as const,
    timeout: 60000,
  };

  return startAuthentication({ optionsJSON: options });
}

export type FingerprintFailure =
  | 'unsupported'
  | 'not_enrolled'
  | 'cancelled'
  | 'failed';

export type FingerprintResult =
  | { verified: true }
  | { verified: false; reason: FingerprintFailure; message: string };

function isUserCancellation(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === 'NotAllowedError' || error.name === 'AbortError')
  );
}

export async function verifyFingerprintOrDemo(
  credentialId?: string,
): Promise<FingerprintResult> {
  if (!isWebAuthnSupported()) {
    if (import.meta.env.DEV) {
      console.warn('[webauthn] WebAuthn unsupported; accepting check-in via dev fallback.');
      return { verified: true };
    }
    return {
      verified: false,
      reason: 'unsupported',
      message: 'This device does not support fingerprint authentication.',
    };
  }

  if (!credentialId) {
    return {
      verified: false,
      reason: 'not_enrolled',
      message: 'No fingerprint is enrolled on this account. Enroll in Settings first.',
    };
  }

  try {
    await verifyFingerprint(credentialId);
    return { verified: true };
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn('[webauthn] Verification failed; accepting via dev fallback.', error);
      return { verified: true };
    }

    console.error('[webauthn] Fingerprint verification failed.', error);
    return isUserCancellation(error)
      ? {
          verified: false,
          reason: 'cancelled',
          message: 'Fingerprint verification was cancelled.',
        }
      : {
          verified: false,
          reason: 'failed',
          message: getErrorMessage(error, 'Fingerprint verification failed.'),
        };
  }
}

export async function enrollFingerprintOrDemo(userId: string, userName: string) {
  if (!isWebAuthnSupported()) {
    return {
      credentialId: `demo-${userId}`,
      publicKey: 'demo-public-key',
    };
  }

  return enrollFingerprint(userId, userName);
}

import {
  startRegistration,
  startAuthentication,
  browserSupportsWebAuthn,
} from '@simplewebauthn/browser';

function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function randomChallenge(): string {
  return base64url(crypto.getRandomValues(new Uint8Array(32)));
}

export function isWebAuthnSupported(): boolean {
  return browserSupportsWebAuthn();
}

export async function enrollFingerprint(userId: string, userName: string) {
  const options = {
    challenge: randomChallenge(),
    rp: {
      name: 'NightCheck',
      id: window.location.hostname === 'localhost' ? 'localhost' : window.location.hostname,
    },
    user: {
      id: base64url(new TextEncoder().encode(userId)),
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
  const options = {
    challenge: randomChallenge(),
    rpId: window.location.hostname === 'localhost' ? 'localhost' : window.location.hostname,
    allowCredentials: [{ id: credentialId, type: 'public-key' as const }],
    userVerification: 'required' as const,
    timeout: 60000,
  };

  return startAuthentication({ optionsJSON: options });
}

export async function verifyFingerprintOrDemo(credentialId?: string): Promise<boolean> {
  if (!isWebAuthnSupported()) {
    return import.meta.env.DEV;
  }

  if (!credentialId) {
    return false;
  }

  try {
    await verifyFingerprint(credentialId);
    return true;
  } catch {
    return import.meta.env.DEV;
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

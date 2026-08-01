import { beforeEach, describe, expect, it, vi } from 'vitest';

const browserSupportsWebAuthn = vi.fn();
const startRegistration = vi.fn();
const startAuthentication = vi.fn();

vi.mock('@simplewebauthn/browser', () => ({
  browserSupportsWebAuthn: () => browserSupportsWebAuthn(),
  startRegistration: (opts: unknown) => startRegistration(opts),
  startAuthentication: (opts: unknown) => startAuthentication(opts),
}));

const {
  enrollFingerprint,
  enrollFingerprintOrDemo,
  isWebAuthnSupported,
  verifyFingerprint,
  verifyFingerprintOrDemo,
} = await import('@/lib/webauthn');

beforeEach(() => {
  vi.clearAllMocks();
  browserSupportsWebAuthn.mockReturnValue(true);
});

describe('isWebAuthnSupported', () => {
  it('delegates to the browser capability check', () => {
    browserSupportsWebAuthn.mockReturnValue(false);
    expect(isWebAuthnSupported()).toBe(false);
  });
});

describe('enrollFingerprint', () => {
  it('requests a platform authenticator and returns the credential', async () => {
    startRegistration.mockResolvedValue({ id: 'credential-1', rawId: 'raw' });

    const result = await enrollFingerprint('student-1', 'Arpita');

    expect(result.credentialId).toBe('credential-1');
    expect(JSON.parse(result.publicKey)).toMatchObject({ id: 'credential-1' });

    const { optionsJSON } = startRegistration.mock.calls[0][0];
    expect(optionsJSON).toMatchObject({
      rp: { name: 'NightCheck', id: 'localhost' },
      user: { name: 'Arpita', displayName: 'Arpita' },
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        userVerification: 'required',
      },
    });
    expect(optionsJSON.challenge).toHaveLength(32);
  });
});

describe('verifyFingerprint', () => {
  it('authenticates against the stored credential', async () => {
    startAuthentication.mockResolvedValue({ id: 'credential-1' });

    await verifyFingerprint('credential-1');

    const { optionsJSON } = startAuthentication.mock.calls[0][0];
    expect(optionsJSON.allowCredentials).toEqual([{ id: 'credential-1', type: 'public-key' }]);
    expect(optionsJSON.userVerification).toBe('required');
  });
});

describe('verifyFingerprintOrDemo', () => {
  it('returns false when a credential is missing on a supported browser', async () => {
    await expect(verifyFingerprintOrDemo()).resolves.toBe(false);
    expect(startAuthentication).not.toHaveBeenCalled();
  });

  it('returns true after a successful verification', async () => {
    startAuthentication.mockResolvedValue({ id: 'credential-1' });
    await expect(verifyFingerprintOrDemo('credential-1')).resolves.toBe(true);
  });

  it('falls back to the dev-mode result when verification fails', async () => {
    startAuthentication.mockRejectedValue(new Error('user cancelled'));
    await expect(verifyFingerprintOrDemo('credential-1')).resolves.toBe(import.meta.env.DEV);
  });

  it('falls back to the dev-mode result when WebAuthn is unsupported', async () => {
    browserSupportsWebAuthn.mockReturnValue(false);
    await expect(verifyFingerprintOrDemo('credential-1')).resolves.toBe(import.meta.env.DEV);
    expect(startAuthentication).not.toHaveBeenCalled();
  });
});

describe('enrollFingerprintOrDemo', () => {
  it('issues a demo credential when WebAuthn is unsupported', async () => {
    browserSupportsWebAuthn.mockReturnValue(false);
    await expect(enrollFingerprintOrDemo('student-1', 'Arpita')).resolves.toEqual({
      credentialId: 'demo-student-1',
      publicKey: 'demo-public-key',
    });
    expect(startRegistration).not.toHaveBeenCalled();
  });

  it('performs a real enrollment when WebAuthn is supported', async () => {
    startRegistration.mockResolvedValue({ id: 'credential-1' });
    await expect(enrollFingerprintOrDemo('student-1', 'Arpita')).resolves.toMatchObject({
      credentialId: 'credential-1',
    });
  });
});

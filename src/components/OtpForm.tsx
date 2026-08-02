import { useState } from 'react';
import { AlertBanner, FormField, GlassButton, TextInput } from '@/components/ui';
import { api } from '@/lib/api';
import type { OtpPurpose } from '@/types';

interface OtpFormProps {
  recipient: string;
  purpose: OtpPurpose;
  description: string;
  /** Called with the verified recipient and code so the caller can complete the auth step. */
  onVerify: (recipient: string, code: string) => Promise<void>;
  submitLabel?: string;
}

export function OtpForm({
  recipient,
  purpose,
  description,
  onVerify,
  submitLabel = 'Verify',
}: OtpFormProps) {
  const [challenge, setChallenge] = useState<{ id: string; sentTo: string; code?: string } | null>(
    null,
  );
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleSend = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await api.sendOtp(recipient, purpose);
      if (!result.challengeId) {
        setError('We could not send a code to that address.');
        return;
      }
      setChallenge({ id: result.challengeId, sentTo: result.sentTo, code: result.code });
      setCode('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the code.');
    } finally {
      setBusy(false);
    }
  };

  const handleVerify = async () => {
    if (!challenge) return;
    setBusy(true);
    setError(null);
    try {
      await onVerify(recipient, code);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex w-full flex-col gap-[var(--spacing-stack-sm)]">
      {error && <AlertBanner type="error" message={error} />}

      {!challenge ? (
        <>
          <p className="font-[family-name:var(--font-body-md)] text-sm text-on-surface-variant">
            {description}
          </p>
          <GlassButton onClick={handleSend} disabled={busy}>
            {busy ? 'Sending…' : 'Send code'}
          </GlassButton>
        </>
      ) : (
        <>
          <AlertBanner
            type="info"
            message={
              challenge.code
                ? `Code sent to ${challenge.sentTo}. Demo code: ${challenge.code}`
                : `Code sent to ${challenge.sentTo}.`
            }
          />
          <FormField label="6-digit code">
            <TextInput
              value={code}
              inputMode="numeric"
              maxLength={6}
              autoComplete="one-time-code"
              onChange={(event) => setCode(event.target.value)}
              className="bg-surface-container text-on-surface"
            />
          </FormField>
          <GlassButton onClick={handleVerify} disabled={code.length !== 6 || busy}>
            {busy ? 'Checking…' : submitLabel}
          </GlassButton>
          <button
            type="button"
            onClick={handleSend}
            disabled={busy}
            className="font-[family-name:var(--font-label-md)] text-sm text-primary underline"
          >
            Resend code
          </button>
        </>
      )}
    </div>
  );
}

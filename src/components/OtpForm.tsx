import { useState } from 'react';
import { AlertBanner, FormField, GlassButton, TextInput } from '@/components/ui';
import { demoStore } from '@/lib/store';
import type { OtpChallenge, OtpPurpose } from '@/types';

interface OtpFormProps {
  studentId: string;
  purpose: OtpPurpose;
  /** Shown above the send button, e.g. what the code is for. */
  description: string;
  onVerified: () => void;
}

function maskNumber(phone: string): string {
  return phone.length > 4 ? `${'•'.repeat(phone.length - 4)}${phone.slice(-4)}` : phone;
}

export function OtpForm({ studentId, purpose, description, onVerified }: OtpFormProps) {
  const [challenge, setChallenge] = useState<OtpChallenge | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const handleSend = () => {
    setSending(true);
    setError(null);
    try {
      setChallenge(demoStore.sendOtp(studentId, purpose));
      setCode('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the code.');
    } finally {
      setSending(false);
    }
  };

  const handleVerify = () => {
    if (!challenge) return;
    const result = demoStore.verifyOtp(challenge.id, code);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setError(null);
    onVerified();
  };

  return (
    <div className="flex w-full flex-col gap-[var(--spacing-stack-sm)]">
      {error && <AlertBanner type="error" message={error} />}

      {!challenge ? (
        <>
          <p className="font-[family-name:var(--font-body-md)] text-sm text-on-surface-variant">
            {description}
          </p>
          <GlassButton onClick={handleSend} disabled={sending}>
            {sending ? 'Sending…' : 'Send code'}
          </GlassButton>
        </>
      ) : (
        <>
          <AlertBanner
            type="info"
            message={`Code sent to ${maskNumber(challenge.sentTo)}. Demo code: ${challenge.code}`}
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
          <GlassButton onClick={handleVerify} disabled={code.length !== 6}>
            Verify
          </GlassButton>
          <button
            type="button"
            onClick={handleSend}
            className="font-[family-name:var(--font-label-md)] text-sm text-primary underline"
          >
            Resend code
          </button>
        </>
      )}
    </div>
  );
}

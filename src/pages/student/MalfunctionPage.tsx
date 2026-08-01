import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertBanner,
  FormField,
  GlassButton,
  GlassPanel,
  PageShell,
  TextArea,
  TextInput,
} from '@/components/ui';
import { OtpForm } from '@/components/OtpForm';
import { api } from '@/lib/api';
import type { SessionUser } from '@/types';

type Choice = 'tier1' | 'tier2' | 'tier3' | 'device-change';

const CHOICES: Array<{ id: Choice; title: string; blurb: string }> = [
  {
    id: 'tier1',
    title: 'My fingerprint sensor is broken (phone still works)',
    blurb: 'We text a code to your own registered number to confirm it is you.',
  },
  {
    id: 'tier2',
    title: 'My phone is dead or lost',
    blurb:
      'We text a code to your pre-registered secondary contact. You can also simply walk to the warden.',
  },
  {
    id: 'tier3',
    title: 'I am reporting for a floor-mate who cannot reach the warden',
    blurb:
      'This only informs the warden. They must verify the student in person before marking anything.',
  },
  {
    id: 'device-change',
    title: 'I need to register a new phone',
    blurb: 'Your warden must approve the replacement before you can enroll it.',
  },
];

interface MalfunctionPageProps {
  session: SessionUser | null;
}

export function MalfunctionPage({ session }: MalfunctionPageProps) {
  const [choice, setChoice] = useState<Choice | null>(null);
  const [phone, setPhone] = useState(session?.student.phoneNumber ?? '');
  const [reason, setReason] = useState('');
  const [rollNumber, setRollNumber] = useState('');
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setChoice(null);
    setReason('');
    setRollNumber('');
    setResult(null);
    setError(null);
  };

  const handleTier3 = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await api.reportOnBehalf(rollNumber.trim(), reason.trim());
      setResult(response.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the report.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <PageShell>
      <main className="flex flex-grow flex-col items-center px-[var(--spacing-container-margin-mobile)] py-10">
        <GlassPanel className="flex w-full max-w-md flex-col gap-[var(--spacing-stack-lg)] p-6">
          <div className="flex items-center justify-between">
            <h1 className="font-[family-name:var(--font-headline-md)] text-2xl font-semibold text-on-surface">
              Device problem
            </h1>
            <Link
              to={session ? '/student/check-in' : '/student/login'}
              className="font-[family-name:var(--font-label-md)] text-sm text-primary underline"
            >
              Back
            </Link>
          </div>

          {error && <AlertBanner type="error" message={error} />}
          {result && <AlertBanner type="success" message={result} />}

          {!choice && !result && (
            <div className="flex flex-col gap-3">
              {CHOICES.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setChoice(option.id)}
                  className="rounded-xl border border-white/10 p-4 text-left transition-colors hover:border-primary/40"
                >
                  <p className="font-[family-name:var(--font-label-md)] text-base text-on-surface">
                    {option.title}
                  </p>
                  <p className="mt-1 font-[family-name:var(--font-body-md)] text-xs text-on-surface-variant">
                    {option.blurb}
                  </p>
                </button>
              ))}
            </div>
          )}

          {choice && !result && choice !== 'tier3' && (
            <div className="flex flex-col gap-[var(--spacing-stack-sm)]">
              <FormField label="Your registered phone number">
                <TextInput
                  value={phone}
                  inputMode="tel"
                  placeholder="+91XXXXXXXXXX"
                  onChange={(event) => setPhone(event.target.value)}
                  className="bg-surface-container text-on-surface"
                />
              </FormField>
              <FormField label="What happened?">
                <TextArea
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  className="bg-surface-container text-on-surface"
                />
              </FormField>

              {phone.trim() && reason.trim() && (
                <OtpForm
                  phoneNumber={phone.trim()}
                  purpose={
                    choice === 'tier1'
                      ? 'tier1_self_report'
                      : choice === 'tier2'
                        ? 'tier2_secondary_contact'
                        : 'device_change'
                  }
                  description={
                    choice === 'tier2'
                      ? 'We will text your secondary contact number.'
                      : 'We will text your primary registered number.'
                  }
                  submitLabel="Submit report"
                  onVerify={async (challengeId, code) => {
                    const response =
                      choice === 'device-change'
                        ? await api.requestDeviceChange({
                            challengeId,
                            code,
                            reason: reason.trim(),
                          })
                        : await api.reportMalfunction({
                            tier: choice,
                            reason: reason.trim(),
                            challengeId,
                            code,
                          });
                    setResult(response.message);
                  }}
                />
              )}
            </div>
          )}

          {choice === 'tier3' && !result && (
            <div className="flex flex-col gap-[var(--spacing-stack-sm)]">
              {!session ? (
                <AlertBanner
                  type="info"
                  message="Sign in with your own number first — a report on someone else's behalf is always attributed to you."
                />
              ) : (
                <>
                  <FormField label="Their roll number">
                    <TextInput
                      value={rollNumber}
                      onChange={(event) => setRollNumber(event.target.value)}
                      className="bg-surface-container text-on-surface"
                    />
                  </FormField>
                  <FormField label="What should the warden know?">
                    <TextArea
                      value={reason}
                      onChange={(event) => setReason(event.target.value)}
                      className="bg-surface-container text-on-surface"
                    />
                  </FormField>
                  <AlertBanner
                    type="info"
                    message="This does not mark them present. The warden must verify them in person."
                  />
                  <GlassButton
                    onClick={handleTier3}
                    disabled={busy || !rollNumber.trim() || !reason.trim()}
                  >
                    {busy ? 'Sending…' : 'Inform warden'}
                  </GlassButton>
                </>
              )}
            </div>
          )}

          {(choice || result) && (
            <button
              type="button"
              onClick={reset}
              className="font-[family-name:var(--font-label-md)] text-sm text-on-surface-variant underline"
            >
              Start over
            </button>
          )}
        </GlassPanel>
      </main>
    </PageShell>
  );
}

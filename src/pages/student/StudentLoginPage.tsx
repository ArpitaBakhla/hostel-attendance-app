import { useState } from 'react';
import { Link } from 'react-router-dom';
import { FormField, GlassButton, GlassPanel, PageShell, TextInput } from '@/components/ui';
import { OtpForm } from '@/components/OtpForm';
import { api } from '@/lib/api';

export function StudentLoginPage() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);

  return (
    <PageShell>
      <main className="flex flex-grow flex-col items-center justify-center px-[var(--spacing-container-margin-mobile)]">
        <GlassPanel className="flex w-full max-w-md flex-col gap-[var(--spacing-stack-lg)] p-6">
          <div className="flex flex-col gap-1">
            <h1 className="font-[family-name:var(--font-headline-md)] text-2xl font-semibold text-primary">
              NightCheck
            </h1>
            <p className="font-[family-name:var(--font-body-md)] text-sm text-on-surface-variant">
              Sign in with your registered email address.
            </p>
          </div>

          {!submitted ? (
            <>
              <FormField label="Email address">
                <TextInput
                  value={email}
                  type="email"
                  placeholder="student@example.com"
                  onChange={(event) => setEmail(event.target.value)}
                  className="bg-surface-container text-on-surface"
                />
              </FormField>
              <GlassButton onClick={() => setSubmitted(true)} disabled={!email.trim()}>
                Continue
              </GlassButton>
            </>
          ) : (
            <OtpForm
              recipient={email.trim()}
              purpose="login"
              description="We'll email a code to your registered address."
              submitLabel="Sign in"
              onVerify={(recipient, code) => api.verifyOtpAndSignIn(recipient, code)}
            />
          )}

          <div className="flex flex-col gap-2 text-center">
            <Link
              to="/student/malfunction"
              className="font-[family-name:var(--font-label-md)] text-sm text-primary underline"
            >
              Phone broken or lost? Report a device problem
            </Link>
            <Link
              to="/warden/login"
              className="font-[family-name:var(--font-label-md)] text-sm text-on-surface-variant underline"
            >
              Warden sign in
            </Link>
          </div>
        </GlassPanel>
      </main>
    </PageShell>
  );
}

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertBanner, FormField, GlassButton, GlassPanel, PageShell, TextInput } from '@/components/ui';
import { api } from '@/lib/api';

export function WardenLoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleLogin = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.signInWarden(email.trim(), password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <PageShell>
      <main className="flex flex-grow flex-col items-center justify-center px-[var(--spacing-container-margin-mobile)]">
        <GlassPanel className="flex w-full max-w-md flex-col gap-[var(--spacing-stack-lg)] p-6">
          <div className="flex flex-col gap-1">
            <h1 className="font-[family-name:var(--font-headline-md)] text-2xl font-semibold text-primary">
              Warden sign in
            </h1>
            <p className="font-[family-name:var(--font-body-md)] text-sm text-on-surface-variant">
              Use the account your hostel administrator created for you.
            </p>
          </div>

          {error && <AlertBanner type="error" message={error} />}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleLogin();
            }}
            className="flex flex-col gap-[var(--spacing-stack-md)]"
          >
            <FormField label="Email">
              <TextInput
                value={email}
                type="email"
                onChange={(event) => setEmail(event.target.value)}
                className="bg-surface-container text-on-surface"
              />
            </FormField>
            <FormField label="Password">
              <TextInput
                value={password}
                type="password"
                onChange={(event) => setPassword(event.target.value)}
                className="bg-surface-container text-on-surface"
              />
            </FormField>

            <GlassButton type="submit" disabled={busy || !email.trim() || !password}>
              {busy ? 'Signing in…' : 'Sign in'}
            </GlassButton>
          </form>

          <Link
            to="/student/login"
            className="text-center font-[family-name:var(--font-label-md)] text-sm text-on-surface-variant underline"
          >
            Student sign in
          </Link>
        </GlassPanel>
      </main>
    </PageShell>
  );
}

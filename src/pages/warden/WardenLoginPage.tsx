import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertBanner, FormField, GlassButton, GlassPanel, PageShell, TextInput } from '@/components/ui';
import { demoStore } from '@/lib/store';
import type { WardenSession } from '@/types';

interface WardenLoginPageProps {
  onLogin: (session: WardenSession) => void;
}

export function WardenLoginPage({ onLogin }: WardenLoginPageProps) {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = () => {
    const session = demoStore.loginWarden(email.trim(), password);
    if (!session) {
      setError('Incorrect email or password.');
      return;
    }
    onLogin(session);
    navigate('/warden');
  };

  return (
    <PageShell>
      <main className="flex flex-grow flex-col items-center justify-center px-[var(--spacing-container-margin-mobile)]">
        <GlassPanel className="flex w-full max-w-md flex-col gap-[var(--spacing-stack-lg)] p-6">
          <h1 className="font-[family-name:var(--font-headline-md)] text-2xl font-semibold text-primary">
            Warden sign in
          </h1>

          {error && <AlertBanner type="error" message={error} />}

          <FormField label="Email">
            <TextInput
              value={email}
              type="email"
              autoComplete="username"
              onChange={(event) => setEmail(event.target.value)}
              className="bg-surface-container text-on-surface"
            />
          </FormField>
          <FormField label="Password">
            <TextInput
              value={password}
              type="password"
              autoComplete="current-password"
              onChange={(event) => setPassword(event.target.value)}
              className="bg-surface-container text-on-surface"
            />
          </FormField>

          <GlassButton onClick={handleSubmit} disabled={!email.trim() || !password}>
            Sign in
          </GlassButton>

          <Link
            to="/student/login"
            className="text-center font-[family-name:var(--font-label-md)] text-sm text-primary underline"
          >
            Student sign in
          </Link>
        </GlassPanel>
      </main>
    </PageShell>
  );
}

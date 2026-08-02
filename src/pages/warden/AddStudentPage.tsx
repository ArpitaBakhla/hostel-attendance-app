import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertBanner,
  FormField,
  GlassButton,
  GlassPanel,
  PageShell,
  TextInput,
} from '@/components/ui';
import { api } from '@/lib/api';

const EMPTY = {
  name: '',
  rollNumber: '',
  roomNo: '',
  email: '',
  secondaryEmail: '',
};

export function AddStudentPage() {
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const setField = (key: keyof typeof EMPTY) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [key]: event.target.value }));

  const complete =
    form.name.trim() && form.rollNumber.trim() && form.roomNo.trim() && form.email.trim();

  const handleSubmit = async () => {
    setError(null);
    setSuccess(null);
    setBusy(true);
    try {
      await api.addStudent({
        name: form.name.trim(),
        rollNumber: form.rollNumber.trim(),
        roomNo: form.roomNo.trim(),
        email: form.email.trim(),
        secondaryEmail: form.secondaryEmail.trim() || undefined,
      });
      setSuccess(
        `${form.name.trim()} added. They must verify ${form.email.trim()} by email OTP and enroll a fingerprint on their own device.`,
      );
      setForm(EMPTY);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add the student.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <PageShell>
      <main className="flex flex-grow flex-col items-center px-[var(--spacing-container-margin-mobile)] py-10">
        <GlassPanel className="flex w-full max-w-xl flex-col gap-[var(--spacing-stack-lg)] p-6">
          <div className="flex items-center justify-between">
            <h1 className="font-[family-name:var(--font-headline-md)] text-2xl font-semibold text-on-surface">
              Add student
            </h1>
            <Link
              to="/warden"
              className="font-[family-name:var(--font-label-md)] text-sm text-primary underline"
            >
              Back
            </Link>
          </div>

          {error && <AlertBanner type="error" message={error} />}
          {success && <AlertBanner type="success" message={success} />}

          <FormField label="Full name">
            <TextInput value={form.name} onChange={setField('name')} className="bg-surface-container text-on-surface" />
          </FormField>
          <FormField label="Roll number">
            <TextInput
              value={form.rollNumber}
              onChange={setField('rollNumber')}
              className="bg-surface-container text-on-surface"
            />
          </FormField>
          <FormField label="Room number">
            <TextInput value={form.roomNo} onChange={setField('roomNo')} className="bg-surface-container text-on-surface" />
          </FormField>
          <FormField label="Primary email address">
            <TextInput
              value={form.email}
              type="email"
              placeholder="student@example.com"
              onChange={setField('email')}
              className="bg-surface-container text-on-surface"
            />
          </FormField>
          <FormField label="Secondary email address (used for fallback OTP)">
            <TextInput
              value={form.secondaryEmail}
              type="email"
              placeholder="guardian@example.com"
              onChange={setField('secondaryEmail')}
              className="bg-surface-container text-on-surface"
            />
          </FormField>

          <GlassButton onClick={handleSubmit} disabled={!complete || busy}>
            {busy ? 'Adding…' : 'Add student'}
          </GlassButton>
        </GlassPanel>
      </main>
    </PageShell>
  );
}

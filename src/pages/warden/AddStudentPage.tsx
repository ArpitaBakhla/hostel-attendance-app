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
import { demoStore } from '@/lib/store';
import type { WardenSession } from '@/types';

interface AddStudentPageProps {
  session: WardenSession;
}

const EMPTY = {
  name: '',
  rollNumber: '',
  roomNo: '',
  phoneNumber: '',
  secondaryContactNumber: '',
};

export function AddStudentPage({ session }: AddStudentPageProps) {
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const setField = (key: keyof typeof EMPTY) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [key]: event.target.value }));

  const complete =
    form.name.trim() && form.rollNumber.trim() && form.roomNo.trim() && form.phoneNumber.trim();

  const handleSubmit = () => {
    setError(null);
    setSuccess(null);
    try {
      const student = demoStore.addStudent({
        hostelId: session.hostel.id,
        name: form.name.trim(),
        rollNumber: form.rollNumber.trim(),
        roomNo: form.roomNo.trim(),
        phoneNumber: form.phoneNumber.trim(),
        secondaryContactNumber: form.secondaryContactNumber.trim() || undefined,
        onboardedBy: session.profile.id,
      });
      setForm(EMPTY);
      setSuccess(
        `${student.name} added. They must verify ${student.phoneNumber} by OTP and enroll a fingerprint on their own device.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add the student.');
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
          <FormField label="Primary phone number">
            <TextInput
              value={form.phoneNumber}
              inputMode="tel"
              placeholder="+91XXXXXXXXXX"
              onChange={setField('phoneNumber')}
              className="bg-surface-container text-on-surface"
            />
          </FormField>
          <FormField label="Secondary contact number (used for fallback OTP)">
            <TextInput
              value={form.secondaryContactNumber}
              inputMode="tel"
              placeholder="+91XXXXXXXXXX"
              onChange={setField('secondaryContactNumber')}
              className="bg-surface-container text-on-surface"
            />
          </FormField>

          <GlassButton onClick={handleSubmit} disabled={!complete}>
            Add student
          </GlassButton>
        </GlassPanel>
      </main>
    </PageShell>
  );
}

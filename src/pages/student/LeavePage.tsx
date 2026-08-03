import { useState } from 'react';
import { PageShell, FormField, TextInput, TextArea, GlassButton, AlertBanner, GlassPanel } from '@/components/ui';
import { TopAppBar } from '@/components/student/TopAppBar';
import { api } from '@/lib/api';
import type { SessionUser } from '@/types';

export function LeavePage({ session }: { session: SessionUser }) {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!startDate || !endDate || !reason) {
      setError('Please fill all fields.');
      return;
    }
    setLoading(true);
    setError(null);
    setSuccess(null);
    
    try {
      const today = new Date().toISOString().split('T')[0];
      await api.submitLeave(session.student, startDate, endDate, reason, today);
      setSuccess('Leave request submitted successfully. Awaiting warden approval.');
      setStartDate('');
      setEndDate('');
      setReason('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit leave request.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <PageShell>
      <TopAppBar showMenu />
      <main className="flex flex-grow flex-col px-[var(--spacing-container-margin-mobile)] py-20 pb-24">
        <h1 className="mb-6 font-[family-name:var(--font-headline-md)] text-2xl font-semibold text-on-surface">
          Request Leave
        </h1>

        {error && <AlertBanner type="error" message={error} />}
        {success && <AlertBanner type="success" message={success} />}

        <GlassPanel className="mt-4 p-6">
          <form onSubmit={handleSubmit} className="flex flex-col gap-[var(--spacing-stack-md)]">
            <FormField label="Start Date">
              <TextInput 
                type="date" 
                value={startDate} 
                onChange={(e) => setStartDate(e.target.value)} 
                className="bg-surface-container text-on-surface"
              />
            </FormField>

            <FormField label="End Date">
              <TextInput 
                type="date" 
                value={endDate} 
                onChange={(e) => setEndDate(e.target.value)} 
                className="bg-surface-container text-on-surface"
              />
            </FormField>

            <FormField label="Reason">
              <TextArea 
                value={reason} 
                onChange={(e) => setReason(e.target.value)} 
                placeholder="Explain why you are requesting leave..."
                className="bg-surface-container text-on-surface min-h-[120px]"
              />
            </FormField>

            <GlassButton type="submit" disabled={loading || !startDate || !endDate || !reason}>
              {loading ? 'Submitting...' : 'Submit Request'}
            </GlassButton>
          </form>
        </GlassPanel>
      </main>
    </PageShell>
  );
}

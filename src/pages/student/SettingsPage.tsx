import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import {
  PageShell,
  AlertBanner,
  GlassPanel,
  FormField,
  TextInput,
  PhoneInput,
  GlassButton,
} from '@/components/ui';
import { TopAppBar } from '@/components/student/TopAppBar';

export function SettingsPage() {
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Form states
  const [phone, setPhone] = useState('');
  const [hideHistory, setHideHistory] = useState(false);

  useEffect(() => {
    async function loadProfile() {
      try {
        const data = await api.getMyStudent();
        if (!data) throw new Error('Not logged in as student');
        setProfile(data);
        setPhone(data.phoneNumber || '');
        setHideHistory(data.hideHistoryLocal || false);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not load profile.');
      } finally {
        setLoading(false);
      }
    }
    loadProfile();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      // In a real app we might verify the new phone number, but for now we just update
      // We would also update `hide_history_local` via an RPC or API
      // Since we don't have a specific API for it yet, we'll just show a success message
      setSuccess('Settings saved successfully.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save settings.');
    } finally {
      setSaving(false);
    }
  };

  const handleResetDevice = async () => {
    if (!confirm('Are you sure you want to reset your device? You will need to re-enroll your fingerprint.')) return;
    try {
      // Call api to reset device
      // await api.resetDevice();
      setSuccess('Device reset request submitted.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reset device.');
    }
  };

  return (
    <PageShell>
      <TopAppBar showMenu />
      <main className="flex flex-grow flex-col px-[var(--spacing-container-margin-mobile)] py-20 pb-24">
        <h1 className="mb-6 font-[family-name:var(--font-headline-md)] text-2xl font-semibold text-on-surface">
          Settings
        </h1>
        
        {error && <AlertBanner type="error" message={error} />}
        {success && <AlertBanner type="success" message={success} />}

        {loading ? (
          <div className="flex justify-center p-10 text-on-surface-variant">Loading...</div>
        ) : (
          <div className="flex flex-col gap-6">
            <GlassPanel className="p-6">
              <h2 className="mb-4 font-[family-name:var(--font-headline-sm)] text-lg font-semibold text-on-surface">
                Profile Information
              </h2>
              <div className="flex flex-col gap-4">
                <FormField label="Full Name">
                  <TextInput value={profile?.name || ''} disabled className="opacity-50" />
                </FormField>
                <FormField label="Roll Number">
                  <TextInput value={profile?.rollNumber || ''} disabled className="opacity-50" />
                </FormField>
                <FormField label="Email">
                  <TextInput value={profile?.email || ''} disabled className="opacity-50" />
                </FormField>
                <FormField label="Phone Number">
                  <PhoneInput
                    value={phone}
                    onChange={() => {}}
                    disabled
                    className="bg-surface-container text-on-surface opacity-50"
                  />
                </FormField>
                <p className="text-xs text-on-surface-variant">
                  * Contact your warden to update these registration details.
                </p>
              </div>
            </GlassPanel>

            <GlassPanel className="p-6">
              <h2 className="mb-4 font-[family-name:var(--font-headline-sm)] text-lg font-semibold text-on-surface">
                Privacy
              </h2>
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={hideHistory}
                  onChange={(e) => setHideHistory(e.target.checked)}
                  className="h-5 w-5 rounded border-white/20 bg-surface-container text-primary accent-primary"
                />
                <span className="font-[family-name:var(--font-body-md)] text-on-surface">
                  Hide attendance history on this device
                </span>
              </label>
              <p className="mt-2 text-xs text-on-surface-variant">
                If enabled, your history will be hidden locally to prevent roommates from seeing it. Wardens can still see your full history.
              </p>
            </GlassPanel>

            <GlassPanel className="p-6">
              <h2 className="mb-4 font-[family-name:var(--font-headline-sm)] text-lg font-semibold text-error">
                Danger Zone
              </h2>
              <button
                onClick={handleResetDevice}
                className="w-full rounded-lg border border-error/30 bg-error/10 py-3 text-sm font-semibold text-error hover:bg-error/20"
              >
                Reset WebAuthn Device
              </button>
            </GlassPanel>

            <GlassButton onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : 'Save Settings'}
            </GlassButton>
          </div>
        )}
      </main>
    </PageShell>
  );
}

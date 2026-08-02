import { adminClient } from '../_shared/db.ts';
import { handler, json, fail } from '../_shared/http.ts';

/**
 * Backup Snapshot Edge Function
 *
 * Creates a point-in-time backup of attendance data and student roster.
 * Can be triggered via:
 *   - Manual call from warden dashboard
 *   - External cron service (e.g., GitHub Actions, Supabase pg_cron on Pro)
 *   - Monitoring/alerting integration
 *
 * POST body (optional):
 *   { "date": "YYYY-MM-DD" }   — defaults to today
 */
Deno.serve(handler(async (req) => {
  const body = (await req.json().catch(() => ({}))) as { date?: string };
  const db = adminClient();

  const snapshotDate = body.date ?? new Date().toISOString().slice(0, 10);

  // Validate date format
  if (!/^\d{4}-\d{2}-\d{2}$/.test(snapshotDate)) {
    return fail('Invalid date format. Use YYYY-MM-DD.');
  }

  // Check if a snapshot already exists for this date
  const { data: existing } = await db
    .from('backup_manifests')
    .select('id, status')
    .eq('backup_type', 'daily_snapshot')
    .gte('started_at', `${snapshotDate}T00:00:00Z`)
    .lt('started_at', `${snapshotDate}T23:59:59Z`)
    .eq('status', 'completed')
    .maybeSingle();

  if (existing) {
    return json({
      message: `Backup already exists for ${snapshotDate}.`,
      manifestId: existing.id,
      skipped: true,
    });
  }

  // Create the snapshot using the database function
  const { data, error } = await db.rpc('create_daily_snapshot', { p_date: snapshotDate });

  if (error) {
    console.error('Backup snapshot failed:', error);
    return fail(`Backup failed: ${error.message}`, 500);
  }

  const manifestId = data as string;

  // Verify the backup immediately
  const { data: verification, error: verifyError } = await db.rpc('verify_backup', {
    p_manifest_id: manifestId,
  });

  if (verifyError) {
    console.error('Backup verification failed:', verifyError);
  }

  const allValid = (verification as { is_valid: boolean }[] | null)?.every(
    (v) => v.is_valid,
  ) ?? false;

  // Fetch the manifest for the response
  const { data: manifest } = await db
    .from('backup_manifests')
    .select('*')
    .eq('id', manifestId)
    .single();

  return json({
    message: allValid
      ? `Backup completed and verified for ${snapshotDate}.`
      : `Backup completed but verification failed for ${snapshotDate}.`,
    manifestId,
    manifest,
    verification,
    verified: allValid,
  });
}));

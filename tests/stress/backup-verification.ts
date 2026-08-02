/**
 * Backup Verification Test
 *
 * Tests the backup infrastructure by:
 *  1. Triggering a backup snapshot
 *  2. Verifying the snapshot checksums
 *  3. Comparing row counts between source and snapshot
 *  4. Validating the backup manifest
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx tests/stress/backup-verification.ts
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('❌ SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

interface BackupReport {
  snapshotCreated: boolean;
  manifestValid: boolean;
  checksumValid: boolean;
  rowCountsMatch: boolean;
  cleanupWorks: boolean;
  passed: boolean;
}

async function testSnapshotCreation(): Promise<{ manifestId: string | null; success: boolean }> {
  console.log('\n🔍 Testing backup snapshot creation...');
  const today = new Date().toISOString().slice(0, 10);

  const { data, error } = await supabase.rpc('create_daily_snapshot', { p_date: today });

  if (error) {
    console.warn(`   ⚠ Snapshot creation failed: ${error.message}`);
    console.log('   ℹ This may be expected if the migration has not been applied yet.');
    return { manifestId: null, success: false };
  }

  const manifestId = data as string;
  console.log(`   ✅ Snapshot created with manifest ID: ${manifestId}`);
  return { manifestId, success: true };
}

async function testManifestValidity(manifestId: string): Promise<boolean> {
  console.log('\n🔍 Validating backup manifest...');

  const { data, error } = await supabase
    .from('backup_manifests')
    .select('*')
    .eq('id', manifestId)
    .single();

  if (error || !data) {
    console.warn(`   ❌ Manifest not found: ${error?.message}`);
    return false;
  }

  const checks = [
    { name: 'Status is completed', pass: data.status === 'completed' },
    { name: 'Has completed_at', pass: Boolean(data.completed_at) },
    { name: 'Has row_counts', pass: Boolean(data.row_counts) },
    { name: 'Has checksum', pass: Boolean(data.checksum) },
    { name: 'Type is daily_snapshot', pass: data.backup_type === 'daily_snapshot' },
  ];

  let allPassed = true;
  for (const check of checks) {
    console.log(`   ${check.pass ? '✅' : '❌'} ${check.name}`);
    if (!check.pass) allPassed = false;
  }

  return allPassed;
}

async function testChecksumVerification(manifestId: string): Promise<boolean> {
  console.log('\n🔍 Verifying backup checksums...');

  const { data, error } = await supabase.rpc('verify_backup', { p_manifest_id: manifestId });

  if (error) {
    console.warn(`   ⚠ Checksum verification failed: ${error.message}`);
    return false;
  }

  if (!data || (data as unknown[]).length === 0) {
    console.warn('   ⚠ No snapshots to verify');
    return false;
  }

  let allValid = true;
  for (const row of data as { table_name: string; stored_checksum: string; computed_checksum: string; is_valid: boolean }[]) {
    console.log(`   ${row.is_valid ? '✅' : '❌'} ${row.table_name}: ${row.is_valid ? 'valid' : 'MISMATCH'}`);
    if (!row.is_valid) allValid = false;
  }

  return allValid;
}

async function testRowCountConsistency(manifestId: string): Promise<boolean> {
  console.log('\n🔍 Checking row count consistency...');

  // Get manifest row counts
  const { data: manifest } = await supabase
    .from('backup_manifests')
    .select('row_counts')
    .eq('id', manifestId)
    .single();

  if (!manifest?.row_counts) {
    console.warn('   ⚠ No row counts in manifest');
    return false;
  }

  const counts = manifest.row_counts as Record<string, number>;

  // Get snapshot row counts
  const { data: snapshots } = await supabase
    .from('backup_snapshots')
    .select('table_name, row_count')
    .eq('manifest_id', manifestId);

  if (!snapshots) {
    console.warn('   ⚠ No snapshots found');
    return false;
  }

  let allMatch = true;
  for (const snapshot of snapshots) {
    const manifestCount = counts[snapshot.table_name] ?? -1;
    const match = manifestCount === snapshot.row_count;
    console.log(
      `   ${match ? '✅' : '❌'} ${snapshot.table_name}: ` +
      `manifest=${manifestCount}, snapshot=${snapshot.row_count}`,
    );
    if (!match) allMatch = false;
  }

  return allMatch;
}

async function testCleanupFunction(): Promise<boolean> {
  console.log('\n🔍 Testing backup cleanup function...');

  try {
    // Test with 9999 days retention (shouldn't delete anything recent)
    const { data, error } = await supabase.rpc('cleanup_old_backups', { retention_days: 9999 });

    if (error) {
      console.warn(`   ⚠ Cleanup function error: ${error.message}`);
      return false;
    }

    console.log(`   ✅ Cleanup function returned: ${data} manifests cleaned`);
    return true;
  } catch (err) {
    console.warn(`   ⚠ Cleanup function not available: ${err}`);
    return false;
  }
}

async function runBackupVerification(): Promise<void> {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║       NightCheck — Backup Verification Test                 ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');

  const report: BackupReport = {
    snapshotCreated: false,
    manifestValid: false,
    checksumValid: false,
    rowCountsMatch: false,
    cleanupWorks: false,
    passed: false,
  };

  // 1. Create snapshot
  const { manifestId, success } = await testSnapshotCreation();
  report.snapshotCreated = success;

  if (manifestId) {
    // 2. Validate manifest
    report.manifestValid = await testManifestValidity(manifestId);

    // 3. Verify checksums
    report.checksumValid = await testChecksumVerification(manifestId);

    // 4. Check row counts
    report.rowCountsMatch = await testRowCountConsistency(manifestId);
  }

  // 5. Test cleanup
  report.cleanupWorks = await testCleanupFunction();

  // Determine overall result
  report.passed = report.snapshotCreated &&
    report.manifestValid &&
    report.checksumValid &&
    report.rowCountsMatch;

  // Print summary
  console.log('\n┌──────────────────────────────────────────────────────────────┐');
  console.log('│                  BACKUP VERIFICATION REPORT                 │');
  console.log('├──────────────────────────────────────────────────────────────┤');
  console.log(`│  Snapshot created:   ${report.snapshotCreated ? 'YES ✅' : ' NO ❌'}`);
  console.log(`│  Manifest valid:     ${report.manifestValid ? 'YES ✅' : ' NO ❌'}`);
  console.log(`│  Checksums valid:    ${report.checksumValid ? 'YES ✅' : ' NO ❌'}`);
  console.log(`│  Row counts match:   ${report.rowCountsMatch ? 'YES ✅' : ' NO ❌'}`);
  console.log(`│  Cleanup works:      ${report.cleanupWorks ? 'YES ✅' : ' NO ❌'}`);
  console.log('├──────────────────────────────────────────────────────────────┤');
  console.log(`│  OVERALL:            ${report.passed ? 'PASS ✅' : 'FAIL ❌'}`);
  console.log('└──────────────────────────────────────────────────────────────┘');

  process.exit(report.passed ? 0 : 1);
}

runBackupVerification().catch((err) => {
  console.error('💥 Backup verification crashed:', err);
  process.exit(1);
});

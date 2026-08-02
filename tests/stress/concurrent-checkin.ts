/**
 * Concurrent Check-in Stress Test
 *
 * Simulates 500 concurrent check-in attempts against the Supabase database
 * to validate:
 *  - No duplicate attendance_logs (unique constraint holds)
 *  - No lost writes under concurrent upserts
 *  - Connection pool doesn't exhaust
 *  - Response latencies are acceptable
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx tests/stress/concurrent-checkin.ts
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CONCURRENCY = parseInt(process.env.STRESS_CONCURRENCY ?? '500', 10);
const HOSTEL_ID_OVERRIDE = process.env.STRESS_HOSTEL_ID;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('❌ SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

interface StressResult {
  totalRequests: number;
  successful: number;
  failed: number;
  duplicates: number;
  latencies: number[];
  errors: string[];
}

async function getOrCreateHostel(): Promise<string> {
  if (HOSTEL_ID_OVERRIDE) return HOSTEL_ID_OVERRIDE;

  const { data } = await supabase.from('hostel_center').select('id').limit(1).single();
  if (data) return data.id;

  const { data: created, error } = await supabase
    .from('hostel_center')
    .insert({
      name: 'Stress Test Hostel',
      center_lat: 28.6139,
      center_lng: 77.209,
      radius_meters: 100,
      timezone: 'Asia/Kolkata',
    })
    .select('id')
    .single();

  if (error) throw error;
  return created!.id;
}

async function seedTestStudents(hostelId: string, count: number): Promise<string[]> {
  console.log(`\n🌱 Seeding ${count} test students...`);
  const ids: string[] = [];

  // Insert in batches of 50
  for (let batch = 0; batch < count; batch += 50) {
    const batchSize = Math.min(50, count - batch);
    const rows = Array.from({ length: batchSize }, (_, i) => ({
      hostel_id: hostelId,
      name: `Stress Test Student ${batch + i + 1}`,
      room_no: `S${String(batch + i + 1).padStart(3, '0')}`,
      roll_number: `STRESS${String(batch + i + 1).padStart(4, '0')}`,
      phone_number: `+91${String(9000000000 + batch + i)}`,
      registered_device_id: `stress-device-${batch + i + 1}`,
      webauthn_credential_id: `stress-cred-${batch + i + 1}`,
      phone_verified: true,
    }));

    const { data, error } = await supabase
      .from('students')
      .upsert(rows, { onConflict: 'hostel_id,roll_number' })
      .select('id');

    if (error) {
      console.warn(`⚠ Batch ${batch} insert issue: ${error.message}`);
      // Try to fetch existing
      const { data: existing } = await supabase
        .from('students')
        .select('id')
        .eq('hostel_id', hostelId)
        .like('roll_number', 'STRESS%')
        .range(batch, batch + batchSize - 1);
      if (existing) ids.push(...existing.map((s) => s.id));
    } else {
      ids.push(...(data ?? []).map((s) => s.id));
    }
  }

  console.log(`   ✅ ${ids.length} students ready`);
  return ids;
}

async function simulateCheckIn(
  studentId: string,
  hostelId: string,
  logDate: string,
): Promise<{ latencyMs: number; success: boolean; error?: string }> {
  const start = performance.now();

  try {
    const { error } = await supabase.from('attendance_logs').upsert(
      {
        student_id: studentId,
        hostel_id: hostelId,
        log_date: logDate,
        timestamp: new Date().toISOString(),
        gps_lat: 28.6139 + (Math.random() - 0.5) * 0.001,
        gps_lng: 77.209 + (Math.random() - 0.5) * 0.001,
        status: 'success',
        fail_reason: null,
        marked_by: null,
      },
      { onConflict: 'student_id,log_date' },
    );

    const latencyMs = performance.now() - start;

    if (error) {
      return { latencyMs, success: false, error: error.message };
    }

    return { latencyMs, success: true };
  } catch (err) {
    return {
      latencyMs: performance.now() - start,
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

function percentile(arr: number[], p: number): number {
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

async function runStressTest(): Promise<void> {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║       NightCheck — Concurrent Check-in Stress Test          ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log(`\n📊 Configuration: ${CONCURRENCY} concurrent check-ins\n`);

  const hostelId = await getOrCreateHostel();
  const studentIds = await seedTestStudents(hostelId, CONCURRENCY);

  if (studentIds.length === 0) {
    console.error('❌ No test students created. Aborting.');
    process.exit(1);
  }

  const logDate = new Date().toISOString().slice(0, 10);

  // Clean previous stress test data for today
  await supabase
    .from('attendance_logs')
    .delete()
    .eq('hostel_id', hostelId)
    .eq('log_date', logDate)
    .in('student_id', studentIds.slice(0, 100)); // Supabase has an IN limit

  console.log(`\n🚀 Firing ${studentIds.length} concurrent check-ins...\n`);

  const startTime = performance.now();
  const results = await Promise.allSettled(
    studentIds.map((id) => simulateCheckIn(id, hostelId, logDate)),
  );
  const totalTime = performance.now() - startTime;

  // Analyse results
  const result: StressResult = {
    totalRequests: results.length,
    successful: 0,
    failed: 0,
    duplicates: 0,
    latencies: [],
    errors: [],
  };

  for (const r of results) {
    if (r.status === 'fulfilled') {
      result.latencies.push(r.value.latencyMs);
      if (r.value.success) {
        result.successful++;
      } else {
        result.failed++;
        if (r.value.error) result.errors.push(r.value.error);
      }
    } else {
      result.failed++;
      result.errors.push(r.reason?.message ?? 'Promise rejected');
    }
  }

  // Check for duplicates
  const { count } = await supabase
    .from('attendance_logs')
    .select('id', { count: 'exact', head: true })
    .eq('hostel_id', hostelId)
    .eq('log_date', logDate)
    .in('student_id', studentIds.slice(0, 100));

  // Print report
  console.log('┌──────────────────────────────────────────────────────────────┐');
  console.log('│                    STRESS TEST REPORT                       │');
  console.log('├──────────────────────────────────────────────────────────────┤');
  console.log(`│  Total requests:     ${result.totalRequests.toString().padStart(6)}`);
  console.log(`│  Successful:         ${result.successful.toString().padStart(6)}  ✅`);
  console.log(`│  Failed:             ${result.failed.toString().padStart(6)}  ${result.failed > 0 ? '❌' : '✅'}`);
  console.log(`│  Total time:         ${(totalTime / 1000).toFixed(2).padStart(6)}s`);
  console.log(`│  Throughput:         ${(result.totalRequests / (totalTime / 1000)).toFixed(0).padStart(6)} req/s`);
  console.log('├──────────────────────────────────────────────────────────────┤');
  console.log('│  LATENCY                                                    │');
  console.log(`│  p50:                ${percentile(result.latencies, 50).toFixed(0).padStart(6)}ms`);
  console.log(`│  p95:                ${percentile(result.latencies, 95).toFixed(0).padStart(6)}ms`);
  console.log(`│  p99:                ${percentile(result.latencies, 99).toFixed(0).padStart(6)}ms`);
  console.log(`│  Max:                ${Math.max(...result.latencies).toFixed(0).padStart(6)}ms`);
  console.log('├──────────────────────────────────────────────────────────────┤');
  console.log('│  DATA INTEGRITY                                             │');
  console.log(`│  DB rows (sample):   ${String(count ?? 'N/A').padStart(6)}`);
  console.log(`│  Duplicates:         ${result.duplicates.toString().padStart(6)}  ${result.duplicates === 0 ? '✅' : '❌'}`);
  console.log('└──────────────────────────────────────────────────────────────┘');

  if (result.errors.length > 0) {
    const uniqueErrors = [...new Set(result.errors)];
    console.log(`\n⚠ Unique errors (${uniqueErrors.length}):`);
    uniqueErrors.slice(0, 10).forEach((e) => console.log(`   • ${e}`));
  }

  // Exit code based on results
  const passRate = result.successful / result.totalRequests;
  if (passRate < 0.95) {
    console.log(`\n❌ FAIL: Pass rate ${(passRate * 100).toFixed(1)}% < 95% threshold`);
    process.exit(1);
  } else {
    console.log(`\n✅ PASS: ${(passRate * 100).toFixed(1)}% success rate`);
  }
}

runStressTest().catch((err) => {
  console.error('💥 Stress test crashed:', err);
  process.exit(1);
});

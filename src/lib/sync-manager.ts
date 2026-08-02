/**
 * Sync Manager — Background synchronisation orchestrator
 *
 * Listens for online/offline events and syncs pending check-ins
 * from the IndexedDB queue when connectivity resumes.
 *
 * Uses exponential backoff for retries and prevents duplicate syncs.
 */

import {
  getPendingCheckIns,
  updateCheckInStatus,
  cleanupSyncedEntries,
  getPendingCount,
  type PendingCheckIn,
} from './offline-store';
import { callFunction } from './supabase';

const MAX_RETRIES = 5;
const BASE_DELAY_MS = 1000;

type SyncStatusCallback = (pending: number, syncing: boolean) => void;

let isSyncing = false;
let statusCallback: SyncStatusCallback | null = null;
let registered = false;

/**
 * Register the sync manager. Sets up online/offline event listeners.
 * Call once at app startup.
 */
export function registerSyncManager(onStatusChange?: SyncStatusCallback): void {
  if (registered) return;
  registered = true;
  statusCallback = onStatusChange ?? null;

  window.addEventListener('online', () => {
    console.log('[sync] Device is online — starting sync');
    syncPendingCheckIns();
  });

  window.addEventListener('offline', () => {
    console.log('[sync] Device is offline — check-ins will be queued');
    notifyStatus();
  });

  // Register Background Sync if available
  if ('serviceWorker' in navigator && 'SyncManager' in window) {
    navigator.serviceWorker.ready.then((registration) => {
      (registration as unknown as { sync: { register: (tag: string) => Promise<void> } })
        .sync.register('nightcheck-sync')
        .catch((err: Error) => console.warn('[sync] Background sync registration failed:', err));
    });
  }

  // Initial sync attempt
  if (navigator.onLine) {
    syncPendingCheckIns();
  }
}

/**
 * Attempt to sync all pending check-ins to the server.
 * Processes entries in FIFO order with exponential backoff.
 */
export async function syncPendingCheckIns(): Promise<{ synced: number; failed: number }> {
  if (isSyncing) return { synced: 0, failed: 0 };
  if (!navigator.onLine) return { synced: 0, failed: 0 };

  isSyncing = true;
  notifyStatus();

  let synced = 0;
  let failed = 0;

  try {
    const pending = await getPendingCheckIns();

    for (const entry of pending) {
      if (!navigator.onLine) break;

      if (entry.retryCount >= MAX_RETRIES) {
        await updateCheckInStatus(entry.id!, 'failed', 'Max retries exceeded');
        failed++;
        continue;
      }

      try {
        await updateCheckInStatus(entry.id!, 'syncing');
        await syncSingleCheckIn(entry);
        await updateCheckInStatus(entry.id!, 'synced');
        synced++;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        await updateCheckInStatus(entry.id!, 'pending', message);
        failed++;

        // Exponential backoff before next attempt
        const delay = BASE_DELAY_MS * Math.pow(2, entry.retryCount);
        await sleep(Math.min(delay, 30000));
      }
    }

    // Cleanup old synced entries
    await cleanupSyncedEntries();
  } finally {
    isSyncing = false;
    notifyStatus();
  }

  return { synced, failed };
}

/**
 * Sync a single check-in entry to the server.
 * Since we can't replay the biometric, we send a special offline-sync request
 * that the server validates differently (requires the entry to have been
 * originally authenticated).
 */
async function syncSingleCheckIn(entry: PendingCheckIn): Promise<void> {
  const result = await callFunction<{ success: boolean; message: string }>('check-in', {
    step: 'offline-sync',
    gpsLat: entry.gpsLat,
    gpsLng: entry.gpsLng,
    deviceId: entry.deviceId,
    offlineAttemptedAt: entry.attemptedAt,
  });

  if (!result.success) {
    // "Already checked in" is a success case (conflict resolved)
    if (result.message?.includes('already checked in') || result.message?.includes('already present')) {
      return;
    }
    throw new Error(result.message || 'Server rejected offline check-in');
  }
}

/**
 * Get the current sync status for UI display.
 */
export async function getSyncStatus(): Promise<{
  isOnline: boolean;
  isSyncing: boolean;
  pendingCount: number;
}> {
  const pendingCount = await getPendingCount();
  return {
    isOnline: navigator.onLine,
    isSyncing,
    pendingCount,
  };
}

/**
 * Notify the registered callback about status changes.
 */
async function notifyStatus(): Promise<void> {
  if (!statusCallback) return;
  const count = await getPendingCount();
  statusCallback(count, isSyncing);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

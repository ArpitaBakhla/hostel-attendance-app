/**
 * Offline Store — IndexedDB-backed queue for check-in attempts
 *
 * When the device is offline, check-in attempts are stored in IndexedDB.
 * When connectivity resumes, they are synced to the server in FIFO order.
 *
 * Each entry stores the full check-in payload needed to replay the request.
 */

const DB_NAME = 'nightcheck_offline';
const DB_VERSION = 1;
const STORE_NAME = 'pending_checkins';

export interface PendingCheckIn {
  /** Auto-incremented IndexedDB key */
  id?: number;
  /** ISO timestamp when the check-in was attempted */
  attemptedAt: string;
  /** GPS coordinates at the time of attempt */
  gpsLat: number;
  gpsLng: number;
  /** Device fingerprint */
  deviceId: string;
  /** Serialised WebAuthn response (cannot replay biometric, but store for audit) */
  webauthnResponse?: string;
  /** Current sync status */
  status: 'pending' | 'syncing' | 'synced' | 'failed';
  /** Error message if sync failed */
  errorMessage?: string;
  /** Number of sync attempts */
  retryCount: number;
  /** Last sync attempt timestamp */
  lastRetryAt?: string;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, {
          keyPath: 'id',
          autoIncrement: true,
        });
        store.createIndex('status', 'status', { unique: false });
        store.createIndex('attemptedAt', 'attemptedAt', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Queue a check-in attempt for later sync.
 */
export async function queueCheckIn(entry: Omit<PendingCheckIn, 'id' | 'status' | 'retryCount'>): Promise<number> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);

    const record: PendingCheckIn = {
      ...entry,
      status: 'pending',
      retryCount: 0,
    };

    const request = store.add(record);
    request.onsuccess = () => resolve(request.result as number);
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
  });
}

/**
 * Get all pending (unsynced) check-in entries, ordered by attemptedAt.
 */
export async function getPendingCheckIns(): Promise<PendingCheckIn[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const index = store.index('status');
    const request = index.getAll('pending');

    request.onsuccess = () => {
      const results = (request.result as PendingCheckIn[]).sort(
        (a, b) => a.attemptedAt.localeCompare(b.attemptedAt),
      );
      resolve(results);
    };
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
  });
}

/**
 * Get the count of pending check-ins (for badge display).
 */
export async function getPendingCount(): Promise<number> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const index = store.index('status');
    const request = index.count('pending');

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
  });
}

/**
 * Update the status of a pending check-in entry.
 */
export async function updateCheckInStatus(
  id: number,
  status: PendingCheckIn['status'],
  errorMessage?: string,
): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const getReq = store.get(id);

    getReq.onsuccess = () => {
      const record = getReq.result as PendingCheckIn;
      if (!record) {
        reject(new Error(`Entry ${id} not found`));
        return;
      }

      record.status = status;
      record.retryCount += 1;
      record.lastRetryAt = new Date().toISOString();
      if (errorMessage) record.errorMessage = errorMessage;

      store.put(record);
    };

    getReq.onerror = () => reject(getReq.error);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
  });
}

/**
 * Remove synced entries older than a given age (cleanup).
 */
export async function cleanupSyncedEntries(maxAgeMs = 7 * 24 * 60 * 60 * 1000): Promise<number> {
  const db = await openDb();
  const cutoff = new Date(Date.now() - maxAgeMs).toISOString();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.openCursor();
    let deleted = 0;

    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) {
        resolve(deleted);
        return;
      }

      const record = cursor.value as PendingCheckIn;
      if (record.status === 'synced' && record.attemptedAt < cutoff) {
        cursor.delete();
        deleted++;
      }
      cursor.continue();
    };

    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
  });
}

/**
 * Check if IndexedDB is available in this browser.
 */
export function isOfflineStoreAvailable(): boolean {
  return typeof indexedDB !== 'undefined';
}

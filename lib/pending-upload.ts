/**
 * The script you picked but have not built yet.
 *
 * The scene map used to live in React state next to the File object, so closing
 * the picker threw both away and the only way back was to upload the same file
 * again. Worse on the path that matters most: tapping Upgrade sends you to
 * Stripe, which is a full page navigation, so even keeping the state would not
 * have survived it. You would come back a paying subscriber to no map.
 *
 * So it goes in IndexedDB, which holds a File as-is and survives both a reload
 * and a round trip through checkout. In the browser, not on our servers: the
 * file is already on this device, and storing scripts we were not asked to keep
 * is a promise we would then have to maintain.
 *
 * One pending upload at a time. Uploading a second script replaces the first,
 * which matches how the picker works — you are choosing scenes from one script.
 */

const DB_NAME = "actorrise";
const STORE = "pending_upload";
const KEY = "current";

/**
 * How long an unbuilt map is kept.
 *
 * Long enough to survive a night's sleep, a subscription decision, or a browser
 * restart. Short enough that a script you abandoned in March is not still
 * sitting in your browser in June.
 */
export const PENDING_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface PendingUpload<TScan = unknown> {
  file: File;
  scan: TScan;
  savedAt: number;
}

/** Has this pending upload aged out? Pure, so the rule can be tested. */
export function isExpired(savedAt: number, now: number): boolean {
  return now - savedAt >= PENDING_TTL_MS;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Every one of these swallows its own failure.
 *
 * IndexedDB is unavailable in private windows on some browsers, and can throw on
 * quota. None of that should stop someone uploading a script — the feature is a
 * convenience, and the upload works without it.
 */
export async function savePending<T>(file: File, scan: T): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put({ file, scan, savedAt: Date.now() }, KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    /* not worth telling anyone about */
  }
}

export async function loadPending<T>(): Promise<PendingUpload<T> | null> {
  if (typeof indexedDB === "undefined") return null;
  try {
    const db = await openDb();
    const value = await new Promise<PendingUpload<T> | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    db.close();

    if (!value?.file) return null;
    if (isExpired(value.savedAt, Date.now())) {
      await clearPending();
      return null;
    }
    return value;
  } catch {
    return null;
  }
}

export async function clearPending(): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    /* nothing to do */
  }
}

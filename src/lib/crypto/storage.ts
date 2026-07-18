import type { VaultEnvelope } from "./vault";

/**
 * Storage backend for the encrypted vault blob. Swap point for persistence:
 * IndexedDB today, anything else (different KV, remote-with-local-cache) later.
 * Stores ONLY the ciphertext envelope — never a key or plaintext.
 */
export interface VaultStorage {
  /** Persist the (already-encrypted) vault envelope. */
  save(envelope: VaultEnvelope): Promise<void>;
  /** Load the envelope, or null if none exists yet (first run). */
  load(): Promise<VaultEnvelope | null>;
  /** Remove the vault entirely (wipe). */
  clear(): Promise<void>;
}

const DB_NAME = "secure-page";
const STORE = "vault";
const KEY = "envelope";

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

function tx(
  db: IDBDatabase,
  mode: IDBTransactionMode,
): IDBObjectStore {
  return db.transaction(STORE, mode).objectStore(STORE);
}

/** Default IndexedDB-backed storage. */
export class IndexedDbStorage implements VaultStorage {
  async save(envelope: VaultEnvelope): Promise<void> {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const store = tx(db, "readwrite");
      const r = store.put(envelope, KEY);
      r.onsuccess = () => resolve();
      r.onerror = () => reject(r.error);
    });
    db.close();
  }

  async load(): Promise<VaultEnvelope | null> {
    const db = await openDb();
    const result = await new Promise<VaultEnvelope | null>((resolve, reject) => {
      const store = tx(db, "readonly");
      const r = store.get(KEY);
      r.onsuccess = () => resolve((r.result as VaultEnvelope) ?? null);
      r.onerror = () => reject(r.error);
    });
    db.close();
    return result;
  }

  async clear(): Promise<void> {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const store = tx(db, "readwrite");
      const r = store.delete(KEY);
      r.onsuccess = () => resolve();
      r.onerror = () => reject(r.error);
    });
    db.close();
  }
}

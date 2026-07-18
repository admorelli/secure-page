import type { CryptoProvider } from "./types";
import { bytesToBase64, base64ToBytes } from "./encoding";

export const KDF_HASH = "SHA-256";
export const DEFAULT_ITERATIONS = 250_000;
export const VAULT_VERSION = 1;

// Known constant encrypted into every vault; decrypting it proves the key.
const AUTH_CONSTANT = new TextEncoder().encode("secure-page:v1:auth");

/** One stored record: ciphertext is AES-GCM output (ciphertext + 16-byte tag). */
export interface EncryptedRecord {
  id: string;
  type: string;
  iv: string; // base64
  ciphertext: string; // base64
}

/** The whole encrypted vault as persisted (IndexedDB / backup file). */
export interface VaultEnvelope {
  version: number;
  kdf: { salt: string; iterations: number; hash: string };
  authTag: { iv: string; ciphertext: string };
  records: EncryptedRecord[];
}

/**
 * In-memory unlocked state. `key` is held only while unlocked and cleared on
 * lock; it never touches disk.
 */
export interface UnlockedVault {
  key: CryptoKey | undefined;
  salt: Uint8Array<ArrayBuffer>;
  iterations: number;
}

export class WrongPasswordError extends Error {
  constructor() {
    super("Incorrect password or corrupted vault");
    this.name = "WrongPasswordError";
  }
}

export async function createVault(
  provider: CryptoProvider,
  password: string,
  iterations: number = DEFAULT_ITERATIONS,
): Promise<{ envelope: VaultEnvelope; unlocked: UnlockedVault }> {
  const salt = provider.randomBytes(16);
  const key = await provider.deriveKey(password, salt, iterations);
  const iv = provider.randomBytes(12);
  const ct = await provider.encrypt(key, iv, AUTH_CONSTANT);
  const envelope: VaultEnvelope = {
    version: VAULT_VERSION,
    kdf: { salt: bytesToBase64(salt), iterations, hash: KDF_HASH },
    authTag: { iv: bytesToBase64(iv), ciphertext: bytesToBase64(ct) },
    records: [],
  };
  return { envelope, unlocked: { key, salt, iterations } };
}

/**
 * Re-derive the key and verify it by decrypting the auth tag. Throws
 * WrongPasswordError on a wrong password or tampered vault — no plaintext is
 * ever produced.
 */
export async function unlockVault(
  provider: CryptoProvider,
  envelope: VaultEnvelope,
  password: string,
): Promise<UnlockedVault> {
  const salt = base64ToBytes(envelope.kdf.salt);
  const key = await provider.deriveKey(password, salt, envelope.kdf.iterations);
  const iv = base64ToBytes(envelope.authTag.iv);
  const ct = base64ToBytes(envelope.authTag.ciphertext);
  try {
    const decrypted = await provider.decrypt(key, iv, ct);
    const ok =
      decrypted.length === AUTH_CONSTANT.length &&
      decrypted.every((b, i) => b === AUTH_CONSTANT[i]);
    if (!ok) throw new WrongPasswordError();
  } catch {
    throw new WrongPasswordError();
  }
  return { key, salt, iterations: envelope.kdf.iterations };
}

export async function encryptRecord<T>(
  provider: CryptoProvider,
  vault: UnlockedVault,
  id: string,
  type: string,
  payload: T,
): Promise<EncryptedRecord> {
  if (!vault.key) throw new Error("Vault is locked");
  const iv = provider.randomBytes(12);
  const plaintext = new TextEncoder().encode(JSON.stringify(payload));
  const ct = await provider.encrypt(vault.key, iv, plaintext);
  return { id, type, iv: bytesToBase64(iv), ciphertext: bytesToBase64(ct) };
}

export async function decryptRecord<T>(
  provider: CryptoProvider,
  vault: UnlockedVault,
  record: EncryptedRecord,
): Promise<T> {
  if (!vault.key) throw new Error("Vault is locked");
  const iv = base64ToBytes(record.iv);
  const ct = base64ToBytes(record.ciphertext);
  const plaintext = await provider.decrypt(vault.key, iv, ct);
  return JSON.parse(new TextDecoder().decode(plaintext)) as T;
}

/** Drop the in-memory key so it can be garbage-collected (lock). */
export function lockVault(vault: UnlockedVault): void {
  vault.key = undefined;
}

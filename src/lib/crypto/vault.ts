import type { CryptoProvider } from "./types";
import { bytesToBase64, base64ToBytes } from "./encoding";

export const KDF_HASH = "SHA-256";
export const DEFAULT_ITERATIONS = 250_000;
export const VAULT_VERSION = 1;

// Known constant encrypted (under the DEK) into every vault; decrypting it
// proves the unwrapped DEK is correct. No plaintext is ever produced on failure.
const AUTH_CONSTANT = new TextEncoder().encode("secure-page:v1:auth");

/** One stored record: ciphertext is AES-GCM output (ciphertext + 16-byte tag). */
export interface EncryptedRecord {
  id: string;
  type: string;
  iv: string; // base64
  ciphertext: string; // base64
}

/** A wrapped DEK: AES-GCM ciphertext of the raw 32-byte DEK under a KEK. */
interface WrappedKey {
  iv: string; // base64
  ciphertext: string; // base64
}

/** The whole encrypted vault as persisted (IndexedDB / backup file). */
export interface VaultEnvelope {
  version: number;
  kdf: { salt: string; iterations: number; hash: string };
  /** Auth tag: AUTH_CONSTANT encrypted under the DEK (proves DEK correctness). */
  authTag: { iv: string; ciphertext: string };
  /** DEK wrapped by each available KEK. `pw` always present. */
  wrap: { pw: WrappedKey; bio?: WrappedKey };
  records: EncryptedRecord[];
  /** Optional auth metadata (additive; absent on vaults created pre-biometrics). */
  auth?: {
    biometric?: {
      credentialId: string; // base64 of the WebAuthn credential rawId
      salt: string; // base64 — PRF input domain salt for this vault
    };
  };
}

/**
 * In-memory unlocked state. `key` is the Data Encryption Key (DEK), held only
 * while unlocked and cleared on lock; it never touches disk. Records and the
 * auth tag are encrypted under the DEK, so either unlock path (password or
 * biometric) that recovers the same DEK can open the vault.
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

// --- DEK lifecycle -------------------------------------------------------

async function genDek(): Promise<{ key: CryptoKey; raw: Uint8Array<ArrayBuffer> }> {
  const key = await globalThis.crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true, // extractable: needed to wrap (export raw) under KEKs
    ["encrypt", "decrypt"],
  );
  const raw = new Uint8Array(
    await globalThis.crypto.subtle.exportKey("raw", key),
  ) as Uint8Array<ArrayBuffer>;
  return { key, raw };
}

async function wrapDek(
  provider: CryptoProvider,
  kek: CryptoKey,
  rawDek: Uint8Array<ArrayBuffer>,
): Promise<WrappedKey> {
  const iv = provider.randomBytes(12);
  const ct = await provider.encrypt(kek, iv, rawDek);
  return { iv: bytesToBase64(iv), ciphertext: bytesToBase64(ct) };
}

async function unwrapDek(
  provider: CryptoProvider,
  kek: CryptoKey,
  wrap: WrappedKey,
): Promise<CryptoKey> {
  const iv = base64ToBytes(wrap.iv);
  const ct = base64ToBytes(wrap.ciphertext);
  const raw = await provider.decrypt(kek, iv, ct);
  return globalThis.crypto.subtle.importKey(
    "raw",
    raw,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

/** Verify a recovered DEK by decrypting the auth tag. Throws on mismatch. */
async function verifyDek(
  provider: CryptoProvider,
  envelope: VaultEnvelope,
  dek: CryptoKey,
): Promise<void> {
  const iv = base64ToBytes(envelope.authTag.iv);
  const ct = base64ToBytes(envelope.authTag.ciphertext);
  try {
    const decrypted = await provider.decrypt(dek, iv, ct);
    const ok =
      decrypted.length === AUTH_CONSTANT.length &&
      decrypted.every((b, i) => b === AUTH_CONSTANT[i]);
    if (!ok) throw new WrongPasswordError();
  } catch {
    throw new WrongPasswordError();
  }
}

// --- KEK derivation -------------------------------------------------------

async function kekFromPassword(
  provider: CryptoProvider,
  password: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number,
): Promise<CryptoKey> {
  return provider.deriveKey(password, salt, iterations);
}

async function kekFromPrf(
  provider: CryptoProvider,
  seed: Uint8Array<ArrayBuffer>,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number,
): Promise<CryptoKey> {
  return provider.deriveKeyFromPrf(seed, salt, iterations);
}

// --- Public API -----------------------------------------------------------

export interface BioCreate {
  /** PRF seed (SHA-256 of the PRF output) for this credential. */
  seed: Uint8Array<ArrayBuffer>;
  /** PRF input salt (base64) recorded for later unlockWithPrf calls. */
  salt: string;
  /** WebAuthn credential rawId (base64), stored for getPrf lookups. */
  credentialId: string;
}

export async function createVault(
  provider: CryptoProvider,
  password: string,
  iterations: number = DEFAULT_ITERATIONS,
  bio?: BioCreate,
): Promise<{ envelope: VaultEnvelope; unlocked: UnlockedVault }> {
  const salt = provider.randomBytes(16);
  const { key: dek, raw: dekRaw } = await genDek();

  const kekPw = await kekFromPassword(provider, password, salt, iterations);
  const wrap: VaultEnvelope["wrap"] = {
    pw: await wrapDek(provider, kekPw, dekRaw),
  };

  let auth: VaultEnvelope["auth"];
  if (bio) {
    const bioSalt = base64ToBytes(bio.salt);
    const kekBio = await kekFromPrf(provider, bio.seed, bioSalt, iterations);
    wrap.bio = await wrapDek(provider, kekBio, dekRaw);
    auth = {
      biometric: { credentialId: bio.credentialId, salt: bio.salt },
    };
  }

  const iv = provider.randomBytes(12);
  const ct = await provider.encrypt(dek, iv, AUTH_CONSTANT);
  const envelope: VaultEnvelope = {
    version: VAULT_VERSION,
    kdf: { salt: bytesToBase64(salt), iterations, hash: KDF_HASH },
    authTag: { iv: bytesToBase64(iv), ciphertext: bytesToBase64(ct) },
    wrap,
    records: [],
    auth,
  };
  return { envelope, unlocked: { key: dek, salt, iterations } };
}

/** Recover the DEK via the password KEK and verify it. */
export async function unlockVault(
  provider: CryptoProvider,
  envelope: VaultEnvelope,
  password: string,
): Promise<UnlockedVault> {
  const salt = base64ToBytes(envelope.kdf.salt);
  try {
    const kek = await kekFromPassword(provider, password, salt, envelope.kdf.iterations);
    const dek = await unwrapDek(provider, kek, envelope.wrap.pw);
    await verifyDek(provider, envelope, dek);
    return { key: dek, salt, iterations: envelope.kdf.iterations };
  } catch {
    throw new WrongPasswordError();
  }
}

/**
 * Recover the DEK via the biometric KEK (WebAuthn PRF seed) and verify it.
 * Throws WrongPasswordError if the vault was not set up for biometrics — the
 * caller should fall back to the password path.
 */
export async function unlockWithPrf(
  provider: CryptoProvider,
  envelope: VaultEnvelope,
  seed: Uint8Array<ArrayBuffer>,
): Promise<UnlockedVault> {
  const bio = envelope.auth?.biometric;
  if (!bio || !envelope.wrap.bio) throw new WrongPasswordError();
  const bioSalt = base64ToBytes(bio.salt);
  try {
    const kek = await kekFromPrf(provider, seed, bioSalt, envelope.kdf.iterations);
    const dek = await unwrapDek(provider, kek, envelope.wrap.bio);
    await verifyDek(provider, envelope, dek);
    return { key: dek, salt: bioSalt, iterations: envelope.kdf.iterations };
  } catch {
    throw new WrongPasswordError();
  }
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

import type { CryptoProvider } from "./types";
import type { VaultStorage } from "./storage";
import type { UnlockStrategy } from "./strategy";
import { defaultCryptoProvider } from "./provider";
import { IndexedDbStorage } from "./storage";
import { PasswordUnlockStrategy, BiometricUnlockStrategy } from "./strategy";
import {
  lockVault,
  encryptRecord,
  decryptRecord,
  unlockVault,
  parseEnvelope,
  BACKUP_FORMAT,
  type UnlockedVault,
  type VaultEnvelope,
  type EncryptedRecord,
  type BackupFile,
} from "./vault";

/**
 * High-level vault store the UI talks to. Depends only on the three swappable
 * interfaces (CryptoProvider, VaultStorage, UnlockStrategy) — wired together at
 * construction via factories/defaults. Replacing any moving part (storage backend,
 * auth method, crypto impl) is a constructor/factory change, not a rewrite.
 *
 * While unlocked it keeps the encrypted envelope in memory so record CRUD can
 * re-encrypt + persist without re-reading storage. The key + plaintext records
 * live only in memory and are cleared on lock.
 */
export class VaultStore {
  private provider: CryptoProvider;
  private storage: VaultStorage;
  private passwordStrategy: UnlockStrategy;
  private biometricStrategy: BiometricUnlockStrategy;
  private useBiometric = false;
  private state: UnlockedVault | null = null;
  private envelope: VaultEnvelope | null = null;

  constructor(opts?: {
    provider?: CryptoProvider;
    storage?: VaultStorage;
    strategy?: UnlockStrategy;
  }) {
    this.provider = opts?.provider ?? defaultCryptoProvider;
    this.storage = opts?.storage ?? new IndexedDbStorage();
    this.passwordStrategy = opts?.strategy ?? new PasswordUnlockStrategy();
    this.biometricStrategy = new BiometricUnlockStrategy();
  }

  /** True if no vault has been created yet (first run). */
  async exists(): Promise<boolean> {
    return (await this.storage.load()) !== null;
  }

  /** True if the runtime supports platform biometrics (WebAuthn PRF). */
  async biometricAvailable(): Promise<boolean> {
    return this.provider.prfSupported();
  }

  /** Opt in/out of biometric unlock. When enabled, `create` registers a passkey. */
  setBiometric(enabled: boolean): void {
    this.useBiometric = enabled;
  }

  isUnlocked(): boolean {
    return this.state?.key !== undefined;
  }

  /** Create a new vault (first run). Throws if one already exists. */
  async create(password: string): Promise<void> {
    if (await this.exists()) throw new Error("Vault already exists");
    const strategy = this.useBiometric ? this.biometricStrategy : this.passwordStrategy;
    const res = await strategy.create(this.provider, this.storage, password);
    this.state = res.unlocked;
    this.envelope = res.envelope;
  }

  /** Unlock with the master password (always works; the fallback path). */
  async unlock(password: string): Promise<void> {
    const res = await this.passwordStrategy.unlock(this.provider, this.storage, password);
    this.state = res.unlocked;
    this.envelope = res.envelope;
  }

  /** Unlock via biometric (WebAuthn PRF). Throws if biometrics aren't set up. */
  async unlockWithBiometric(): Promise<void> {
    if (!this.envelope && !(await this.exists())) throw new Error("No vault exists");
    const res = await this.biometricStrategy.unlock(
      this.provider,
      this.storage,
      "",
    );
    this.state = res.unlocked;
    this.envelope = res.envelope;
  }

  /** Current in-memory unlocked state (for record crypto). Null when locked. */
  unlocked(): UnlockedVault | null {
    return this.state;
  }

  /** Add a new encrypted record. Persists immediately. */
  async addRecord<T>(id: string, type: string, payload: T): Promise<void> {
    this.assertUnlocked();
    const rec = await encryptRecord(
      this.provider,
      this.state!,
      id,
      type,
      payload,
    );
    this.envelope!.records.push(rec);
    await this.storage.save(this.envelope!);
  }

  /** Insert or replace a record by id. Persists immediately. */
  async upsertRecord<T>(id: string, type: string, payload: T): Promise<void> {
    this.assertUnlocked();
    const rec = await encryptRecord(
      this.provider,
      this.state!,
      id,
      type,
      payload,
    );
    const i = this.envelope!.records.findIndex((r) => r.id === id);
    if (i >= 0) this.envelope!.records[i] = rec;
    else this.envelope!.records.push(rec);
    await this.storage.save(this.envelope!);
  }

  /** Delete a record by id. Persists immediately. */
  async deleteRecord(id: string): Promise<void> {
    this.assertUnlocked();
    this.envelope!.records = this.envelope!.records.filter((r) => r.id !== id);
    await this.storage.save(this.envelope!);
  }

  /** Decrypt every record of `type` into its plaintext payload. */
  async listRecords<T>(type: string): Promise<T[]> {
    this.assertUnlocked();
    const recs = this.envelope!.records.filter((r) => r.type === type);
    return Promise.all(
      recs.map((r) => decryptRecord<T>(this.provider, this.state!, r)),
    );
  }

  /** Lock: drop the in-memory key AND the decrypted envelope. */
  lock(): void {
    if (this.state) lockVault(this.state);
    this.state = null;
    this.envelope = null;
  }

  /** Wipe the stored vault (does not lock first). */
  async wipe(): Promise<void> {
    await this.storage.clear();
    this.state = null;
    this.envelope = null;
  }

  /**
   * Export the encrypted vault as a backup JSON string. Works whether locked
   * or unlocked (it serializes the stored ciphertext blob, never plaintext).
   * The backup is the same envelope format persisted to IndexedDB.
   */
  async exportBackup(): Promise<string> {
    const envelope = await this.storage.load();
    if (!envelope) throw new Error("No vault to back up");
    const file: BackupFile = {
      format: BACKUP_FORMAT,
      vaultVersion: envelope.version,
      envelope,
    };
    return JSON.stringify(file);
  }

  /**
   * Import a backup, replacing the stored vault — but only after verifying the
   * given password actually opens it (unwraps the DEK). If the password is
   * wrong or the file is corrupt, the current vault is left untouched.
   * Leaves the vault locked so the user unlocks normally afterwards.
   */
  async importBackup(json: string, password: string): Promise<void> {
    const envelope = parseEnvelope(json);
    await unlockVault(this.provider, envelope, password); // throws on bad password
    await this.storage.save(envelope);
    this.state = null;
    this.envelope = null;
  }

  private assertUnlocked(): void {
    if (!this.state?.key || !this.envelope) {
      throw new Error("Vault is locked");
    }
  }
}

/** Factory: build a VaultStore with the default moving parts. */
export function createVaultStore(opts?: {
  provider?: CryptoProvider;
  storage?: VaultStorage;
  strategy?: UnlockStrategy;
}): VaultStore {
  return new VaultStore(opts);
}

/** Generate a record id without a uuid dependency. */
export function newId(): string {
  return globalThis.crypto.randomUUID();
}

export type { EncryptedRecord };

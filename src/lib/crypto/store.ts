import type { CryptoProvider } from "./types";
import type { VaultStorage } from "./storage";
import type { UnlockStrategy } from "./strategy";
import { defaultCryptoProvider } from "./provider";
import { IndexedDbStorage } from "./storage";
import { PasswordUnlockStrategy } from "./strategy";
import { lockVault, type UnlockedVault } from "./vault";

/**
 * High-level vault store the UI talks to. Depends only on the three swappable
 * interfaces (CryptoProvider, VaultStorage, UnlockStrategy) — wired together at
 * construction via factories/defaults. Replacing any moving part (storage backend,
 * auth method, crypto impl) is a constructor/factory change, not a rewrite.
 */
export class VaultStore {
  private provider: CryptoProvider;
  private storage: VaultStorage;
  private strategy: UnlockStrategy;
  private state: UnlockedVault | null = null;

  constructor(opts?: {
    provider?: CryptoProvider;
    storage?: VaultStorage;
    strategy?: UnlockStrategy;
  }) {
    this.provider = opts?.provider ?? defaultCryptoProvider;
    this.storage = opts?.storage ?? new IndexedDbStorage();
    this.strategy = opts?.strategy ?? new PasswordUnlockStrategy();
  }

  /** True if no vault has been created yet (first run). */
  async exists(): Promise<boolean> {
    return (await this.storage.load()) !== null;
  }

  isUnlocked(): boolean {
    return this.state?.key !== undefined;
  }

  /** Create a new vault (first run). Throws if one already exists. */
  async create(password: string): Promise<void> {
    if (await this.exists()) throw new Error("Vault already exists");
    this.state = await this.strategy.create(this.provider, this.storage, password);
  }

  /** Unlock an existing vault. Throws WrongPasswordError on failure. */
  async unlock(password: string): Promise<void> {
    this.state = await this.strategy.unlock(this.provider, this.storage, password);
  }

  /** Current in-memory unlocked state (for record crypto). Null when locked. */
  unlocked(): UnlockedVault | null {
    return this.state;
  }

  /** Lock: drop the in-memory key. */
  lock(): void {
    if (this.state) lockVault(this.state);
    this.state = null;
  }

  /** Wipe the stored vault (does not lock first). */
  async wipe(): Promise<void> {
    await this.storage.clear();
    this.state = null;
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

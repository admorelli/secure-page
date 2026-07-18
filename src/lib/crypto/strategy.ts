import type { CryptoProvider } from "./types";
import type { VaultStorage } from "./storage";
import {
  createVault,
  unlockVault,
  type UnlockedVault,
  type VaultEnvelope,
} from "./vault";

/**
 * Unlock strategy — how the symmetric key is obtained. Swap point for auth:
 * PasswordUnlockStrategy today; a BiometricUnlockStrategy (WebAuthn PRF) slots
 * in later WITHOUT touching the vault core or the UI. The strategy only ever
 * returns an in-memory UnlockedVault + the (encrypted) envelope; it never sees
 * plaintext records.
 */
export interface UnlockStrategy {
  /** Stable id for which auth path this is (stored in debug logs only). */
  readonly id: string;
  /** Create a brand-new vault protected by this strategy. */
  create(
    provider: CryptoProvider,
    storage: VaultStorage,
    password: string,
  ): Promise<{ unlocked: UnlockedVault; envelope: VaultEnvelope }>;
  /** Unlock an existing vault using this strategy. */
  unlock(
    provider: CryptoProvider,
    storage: VaultStorage,
    password: string,
  ): Promise<{ unlocked: UnlockedVault; envelope: VaultEnvelope }>;
}

/** This strategy protects the vault directly with a master password (PBKDF2). */
export class PasswordUnlockStrategy implements UnlockStrategy {
  readonly id = "password";

  async create(
    provider: CryptoProvider,
    storage: VaultStorage,
    password: string,
  ): Promise<{ unlocked: UnlockedVault; envelope: VaultEnvelope }> {
    const { envelope, unlocked } = await createVault(provider, password);
    await storage.save(envelope);
    return { unlocked, envelope };
  }

  async unlock(
    provider: CryptoProvider,
    storage: VaultStorage,
    password: string,
  ): Promise<{ unlocked: UnlockedVault; envelope: VaultEnvelope }> {
    const envelope = await storage.load();
    if (!envelope) throw new Error("No vault exists");
    const unlocked = await unlockVault(provider, envelope, password);
    return { unlocked, envelope };
  }
}

import type { CryptoProvider } from "./types";
import type { VaultStorage } from "./storage";
import {
  createVault,
  unlockVault,
  unlockWithPrf,
  type UnlockedVault,
  type VaultEnvelope,
} from "./vault";
import { bytesToBase64, base64ToBytes } from "./encoding";

/**
 * Unlock strategy — how the symmetric key is obtained. Swap point for auth:
 * PasswordUnlockStrategy today; BiometricUnlockStrategy wraps it (password is
 * always the fallback). Each strategy only ever returns an in-memory
 * UnlockedVault + the (encrypted) envelope; it never sees plaintext records.
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

/**
 * Biometric unlock via the WebAuthn PRF extension. Protects the SAME vault as
 * the password (the PRF seed is run through the identical PBKDF2 + salt, so the
 * resulting AES key is byte-for-byte the same). Password remains the fallback.
 *
 * The first `create` registers a platform passkey and records its rawId + a
 * vault-specific PRF salt in `envelope.auth.biometric`. Subsequent unlocks call
 * `provider.getPrf(credentialId, salt)` to recover the seed. If biometrics are
 * unavailable or the user cancels, callers fall back to `PasswordUnlockStrategy`.
 */
export class BiometricUnlockStrategy implements UnlockStrategy {
  readonly id = "biometric+password";
  private fallback = new PasswordUnlockStrategy();

  async create(
    provider: CryptoProvider,
    storage: VaultStorage,
    password: string,
  ): Promise<{ unlocked: UnlockedVault; envelope: VaultEnvelope }> {
    // Register the passkey, then obtain its PRF seed (user verifies) so we can
    // wrap the DEK under the biometric KEK at creation time.
    const reg = await this.registerPasskey(provider);
    const seed = await provider.getPrf(
      base64ToBytes(reg.credentialId),
      base64ToBytes(reg.salt),
    );
    const { envelope, unlocked } = await createVault(provider, password, undefined, {
      seed,
      salt: reg.salt,
      credentialId: reg.credentialId,
    });
    await storage.save(envelope);
    return { unlocked, envelope };
  }

  async unlock(
    provider: CryptoProvider,
    storage: VaultStorage,
    _password: string,
  ): Promise<{ unlocked: UnlockedVault; envelope: VaultEnvelope }> {
    const envelope = await storage.load();
    if (!envelope) throw new Error("No vault exists");
    const bio = envelope.auth?.biometric;
    if (!bio) {
      // Vault predates biometrics — fall back to password.
      return this.fallback.unlock(provider, storage, _password);
    }
    const prfSecret = await provider.getPrf(
      base64ToBytes(bio.credentialId),
      base64ToBytes(bio.salt),
    );
    const unlocked = await unlockWithPrf(provider, envelope, prfSecret);
    return { unlocked, envelope };
  }

  /** Register a platform passkey, returning its id + a fresh PRF salt. */
  private async registerPasskey(
    provider: CryptoProvider,
  ): Promise<{ credentialId: string; salt: string }> {
    if (typeof navigator === "undefined" || !navigator.credentials?.create) {
      throw new Error("WebAuthn is not available in this environment");
    }
    const cred = (await navigator.credentials.create({
      publicKey: {
        challenge: provider.randomBytes(32),
        rp: { name: "Secure Page" },
        user: {
          id: provider.randomBytes(16),
          name: "vault-owner",
          displayName: "Vault owner",
        },
        pubKeyCredParams: [{ type: "public-key", alg: -7 }], // ES256
        authenticatorSelection: {
          authenticatorAttachment: "platform",
          userVerification: "required",
          residentKey: "required",
        },
        extensions: { prf: {} },
        timeout: 60_000,
      },
    })) as PublicKeyCredential | null;
    if (!cred) throw new Error("Biometric registration was cancelled");
    const salt = provider.randomBytes(16);
    return {
      credentialId: bytesToBase64(new Uint8Array(cred.rawId)),
      salt: bytesToBase64(salt),
    };
  }
}

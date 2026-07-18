/**
 * Crypto provider contract. The rest of the app depends ONLY on this
 * interface, never on a concrete implementation — so a different backend
 * (e.g. a WebAuthn-PRF-derived key, a hardware module, or a native lib)
 * can be dropped in via the factory without touching callers.
 */
export interface CryptoProvider {
  /** Stable identifier for the implementation (stored in debug logs only). */
  readonly id: string;

  /**
   * Derive a symmetric key from a password + salt + iteration count.
   * Auth-scope: only the owning UnlockStrategy may call this with the user's
   * master password.
   */
  deriveKey(
    password: string,
    salt: Uint8Array<ArrayBuffer>,
    iterations: number,
  ): Promise<CryptoKey>;

  /** Encrypt `plaintext` with `key` and `iv`. Returns ciphertext + GCM tag. */
  encrypt(
    key: CryptoKey,
    iv: Uint8Array<ArrayBuffer>,
    plaintext: Uint8Array<ArrayBuffer>,
  ): Promise<Uint8Array<ArrayBuffer>>;

  /** Decrypt. Throws if the key/iv/ciphertext is wrong or the data was tampered. */
  decrypt(
    key: CryptoKey,
    iv: Uint8Array<ArrayBuffer>,
    ciphertext: Uint8Array<ArrayBuffer>,
  ): Promise<Uint8Array<ArrayBuffer>>;

  /** Cryptographically-random bytes (salt, IV, etc.). */
  randomBytes(length: number): Uint8Array<ArrayBuffer>;

  /** True if this environment supports WebAuthn PRF (platform authenticator). */
  prfSupported(): Promise<boolean>;

  /**
   * Get the PRF output for a stored credential (by its rawId) against the
   * given salted input. Returns a 32-byte raw secret — the seed for the
   * biometric-derived vault key. Auth-scope: only BiometricUnlockStrategy.
   */
  getPrf(
    credentialId: Uint8Array<ArrayBuffer>,
    salt: Uint8Array<ArrayBuffer>,
  ): Promise<Uint8Array<ArrayBuffer>>;

  /**
   * Derive the vault key from a PRF/buffer secret (the seed produced by
   * getPrf) using the SAME PBKDF2 + salt + iterations as the password path,
   * so biometric and password unlock the identical vault. Auth-scope:
   * only BiometricUnlockStrategy.
   */
  deriveKeyFromPrf(
    secret: Uint8Array<ArrayBuffer>,
    salt: Uint8Array<ArrayBuffer>,
    iterations: number,
  ): Promise<CryptoKey>;
}

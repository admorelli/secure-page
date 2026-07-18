import type { CryptoProvider } from "./types";

const HASH = "SHA-256";
const KEY_BITS = 256;

function subtle(): SubtleCrypto {
  const c = globalThis.crypto;
  if (!c || !c.subtle) {
    throw new Error("Web Crypto API unavailable in this environment");
  }
  return c.subtle;
}

/**
 * Default provider: PBKDF2-HMAC-SHA256 key derivation + AES-GCM-256.
 * Uses the browser/standard `crypto.subtle` — no third-party crypto deps.
 */
export class WebCryptoProvider implements CryptoProvider {
  readonly id = "webcrypto-aes-gcm-256-pbkdf2-sha256";

  async deriveKey(
    password: string,
    salt: Uint8Array<ArrayBuffer>,
    iterations: number,
  ): Promise<CryptoKey> {
    const baseKey = await subtle().importKey(
      "raw",
      new TextEncoder().encode(password),
      "PBKDF2",
      false,
      ["deriveKey"],
    );
    return subtle().deriveKey(
      { name: "PBKDF2", salt, iterations, hash: HASH },
      baseKey,
      { name: "AES-GCM", length: KEY_BITS },
      false,
      ["encrypt", "decrypt"],
    );
  }

  async encrypt(
    key: CryptoKey,
    iv: Uint8Array<ArrayBuffer>,
    plaintext: Uint8Array<ArrayBuffer>,
  ): Promise<Uint8Array<ArrayBuffer>> {
    return new Uint8Array(
      await subtle().encrypt({ name: "AES-GCM", iv }, key, plaintext),
    ) as Uint8Array<ArrayBuffer>;
  }

  async decrypt(
    key: CryptoKey,
    iv: Uint8Array<ArrayBuffer>,
    ciphertext: Uint8Array<ArrayBuffer>,
  ): Promise<Uint8Array<ArrayBuffer>> {
    return new Uint8Array(
      await subtle().decrypt({ name: "AES-GCM", iv }, key, ciphertext),
    ) as Uint8Array<ArrayBuffer>;
  }

  randomBytes(length: number): Uint8Array<ArrayBuffer> {
    const b = new Uint8Array(length);
    globalThis.crypto.getRandomValues(b);
    return b as Uint8Array<ArrayBuffer>;
  }
}

/** Known provider ids. Extend this union when adding a new backend. */
export type CryptoProviderId = "webcrypto";

/**
 * Factory — the single swap point. Callers ask for a provider by id and
 * never construct a concrete class directly, so swapping the implementation
 * (or adding a WebAuthn-PRF-backed one) is a one-line change here.
 */
export function createCryptoProvider(
  id: CryptoProviderId = "webcrypto",
): CryptoProvider {
  switch (id) {
    case "webcrypto":
      return new WebCryptoProvider();
    default: {
      const _exhaustive: never = id;
      throw new Error(`Unknown crypto provider: ${String(_exhaustive)}`);
    }
  }
}

/** Shared default instance used across the app. */
export const defaultCryptoProvider: CryptoProvider = createCryptoProvider();

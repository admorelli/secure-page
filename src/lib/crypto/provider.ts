import type { CryptoProvider } from "./types";

const HASH = "SHA-256";
const KEY_BITS = 256;

/** Domain string mixed into the PRF input so the PRF seed is vault-specific. */
const PRF_DOMAIN = new TextEncoder().encode("Secure Page vault key v1");

function subtle(): SubtleCrypto {
  const c = globalThis.crypto;
  if (!c || !c.subtle) {
    throw new Error("Web Crypto API unavailable in this environment");
  }
  return c.subtle;
}

async function sha256(data: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  // `digest` is typed against ArrayBuffer (not BufferSource) in this lib;
  // callers always supply full-buffer views, so pass the backing ArrayBuffer.
  const buf = data.buffer as ArrayBuffer;
  return new Uint8Array(
    await subtle().digest("SHA-256", buf),
  ) as Uint8Array<ArrayBuffer>;
}

/**
 * Default provider: PBKDF2-HMAC-SHA256 key derivation + AES-GCM-256.
 * Uses the browser/standard `crypto.subtle` — no third-party crypto deps.
 *
 * Biometric unlock is implemented here via the WebAuthn PRF extension:
 *   prfSeed = SHA-256( PRF(credential, saltedInput) )
 *   vaultKey = PBKDF2(prfSeed, salt, iterations)   // same params as password
 * so the biometric credential unlocks the EXACT same vault as the password.
 * The AES key therefore never leaves the crypto module; only the raw PRF seed
 * (a 32-byte secret) is exposed to the strategy, and it is never persisted.
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

  async prfSupported(): Promise<boolean> {
    const c = globalThis.crypto as Crypto | undefined;
    if (!c?.subtle) return false;
    // PRF is gated behind WebAuthn + a platform authenticator.
    if (typeof globalThis.PublicKeyCredential?.isUserVerifyingPlatformAuthenticatorAvailable !== "function") {
      return false;
    }
    try {
      return await globalThis.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    } catch {
      return false;
    }
  }

  async getPrf(
    credentialId: Uint8Array<ArrayBuffer>,
    salt: Uint8Array<ArrayBuffer>,
  ): Promise<Uint8Array<ArrayBuffer>> {
    if (typeof navigator === "undefined" || !navigator.credentials?.get) {
      throw new Error("WebAuthn is not available in this environment");
    }
    // Mix the domain + vault salt into the PRF eval input so each vault's PRF
    // seed is distinct and tied to this app + this vault.
    const input = new Uint8Array(PRF_DOMAIN.length + salt.length);
    input.set(PRF_DOMAIN, 0);
    input.set(salt, PRF_DOMAIN.length);
    const evalInput = await sha256(input);

    const cred = (await navigator.credentials.get({
      publicKey: {
        challenge: evalInput,
        allowCredentials: [
          { id: credentialId, type: "public-key" },
        ],
        userVerification: "required",
        extensions: { prf: { eval: { first: evalInput } } },
      },
    })) as PublicKeyCredential | null;

    if (!cred) throw new Error("Biometric authentication was cancelled");
    const results = cred.getClientExtensionResults();
    const prfOut = results.prf?.results?.first;
    if (!prfOut) throw new Error("WebAuthn PRF extension returned no output");
    // PRF output is a 32-byte secret; hash to a stable 32-byte seed.
    return sha256(new Uint8Array(prfOut as ArrayBuffer) as Uint8Array<ArrayBuffer>);
  }

  async deriveKeyFromPrf(
    secret: Uint8Array<ArrayBuffer>,
    salt: Uint8Array<ArrayBuffer>,
    iterations: number,
  ): Promise<CryptoKey> {
    const baseKey = await subtle().importKey(
      "raw",
      secret,
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

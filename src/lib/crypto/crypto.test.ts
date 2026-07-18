import { describe, it, expect } from "vitest";
import { createCryptoProvider, WebCryptoProvider } from "./provider";
import {
  createVault,
  unlockVault,
  unlockWithPrf,
  encryptRecord,
  decryptRecord,
  lockVault,
  WrongPasswordError,
} from "./vault";
import { bytesToBase64, base64ToBytes } from "./encoding";

async function sha256Seed(s: string): Promise<Uint8Array<ArrayBuffer>> {
  const buf = new TextEncoder().encode(s).buffer;
  const digest = await globalThis.crypto.subtle.digest("SHA-256", buf);
  return new Uint8Array(digest) as Uint8Array<ArrayBuffer>;
}

const provider = createCryptoProvider();

describe("createCryptoProvider factory", () => {
  it("returns a WebCryptoProvider by default", () => {
    expect(createCryptoProvider().id).toBe(
      "webcrypto-aes-gcm-256-pbkdf2-sha256",
    );
    expect(createCryptoProvider() instanceof WebCryptoProvider).toBe(true);
  });
});

describe("vault create / unlock", () => {
  it("round-trips a credit-card record with the correct password", async () => {
    const { unlocked } = await createVault(provider, "correct horse");
    const card = {
      id: "1",
      label: "Personal",
      brand: "visa",
      number: "4111111111111111",
      holderName: "ALEX MORELLI",
      expiry: "08/27",
      cvc: "123",
      pin: "4321",
      notes: "",
    };
    const enc = await encryptRecord(
      provider,
      unlocked,
      card.id,
      "credit_card",
      card,
    );
    const back = await decryptRecord<typeof card>(provider, unlocked, enc);
    expect(back).toEqual(card);
  });

  it("rejects the wrong password on unlock", async () => {
    const { envelope } = await createVault(provider, "right-password");
    void envelope;
    await expect(
      unlockVault(provider, envelope, "wrong-password"),
    ).rejects.toBeInstanceOf(WrongPasswordError);
  });

  it("unlocks with the same password used at creation", async () => {
    const { envelope } = await createVault(provider, "pw");
    const unlocked = await unlockVault(provider, envelope, "pw");
    expect(unlocked.key).toBeDefined();
  });

  it("produces a unique IV + ciphertext per encryption", async () => {
    const { unlocked } = await createVault(provider, "pw");
    const a = await encryptRecord(provider, unlocked, "1", "t", { x: 1 });
    const b = await encryptRecord(provider, unlocked, "2", "t", { x: 1 });
    expect(a.ciphertext).not.toBe(b.ciphertext);
    expect(a.iv).not.toBe(b.iv);
  });

  it("fails to decrypt a tampered ciphertext (GCM integrity)", async () => {
    const { unlocked } = await createVault(provider, "pw");
    const enc = await encryptRecord(provider, unlocked, "1", "t", {
      secret: "top",
    });
    const bytes = base64ToBytes(enc.ciphertext);
    bytes[bytes.length - 1] ^= 0xff;
    const tampered = { ...enc, ciphertext: bytesToBase64(bytes) };
    await expect(
      decryptRecord(provider, unlocked, tampered),
    ).rejects.toBeTruthy();
  });

  it("lockVault clears the key and blocks further crypto ops", async () => {
    const { unlocked } = await createVault(provider, "pw");
    lockVault(unlocked);
    expect(unlocked.key).toBeUndefined();
    await expect(
      encryptRecord(provider, unlocked, "1", "t", {}),
    ).rejects.toBeTruthy();
  });
});

// Biometric unlock (WebAuthn PRF) shares the SAME vault as the password via
// key wrapping: a random DEK encrypts the records + auth tag, and that DEK is
// wrapped under BOTH a password-KEK and a biometric-KEK. Either KEK recovers
// the same DEK. PRF itself needs a real authenticator, so here we simulate the
// PRF seed (SHA-256 of the password, as getPrf does) and assert the two paths
// interoperate through the wrapped DEK.
describe("biometric (PRF) key equivalence", () => {
  it("biometric-unwrapped DEK opens password-encrypted data and vice-versa", async () => {
    const seed = await sha256Seed("correct horse");
    const bio = {
      seed,
      salt: bytesToBase64(provider.randomBytes(16)),
      credentialId: bytesToBase64(provider.randomBytes(16)),
    };
    const { envelope, unlocked: pwUnlocked } = await createVault(
      provider,
      "correct horse",
      undefined,
      bio,
    );
    const card = { id: "1", secret: "topsecret" };
    const enc = await encryptRecord(provider, pwUnlocked, "1", "t", card);

    // Simulate BiometricUnlockStrategy.unlock: seed -> unwrap DEK via bio KEK.
    const bioUnlocked = await unlockWithPrf(provider, envelope, seed);
    const back = await decryptRecord<typeof card>(provider, bioUnlocked, enc);
    expect(back).toEqual(card);

    // Other direction: biometric path re-encrypts, password path opens.
    const enc2 = await encryptRecord(provider, bioUnlocked, "2", "t", card);
    const pwAgain = await unlockVault(provider, envelope, "correct horse");
    expect(await decryptRecord(provider, pwAgain, enc2)).toEqual(card);
  });

  it("rejects a wrong PRF seed (mimics wrong credential)", async () => {
    const goodSeed = await sha256Seed("correct horse");
    const bio = {
      seed: goodSeed,
      salt: bytesToBase64(provider.randomBytes(16)),
      credentialId: bytesToBase64(provider.randomBytes(16)),
    };
    const { envelope } = await createVault(provider, "pw", undefined, bio);
    const badSeed = await sha256Seed("not-the-password");
    await expect(unlockWithPrf(provider, envelope, badSeed)).rejects.toBeInstanceOf(
      WrongPasswordError,
    );
  });

  it("password path still opens a vault created without biometrics", async () => {
    const { envelope, unlocked } = await createVault(provider, "pw");
    const enc = await encryptRecord(provider, unlocked, "1", "t", { x: 1 });
    const reopened = await unlockVault(provider, envelope, "pw");
    expect(await decryptRecord(provider, reopened, enc)).toEqual({ x: 1 });
  });
});

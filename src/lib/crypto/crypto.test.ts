import { describe, it, expect } from "vitest";
import {
  createCryptoProvider,
  WebCryptoProvider,
} from "./provider";
import {
  createVault,
  unlockVault,
  encryptRecord,
  decryptRecord,
  lockVault,
  WrongPasswordError,
} from "./vault";
import { bytesToBase64, base64ToBytes } from "./encoding";

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

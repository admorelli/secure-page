# DEV_PLAN — Secure Page (Offline Encrypted Vault PWA)

Status: MVP functional. Phases 1–3 implemented on `feat/pwa-poc`. Phases 4–6 planned.

## 1. Product goal

A mobile-installable web app (PWA) that stores sensitive security data
(login/password, credit cards + PIN, application secrets, notes) **locally on the
device only**. Data is encrypted at rest and protected by a master password and/or
device biometrics (fingerprint / FaceID / security key). Nothing is ever sent to a
server — there is no backend.

First use case delivered: **credit cards**. Add cards with full data; the list shows a
masked card visual (`XXXX XX** **** 1234`); on unlock the full number, CVC, expiry, and
PIN are revealed (decrypted in memory only).

## 2. Core principles

- **Local-first / zero-knowledge.** All data lives in the browser (IndexedDB). No
  network calls, no telemetry, no backend. The only network use is the static GitHub
  Pages deploy.
- **Encryption at rest.** The vault is an encrypted envelope. Without the key, it is
  useless.
- **Installable PWA.** Addable to the phone home screen; works offline (service worker).
- **Fail closed.** App boots to a locked state. No plaintext in DOM, storage, or memory
  until the key is derived and the session is unlocked.

## 3. Tech stack (implemented)

- Vite 8 + React 19 + TypeScript (strict).
- **Web Crypto API** (`crypto.subtle`): AES-GCM-256, PBKDF2-HMAC-SHA256. WebAuthn PRF
  planned for biometric unlock (Phase 4).
- **IndexedDB** for the encrypted vault envelope (hand-rolled promise wrapper in
  `storage.ts` — no `idb` dependency).
- **vite-plugin-pwa** for manifest + service worker (offline + install).
- **Oxlint** (lint), **Prettier** (format), **Vitest** (tests, default Node env — Web
  Crypto + `structuredClone` are available in modern Node, so no fake-indexeddb needed).

## 4. Data model (as implemented)

```ts
VaultEnvelope (stored encrypted in IndexedDB)
{
  version: 1,
  kdf: { salt: base64, iterations: 250000, hash: "SHA-256" },
  authTag: { iv: base64, ciphertext: base64 },  // known constant; decrypt proves key
  records: EncryptedRecord[]
}

EncryptedRecord
{
  id: string,                     // crypto.randomUUID()
  type: "credit_card",            // more types in Phase 6
  iv: base64,                     // 12-byte random AES-GCM IV
  ciphertext: base64             // AES-GCM output (ciphertext + 16-byte tag)
}

CreditCard (plaintext, only in memory while unlocked)
{
  id, label, brand: "visa"|"mastercard"|"amex"|"other",
  number, holderName, expiry: "MM/YY", cvc, pin, notes
}
```

Each record is independently encrypted with its own random IV; a tampered record fails
GCM auth alone and the rest still decrypt. `VaultStore` keeps the envelope in memory
while unlocked so record CRUD re-encrypts + persists without re-reading storage.

## 5. Security model

- **Key derivation (password):** PBKDF2-HMAC-SHA256, random 16-byte salt, 250,000
  iterations → AES-256-GCM key. Key lives only in memory after unlock; cleared on lock.
- **Encryption:** AES-GCM-256, 12-byte random IV per record. GCM gives confidentiality +
  integrity (tamper detection).
- **Unlock check:** a known constant is encrypted into the vault at creation (`authTag`);
  successful decrypt proves the correct key. Wrong password ⇒ GCM decrypt throws ⇒
  `WrongPasswordError`, no plaintext ever materializes.
- **Biometric / device unlock (Phase 4):** WebAuthn **PRF extension** derives a
  deterministic symmetric key from a platform authenticator (fingerprint, FaceID) or
  roaming authenticator (security key / "keycard"). That PRF key derives the same AES key
  as the password path via a new `BiometricUnlockStrategy` implementing the existing
  `UnlockStrategy` interface. Password remains the mandatory baseline.
- **Threat model (honest scope):**
  - PROTECTS: someone who gets the phone, the IndexedDB files, or a backup export — they
    see only ciphertext; brute-forcing the password is slowed by PBKDF2.
  - DOES NOT PROTECT: malware / keylogger / screen recorder on an already-unlocked device;
    a coerced unlock; OS-level compromise.
- **No plaintext at rest:** the key and decrypted records never touch disk or storage;
  cleared from memory on lock.

## 6. Architecture — three swappable seams

Wired together in `VaultStore` via constructor/factory injection
(`createVaultStore`). Replacing any seam is a constructor/factory change, not a rewrite —
this was a deliberate requirement so the moving parts (crypto, storage, auth) are
independently replaceable.

- **`CryptoProvider`** (`crypto/types.ts`, `crypto/provider.ts`): derive/encrypt/decrypt/
  random. Today: `WebCryptoProvider` (PBKDF2 + AES-GCM). A WebAuthn-PRF or native-backed
  provider slots in here. Factory: `createCryptoProvider()`.
- **`VaultStorage`** (`crypto/storage.ts`): persist/load/clear the encrypted envelope.
  Today: `IndexedDbStorage` (ciphertext only).
- **`UnlockStrategy`** (`crypto/strategy.ts`): how the key is obtained. Today:
  `PasswordUnlockStrategy` (master password). A `BiometricUnlockStrategy` implements the
  same interface without touching the vault core or UI.
- **`VaultStore`** (`crypto/store.ts`): the object the UI talks to — `exists`, `create`,
  `unlock`, `lock`, `addRecord`, `upsertRecord`, `deleteRecord`, `listRecords<T>`, `wipe`.
  `newId()` generates record ids (no uuid dependency).

## 7. Phased roadmap

- **Phase 1 — DONE.** Swappable `CryptoProvider` + vault crypto (PBKDF2 + AES-GCM-256),
  unit-tested (factory, create/unlock, wrong-password, unique IV, GCM tamper, lock).
- **Phase 2 — DONE.** Swappable `VaultStorage` (IndexedDB) + `UnlockStrategy` (password);
  wired real `create`/`unlock`/`lock` into the UI; auto-lock on tab hide.
- **Phase 3 — DONE.** Real encrypted credit-card CRUD through the vault (add/edit/delete/
  reveal-on-unlock), Luhn + expiry + CVC/PIN validation, no sample data.
- **Phase 4 — DONE.** Biometric unlock: `BiometricUnlockStrategy` via WebAuthn
  PRF; password fallback. A DEK is wrapped under both a password-KEK and a
  biometric-KEK so either path opens the same vault.
- **Phase 5 — DONE.** Encrypted backup: `VaultStore.exportBackup()`
  serializes the (ciphertext) `VaultEnvelope` to a downloadable JSON file;
  `importBackup(json, password)` verifies the password unwraps the DEK
  BEFORE overwriting storage, so a wrong/corrupt backup leaves the current
  vault untouched. The backup is ciphertext only — zero-knowledge holds.
- **Phase 6 — PLANNED.** Other record types: login/password, secure note, app secret.
  Reuse `addRecord`/`listRecords<T>` — cheap once Phase 3 exists.

## 8. Decided design choices (were open; resolved by the factory approach)

1. **Biometric** → WebAuthn PRF (covers fingerprint, FaceID, security key uniformly) with
   mandatory password fallback. Phase 4.
2. **Master key** → single master password unlocks the whole vault (standard model).
3. **Backup** → local export of the encrypted blob only (no cloud). Phase 5.
4. **Card visual** → generated card graphic (brand + masked number); never a photo of the
   real card.

## 9. Verification

- `npm run lint && npm run test && npm run build` must be green before any phase commit.
- `npm run test:e2e` (Playwright) runs the full app in Chromium against the production
  build served at `/secure-page/`; it covers create-vault, add/reveal/delete card,
  wrong-password rejection, persistence across reload, biometric graceful
  degradation, and backup export→re-import round-trip. Each test wipes IndexedDB.
- Current: lint 0/0, **30 unit tests** pass, **9 E2E tests** pass, build emits the PWA
  service worker + manifest.
- Crypto/store tests use an in-memory `VaultStorage` stand-in (no fake-indexeddb).
- Manual: install as PWA on a real phone (Android Chrome + iOS Safari), offline load,
  biometric unlock (Phase 4).

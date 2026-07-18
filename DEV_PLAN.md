# DEV_PLAN — Secure Page (Offline Encrypted Vault PWA)

Status: DRAFT v1 — open decisions in Section 8 need your confirmation before build.

## 1. Product goal

A mobile-installable web app (PWA) that stores sensitive security data
(login/password, credit cards + PIN, application secrets, notes) **locally on the
device only**. Data is encrypted at rest and protected by a master password and/or
device biometrics (fingerprint / faceID / security key). Nothing is ever sent to a
server — there is no backend.

Initial use case (Phase 3): **credit cards**. The user adds cards with full data;
the list shows a masked card visual (e.g. `XXXX XX** **** 1234`); on unlock the full
number, CVC, expiry, and PIN are revealed.

## 2. Core principles

- **Local-first / zero-knowledge.** All data lives in the browser (IndexedDB). No
  network calls, no telemetry, no backend.
- **Encryption at rest.** The vault is one encrypted blob. Without the key, the blob
  is useless.
- **Installable PWA.** Addable to the phone home screen; works offline.
- **Fail closed.** App boots to a locked state. No plaintext in DOM, localStorage, or
  memory until the correct key is derived and the session is unlocked.

## 3. Tech stack (already scaffolded)

- Vite + React 19 + TypeScript (scaffold present; lint/test/build green).
- **Web Crypto API** (`crypto.subtle`): AES-GCM-256, PBKDF2-HMAC-SHA256, WebAuthn PRF.
- **IndexedDB** for the encrypted vault blob (preferred over localStorage for size +
  structured/large records). Use a tiny wrapper (recommend `idb`, ~1KB) or hand-rolled
  promises — decide in Phase 1.
- PWA: `manifest.webmanifest` + service worker for offline/install (scaffold may need
  enabling — verify `vite-plugin-pwa` or equivalent is configured).
- Testing: Vitest + @testing-library/react (present). Aim 80%+ coverage on crypto +
  vault modules.

## 4. Data model

```
VaultBlob (stored encrypted in IndexedDB)
{
  version: 1,
  kdf: { salt, iterations, hash: "SHA-256" },   // PBKDF2 params for password derived key
  authTag: <bytes>,                               // integrity check of the master key
  records: [ EncryptedRecord, ... ]              // each record independently encrypted
}

EncryptedRecord
{
  id: uuid,
  type: "credit_card" | "login" | "note" | "secret",
  iv: <base64>,
  ciphertext: <base64>        // AES-GCM of the JSON plaintext record
}

CreditCard (plaintext, only in memory while unlocked)
{
  label: string,
  brand: "visa" | "mastercard" | "amex" | "other",
  number: string,             // full PAN
  holderName: string,
  expiry: "MM/YY",            // valid until
  cvc: string,
  pin: string,
  notes: string
}
```

Per-record IV + ciphertext so a single tampered record can't decrypt and the rest stay
intact. The whole `records` array can be one ciphertext or per-record — per-record is
simpler to edit incrementally; recommend per-record.

## 5. Security model

- **Key derivation (password):** PBKDF2-HMAC-SHA256, random 16-byte salt, high
  iteration count (target >= 250k, tune for mobile). The derived 256-bit key is the
  AES-GCM key. Key lives only in memory after unlock; zeroed on lock.
- **Encryption:** AES-GCM-256, 12-byte random IV per record. GCM gives
  confidentiality + integrity (tamper detection).
- **Unlock check:** a known `authTag` value is encrypted into the vault on creation;
  successful decrypt proves the correct key. Wrong password => GCM decrypt throws =>
  rejected, no plaintext ever materializes.
- **Biometric / device unlock:** WebAuthn **PRF extension** derives a deterministic
  symmetric key from a platform authenticator (fingerprint, FaceID) or roaming
  authenticator (security key / "keycard"). That PRF key wraps/derives the same AES key
  as the password path, so either unlock method opens the same vault. Password remains
  the mandatory baseline (biometric is progressive enhancement — not all devices/browsers
  support PRF yet).
- **Threat model (honest scope):**
  - PROTECTS: someone who gets the phone, the IndexedDB files, or a backup export —
    they see only ciphertext.
  - DOES NOT PROTECT: malware / keylogger / screen recorder on an already-unlocked
    device; a coerced unlock; OS-level compromise. State this plainly in-app.
- **No plaintext at rest:** never write PAN/CVC/PIN to DOM attributes, console, or
  storage outside the encrypted blob. Clear decrypted records from memory on lock.

## 6. UI / UX (initial: credit card)

- **Onboarding (first run):** set master password (strength meter + confirm + warning
  that there is NO recovery if forgotten — local-only by design). Optionally enroll
  biometric.
- **Lock screen:** password field + "Unlock with biometrics" button (if enrolled).
- **Cards list:** generated card visual (Apple-Wallet style) showing brand, label, and
  **masked** number (`XXXX XX** **** 1234`). No CVC/PIN/expiry visible.
- **Reveal (on unlock):** tapping a card shows full number, CVC, expiry, PIN (PIN
  masked behind a tap-to-reveal too, optional).
- **Add / Edit card form:** all fields; validated (Luhn for number, MM/YY format).
- **Settings:** change master password (re-derive + re-encrypt all records), enable/
  disable biometric, export encrypted backup, import backup, wipe vault.
- **Auto-lock:** lock after inactivity / on tab hide (configurable).

## 7. Phased roadmap

- **Phase 1 — Foundations:** verify/enable PWA; IndexedDB wrapper; `crypto` module
  (deriveKey, encryptRecord, decryptRecord, randomSalt/IV) with unit tests. No UI logic.
- **Phase 2 — Vault lifecycle:** create vault, lock/unlock, password change, persistence
  in IndexedDB. Component tests for lock/unlock state.
- **Phase 3 — Credit card use case:** list (masked), add/edit form, reveal-on-unlock.
  This is the deliverable for v0.1.
- **Phase 4 — Biometric unlock:** WebAuthn PRF enroll + unlock; password fallback.
- **Phase 5 — Backup/restore:** export/import encrypted blob (file or clipboard),
  PWA install polish, offline check.
- **Phase 6 — Other record types:** login/password, secure note, app secret (reuse the
  record/encrypt layer — cheap once Phase 3 lands).

## 8. Open decisions — PLEASE CONFIRM

1. **Biometric approach.** Recommend: WebAuthn PRF (covers fingerprint, FaceID, AND
   security-key/"keycard" uniformly) with mandatory password fallback. Alternative:
   password-only, no biometric (simpler, ships faster). 
   -> Default if no answer: WebAuthn PRF + password fallback.
2. **Master key model.** Recommend: single master password unlocks the whole vault
   (standard password-manager model). Alternative: per-item password (more complex,
   worse UX). -> Default: single master.
3. **Backup.** Recommend: local export of the encrypted blob only (no cloud, keeps
   zero-knowledge promise). Alternative: skip backup in v0.1. -> Default: local export.
4. **Card visual.** Recommend: generated card graphic (brand color/logo + masked
   number), NOT storing a photo of the real card (photos are a leakage risk).
   -> Default: generated visual.

## 9. Verification

- Unit: crypto round-trip (encrypt->decrypt equal), wrong password fails to decrypt,
  tampered ciphertext fails GCM auth, KDF salt/IV uniqueness.
- Component: lock->unlock transition, add card -> appears masked, reveal -> shows
  full data, wrong password rejected.
- Manual: install as PWA on a real phone (Android Chrome + iOS Safari), offline load,
  biometric unlock (Phase 4).
- Gate before each phase commit: `npm run lint && npm run test && npm run build` green.

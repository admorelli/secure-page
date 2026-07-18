# Secure Page

An offline, installable **PWA** that is a **client-side, locally-encrypted vault**
for sensitive data. Today it stores **credit cards**; the crypto and storage layers
are built as swappable seams so other record types (logins, secrets, notes) and
other auth/storage backends can be added without rewriting the core.

Everything is encrypted **in the browser**. The master password never leaves the
device, no plaintext or key is ever persisted, and there is no server — the only
network use is a static GitHub Pages deploy.

> Status: **MVP functional.** Encrypted credit-card vault is implemented end-to-end
> (create vault → lock/unlock → add/edit/delete/decrypt cards, all in IndexedDB).
> Biometric unlock (WebAuthn PRF) is implemented and enabled from the create
> screen when a platform authenticator exists; password remains the fallback. No
> server, no telemetry.

## Tech stack

- **React 19** + **TypeScript** (strict, `erasableSyntaxOnly`) + **Vite 8**
- **Web Crypto API** for all cryptography — no third-party crypto dependency
- **IndexedDB** for persistence (ciphertext only)
- **vite-plugin-pwa** for the installable/offline service worker + manifest
- **Oxlint** for linting, **Prettier** for formatting, **Vitest** for tests

## Commands

All verified to pass on this branch:

| Command | What it does |
| --- | --- |
| `npm run dev` | Start Vite dev server |
| `npm run build` | `tsc -b && vite build` (emits app + PWA service worker + manifest) |
| `npm run preview` | Preview the production build locally |
| `npm run lint` | Oxlint over `src` (0 errors / 0 warnings) |
| `npm run format` | Prettier `--write src` |
| `npm run test` | Vitest (run once; 24 tests pass) |
| `npm run test:e2e` | Playwright — builds, serves via `vite preview` at `/secure-page/`, runs `e2e/*.spec.ts` (7 tests). Requires `npx playwright install chromium` once. |
| `npm run deploy` | `npm run build` then push `dist/` to GitHub Pages via `gh-pages` |

Deployed at the GitHub Pages project subpath **`/secure-page/`** (set as Vite `base`).
If you fork this, change `base` in `vite.config.ts` and the repo name accordingly.

## Security model

- **Key derivation:** master password → PBKDF2-HMAC-SHA256 (250,000 iterations,
  16-byte random salt) → AES-256-GCM key.
- **Encryption:** each record is JSON-serialized, AES-GCM-256 encrypted with a
  unique 12-byte IV. The vault also stores an `authTag` (a known constant
  encrypted at creation); decrypting it proves the password is correct on unlock.
  A wrong password or tampered data throws `WrongPasswordError` — no plaintext is
  ever produced.
- **At rest:** IndexedDB stores only the encrypted `VaultEnvelope` (KDF params +
  auth tag + ciphertext records). No key, no plaintext.
- **In memory:** the `CryptoKey` lives only inside `VaultStore` while unlocked and
  is cleared on `lock()`. The app auto-locks on `visibilitychange` (tab hidden).

## Architecture

Three swappable seams, wired together in `VaultStore` via a factory/defaults.
Replacing any one (crypto impl, storage backend, auth method) is a constructor
change, not a rewrite.

```
src/
  main.tsx              entry; registers the PWA service worker
  App.tsx               UI: Locked / CardForm / CardView / Cards screens
  index.css, App.css    styles
  lib/
    mask.ts             CreditCard type + maskCardNumber / formatCardNumber
    validate.ts         luhnValid / expiryValid
    crypto/
      types.ts          CryptoProvider interface (the only contract callers use)
      provider.ts       WebCryptoProvider (default) + createCryptoProvider factory
      vault.ts          createVault / unlockVault / encryptRecord / decryptRecord /
                        lockVault + VaultEnvelope types + WrongPasswordError
      storage.ts        VaultStorage interface + IndexedDbStorage
      strategy.ts       UnlockStrategy interface + PasswordUnlockStrategy
      store.ts          VaultStore (high-level API) + createVaultStore / newId
      *.test.ts         unit + integration tests
```

- **`CryptoProvider`** — derive/encrypt/decrypt/random. Today: PBKDF2 + AES-GCM
  via `WebCryptoProvider`. A WebAuthn-PRF or native-backed provider slots in here.
- **`VaultStorage`** — persist/load/clear the encrypted envelope. Today: IndexedDB.
- **`UnlockStrategy`** — how the key is obtained. Today: `PasswordUnlockStrategy`
  (master password) and `BiometricUnlockStrategy` (WebAuthn PRF). The
  biometric strategy wraps the password one as a fallback. Both implement the
  same interface without touching the vault core or UI.
- **`VaultStore`** — the single object the UI talks to: `exists`, `create`,
  `unlock`, `unlockWithBiometric`, `lock`, `addRecord`, `upsertRecord`,
  `deleteRecord`, `listRecords`, `wipe`, `biometricAvailable`, `setBiometric`.

## Implementation phases

All work is on the `feat/pwa-poc` branch (not yet merged to `master`).

- **Phase 1** — swappable `CryptoProvider` + vault crypto (PBKDF2 + AES-GCM-256).
- **Phase 2** — swappable `VaultStorage` (IndexedDB) + `UnlockStrategy`
  (password); wired real `create`/`unlock`/`lock` into the UI.
- **Phase 3** — real encrypted credit-card CRUD through the vault (add/edit/delete/reveal).
- **Phase 4** — biometric unlock via a `BiometricUnlockStrategy` (WebAuthn PRF); password fallback.
- **Phase 5** — encrypted backup export/import (the ciphertext `VaultEnvelope` is
  downloadable and re-importable, password-verified before it replaces storage).
- **Phase 6 (planned)** — other record types (login, note, secret).

## Live demo

Deployed (static, no backend) at https://admorelli.github.io/secure-page/ — installable
to a phone home screen. Re-run `npm run deploy` after any build change to refresh it.

## Tests

Vitest, run in the default (Node) environment — Web Crypto and `structuredClone`
are available in modern Node, so no fake-indexeddb is needed. The crypto/store
tests use an in-memory `VaultStorage` stand-in. Coverage:

- `crypto.test.ts` — provider factory, vault create/unlock, wrong-password
  rejection, unique IV/ciphertext per encryption, GCM tamper detection, lock.
- `store.test.ts` — first-run / exists, lock→unlock, wrong password, no
  double-create, wipe.
- `records.test.ts` — card add/list, persistence across a lock→reload→unlock
  cycle, upsert, delete, no plaintext after lock.
- `mask.test.ts` — card masking / formatting.

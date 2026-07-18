# AGENTS

Assistant-operating notes for the **Secure Page** project. Project overview,
security model, and architecture live in `README.md`; the phased roadmap and
design decisions live in `DEV_PLAN.md`. This file is for execution guidance.

## What this project is

An offline, installable **PWA** that is a **client-side, locally-encrypted vault**
for sensitive data (currently credit cards). No server, no telemetry, no backend.
The only network use is a static GitHub Pages deploy. All cryptography is the
browser **Web Crypto API** — there is deliberately **no third-party crypto
dependency**.

## Branch / deploy state

- Active work branch: `feat/pwa-poc` (NOT yet merged to `master`).
- Live demo: https://admorelli.github.io/secure-page/ (project subpath
  `/secure-page/` — set as Vite `base` in `vite.config.ts`).
- Re-run `npm run deploy` after any build change to refresh the GitHub Pages site
  (it pushes `dist/` to the `gh-pages` branch). Page source is already set to
  `gh-pages` in repo Settings.

## Commands (all must pass before committing)

- `npm run dev` — Vite dev server
- `npm run build` — `tsc -b && vite build` (also emits PWA SW + manifest)
- `npm run preview` — preview the production build
- `npm run lint` — Oxlint over `src` (target: 0 errors / 0 warnings)
- `npm run format` — Prettier `--write src`
- `npm run test` — Vitest run-once (currently **24 tests**)
- `npm run deploy` — build + push to GitHub Pages

## Conventions

- **TypeScript strict.** Note: TS 6.x makes `Uint8Array` generic over its buffer;
  crypto binary buffers must be typed `Uint8Array<ArrayBuffer>` to satisfy
  `crypto.subtle` (`BufferSource`). If you add crypto code, pin those types.
- **No third-party crypto libs.** Use `crypto.subtle` only.
- **Swappable seams by design.** The vault core depends only on three interfaces:
  `CryptoProvider`, `VaultStorage`, `UnlockStrategy` — wired in `VaultStore` via
  `createVaultStore()`. To change crypto impl, storage backend, or auth method, add a
  new implementation of the interface and swap it at the factory/constructor — do NOT
  rewrite callers. This is a hard requirement from the user.
- **UI talks only to `VaultStore`** (`src/lib/crypto/store.ts`), never to the crypto
  primitives directly.
- Tests run in Vitest's default Node environment (Web Crypto + `structuredClone`
  available). Crypto/store tests use an in-memory `VaultStorage` stand-in — do NOT add
  `fake-indexeddb` unless a test genuinely needs the real IndexedDB.
- Oxlint uses `noUnusedLocals`/`noUnusedParameters` (tsconfig). Leftover unused vars
  fail the build (`tsc -b`), not just lint.

## What's built vs planned

- **Built (Phases 1–3):** swappable crypto provider (PBKDF2 + AES-GCM-256); swappable
  IndexedDB storage; password `UnlockStrategy`; real create/unlock/lock wired to UI;
  encrypted credit-card add/edit/delete/reveal with Luhn + expiry + CVC/PIN validation;
  auto-lock on tab hide.
- **Planned:** Phase 4 biometric unlock (`BiometricUnlockStrategy` via WebAuthn PRF);
  Phase 5 encrypted backup export/import; Phase 6 other record types (login/note/secret).

## File map (crypto core)

```
src/lib/crypto/
  types.ts        CryptoProvider interface (the only contract callers use)
  provider.ts     WebCryptoProvider (default) + createCryptoProvider factory
  vault.ts        createVault / unlockVault / encryptRecord / decryptRecord /
                  lockVault + VaultEnvelope types + WrongPasswordError
  storage.ts      VaultStorage interface + IndexedDbStorage
  strategy.ts     UnlockStrategy interface + PasswordUnlockStrategy
  store.ts        VaultStore (high-level API) + createVaultStore / newId
  *.test.ts       unit + integration tests
src/lib/mask.ts        CreditCard type + maskCardNumber / formatCardNumber
src/lib/validate.ts    luhnValid / expiryValid
src/App.tsx            UI: Locked / CardForm / CardView / Cards screens
```

## Pitfalls

- The "Unlock with biometrics" button is a **disabled placeholder** — do not wire real
  behavior there until Phase 4 (WebAuthn PRF). Keep it disabled.
- Never persist plaintext, the `CryptoKey`, or decrypted records. `VaultStore.lock()`
  clears the key AND the in-memory envelope.
- Changing `base` in `vite.config.ts` breaks the GitHub Pages path; keep `/secure-page/`
  unless the repo is renamed.

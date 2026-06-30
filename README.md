# Secure Page

Local-first, encrypted vault for sensitive data built in TypeScript with Vite, React, and Vitest. The current focus is credit card storage on-device; future targets include bank credentials, document metadata, recovery codes, and custom sensitive notes.

This repository is **not** the blog itself. Read the corresponding blog post at:
`https://admorelli.github.io/static-blog/posts/secure-card-vault-local-first-encrypted-sensitive-data-storage/`

## What this is

- data never leaves the device unless the user explicitly exports it
- encryption happens on-device before anything is written to storage
- unlock is a single secret the user controls: a password, PIN, or biometric gate
- the app stays simple and focused, with room to grow

## Project layout

- `src/` — application source
- `public/` — static assets served as-is
- `index.html` — Vite entry
- `vite.config.ts` — dev/build/PWA configuration
- `tsconfig.json` — TypeScript settings

## Commands

- `npm run dev` — local development server
- `npm run build` — typecheck and production build
- `npm run preview` — serve the built output
- `npm run lint` — ESLint
- `npm run format` — Prettier
- `npm run test` — Vitest
- `npm run deploy` — build and publish to GitHub Pages

## Verification

Run the full gate before opening work-in-progress PRs:

- `npm run test`
- `npm run lint`
- `npm run build`
- `npm run format`

## Status

MVP scope: credit cards only, with masked display by default and an unlock flow that decrypts data in memory for viewing.

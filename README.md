# صوتی بقیہ — Urdu Voice Finance Assistant

Voice-controlled bookkeeping for shopkeepers: income, expenses, balance, udhaar/party
tracking, monthly reports and a financial assistant — all in Urdu.

## Architecture (single backend)

| Piece | Where |
|---|---|
| Ledger, parties, settings, quota, AI cache | **Firestore** (`users/{uid}/…`), owner-scoped rules |
| Sign-in | **Firebase Anonymous Auth** (silent, no login screen) + optional **Email link** that links the anonymous uid, so the same cloud khata opens on a new phone |
| Server-side AI | **Cloud Function** `analyze` in `functions/` (provider key stays on the server) |
| Rules | `firestore.rules` |

Convex was removed entirely — see [`docs/adr-dual-backend.md`](docs/adr-dual-backend.md).

### Account recovery

An anonymous Firebase uid belongs to one browser, so the ledger is local-first until
the user links an email in **Settings → کھاتہ محفوظ کریں**. The link is completed with
`linkCredential`/`linkWithEmailLink`, which keeps the **same uid** (no data moves); on a
new device the same email signs in to that account and the cloud ledger is merged in
automatically (no manual Download needed). Requires **Email link
(passwordless sign-in)** to be enabled in Firebase Authentication — see
[`docs/RUNBOOK.md`](docs/RUNBOOK.md) section 0.

## Project layout

- `src/hooks/` — ledger state (`use-khata`), Firestore sync (`use-sync`), staff lock, PWA, voice.
- `src/lib/` — pure domain helpers: khata math, parties, insights, i18n, tts, voice grammar, AI client.
- `src/features/` — UI features: ledger, analytics, settings, ai-advisor, shop, onboarding.
- `functions/` — Firebase Cloud Functions (AI analysis + daily quota + cache).
- `scripts/` — runnable verification (`verify-*.ts`), bundle budget, asset tooling.
- `tests/` — Vitest unit tests and a Playwright smoke test.

## Development

```bash
bun install
bun run typecheck
bun run test        # ledger / sync-safety / voice logic scripts
bun run test:unit   # Vitest: reducer, sync planning, Urdu grammar
bun run build
bun run size        # bundle budget check (after build)
bun run dev         # http://localhost:3000
```

Optional end-to-end smoke (downloads Chromium first):

```bash
bunx playwright install chromium
bun run test:e2e
```

## Deployment

1. Frontend (Firebase Hosting): `bun run build && firebase deploy --only hosting`.
2. AI function: set the provider key, then `firebase deploy --only functions:sauti`.
   See [`docs/RUNBOOK.md`](docs/RUNBOOK.md) for key rotation and recovery steps.

The AI function is optional for the ledger: without it the advisor shows an
explicit *local* summary instead of failing.

## Documentation

- [`docs/RUNBOOK.md`](docs/RUNBOOK.md) — recovery, key rotation, lost device.
- [`docs/AUDIT-REPORT-URDU.md`](docs/AUDIT-REPORT-URDU.md) — current technical audit (Urdu).
- [`docs/DEPLOY.md`](docs/DEPLOY.md), [`docs/FIREBASE-SETUP.md`](docs/FIREBASE-SETUP.md).

## License

Private project.

# Rate Vault — module boundary

Owner-eyes-only B-1 / rate builder workshop inside Hit Squad. Default grant is the owner seat. Settings → Privileges can assign `rate-vault` later without a code change.

## What this scaffold owns

| Surface | Path |
| --- | --- |
| Home door | `RATE_VAULT_DOOR` via `homeDockTilesForViewer` — not a public `HOME_DOCK_TILES` peer |
| Route | `/rate-vault` — server layout redirects home (or login) when the session lacks the grant |
| API | `/api/rate-vault` — `requireRateVault` returns 401 / 403 before any payload |
| Types / stub store | `lib/rate-vault.ts` |

Do not import estimate packs, Jobs, Quality, HSE, seats, Inbox, or live Rate Tables into this module.

## Break-off later

Rate Vault is partitioned so a later program can leave `hitsquad-desk` without rewriting the workshop.

1. Keep `lib/rate-vault.ts` as the public data/API contract (workshop shape, section ids, publish stub).
2. Keep `/api/rate-vault` as the only HTTP boundary. A new Vercel app can copy that route and `requireRateVault` (or swap the session reader).
3. Home door, DeskChrome, and Privileges stay on Hit Squad. The break-off app does not need `HOME_DOCK_TILES`, Jobs, or seats.
4. When live hall / contractor / P66 ingest lands, persist it behind this module — not `lib/estimate-pack.ts` or `/api/desk/rates`.
5. “Publish rate package” is a stub. Wiring live estimate Rate Tables is a later, explicit step — not implied by this scaffold.

No Inbox / what’s-new blast. No new Vercel project in this phase.

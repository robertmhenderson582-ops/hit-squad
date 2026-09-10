# Rate Vault — module boundary

Owner-eyes-only B-1 / rate builder workshop inside Hit Squad. Default grant is the owner seat. Settings → Privileges can assign `rate-vault` later without a code change.

## What this scaffold owns

| Surface | Path |
| --- | --- |
| Home door | `RATE_VAULT_DOOR` via `homeDockTilesForViewer` — not a public `HOME_DOCK_TILES` peer |
| Route | `/rate-vault` — server layout redirects home (or login) when the session lacks the grant |
| API | `/api/rate-vault` — `requireRateVault` returns 401 / 403 before any payload |
| Types / stub store | `lib/rate-vault.ts` |

First-class workshop modules (`RATE_VAULT_SECTIONS` ids): `halls`, `contractor`, `cba-pla`, `state-law`, `p66`, `publish`.

`cba-pla` is its own pane — **CBA / PLA** (CBA & PLA vault). It is not nested under P66 / site rules. For sites without a dedicated P66 rate book (Wood River, Bayway), hall CBA/PLA rules drive OT, fringes, eligibility, and clock, and must feed the published rate package. This pass is structure only (empty vault list + file drop stub). No live estimate CBA circuits, no Cassidy mail.

`state-law` is its own pane — **State law**. Rules are keyed by site location / state (Illinois / Wood River, California / Rodeo & Ferndale, New Jersey / Bayway, Montana / Billings). OT, wage, rest, and holiday sit alongside CBA/PLA when site-specific P66 rates are thin, and must feed the published rate package later. Structure only this pass.

Do not import estimate packs, Jobs, Quality, HSE, seats, Inbox, or live Rate Tables into this module.

## Break-off later

Rate Vault is partitioned so a later program can leave `hitsquad-desk` without rewriting the workshop.

1. Keep `lib/rate-vault.ts` as the public data/API contract (workshop shape, section ids including `cba-pla` and `state-law`, empty vaults, publish stub).
2. Keep `/api/rate-vault` as the only HTTP boundary. A new Vercel app can copy that route and `requireRateVault` (or swap the session reader).
3. Home door, DeskChrome, and Privileges stay on Hit Squad. The break-off app does not need `HOME_DOCK_TILES`, Jobs, or seats.
4. When live hall / contractor / CBA-PLA / state-law / P66 ingest lands, persist it behind this module — not `lib/estimate-pack.ts` or `/api/desk/rates`. `cba-pla` and `state-law` stay first-class module ids, not children of `p66`.
5. “Publish rate package” is a stub. Wiring live estimate Rate Tables is a later, explicit step — not implied by this scaffold.

No Inbox / what’s-new blast. No new Vercel project in this phase.

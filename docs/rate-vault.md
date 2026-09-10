# Rate Vault — module boundary

Owner-eyes-only B-1 / rate builder workshop inside Hit Squad. Default grant is the owner seat. Settings → Privileges can assign `rate-vault` later without a code change. Madison seats stay out unless that privilege is granted.

**Rate Vault is Phillips 66 exclusive** — James Hutton / P66 procurement lane. Site pickers, seed catalog, CBA/PLA keys, state-law keys, and B-1 Builder lists only cover P66 Hit Squad plants (Wood River, Bayway, Rodeo, Ferndale, Billings) plus East Coast COMP. Monroe Energy, Yates / Georgia Power, and any other non-P66 client or refinery are out of this vault. Other clients get their own vault later if ever.

## What this module owns

| Surface | Path |
| --- | --- |
| Home door | `RATE_VAULT_DOOR` via `homeDockTilesForViewer` — not a public `HOME_DOCK_TILES` peer |
| Route | `/rate-vault` — server layout redirects home (or login) when the session lacks the grant |
| API | `/api/rate-vault` — `requireRateVault` returns 401 / 403 before any payload |
| Types / catalog | `lib/rate-vault.ts`, `lib/rate-vault-library.ts` |
| Recognition | `lib/rate-vault-recognize.ts` |

First-class workshop modules (`RATE_VAULT_SECTIONS` ids): `library`, `halls`, `contractor`, `cba-pla`, `state-law`, `p66`, `publish`.

The B-1 Builder face is a guided path (`RATE_VAULT_BUILDER_STEPS`): **Sources → Recognize → Map crafts → Burden / build → Publish preview**. Full Exhibit B-1 math parity is incremental. Publish stays a stub and does not write live estimate Rate Tables.

`cba-pla` is its own pane — **CBA / PLA** (CBA & PLA vault). It is not nested under P66 / site rules. For sites without a dedicated P66 rate book (Wood River, Bayway), hall CBA/PLA rules drive OT, fringes, eligibility, and clock, and must feed the published rate package.

`state-law` is its own pane — **State law**. Rules are keyed by site location / state (Illinois / Wood River, California / Rodeo & Ferndale, New Jersey / Bayway, Montana / Billings). OT, wage, rest, and holiday sit alongside CBA/PLA when site-specific P66 rates are thin.

Do not import estimate packs, Jobs, Quality, HSE, seats, Inbox, or live Rate Tables into this module.

## Source library (Drive index)

The catalog is **Drive file id + metadata only**. Never commit P66 / Madison rate books, B-1 `.xlsx` / `.xlsb`, GPPMA PDFs, or wage sheets into GitHub. Files stay on Drive / the desk vault. Owner can link more entries (Drive id + site / kind / craft / local) without leaving Rate Vault.

Seeded kinds: `cba`, `pla`, `gppma`, `local-craft-sheet`, `b1-exhibit`, `rate-builder`, `comp`, `union-terms`, `other`.

Sites indexed: Wood River, Bayway, Rodeo, Ferndale, Billings, and East Coast COMP. Prefer the latest book per site. Older B-1 faces stay in the catalog as archived / not primary. Ambiguous folder refs and clearly non-P66 books (Monroe PLA / Local 420 / Exhibit C Monroe, Yates) stay out of the default seed rather than appearing as a foreign site.

Owner-added rows persist as metadata in `rate-vault.json` on Drive (`RATE_VAULT_LIBRARY_KIND`). That file must not contain file bytes.

## Formats and recognition

Accepted drops: PDF, Word (`.doc` / `.docx`), Excel (`.xlsx` / `.xlsm` / `.xls` / `.xlsb`).

Recognition is flexible and path-aware — layouts are not universal (site, craft, hall, contractor, client book):

1. Detect mime / extension.
2. Classify kind from filename + extracted text / sheet names (B-1, wage sheet, PLA, GPPMA, rate builder, COMP, unknown).
3. Excel: list sheets and sniff header rows for craft / position / wage / fringe / burden columns. Do not assume one layout. `.xlsb` / `.xls` are filename-sniffed when ExcelJS cannot open them.
4. PDF / Word: extract text where streams are readable.
5. Surface a **review card** (guessed kind, site, craft / local, confidence, preview snippets).

Human confirm / correct is required before the catalog updates. **Recognition ≠ silent overwrite.** Confirm never writes a live rate book.

## Drag and drop

Every B-1 Builder step is a drop target — Sources, Recognize, Map crafts, Burden / build, and Publish — plus a persistent zone under the stepper. Drop PDF / Word / Excel the same way Quality folders accept files. Library cards are also draggable onto site and kind buckets to recategorize (metadata only; the Drive file does not move). Mapped craft / column rows can be reordered by drag. Binaries still never land in git.

## Break-off later

Rate Vault is partitioned so a later program can leave `hitsquad-desk` without rewriting the workshop.

1. Keep `lib/rate-vault.ts` as the public data/API contract (workshop shape, section ids including `library`, `cba-pla` and `state-law`, builder steps, empty vaults, publish stub).
2. Keep `/api/rate-vault` as the only HTTP boundary. A new Vercel app can copy that route and `requireRateVault` (or swap the session reader).
3. Home door, DeskChrome, and Privileges stay on Hit Squad. The break-off app does not need `HOME_DOCK_TILES`, Jobs, or seats.
4. When live hall / contractor / CBA-PLA / state-law / P66 ingest lands, persist it behind this module — not `lib/estimate-pack.ts` or `/api/desk/rates`. `cba-pla` and `state-law` stay first-class module ids, not children of `p66`.
5. “Publish rate package” is a stub. Wiring live estimate Rate Tables is a later, explicit step — not implied by this scaffold.

No Inbox / what’s-new blast. No new Vercel project in this phase. No Cassidy / union-hall mail.

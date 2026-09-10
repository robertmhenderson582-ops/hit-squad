# Rate Vault — module boundary

Owner-eyes-only B-1 / rate builder workshop inside Hit Squad. Default grant is the owner seat plus the P66 Rate Vault seat **James Hutton** (`jhut26@gmail.com`). That seat is Rate Vault–scoped — Home shows only the Rate Vault door, and Jobs / Inbox / Suggestion Box / Quality / HSE stay closed. Settings → Privileges can assign `rate-vault` later without a code change. The wider tester circle stays out. Do not mail James from this build. Not James Cain (`jameshcainjr@gmail.com`).

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

The B-1 Builder face is a guided path (`RATE_VAULT_BUILDER_STEPS`): **Sources → Recognize → Map crafts → Burden / build → Publish preview**. Burden / Publish show a **visual rate package** (positions × wage / fringe / burden / bill) friendlier than a raw Exhibit B-1. Sites v1: Wood River is the full demo path (opening Rate Vault auto-loads the B-1-derived fixture). Bayway / Rodeo / Ferndale / Billings use the same shell and stay empty until their B-1 is linked. Merit and union lanes stay visible and mapped separately — never blended. OCIP and non-OCIP faces are selectable. Full Exhibit B-1 math parity is still incremental. Publish stays a stub and does not write live estimate Rate Tables. A thin **Rate package buyoff** hinge (Approve / Reject / Request changes) stamps a decision only — approve does not write Rate Tables.

`cba-pla` is its own pane — **CBA / PLA** (CBA & PLA vault). It is not nested under P66 / site rules. For sites without a dedicated P66 rate book (Wood River, Bayway), hall CBA/PLA rules drive OT, fringes, eligibility, and clock, and must feed the published rate package.

`state-law` is its own pane — **State law**. Rules are keyed by site location / state (Illinois / Wood River, California / Rodeo & Ferndale, New Jersey / Bayway, Montana / Billings). OT, wage, rest, and holiday sit alongside CBA/PLA when site-specific P66 rates are thin.

Do not import estimate packs, Jobs, Quality, HSE, seats, Inbox, or live Rate Tables into this module.

## Source library (Drive index)

The catalog is **Drive file id + metadata only**. Never commit P66 / Madison rate books, B-1 `.xlsx` / `.xlsb`, GPPMA PDFs, or wage sheets into GitHub. Files stay on Drive / the desk vault. Owner can link more entries (Drive id + site / kind / craft / local) without leaving Rate Vault.

Seeded kinds: `cba`, `pla`, `gppma`, `local-craft-sheet`, `b1-exhibit`, `rate-builder`, `comp`, `union-terms`, `other`.

Sites indexed: Wood River, Bayway, Rodeo, Ferndale, Billings, and East Coast COMP. Prefer the latest book per site. Older B-1 faces stay in the catalog as archived / not primary. Ambiguous folder refs and clearly non-P66 books (Monroe PLA / Local 420 / Exhibit C Monroe, Yates) stay out of the default seed rather than appearing as a foreign site.

Wood River now has a primary `b1-exhibit` — **Wood River Exhibit B-1 latest (Robert 09.10.26)**. Catalog by Drive id only. If the Drive upload is still pending, the seed uses a placeholder id (`WOOD_RIVER_B1_EXHIBIT_DRIVE_ID` in `lib/rate-vault-preview.ts`) with a TODO to swap the real id in. Never commit the ~24 MB `.xlsx`.

## Visual B-1 preview

Selecting the Wood River B-1 library card (or opening Burden / Publish) loads a filled package from the checked-in JSON fixture `lib/rate-vault/wood-river-b1-preview-fixture.json`. That file is metadata and rate rows only — no workbook bytes. It mirrors Rate Summary / Burden Summary / craft locals (BM 363, PF 553, Laborer) plus Staff / Craft OCIP faces so the owner can scroll a real table before a compact extract from the live workbook replaces the seed.

Site pickers on Burden and Publish default to Wood River. Other P66 sites stay empty until their fixtures land. Recognize → map → burden stays wired: a linked Drive title still produces a review card, and the Wood River path injects fixture columns when no binary was dropped. Confirm never writes a live rate book. The Publish button remains `stubPublishRateVault()`.

## B-1 Excel export / import (vault-internal)

Rate Vault’s B-1 Builder matches Hit Squad estimate Excel round-trip behavior — export with formulas visible, edit offline, re-import so the vault preview updates. This is **one source**, not a parallel book.

| Direction | Surface |
| --- | --- |
| Export | `POST /api/rate-vault` `action: "export-b1"` → `lib/rate-vault-xlsx.ts` `rateVaultPreviewToXlsx` |
| Import | Drop an `.xlsx` / `.xlsm` on any Builder step → `action: "import-b1"` → `parseRateVaultB1Xlsx` |

The export is the **friendlier Rate Vault face** and the **formula check to the site** (same credibility bar as estimate Excel / under-the-hood proof). Rate Summary columns: position, craft, local, wage, fringe, burden, Bill ST / OT / DT, lane, OCIP, OT / clock. **Bill ST** is `=Fn+Gn+Hn` with a cached result tying burden → bill. Hidden `_id` columns key the importer. Spare empty position rows sit under the live seats so a new line can be typed in. Export also writes:

- **COMP Check** — key totals (positions, wage / fringe / burden / bill, burden stack %) via formulas that pull Rate Summary / Burden Summary. Not a raw dump of the giant COMP xlsm.
- **CBA PLA** and **State law** — read-only rule summary tabs (Excel forbids `/` in the CBA sheet name). Editable rate cells stay on Rate Summary / Burden Summary only.

Export tags the selected OCIP face (`ocip` / `non-ocip` / both). Import refuses mixing an OCIP workbook into a non-OCIP picker (or the reverse) unless the owner clicks **Confirm OCIP mix**. Merit vs union lanes never blend on mapped rows.

Re-import writes the edited package into `rate-vault.json` (`packages[]` — metadata / rate rows only, never workbook bytes). Each successful import stamps a **version** (date + note) and keeps a **last-good** package so Restore last-good can roll back. GET / recognize / Burden / Publish prefer that stored package over the Wood River fixture so a library-card click does not wipe offline edits. Owner and James share one canonical Drive vault package — no device-kick.

Import **may change** wages, fringes, burden inputs, bill overrides, and add/remove positions on mapped rows. Import validates and **refuses silent poison**:

- No Rate Vault marker / not our export → `{ fallback: "recognize" }` so a raw hall book still sniffs.
- Monroe / Yates / non-P66 site, NaN or negative money, missing Rate Summary, empty positions → 400 and the preview is unchanged.
- Silent sheet renames (required Rate Summary / Burden / COMP Check / CBA PLA / State law tabs) or broken Bill ST formula guts → 400, preview unchanged.

PDF / Word drops stay **review cards** this pass. Round-trip is Excel ↔ vault.

A successful import also queues a **Rate package buyoff** row. Approve / Reject / Request changes stamp the hinge only. Approve does **not** write live estimate Rate Tables.

Publish to live estimate Rate Tables stays a later explicit step. Vault-internal export / edit / import is enough for Burden / Publish preview to ripple.

Never commit the ~24 MB official Exhibit B-1 or any generated Rate Vault `.xlsx` to git.

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

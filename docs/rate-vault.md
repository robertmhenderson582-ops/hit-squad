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

The B-1 Builder face is a guided path (`RATE_VAULT_BUILDER_STEPS`): **Sources → Recognize → Map crafts → Burden / build → Publish preview**. Burden / Publish show a **visual rate package** (positions × wage / fringe / burden / bill) friendlier than a raw Exhibit B-1. Sites v1: Wood River is the full demo path (opening Rate Vault auto-loads the RRFF craft-sheet fixture — Pay Tax / Ins / Misc / O/H / Profit plus hall Fringes Subtotal). A book switch on Burden / Publish picks **RRFF** or **T&M** — two different P66 Exhibit B-1 labor-burden workbooks, not an OCIP filter. Default remains RRFF. Switching books loads that book’s package; rows never blend. Book **T&M** loads the Union_TM craft-sheet fixture (Fringes Subtotal as a single $/hr on union halls — no invented H&W/Pension splits). OCIP / non-OCIP still filters seats **inside** the selected book. Bayway / Rodeo / Ferndale / Billings use the same shell and stay empty until their B-1 is linked. Merit and union lanes stay visible and mapped separately — never blended. Publish stays a stub and does not write live estimate Rate Tables. A thin **Rate package buyoff** hinge (Approve / Reject / Request changes) stamps a decision only — approve does not write Rate Tables. Bill OT/DT formula work stays parked.

`cba-pla` is its own pane — **CBA / PLA** (CBA & PLA vault). It is not nested under P66 / site rules. For sites without a dedicated P66 rate book (Wood River, Bayway), hall CBA/PLA rules drive OT, fringes, eligibility, and clock, and must feed the published rate package.

`state-law` is its own pane — **State law**. Rules are keyed by site location / state (Illinois / Wood River, California / Rodeo & Ferndale, New Jersey / Bayway, Montana / Billings). OT, wage, rest, and holiday sit alongside CBA/PLA when site-specific P66 rates are thin.

Do not import estimate packs, Jobs, Quality, HSE, seats, Inbox, or live Rate Tables into this module.

## Source library (Drive index)

The catalog is **Drive file id + metadata only**. Never commit P66 / Madison rate books, B-1 `.xlsx` / `.xlsb`, GPPMA PDFs, or wage sheets into GitHub. Files stay on Drive / the desk vault. Owner can link more entries (Drive id + site / kind / craft / local) without leaving Rate Vault.

Seeded kinds: `cba`, `pla`, `gppma`, `local-craft-sheet`, `b1-exhibit`, `rate-builder`, `comp`, `union-terms`, `other`.

Sites indexed: Wood River, Bayway, Rodeo, Ferndale, Billings, and East Coast COMP. Prefer the latest book per site. Older B-1 faces stay in the catalog as archived / not primary. Ambiguous folder refs and clearly non-P66 books (Monroe PLA / Local 420 / Exhibit C Monroe, Yates) stay out of the default seed rather than appearing as a foreign site.

Wood River has two primary `b1-exhibit` labor-burden books. They are separate workbooks — never silently mix RRFF wages/burden with T&M.

| Book | UI label | Drive id | Title |
| --- | --- | --- | --- |
| `rrff` (default) | **RRFF** | `1HN5FclxjQNw0iHm_hizHbcWM9GZV_Zeu` | Wood River Exhibit B-1 RRFF Labor Burden Buildup |
| `tm` | **T&M** | `1fFrxkY68TaCJXQa3OYVRZJ5oStJg9kMg` | Wood River Exhibit B-1 Union_TM Labor Burden Buildup |

Catalog by Drive id only. Never commit the official ~24–25 MB `.xlsx` / `.xlsm`. RRFF and T&M each have a filled craft-sheet fixture (`lib/rate-vault/wood-river-b1-preview-fixture.json` and `lib/rate-vault/wood-river-tm-b1-preview-fixture.json`). T&M numbers come from the official Union_TM book — union halls expose a single **Fringes Subtotal** $/hr (no invented RRFF H&W/Pension splits or Illinois composite %). OCIP still filters seats inside whichever book is selected.

## Visual B-1 preview

Selecting the Wood River B-1 library card (or opening Burden / Publish) loads a filled package from the checked-in JSON fixture for that book — `lib/rate-vault/wood-river-b1-preview-fixture.json` (RRFF) or `lib/rate-vault/wood-river-tm-b1-preview-fixture.json` (T&M / Union_TM). Those files are metadata and rate rows only — no workbook bytes. Burden / build is driven by ingested B-1 craft-sheet columns: **Pay Tax FICA-MC / FUI / SUI**, **Ins W/C / Emp Liab / Gen Liab / Umbrella**, **Misc Small / Cons / PPE**, **O/H**, **Profit**, and **Fringes Subtotal** as $/hr hall by hall. T&M union halls carry that Fringes Subtotal as one line (the official face has no H&W/Pension component columns). Dollars imply % of taxable base wage. The official Burden Summary pivot can be an empty shell — do not trust it over craft-sheet columns. This is not a placeholder Illinois composite (no invented WC 14.20 / tools 1.85 / bundled overhead-and-fee).

Site pickers on Burden and Publish default to Wood River. The **Book** picker (RRFF / T&M) sits next to site and OCIP on those panes. Other P66 sites stay empty until their fixtures land. Recognize → map → burden stays wired: a linked Drive title still produces a review card, and the Wood River RRFF / T&M path injects that book’s fixture columns when no binary was dropped. Confirm never writes a live rate book. The Publish button remains `stubPublishRateVault()`. Desk Bill OT/DT follow the Exhibit B-1 builder controls below. Excel Bill OT/DT stay typed values this pass (not formulas).

## Exhibit B-1 rate-builder controls

Wood River hall sheets are not a three-way enum. Desk extract (2026-09-11) lists **16** distinct option strings. Product UI and stored modes use those exact labels.

| Control | Book labels | Notes |
| --- | --- | --- |
| Rate $/%/Varies | `$`, `%`, `Varies` | Row-6 cell format / text, not a DV list. |
| Base | `BW (K)`, `Tax BW (P)` | Drop Down List E1:E2 → row 8. `%` lines default to Tax BW (P). |
| ST Calc / OT Calc / DT Calc | `ST`, `OT`, `DT`, `ST-ONLY`, `OT-ONLY` | Drop Down List A1:A5 → row 7. Keep all five. Closest mapping for readers only: ST ≈ hours worked, DT ≈ hours paid, ST-ONLY ≈ straight only — do not rename the product. `OT` multiplies 1.5; `DT` multiplies 2. `OT-ONLY` bills the OT bucket only. |
| Rate Class | `Merit`, `Union` | Also in the book. |
| Craft Type | `Staff`, `Craft`, `Engineer`, `All` | Also in the book. |
| Mult | number or blank | Used when a hall is not a plain 1.5 / 2. |
| Ride ST / Ride OT / Ride DT | `Y`, `N` | Column ride flags on Fringes **and** Pay Tax / Ins / Misc / O/H / Profit. |

Legacy `ridesOt` still maps in: `true` → OT Calc **OT** + DT Calc **DT** + Ride Y; `false` → **ST** + Ride Y (parks the ST $ on OT/DT — Laborer / Teamster honesty). That map does **not** delete or hide the other book choices. Merit Health without `ridesOt` recognizes as **ST-ONLY** / Ride OT N.

Desk Burden / Publish show every control. `POST /api/rate-vault` `action: "patch-b1-line"` persists a line and ripples Bill OT/DT so Export uses the stored package.

Canonical lists: `lib/rate-vault/b1-fringe-options.json` (desk extract of Drop Down List A1:A5 / E1:E2 plus Rate Class, Craft Type, and row-6 `$` / `%` / `Varies`). Extract notes: `docs/b1-fringe-options.md`. Further Drop Down List strings append to `lib/rate-vault/b1-dropdowns.json`. Unknown option strings are never dropped. Do not invent Illinois composites or names that are not in the book.

## B-1 Excel export / import (vault-internal)

Rate Vault’s B-1 Builder matches Hit Squad estimate Excel round-trip behavior — export with formulas visible, edit offline, re-import so the vault preview updates. This is **one source**, not a parallel book.

| Direction | Surface |
| --- | --- |
| Export | `POST /api/rate-vault` `action: "export-b1"` → `lib/rate-vault-xlsx.ts` `rateVaultPreviewToXlsx` |
| Import | Drop an `.xlsx` / `.xlsm` on any Builder step → `action: "import-b1"` → `parseRateVaultB1Xlsx` |

The export is the **lean Rate Vault face** and the **formula check to the site** — not a clone of the ~25 MB official Exhibit B-1 (no pivots, no OCIP/staff dumps, no unused shells). Excel opens on **Rate Summary** (teal Hit Squad header, column widths that fit Position / Sheet / `$###.##` without a manual drag). Machine package keys (`kind`, `packageId`, `fixture`, …) live on a hidden last-tab `_meta` sheet — not the first thing you see. Import still reads `_meta`, `Package`, or a legacy `B-1 Package` tab. Rate Summary columns: position, craft, local, wage, fringe, burden, Bill ST / OT / DT, lane, OCIP, OT / clock. **Fringe** and **Burden** are `SUMIF` / `SUMIFS` ties to the Fringes and Burden Summary tabs. **Bill ST** is `=Fn+Gn+Hn`. Hidden `_id` / `_ridesOt` columns key the importer. Spare empty position rows sit under the live seats so a new line can be typed in. Export also writes:

- **Fringes** — hall-by-hall B-1 fringe lines as $/hr with Rate $/%/Varies, Base, ST/OT/DT Calc, Mult, Ride ST/OT/DT, and a Fringes Subtotal formula. Burden Summary carries the same controls on Pay Tax / Ins / Misc / O/H / Profit. Hidden `_id` / `_ridesOt` stay for compat; a workbook that only has `_ridesOt` still imports and infers Calc.
- **COMP Check** — key totals (positions, wage / fringe / burden / bill, Pay Tax stack %, fringe $) via formulas that pull Rate Summary / Burden Summary / Fringes. Not a raw dump of the giant COMP xlsm.
- **CBA PLA** and **State law** — read-only rule summary tabs (Excel forbids `/` in the CBA sheet name). Editable rate cells stay on Rate Summary / Burden Summary only.

Export tags the selected **book** (`rrff` / `tm`) and OCIP face (`ocip` / `non-ocip` / both). Stored packages, last-good, and versions are keyed by site + book so an RRFF import cannot drop T&M (or the reverse). A both-faces OCIP book **replaces** the stored package **for that book only** — do not default that book onto an OCIP-only merge (that dropped craft / non-OCIP wage and fringe edits). An OCIP-only (or non-OCIP-only) export still merges just that face and ripples hall Fringes / Burden onto kept rows, still inside one book. Import refuses mixing an OCIP workbook into a non-OCIP picker (or the reverse) unless the owner clicks **Confirm OCIP mix**. Import refuses mixing an RRFF workbook into a T&M picker (or the reverse) unless the owner clicks **Confirm book mix**. Confirm applies the file to the current picker only — it does not blend RRFF rows into T&M. Merit vs union lanes never blend on mapped rows.

Re-import writes the edited package into `rate-vault.json` (`packages[]` — metadata / rate rows only, never workbook bytes). Each successful import stamps a **version** (date + note) and keeps a **last-good** package so Restore last-good can roll back. GET / recognize / Burden / Publish prefer that stored package over the Wood River fixture so a library-card click does not wipe offline edits. Owner and James share one canonical Drive vault package — no device-kick.

Import **may change** wages, fringes, burden inputs, bill overrides, and add/remove positions on mapped rows. Offline edits on Fringes / Burden Summary / Rate Summary wages ripple back onto the live Rate Vault desk (hall cards and bills). One book — not a parallel copy. Import validates and **refuses silent poison**:

- No Rate Vault marker / not our export → `{ fallback: "recognize" }` so a raw hall book still sniffs.
- Monroe / Yates / non-P66 site, NaN or negative money, missing Rate Summary, empty positions → 400 and the preview is unchanged.
- Silent sheet renames (required Rate Summary / Burden / Fringes / COMP Check / CBA PLA / State law tabs) or broken Bill ST formula guts → 400, preview unchanged.

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

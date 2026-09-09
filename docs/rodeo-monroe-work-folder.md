# Rodeo + Monroe wake-up — Work Folder ids

Draft scaffold. Robert locks official totals. **Do not git client xlsx / pdf.**
Ids only. Books stay in Drive.

## Source of truth

1. **Work Folder** (primary document pile): Clients → P66 → Rodeo and Clients → Monroe Energy.
2. **Gmail official estimate revisions** lock filled totals.

## Folders

| Label | Drive id |
| --- | --- |
| Live Work Folder | `1_e5q1-ZpFTPE5LEWM9kv27a10gC16WbE` |
| Clients | `1cbbeGP-9oruYJyJ3JbH2r56Lj4PML1Ul` |
| Phillips 66 | `1tLqi03KY7tXJPZbw0BM3Q6GL-QL4XqS6` |
| Rodeo | `1uHhYyFdeu2N-QNYPKxEP9LzBQ1_JLjnk` |
| Rodeo PLA & CBAs | `1z-Nw_C53gJPGtu2tV4vvcTvBrHApbKax` |
| U110 2026 TA | `1JLlefSg4FPsNdkCGr8XZ3aWr-ZUNX4Oc` |
| U250 (parent) | `1mu2ybDmiZTuZMkLWN5yoqHegQPPV5iGH` |
| U250 Fall 2026 | `1a4tqDikHoTI3QjNYkpub-etjR7vFls4T` |
| Latest Estimate Workbook | `1FLCSXAmJYbLCt-95mB-8s3_xd0H_n-OZ` |
| Monroe Energy | `1ABdF_NkurspzC7YTF2us-3syOt0MBMyZ` |
| Monroe Site PLA | `1NDjMfdotigHW4mY1iD3SbuoE7SQqG46L` |
| 541V Estimate | `1dqQNs3SH2DCYuclP7_VaAhndJmdy2k87` |

## Official revisions (lock filled totals)

| Job | File | Drive id |
| --- | --- | --- |
| U110 | MADISON U110 … 1540 072222026R1.xlsx | `1Y9Y9xk6HGQycPBwUm6Xi4RM2dA0GfOej` |
| U250 | MADISON U250 … R2_08_17_2026_RH.xlsx | `1JNH2TwVz-iiubkr86i9CUwVETQFVSQlg` |
| Monroe 541V | POST REVIEW workbook | `15NhD45FUvdFmfynkbqYGGsy0muhIcx3y` |

## Rodeo has MULTIPLE templates (do not collapse)

**A — Madison Turnaround Contractor Estimate Template**  
Hours × one composite rate; Direct vs Indirect; INSTRUCTIONS / SUMMARY / tabs 1–9.  
Official U110 and U250 Gmail revisions are this family.

**B — P66 RODEO ESTIMATE WORKBOOK (~4.5MB)**

| Face | Drive id |
| --- | --- |
| Blank Needs Rates | `1X2ETYoUFx1gbVTX7GhFEyWD7nP0ABcBo` |
| Filled U110 | `1j0YaowDFQgZTspCY_yMT8oYeWjxEZQTs` |
| Filled U250 | `1gNw_YEzhBICk8TGiqANxXvw_NLTR-4Mu` |

**C — Client Estimate Form family** (U240 examples under Rodeo/U240).

John loop: Robert Excel → Hit Squad live pack → **estimate fills P66-shaped export → Robert pastes into official file**.

## Commercial stack (same idea as Wood River)

| Document | Drive id |
| --- | --- |
| Western States Agreement.pdf | `1wdYyt-qOEruPtosgiCSbkYO2yaTZnPfi` |
| West COMP PCA0001100 Amend 9 | `1zWoijAW5hGx7-Ew2U77_7uYxjEHS3RqT` |

Rate-book samples on the desk still read Amendment 8 figures. Amend 9 is the abiding signed PDF until Robert remaps wages.

## Reserved live-pack slots

| Job | Pack id | Job code | Crew |
| --- | --- | --- | --- |
| Rodeo U110 2026 TA | `new-u11026-rodeo` | EST-U11026 | Madison R1 five-card fill (`lib/wake-golden/rodeo-u110-crew.json`) |
| Rodeo U250 Fall 2026 | `new-u25026-rodeo` | EST-U25026 | Madison R2 five-card fill (`lib/wake-golden/rodeo-u250-crew.json`) |
| Monroe 541V | `new-541v26-monroe` | EST-541V26 | Identity only — later |

One live pack per job. U110 / U250 wake seed Staff / GF / Foreman / Direct / Support from official Madison hours × composite `bookRate` lines. Seat labor is `crewRowLaborAmount`: hours × that fixture rate when `bookRate` is set; otherwise Rate Table ST/OT/DT. Madison titles stay typed — they do not invent Shahan Rodeo aliases. Non-labor SUMMARY lines seed Other Cost as book-priced sell so 6.5% commercial markup does not double-charge Family A. There is no day grid in those books — hours plug on the official revision date (U110 2026-07-22, U250 2026-08-17), not an invented TA window. Official U250 has no GF seat — do not invent one. Do not seed EST-MTN9RM or a second U250 pack. Monroe shells still do not invent crew. Aromatics / Wood River packs are untouched.

## Golden locks (official SUMMARY)

Extracted from Drive text of the official books. Binaries stay out of git. Unexplained drift is a P0 bug.

| Job | Face | Hours | Grand $ |
| --- | --- | ---: | ---: |
| U110 | Family A contractor R1 | 26,441 | $5,247,587 |
| U250 | Family A contractor R2 | 12,881 | $2,470,680 |
| Monroe 541V | POST REVIEW SUMMARY | 8,483 labor (pivot 9,267) | formula — do not invent |

U110 buckets: Direct 16,730 / $2,746,343 · Indirect 9,711 / $1,735,592 · PD $429,790 · Mob $150,000 · Materials $50,000 · Equipment $10,862 · 3rd party $125,000.

U250 buckets: Direct 8,315 / $1,383,800 · Indirect 4,566 / $767,540 · PD $188,740 · Mob $101,000 · Materials $20,000 · Equipment $9,600.

Family B (~4.5MB P66 RODEO ESTIMATE WORKBOOK) is an additional face. Official lock for U110 / U250 is family A. Family B SUMMARY $ is pending workbook eval (no Drive text extract on the 4.5MB books) — do not invent those totals. Committed snapshot: `lib/wake-golden/fixtures.json`. U110 crew extract: `lib/wake-golden/rodeo-u110-crew.json`. U250 crew extract: `lib/wake-golden/rodeo-u250-crew.json`.

## Vault create (follow-up — do not upload a broken seed)

No Drive vault JSON yet for U110 / U250 (only Aromatics / Cat2 / Boiler 17). Do not invent Family B workbook dollars. Do not upload a seed whose Estimate Total is other+markup only.

After wake seed `deskPackageTotal` matches Family A (`5247587` / `2470680`):

1. Owner OAuth opens Rodeo U110 / U250 so persist fills the live pack from the fixtures.
2. Confirm the Estimate Total rail equals the Family A lock (hours stay `26441` / `12881`).
3. Save. First write is Drive `createJson` (not PATCH). `estimateFileName` mints in the Estimates room:
   - U110 → `rodeo-rodeo-u110-2026-ta.json`
   - U250 → `rodeo-rodeo-u250-fall-2026.json`
4. A hydrated pack whose rail is other+markup only (`~$815k` / `~$340k`) is a **409** — banner shows `Rodeo U110 desk $… ≠ locked $5247587` (never “Could not store that package.”). Drive 401/403/404 say sign-in, Estimates-folder write, or missing folder.
5. Service-account-only isolates cannot PATCH a missing file. Owner Save (or SA create of the filled snapshot after the desk total is honest) is the create path.

Do not commit vault JSON or client workbooks. Fixtures stay the source of truth until those landing files exist on Drive.

### Official-sheet findings (Madison U110 R1)

- SUMMARY CONTRACTOR (B3) and BLOCK / EVENT (B4) are blank — do not invent them.
- Filename stamps `072222026R1` (extra 2). Drive created/modified 2026-07-22.
- INSTRUCTIONS say tabs 1 through 10; the book has nine numbered tabs plus Lookups.
- Defined names leftover from another workbook (`wrn.*`, `sss`, `abc`, `_Fill`) resolve to `#N/A` / `#REF!`. Labor $ cells themselves are hours × typed composite rate — not `#REF`.
- Two Boilermaker rows and two Foreman rows kept as separate seats (different book rates).
- Tab 6 MATERIAL 1 is a $0 leftover; Freight $10,000 sits on MATERIAL 7. Tab 4 row 28 is labeled MOB _DEMOB 21 (skips 20) with $0.

### Official-sheet findings (Madison U250 R2)

- SUMMARY CONTRACTOR (B3) and BLOCK / EVENT (B4) are blank — other tabs formula-link those cells and show 0. Do not invent Madison or a block name.
- Filename stamps `R2_08_17_2026`. Gmail thread `1a079325d30a2c45` is 17 Aug 2026. Drive created/modified 2026-08-27. Hours-plug uses that revision day.
- Same leftover defined names / `#REF!` (`_Fill`) as U110. Labor $ cells are hours × typed composite rate — not `#REF`.
- Gmail R2 said Tool Room / Trailer Attendant 794h @ $159.84 moved to Directs. Official Direct tab labels that row Boilermaker — kept as typed.
- No GF / PM / Super rows. Two Boilermaker seats and two Foreman seats kept separate (different book rates).
- Tab 6 MATERIAL 1 is a $0 leftover. Freight $8,000 sits on Mob/Demob. Tab 4 row 28 is labeled MOB _DEMOB 21 (skips 20). Tab 8/9 headers are off-by-one leftovers.
- Family B P66 RODEO ESTIMATE WORKBOOK U-250 is an extra face. Do not seed EST-MTN9RM or a second U250 pack.

## Export (Rodeo V1)

**Estimate fills P66-shaped export → Robert pastes into official file.** Source = Hit Squad live pack (look-alike). The export includes a P66-shaped transfer face — Madison contractor hours × composite layout (SUMMARY + Direct/Indirect and money tabs 1–9) filled from that pack, plus a Paste Map of official-field → value. Destination is their official P66 file — Robert copy-pastes for V1. Do not block wake-up on cloning or protecting the locked official xlsx binary. Auto-write into an official template copy is later. Golden: Hit Squad totals ↔ this face ↔ Work Folder fixtures. Family B workbook fill is later. Bayway stays its own ST/OT/DT form later.

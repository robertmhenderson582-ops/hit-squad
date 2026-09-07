# Wood River Boiler 17 — official B-1 + Mike CPPR

Awarded Regular (in-facility) job. Desk status is **Locked** — not bid Awarded.
Ids and locked numbers only. **Do not git client xlsx / xls.**

## Official RH B-1

| Label | Drive id |
| --- | --- |
| Official RH B-1 | `1sMay67BNvtkW6fFLygPtymnIkFqrvvHT` |
| File | Boiler 17 2026  B-1 1019 071326RH.xlsx |
| Parent folder | `1jZc07jJjn3i4fodUhl6ieMvsmeOC-7XJ` |

Hours extracted from Drive text. Labor $ cells were `#REF` — do not invent a desk grand total from that book.

| Bucket | Hours / labeled $ |
| --- | ---: |
| Direct | 16,860 |
| Foremen | 2,134 |
| Support | 2,428 |
| Target craft | 21,422 |
| Staff | 6,826 |
| Craft PD | $228,150 |
| Materials / reimbursable | $104,100 |
| Heat induction | $152,880 |
| Staff PD | $127,400 |
| Staff travel | $8,400 |
| Original 6x20 (labeled) | $4,014,660 |
| Revised 7x20 (labeled) | $4,164,721 |

## Mike CPPR golden (Cost / PPR)

Gmail attachment — no Drive file id.

| Field | Lock |
| --- | --- |
| File | `Madison_CPPR_108451_P66 WR_Boiler 17_05.30.26.rev.xxx.xls` |
| JN | **108451** |
| Status date | 2026-05-30 |
| May Labor+PD+Travel | **$191,802** |
| May w/ 3rd+COE | **$225,256** |

These are May period actuals. They are not the B-1 estimate total.

## Live pack

| Field | Value |
| --- | --- |
| Pack id | `new-b1726` |
| Job code | `EST-B1726` |
| Vault JSON | `wood-river-boiler-17-2026.json` (`1SDOBakDxjUCUE-PgTlBUjqnbgchNlG8Y`) |
| Site | Phillips 66 → Wood River (Regular / budget lane) |
| Status | Locked |
| Job setup | 2026-08-10 → 2026-12-06 (Staff date row) |

Wake / HIS persist fills Staff / GF / Foreman / Direct / Support calendars from the official B-1 HC × Hours/shift / PD grids (`lib/wake-golden/boiler17-b1-crew.json`). Same Wood River five-card desk as Aromatics / CAT 2 — not a Rodeo layout. Rodeo / Ferndale stay additive tabs. Ranges are Hit Squad phase stacks so export/import UP→DOWN round-trips. Excel binary is never committed.

### Hours: Summary face vs typed grids

Official Summary cached K totals (Drive text / `BOILER17_B1_GOLDEN.boiler17Hours`) stay the face lock: Direct 16,860 · Foremen 2,134 · Support 2,428 · Target 21,422 · Staff 6,826.

Typed HC × HPS on the same book is slightly higher on Staff (7,234 including GF + an “Empty” leftover) and Direct (16,946). SR PROJECT MGR ST formulas were cleared on filled days (cached ST 0) so Summary under-counts that seat. Desk calendars follow the typed grids. Labor $ stay on Rate Tables / Shahan titles — do not invent #REF.

Numeric Misc / heat / staff travel seed Other Cost. Craft PD $228,150 and Staff PD $127,400 follow crew PD days × Shahan $130 / $140.

### Owner vault apply

Opening Jobs → Boiler 17 seeds the filled pack locally. Production Drive write uses the same `overwriteEstimateInDrive` helper as Rodeo / Monroe wake and needs owner OAuth. Service-account-only isolates cannot PATCH `1SDOBakDxjUCUE-PgTlBUjqnbgchNlG8Y`. Mike CPPR May notes stay on Cost.

Aromatics and Cat 2 stay on the vault. This pack is additional true-material.

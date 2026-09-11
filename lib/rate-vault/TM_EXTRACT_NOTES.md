# Wood River TM Exhibit B-1 — Extract Notes

- Source: `Wood_River_B1_latest.xlsx` (TM labor-burden book)
- Drive catalog id: `1fFrxkY68TaCJXQa3OYVRZJ5oStJg9kMg` / vault copy `11yTuFWKa-T9of8peqKrRASkGAmkXBMiL`
- Extracted at: `2026-09-11T11:26:45Z` (UTC)
- Reader: openpyxl `read_only=True`, `data_only=True`
- Output: `wood-river-tm-b1-extract.json` (raw extract). Rate Vault loads the derived compact fixture `wood-river-tm-b1-preview-fixture.json` — metadata and rate rows only, no workbook bytes.
- Halls populated: **8**
- Positions (nonzero ST Base Wage): **183**

## Confirmation: headers say TM, not RRFF

- `BM Union Staff` → banner **WOODRIVER BM STAFF TM** (rev 2026-01-01, eff 2026-12-31)
- `PF Union Staff` → banner **WOODRIVER PF STAFF TM** (rev 2026-01-01, eff 2026-12-31)
- `Merit Staff` → banner **WOODRIVER MERIT STAFF TM** (rev 2023-06-01, eff 2027-12-31)
- `Laborer L338` → banner **WOODRIVER LABORER TM** (rev 2026-08-01, eff 2027-07-31)
- `Teamster L525` → banner **WOODRIVER TEAMSTER TM** (rev 2026-05-01, eff 4/31/27)
- `Operating Engineer #520` → banner **WOODRIVER OPERATING ENG TM** (rev 2026-08-01, eff 2027-07-31)
- `Pipefitter L553` → banner **WOODRIVER PIPEFITTER TM** (rev 2026-01-01, eff 2026-12-31)
- `Boilermaker L363` → banner **WOODRIVER BOILERMAKER TM** (rev 2026-01-01, eff 2026-12-31)

## Example rows (title + wage + bill ST)

- **WOODRIVER BM STAFF TM** / LEAD SITE BOILERMAKER 01: Base Wage ST **71.0**, Billable ST **141.902**
- **WOODRIVER PF STAFF TM** / MANAGER PROJECT PIPEFITTER 01: Base Wage ST **70.58**, Billable ST **127.2264**
- **WOODRIVER MERIT STAFF TM** / LEAD SITE 01: Base Wage ST **90.0**, Billable ST **139.09**
- **WOODRIVER LABORER TM** / LABORER JOURNEYMAN: Base Wage ST **34.5135**, Billable ST **89.9704**
- **WOODRIVER TEAMSTER TM** / TEAMSTER GRP06: Base Wage ST **49.9415**, Billable ST **102.6191**
- **WOODRIVER OPERATING ENG TM** / OPERATING ENG GRP 01: Base Wage ST **49.115**, Billable ST **112.9474**
- **WOODRIVER PIPEFITTER TM** / PIPEFITTER JOURNEYMAN: Base Wage ST **49.0295**, Billable ST **99.3338**
- **WOODRIVER BOILERMAKER TM** / BOILERMAKER GENERAL FOREMAN: Base Wage ST **50.6**, Billable ST **114.4372**

## Empty / skipped tabs

- `Electrician` — no non-zero Base Wage / Billable in data_only cache (or extract error)
- `Operator Eng SE` — no non-zero Base Wage / Billable in data_only cache (or extract error)
- `Operator Eng BC` — no non-zero Base Wage / Billable in data_only cache (or extract error)

## Fringe / burden notes

- Most union halls (BM/PF staff + craft locals) carry a single **Fringes Subtotal** column; component H&W/Pension/Annuity columns are not on this workbook face. Extract records that subtotal $/hr from the file — does **not** invent Illinois composite or RRFF component splits.
- **Merit Staff** has named fringe columns (401K, Health, Vacation, Holiday Sick Pay) with row-6 rates and ST/OT/DT ride flags.
- Pay Tax % (FICA-MC / FUI / SUI), Ins %, Misc $/hr, O/H, Profit taken from hall sheet row 6 (Rate $/ %/Varies).
- Burden Summary / Rate Summary / Bill Rate Review pivots are sparse/empty in this cached snapshot — craft sheets are the source of truth.
- Numbers came from `Wood_River_B1_latest.xlsx` TM banners only. Do not commit the xlsx/xlsm.

## Extra extract notes

- Numbers extracted from Wood_River_B1_latest.xlsx with openpyxl read_only + data_only.
- Sheet banners confirm TM face (WOODRIVER … TM), not RRFF.
- No Illinois composite placeholders invented.
- Union craft/staff halls expose Fringes Subtotal only (no H&W/Pension component columns); Merit Staff has named fringe columns.
- Ins row-6 values stored as decimals and exported as ratePct; Misc/O/H/Profit as $/hr from row 6.
- Do not commit the xlsx/xlsm binary.
- BM Union Staff: Fringes Subtotal only (no component columns); ST=36.89 OT=54.665 — OT≈1.5×ST so ridesOt=true on subtotal line
- PF Union Staff : Fringes Subtotal only (no component columns); ST=21.5 OT=32.225 — OT≈1.5×ST so ridesOt=true on subtotal line
- Laborer L338: Fringes Subtotal only; ST=34.74 OT=34.74 — does not ride OT
- Electrician: banner=None — no non-zero Base Wage ST rows (skipped empty/template)
- Teamster L525: Fringes Subtotal only; ST=26.11 OT=17.41 — does not ride OT
- Operating Engineer #520: Fringes Subtotal only (no component columns); ST=40.3 OT=60.425 — OT≈1.5×ST so ridesOt=true on subtotal line
- Operator Eng SE: banner=None — no non-zero Base Wage ST rows (skipped empty/template)
- Operator Eng BC: banner=None — no non-zero Base Wage ST rows (skipped empty/template)
- Pipefitter L553: Fringes Subtotal only (no component columns); ST=21.5 OT=32.225 — OT≈1.5×ST so ridesOt=true on subtotal line
- Boilermaker L363: Fringes Subtotal only (no component columns); ST=36.89 OT=54.665 — OT≈1.5×ST so ridesOt=true on subtotal line
- Burden Summary: pivot/cached values sparse/empty in data_only snapshot (nonEmpty≈10) — not used as rate source
- Bill Rate Review: pivot/cached values sparse/empty in data_only snapshot (nonEmpty≈10) — not used as rate source

# Wood River B-1 — Fringe / Burden Rate-Building Options (full catalog)

**Source:** `/workspace/rate-vault-wr-b1/Wood_River_B1_latest.xlsx` (TM face: WOODRIVER … TM)  
**Machine-readable twin:** `b1-fringe-options.json`  
**Owner rule (Robert 2026-09-11):** if the B-1 has an option, more than likely it was put in for a purpose — **do not collapse** to a short list.  
**Rules followed:** Do not invent options. Do not commit the xlsx. Do not email.

---

## 1. Summary counts

| Scope | Count | Labels (exact) |
|---|---|---|
| **Distinct fringe/burden calc / sheet-classifier options** | **16** | `ST`, `OT`, `DT`, `ST-ONLY`, `OT-ONLY`, `BW (K)`, `Tax BW (P)`, `$`, `%`, `Varies`, `Merit`, `Union`, `Staff`, `Craft`, `Engineer`, `All` |
| Drop Down List col A (ST/OT/DT Calc) | 5 | `ST`, `OT`, `DT`, `ST-ONLY`, `OT-ONLY` |
| Drop Down List col E (% base) | 2 | `BW (K)`, `Tax BW (P)` |
| Row-6 rate modes (label + formulas; **not** a DV list) | 3 | `$`, `%`, `Varies` |
| Drop Down List col B (Rate Class) | 2 populated | `Merit`, `Union` |
| Drop Down List col D (Position / Craft Type) | 4 populated | `Staff`, `Craft`, `Engineer`, `All` |
| Drop Down List col C (Sites/Regions) | 51 | see section 5 (site validity; not fringe math) |
| Subcategory | open list | `Master Position List!$N$3:$N$624` |

**Not present in this workbook (sharedStrings search):** `hours worked`, `hours paid`, `Hours Worked`, `Hours Paid`, `accrual`.

**`% of BW`:** exists only as `Rate Detail!AC1` column header — **not** a craft-sheet fringe dropdown.

---

## 2. Drop Down List sheet (exact strings)

Sheet: `Drop Down List` (xlsx sheet31), dimension `A1:E51`.

### Column A — ST/OT/DT Calc options (`$A$1:$A$5`)

| Cell | Exact label |
|---|---|
| A1 | `ST` |
| A2 | `OT` |
| A3 | `DT` |
| A4 | `ST-ONLY` |
| A5 | `OT-ONLY` |

### Column B — Rate Class (`$B$1:$B$5` DV range; only B1:B2 populated)

| Cell | Exact label |
|---|---|
| B1 | `Merit` |
| B2 | `Union` |

### Column D — Position / Craft Type (`$D$1:$D$20` DV range; only D1:D4 populated)

| Cell | Exact label |
|---|---|
| D1 | `Staff` |
| D2 | `Craft` |
| D3 | `Engineer` |
| D4 | `All` |

### Column E — % calc base (`$E$1:$E$2`)

| Cell | Exact label |
|---|---|
| E1 | `BW (K)` |
| E2 | `Tax BW (P)` |

### Column C — Sites/Regions

Exact strings in section 5. DV on craft sheets uses `'Drop Down List'!$C$2:$C$65` (oversized vs populated C1:C51).

---

## 3. Data validations (rate-building)

openpyxl reports "Data Validation extension is not supported". Classic `dataValidations` nodes on craft sheets are stubs (`#N/A` / empty). **Real lists** live in `x14:dataValidations`:

| List formula | Applied on (examples) | Purpose |
|---|---|---|
| `'Drop Down List'!$A$1:$A$5` | Row **7** burden columns (and some row-8 overlaps on BW adders) | **ST/OT/DT Calc** |
| `'Drop Down List'!$E$1:$E$2` | Row **8** Pay Tax / Fringes / Ins / Misc / O/H / Profit | **BW (K) vs Tax BW (P)** for % rates |
| `'Drop Down List'!$B$1:$B$5` | `I3`/`J3` (named `RateClass`) | Merit / Union |
| `'Drop Down List'!$D$1:$D$20` | `I2`/`J2` (named `Craft_Type`) | Staff / Craft / Engineer / All |
| `'Drop Down List'!$C$2:$C$65` | Sites column (AK/AJ/AV rows 10–41) | Site validity multi-select |
| `'Master Position List'!$N$3:$N$624` | `I1`/`J1` (named `Subcategory`) | Subcategory filter |

### Named ranges (rate-related)

| Name | Example attr | Role |
|---|---|---|
| `Craft_Type` | `'Boilermaker L363'!$J$2` | Position type selector |
| `RateClass` | `'Boilermaker L363'!$J$3` | Merit/Union selector |
| `Subcategory` | `'Boilermaker L363'!$J$1` | Subcategory selector |
| `Master_Position_List` | `'Master Position List'!$A:$L` | Position lookup |
| `_xlnm.Print_Titles` | `!$5:$9` | Freezes header band rows 5–9 |

---

## 4. Complete option catalog (every label; do not drop)

### 4.1 ST/OT/DT Calc (row 7) — dropdown

**Where:** Row label `D7` = `ST/OT/DT Calc ---->` on every GPPMA craft/staff sheet. Per-column selectors in row 7 for Pay Tax, Fringes (Merit), Ins, Misc, O/H, Profit, and BW adder columns.

**Appears on (verified):** Boilermaker L363, BM Union Staff, Merit Staff, Pipefitter L553 (same template on other craft/staff tabs).

| Exact label | What it appears to control |
|---|---|
| `ST` | OT and DT rows use the **same** ST-row $/hr amount (flat; does **not** ride premium). |
| `OT` | OT row = ST amount x **1.5**; DT row keeps the **1.5x** amount (rides OT, not DT). |
| `DT` | OT row = ST amount x **1.5**; DT row = ST amount x **2** (rides OT and DT). |
| `ST-ONLY` | Amount on **ST rows only**; OT and DT -> 0. |
| `OT-ONLY` | OT row = ST amount x **1.5**; ST and DT -> 0. |

Formula evidence (Boilermaker Pay Tax / Ins / Misc / O/H OT-DT rows): branches on `col$7` equal to `st` / `ot` / `dt` / `st-only` / `ot-only`.

**Mapping note vs hours-worked / hours-paid / straight-only:**

| Label | Maps cleanly? | Comment |
|---|---|---|
| `ST` | Closest to **hours-worked / straight flat** | Same $/hr on ST/OT/DT |
| `DT` | Closest to **hours-paid / rides premium** | 1.5x OT, 2x DT |
| `OT` | **Does not map cleanly** | Rides OT (1.5x) but **not** DT (DT stays 1.5x) |
| `ST-ONLY` | Partial **straight-only** | Zero on OT/DT; not named "straight-only" in file |
| `OT-ONLY` | **Does not map cleanly** | OT-only premium; zero on ST and DT |

### 4.2 Base for % calc (row 8) — dropdown

**Where:** Row label `D8` = `Base Wage (COL K) or Taxable Base (COL P) for % Calc in Row 6 ---->`  
(Staff sheets: COL K wording is template text; Base Wage is actually col **I**, Taxable BW col **O**.)

| Exact label | What it appears to control |
|---|---|
| `BW (K)` | If row-6 is **%**-formatted, multiply by **Base Wage** (craft col K / staff col I). |
| `Tax BW (P)` | If row-6 is **%**-formatted, multiply by **Taxable BW** (craft col P / staff col O). |

Observed on this TM file: Pay Tax columns -> `Tax BW (P)`; Ins/Misc/O/H -> mostly `BW (K)`; **Profit** -> `Tax BW (P)`.

### 4.3 Rate $/ %/Varies (row 6) — format/value modes (**not** a Drop Down List)

**Where:** Row label `D6` = `Rate $/ %/Varies ---->`  
**Not** listed as A/B/C/D/E dropdown items. Mode is inferred by formulas:

- `CELL("format", col$6)` starts with `c` -> currency **$**
- starts with `p` -> percent **%**
- value equals `"varies"` -> **Varies** -> ST formula returns `"Enter Amt"`

| Exact label (as used) | What it appears to control |
|---|---|
| `$` | Flat **$/hr** from the numeric row-6 value (currency format). Prompt/error text uses `not $ or %`. |
| `%` | **Percent of** BW (K) or Tax BW (P); rejects out-of-range with `Invalid %`. |
| `Varies` | Exact shared string / cell text; per-position amount entry (`Enter Amt`) instead of header rate. Seen on Base Wage (`J6`/`I6`) and Merit `Other` (`AE6`). |

### 4.4 Rate Class (sheet header row 3) — dropdown

| Exact label | Appears on | Controls |
|---|---|---|
| `Merit` | `Drop Down List!B1`; DV -> `I3`/`J3` (`RateClass`) | Sheet Rate Class tag. **Uncertain** if it changes fringe math. |
| `Union` | `Drop Down List!B2`; same | Sheet Rate Class tag. **Uncertain** if it changes fringe math. |

Current values in this file: Boilermaker/Pipefitter/BM Staff/Merit Staff all show `Union` in the Rate Class cell (including Merit Staff sheet).

### 4.5 Position / Craft Type (sheet header row 2) — dropdown

| Exact label | Appears on | Controls |
|---|---|---|
| `Staff` | `Drop Down List!D1`; DV -> `I2`/`J2` (`Craft_Type`) | Sheet Position Type. **Uncertain** direct fringe math effect. |
| `Craft` | `Drop Down List!D2` | Same |
| `Engineer` | `Drop Down List!D3` | Same |
| `All` | `Drop Down List!D4` | Same |

Current: Boilermaker/Pipefitter = `Craft`; BM Union Staff / Merit Staff = `Staff`.

### 4.6 Data-row rate type (column F) — ST / OT / DT row identity

Same **labels** as 4.1 but different role: each position occupies three rows tagged `ST` / `OT` / `DT`. Formulas compare `$F` to these when applying row-7 Calc. **Not** sourced from the Drop Down List DV on column F.

### 4.7 Mult

**Not an option.** Column `Mult ` (trailing space in header) is computed: `IFERROR(BillableRate/SUM(BaseWageParts),"")`. No dropdown.

### 4.8 Fringes / Ins / Pay Tax / Misc / O/H / Profit (column groups)

These are **column bands** (row 5 group labels + row 9 detail names), each optionally governed by row-6/7/8 selectors:

| Band | Typical row-6 mode on this TM file | Typical row-7 Calc | Typical row-8 base |
|---|---|---|---|
| Pay Tax (FICA-MC / FUI / SUI) | `%` | `DT` | `Tax BW (P)` |
| Fringes Subtotal (union halls) | *(from Rate Input INDEX — not row-6)* | *(ride baked into Rate Input ST/OT/DT)* | n/a |
| Fringes components (Merit only: 401K, Health, Vacation, Holiday Sick Pay, Other…) | mix of `%`, `$`, `Varies` | mix `DT`/`ST` | `BW (K)` |
| Ins (W/C, Emp Liab, Gen Liab, Umbrella, Other) | `%` | `ST` | `BW (K)` |
| Misc (Small, Cons, PPE, Other) | `$` | `ST` | `BW (K)` |
| O/H | `$` | `ST` | `BW (K)` |
| Profit | `$` | `ST` | `Tax BW (P)` |

---

## 5. Sites/Regions (Drop Down List col C) — exact strings

**Controls:** which sites the sheet rates are valid for. **Does not** change fringe $/hr math. Listed because they are real B-1 dropdown options (owner: do not drop).

1. `Refineries - Alliance `
2. `Refineries - Bayway `
3. `Refineries - Billings `
4. `Refineries - Borger`
5. `Refineries - Ferndale`
6. `Refineries - Lake Charles `
7. `Refineries - Los Angeles`
8. `Refineries - Ponca City `
9. `Refineries - Rodeo`
10. `Refineries - Santa Maria`
11. `Refineries - Sweeny`
12. `Refineries - Wood River `
13. `Midstream - Amarillo Division - New Mexico`
14. `Midstream - Amarillo Division - Colorado`
15. `Midstream - Amarillo Division - Texas (Panhandle only)`
16. `Midstream - Billings Division - Utah`
17. `Midstream - Billings Division - Wyoming`
18. `Midstream - Billings Division - Montana`
19. `Midstream - Billings Division - Idaho`
20. `Midstream - Billings Division - North Dakota`
21. `Midstream - Central Division - Oklahoma`
22. `Midstream - Central Division - Kansas`
23. `Midstream - Central Division - Missouri`
24. `Midstream - Central Division - Iowa`
25. `Midstream - Central Division - Nebraska`
26. `Midstream - Central Division - Illinois`
27. `Midstream - East/Gulf Coast Division - Texas`
28. `Midstream - East/Gulf Coast Division - Louisiana`
29. `Midstream - East/Gulf Coast Division - New Jersey`
30. `Midstream - Gulf Coast Fractionators`
31. `Midstream - West Coast Division - California`
32. `Midstream - West Coast Division - Oregon`
33. `Midstream - West Coast Division - Washington`
34. `Lubricants - Portland Plant`
35. `Lubricants - Benicia Plant`
36. `Lubricants - Los Angeles Plant`
37. `Lubricants - Sulphur Plant`
38. `Lubricants - Waukesha Plant`
39. `Lubricants - Hartford Plant`
40. `Lubricants - Selmer Plant`
41. `Lubricants - Savannah Plant`
42. `CP Chemical - Bartlesville Research & Technology Center (BRTC)`
43. `CP Chemical - Borger Plant`
44. `CP Chemical - Cedar Bayou Plant`
45. `CP Chemical - Headquarters/Corporate Office Location`
46. `CP Chemical - Kingwood Research and Technology Center (KRTC)`
47. `CP Chemical - Orange Plant`
48. `CP Chemical - Pasadena Plant`
49. `CP Chemical - Port Arthur Plant`
50. `CP Chemical - Sweeny Plant`
51. `CP Chemical - Drilling Specilties Company, a division of Chevron Phillips Chemical Company LP-Alamo Plant`

**Appears on:** Boilermaker `AK10:AK41`, BM Union Staff `AJ10:AJ41`, Merit Staff `AV10:AV41`, Pipefitter `AK10:AK41`.

---

## 6. Header rows 5–9 dumps (requested sheets)

### 6.1 Boilermaker L363

**Row 5 (bands):** Billable Rate | Mult | BW x6 | Taxable BW | Pay Tax x3 | Pay Tax Subtotal | Fringes Subtotal | Ins x5 | Ins Subtotal | Misc x4 | Misc Subtotal | Supplier x2 | Supplier Subtotal

**Row 6:** `Rate $/ %/Varies ---->` -> Base Wage `Varies`; BW 100% `1` (0% fmt); Taxable Others `$0`; Pay Tax `7.65%` / `0.60%` / `8.55%`; Ins `%` rates; Misc `$2.25/$1.86/$2.10/$0`; O/H `$6.68`; Profit `$3.33`.

**Row 7:** `ST/OT/DT Calc ---->` -> BW/Pay Tax columns `DT`; Ins/Misc/O/H/Profit `ST`.

**Row 8:** Pay Tax + Base Wage selector `Tax BW (P)`; Ins/Misc/O/H `BW (K)`; Profit `Tax BW (P)`.

**Row 9 names:** Sub Category | Service Code | Position | ESN | Billable Rate | Mult | Base Wage | BW 100% | Shift Diff | Taxable Vacation | Taxable Other x2 | Taxable BW | Pay Tax FICA-MC | FUI | SUI | Pay Tax Subtotal | Fringes Subtotal | Ins W/C | Emp Liab | Gen Liab | Umbrella | Ins Other | Ins Subtotal | Misc Small | Cons | PPE | Misc Other | Misc Subtotal | O/H | Profit | Supplier Subtotal | SITES/REGIONS…

### 6.2 BM Union Staff

Same pattern as Boilermaker with columns shifted one left (Billable starts at **G**). Fringes Subtotal col **T**. O/H `$10.24` / Profit `$5.12`. Sites col **AJ**.

### 6.3 Merit Staff

Extra **Fringes** band cols T–AE with names: `401K`, `Health`, `Vacation`, `Holiday Sick Pay`, `Other` x8.  
Row 6: 401K `2%`, Health `$4.75`, Vacation `3%`, Holiday Sick Pay `2%`, AE `Varies`.  
Row 7: 401K `DT`; Health/Vacation/Holiday/Other `ST`.  
Row 8: all those fringes `BW (K)`.  
O/H `$10.24` / Profit `$5.12`. Sites col **AV**.

### 6.4 Pipefitter L553

Same structure as Boilermaker L363. O/H `$8.13` / Profit `$4.07`. Fringes Subtotal from Rate Input.

---

## 7. Options that do **not** map cleanly to hours-worked / hours-paid / straight-only

- `OT` — rides OT only (DT stays at 1.5x), neither pure hours-worked nor full hours-paid.
- `OT-ONLY` — OT premium only; zero on ST and DT.
- `ST-ONLY` — near straight-only, but **not** named that in the file.
- `$` / `%` / `Varies` — unit/entry mode, not an hours basis.
- `BW (K)` / `Tax BW (P)` — % base selector, not an hours basis.
- `Merit` / `Union` / `Staff` / `Craft` / `Engineer` / `All` — classifiers; uncertain fringe math.
- Site list — validity only.

Clean-ish approximations only: `ST` ≈ hours-worked/flat; `DT` ≈ hours-paid/rides; `ST-ONLY` ≈ straight-only. **Do not collapse the five ST/OT/DT Calc values to those three.**

---

## 8. Full option label list (exact) — fringe/burden calc + classifiers

1. `ST`
2. `OT`
3. `DT`
4. `ST-ONLY`
5. `OT-ONLY`
6. `BW (K)`
7. `Tax BW (P)`
8. `$`
9. `%`
10. `Varies`
11. `Merit`
12. `Union`
13. `Staff`
14. `Craft`
15. `Engineer`
16. `All`

Plus 51 site strings (section 5) and open Subcategory list from Master Position List.

---

## 9. Paths written

- `/workspace/rate-vault-wr-b1/B1_FRINGE_OPTIONS.md`
- `/workspace/rate-vault-wr-b1/b1-fringe-options.json`

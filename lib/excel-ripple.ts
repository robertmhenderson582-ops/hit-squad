/**
 * Standing ripple rule (Robert 2026-09-04) — RETROACTIVE.
 * Covers every Hit Squad modification: Look chrome already shipped on PR 138
 * (TOTAL bars, Rate Tables BW/chrome/tools/rentals, hour integers, craft titles,
 * Summary wrap, centered craft blocks, Job setup phase bar) and earlier
 * Excel/desk paths, not only new asks.
 *
 * One source of truth = the live estimate pack. One change updates the pack
 * and every surface (desk totals, Excel export/edit, Rate Tables, fills,
 * Misc, Equipment/COE, Subs). Excel is always a view/edit surface of that
 * pack, never a parallel book. No Excel-only catalogs, no hard-coded
 * sample dollars, no Look chrome that disconnects math from shared libs
 * (estimate-total, other-cost, equipment-sheet, shahan-wood-river,
 * third-party-rental, wage-lookup, phase-schedule).
 *
 * Position dropdowns + workbook import are on this compile (Robert Look
 * sign-off 2026-09-04). Lists come from the same Shahan titles the desk uses.
 * Support Bill as is a live-pack view of billedAs (same Rate Tables craft);
 * the field round-trips on import.
 * Daily PD count on craft sheets is live-pack perDiemPeople / nightPerDiemPeople
 * (can differ from HC). Day cells are hard yellow inputs like HC; PD $ stays
 * count × PD rate. Empty unused day cells stay teal, not yellow.
 * Craft-sheet Billable column is dropped — it duplicated ST+OT+DT / per-row
 * totals. Labor $ is dropped the same way: Subtotal $ holds TM $ (ST+OT+DT);
 * PD $ stays on the PD row. Day-grid sums still feed ST/OT/DT hours and PD
 * count → $; Summary hours still F+G+H. Rate Tables ST Billable is a catalog
 * column and stays. Native column outline groups A–I (collapse left; calendar
 * stays).
 * Shift is one merged DAYSHIFT/NIGHTSHIFT block (no Hours/shift or PD count
 * in A). Craft sheets emit all DAYSHIFT blocks, then all NIGHTSHIFT blocks.
 * Subtotal $ + Rate merge title through HC/HPS so those cells are not
 * empty holes; ST/OT/DT/PD rate+$ stay per-row.
 * ST/OT/DT Rate cells INDEX/MATCH the live Position (Support Bill as) on Rate Tables.
 * Calendar ST/OT/DT live-tie Job setup ON/Start/Stop/OT after 8 (G). Days/wk (4–7) and Hrs/day (8/9/10/12/13) are lists; one OT control. Long gates sit on hidden _JobDays so day cells stay short (Excel 8192-char limit). Column span is baked — Start/Stop beyond the exported window needs re-export. Phase bar stays painted (no VBA). Job setup F does not overwrite yellow HPS. CA 7th-day is a re-export gap. Misc/Travel/Equipment/COE/Subcontractor Item, Description, Qty, travelers, miles, and unit rates stay unlocked; formula Total $ stays locked. COE/Rental/Tension/Crane Period is a _Lists daily/weekly/monthly dropdown (desk strings). Craft-block clock pick Auto/Staff clock/COMP clock (E title) follows desk clockOverride + seat recognition; east-coast COMP OT-after-8 is always on Oil Out / Mechanical / Oil In (Pre/Post follow G); Rate Tables still MATCH Position.
 * Visible sheets take the estimate company’s live logo as a faded sheet-background splash; no logo on file means no splash (never invent a mark). Import does not store a second logo.
 * Craft title-block stays in A–I (instrument only) with Prepared by from the signed-in exporter and Status from the live pack (budget-lane sites omit Submitted/Awarded); phase bar stays on date columns. Import ignores that byline and does not overwrite pack status.
 *
 * Adjustable Job setup + phase-bar import ships on this compile (the next Excel compile
 * after Look). A Job setup sheet/card (phases / dates / OT picks) drives
 * the phase bar; edits to that card, Position dropdowns, hour cells, and
 * Bill as import back into the live desk pack. The Look pass shipped the
 * phase bar as a view of Job setup only — this compile adds the card + path.
 */
export const EXCEL_RIPPLE_RETROACTIVE = true;
export const EXCEL_RIPPLE_RULE =
  "Excel is a view of the live estimate pack. One change updates the pack and every surface. Never a parallel book.";
/** Job setup card + Position dropdowns + workbook import are live on this compile. */
export const EXCEL_JOB_SETUP_IMPORT_PARKED = false;

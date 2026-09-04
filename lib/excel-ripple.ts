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
 * Position dropdowns + workbook import stay parked until Look sign-off.
 * A validation list with no pack path would be a parallel book.
 * Support Bill as is a live-pack view of billedAs (same Rate Tables craft);
 * the field is on the Support sheet for offline fill — import still parked.
 * Daily PD count on craft sheets is live-pack perDiemPeople / nightPerDiemPeople
 * (can differ from HC). Day cells are hard yellow inputs like HC; PD $ stays
 * count × PD rate. Empty unused day cells stay teal, not yellow.
 *
 * Adjustable Job setup + phase-bar import is parked for the next Excel compile
 * after Look (Robert 2026-09-04). Locked answer is YES under the
 * ripple rule: a Job setup sheet/card (phases / dates / OT picks) will
 * drive the phase bar, and edits to that card, the bar, Position
 * dropdowns, and hour cells will import back into the live desk pack.
 * This Look pass ships the phase bar as a view of Job setup only — not
 * editable, not a Job setup card, not an import path.
 */
export const EXCEL_RIPPLE_RETROACTIVE = true;
export const EXCEL_RIPPLE_RULE =
  "Excel is a view of the live estimate pack. One change updates the pack and every surface. Never a parallel book.";
/** Next Excel compile after Look — not this Look chrome pass. */
export const EXCEL_JOB_SETUP_IMPORT_PARKED = true;

/**
 * Standing ripple rule (Robert 2026-09-04) — RETROACTIVE.
 * Covers every Hit Squad modification: Look chrome already shipped on PR 138
 * (TOTAL bars, Rate Tables BW/chrome/tools/rentals, drop .0, craft titles,
 * Summary wrap, centered craft blocks) and earlier Excel/desk paths, not
 * only new asks.
 *
 * One source of truth = the live estimate pack. One change updates the pack
 * and every surface (desk totals, Excel export/edit, Rate Tables, fills,
 * Misc, Equipment/COE, Subs). Excel is always a view/edit surface of that
 * pack, never a parallel book. No Excel-only catalogs, no hard-coded
 * sample dollars, no Look chrome that disconnects math from shared libs
 * (estimate-total, other-cost, equipment-sheet, shahan-wood-river,
 * third-party-rental, wage-lookup).
 *
 * Position dropdowns + workbook import stay parked until Look sign-off.
 * A validation list with no pack path would be a parallel book.
 */
export const EXCEL_RIPPLE_RETROACTIVE = true;
export const EXCEL_RIPPLE_RULE =
  "Excel is a view of the live estimate pack. One change updates the pack and every surface. Never a parallel book.";

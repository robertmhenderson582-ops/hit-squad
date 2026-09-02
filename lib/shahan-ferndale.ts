/**
 * P66 Ferndale — West Coast COMP Amendment 8 PCA0001100 Exhibit B-1
 * Rev 6-1-26, effective 2026-09-01. Rodeo and Ferndale only.
 * Only verified ST samples. Do not invent the rest of the book.
 * Crew still bills Shahan ST/OT/DT when those exist. Wage lookup uses BW.
 * Books stay in Drive. Never commit the xlsx / xlsm / PDF.
 */

import type { ShahanLaborRow } from "./shahan-wood-river.ts";

export const FERNDALE_BOOK_ID = "comp-ferndale";
export const FERNDALE_BOOK_LABEL = "West Coast COMP — Ferndale";
export const FERNDALE_PLANT = "Ferndale";
export const FERNDALE_STAFF_PD = 0;
export const FERNDALE_CRAFT_PD = 0;
export const FERNDALE_MARKUP = null;
export const FERNDALE_LABOR: ShahanLaborRow[] = [
  { craftName: "LEAD SITE 01", group: "", baseSt: 80, st: 120.17, ot: null, dt: null, pd: null, wageSource: "comp" },
  { craftName: "BOILERMAKER JOURNEYMAN", group: "", baseSt: 49.51, st: 107.53, ot: null, dt: null, pd: null, wageSource: "comp" },
];

/**
 * Debbie Shahan TM OCIP — Yates (Georgia Power).
 * Markup materials/rentals/subs 0.10.
 * No East/West COMP PDF yet. Base wage is Shahan Base ST where sheeted.
 * Books stay in Drive. Never commit the xlsx / xlsm / PDF.
 */

import type { ShahanLaborRow } from "./shahan-wood-river.ts";

export const YATES_BOOK_ID = "shahan-yates";
export const YATES_BOOK_LABEL = "Shahan TM OCIP — Yates";
export const YATES_PLANT = "Yates";
export const YATES_STAFF_PD = 150;
export const YATES_CRAFT_PD = 150;
export const YATES_MARKUP = 0.1;

export const YATES_LABOR: ShahanLaborRow[] = [
  { craftName: "Sr. Project Manager (Merit)", group: "Management", baseSt: 95, st: 162.18, ot: 222.14, dt: 282.11, pd: 150, wageSource: "shahan" },
  { craftName: "Sr. Project Manager (Union)", group: "Management", baseSt: null, st: 159.96, ot: 221.8, dt: 283.64, pd: 150 },
  { craftName: "Project Manager (Merit)", group: "Management", baseSt: null, st: 154.2, ot: 211.19, dt: 268.19, pd: 150 },
  { craftName: "Project Manager (Union)", group: "Management", baseSt: null, st: 151.98, ot: 210.85, dt: 269.72, pd: 150 },
  { craftName: "Superintendent (Merit)", group: "Management", baseSt: null, st: 146.21, ot: 200.24, dt: 254.28, pd: 150 },
  { craftName: "Superintendent (Union)", group: "Management", baseSt: null, st: 128.03, ot: 178, dt: 227.98, pd: 150 },
  { craftName: "QA/QC Lead (Merit)", group: "Management", baseSt: null, st: 110.29, ot: 150.97, dt: 191.66, pd: 150 },
  { craftName: "QA/QC Lead (Union)", group: "Management", baseSt: null, st: 120.05, ot: 167.06, dt: 214.06, pd: 150 },
  { craftName: "QA/QC Tech (Merit)", group: "Management", baseSt: null, st: 110.29, ot: 150.97, dt: 191.66, pd: 150 },
  { craftName: "QA/QC Tech (Union)", group: "Management", baseSt: null, st: 106.11, ot: 146.57, dt: 187.03, pd: 150 },
  { craftName: "Safety Lead", group: "Management", baseSt: null, st: 110.29, ot: 150.97, dt: 191.66, pd: 150 },
  { craftName: "SafetyTech (Merit)", group: "Management", baseSt: null, st: 90.34, ot: 123.6, dt: 156.87, pd: 150 },
  { craftName: "SafetyTech (Union)", group: "Management", baseSt: null, st: 96.1, ot: 134.21, dt: 172.32, pd: 150 },
  { craftName: "Engineer Lead", group: "Management", baseSt: null, st: 122.27, ot: 167.4, dt: 212.53, pd: 150 },
  { craftName: "Field Engineer", group: "Management", baseSt: null, st: 114.28, ot: 156.45, dt: 198.62, pd: 150 },
  { craftName: "Timekeeper", group: "Management", baseSt: null, st: 98.32, ot: 134.55, dt: 170.79, pd: 150 },
  { craftName: "Field Clerk", group: "Management", baseSt: null, st: 75.99, ot: 102.84, dt: 129.68, pd: 150 },
  { craftName: "Toolroom", group: "BM", baseSt: null, st: 97.93, ot: 135.48, dt: 173.04, pd: 150 },
  { craftName: "Boilermaker General Foreman", group: "BM", baseSt: null, st: 106.11, ot: 146.57, dt: 187.03, pd: 150 },
  { craftName: "Boilermaker Foreman", group: "BM", baseSt: null, st: 104.47, ot: 144.35, dt: 184.23, pd: 150 },
  { craftName: "Boilermaker Assistant Foreman", group: "BM", baseSt: null, st: 102.84, ot: 142.13, dt: 181.43, pd: 150 },
  { craftName: "Boilermaker CPW-Tig Welder", group: "BM", baseSt: null, st: 101.2, ot: 139.92, dt: 178.63, pd: 150 },
  { craftName: "Boilermaker CPW-Mig Welder", group: "BM", baseSt: null, st: 101.2, ot: 139.92, dt: 178.63, pd: 150 },
  { craftName: "Boilermaker Mechanic", group: "BM", baseSt: null, st: 101.2, ot: 139.92, dt: 178.63, pd: 150 },
  { craftName: "Boilermaker Apprentice 95%", group: "BM", baseSt: null, st: 77.46, ot: 107.76, dt: 138.05, pd: 150 },
  { craftName: "Boilermaker Apprentice 90%", group: "BM", baseSt: null, st: 74.66, ot: 103.96, dt: 133.26, pd: 150 },
  { craftName: "Boilermaker Apprentice 85%", group: "BM", baseSt: null, st: 71.86, ot: 100.17, dt: 128.47, pd: 150 },
  { craftName: "Boilermaker Apprentice 80%", group: "BM", baseSt: null, st: 69.06, ot: 96.38, dt: 123.69, pd: 150 },
  { craftName: "Boilermaker Apprentice 75%", group: "BM", baseSt: null, st: 66.27, ot: 92.58, dt: 118.9, pd: 150 },
  { craftName: "Boilermaker Apprentice 70%", group: "BM", baseSt: null, st: 63.47, ot: 88.79, dt: 114.12, pd: 150 },
  { craftName: "Boilermaker Apprentice 65%", group: "BM", baseSt: null, st: 61.81, ot: 86.55, dt: 111.29, pd: 150 },
  { craftName: "Boilermaker Helper > 4000", group: "BM", baseSt: null, st: 69.06, ot: 96.38, dt: 123.69, pd: 150 },
  { craftName: "Boilermaker Helper (1000-2000)", group: "BM", baseSt: null, st: 57.87, ot: 81.21, dt: 104.54, pd: 150 },
  { craftName: "Boilermaker Helper (0-1000)", group: "BM", baseSt: null, st: 57.87, ot: 81.21, dt: 104.54, pd: 150 },
];

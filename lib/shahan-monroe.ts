/**
 * Debbie Shahan TM OCIP — Monroe Energy (Trainer, PA).
 * Markup 0.06. Group strings keep trailing spaces from the sheet.
 * No East/West COMP PDF yet. Base wage is Shahan Base ST where sheeted.
 * Books stay in Drive. Never commit the xlsx / xlsm / PDF.
 */

import type { ShahanLaborRow } from "./shahan-wood-river.ts";

export const MONROE_BOOK_ID = "shahan-monroe";
export const MONROE_BOOK_LABEL = "Shahan TM OCIP — Monroe Energy";
export const MONROE_PLANT = "Monroe Energy";
export const MONROE_STAFF_PD = 150;
export const MONROE_CRAFT_PD = 150;
export const MONROE_MARKUP = 0.06;

export const MONROE_LABOR: ShahanLaborRow[] = [
  { craftName: "BOILERMAKER, GEN FOREMAN 01", group: "MEBM - Boilermaker ", baseSt: 68, st: 140.47, ot: 194.58, dt: 248.69, pd: 150, wageSource: "shahan" },
  { craftName: "BOILERMAKER, GEN FOREMAN 02", group: "MEBM - Boilermaker ", baseSt: null, st: 134.7, ot: 186.41, dt: 238.12, pd: 150 },
  { craftName: "BOILERMAKER, FOREMAN", group: "MEBM - Boilermaker ", baseSt: null, st: 131.82, ot: 182.32, dt: 232.83, pd: 150 },
  { craftName: "BOILERMAKER, JOURNEYMAN", group: "MEBM - Boilermaker ", baseSt: null, st: 126.05, ot: 174.15, dt: 222.25, pd: 150 },
  { craftName: "BOILERMAKER, APPR 1ST P", group: "MEBM - Boilermaker ", baseSt: null, st: 96.76, ot: 132.66, dt: 168.57, pd: 150 },
  { craftName: "BOILERMAKER, APPR 2ND P", group: "MEBM - Boilermaker ", baseSt: null, st: 96.76, ot: 132.66, dt: 168.57, pd: 150 },
  { craftName: "BOILERMAKER, APPR 3RD P", group: "MEBM - Boilermaker ", baseSt: null, st: 100.941, ot: 138.59, dt: 176.24, pd: 150 },
  { craftName: "BOILERMAKER, APPR 4TH P", group: "MEBM - Boilermaker ", baseSt: null, st: 105.13, ot: 144.52, dt: 183.91, pd: 150 },
  { craftName: "BOILERMAKER, APPR 5TH P", group: "MEBM - Boilermaker ", baseSt: null, st: 109.31, ot: 150.44, dt: 191.58, pd: 150 },
  { craftName: "BOILERMAKER, APPR 6TH P", group: "MEBM - Boilermaker ", baseSt: null, st: 113.5, ot: 156.37, dt: 199.24, pd: 150 },
  { craftName: "BOILERMAKER, APPR 7TH P", group: "MEBM - Boilermaker ", baseSt: null, st: 117.68, ot: 162.3, dt: 206.91, pd: 150 },
  { craftName: "BOILERMAKER, APPR 8TH P", group: "MEBM - Boilermaker ", baseSt: null, st: 121.86, ot: 168.22, dt: 214.58, pd: 150 },
  { craftName: "PF, GEN FMN, 2+ FMN, UP TO 100", group: "MEPF - Pipefitter ", baseSt: null, st: 177.72, ot: 253.27, dt: 328.82, pd: 150 },
  { craftName: "PF, GEN FMN, 101+ JRYMN", group: "MEPF - Pipefitter ", baseSt: null, st: 183.14, ot: 260.94, dt: 338.75, pd: 150 },
  { craftName: "PIPEFITTER, FOREMAN, 2-5", group: "MEPF - Pipefitter ", baseSt: null, st: 169.05, ot: 240.99, dt: 312.92, pd: 150 },
  { craftName: "PIPEFITTER, FOREMAN, UP TO 10", group: "MEPF - Pipefitter ", baseSt: null, st: 172.3, ot: 245.59, dt: 318.88, pd: 150 },
  { craftName: "PIPEFITTER, FOREMAN, AREA", group: "MEPF - Pipefitter ", baseSt: null, st: 174.47, ot: 248.66, dt: 322.86, pd: 150 },
  { craftName: "PIPEFITTER, WELDER, FOREMAN", group: "MEPF - Pipefitter ", baseSt: null, st: 172.3, ot: 245.59, dt: 318.88, pd: 150 },
  { craftName: "PIPEFITTER, JOURNEYMAN", group: "MEPF - Pipefitter ", baseSt: null, st: 161.47, ot: 230.24, dt: 299.02, pd: 150 },
  { craftName: "PIPEFITTER, APPR 1ST P", group: "MEPF - Pipefitter ", baseSt: null, st: 73.7, ot: 104.03, dt: 134.36, pd: 150 },
  { craftName: "PIPEFITTER, APPR 2ND P", group: "MEPF - Pipefitter ", baseSt: null, st: 73.7, ot: 104.03, dt: 134.36, pd: 150 },
  { craftName: "PIPEFITTER, APPR 3RD P", group: "MEPF - Pipefitter ", baseSt: null, st: 85.46, ot: 121.21, dt: 156.97, pd: 150 },
  { craftName: "PIPEFITTER, APPR 4TH P", group: "MEPF - Pipefitter ", baseSt: null, st: 85.46, ot: 121.21, dt: 156.97, pd: 150 },
  { craftName: "PIPEFITTER, APPR 5TH P", group: "MEPF - Pipefitter ", baseSt: null, st: 102.55, ot: 145.94, dt: 189.33, pd: 150 },
  { craftName: "PIPEFITTER, APPR 6TH P", group: "MEPF - Pipefitter ", baseSt: null, st: 102.55, ot: 145.94, dt: 189.33, pd: 150 },
  { craftName: "PIPEFITTER, APPR 7TH P", group: "MEPF - Pipefitter ", baseSt: null, st: 114.88, ot: 163.54, dt: 212.2, pd: 150 },
  { craftName: "PIPEFITTER, APPR 8TH P", group: "MEPF - Pipefitter ", baseSt: null, st: 114.88, ot: 163.54, dt: 212.2, pd: 150 },
  { craftName: "PIPEFITTER, APPR 9TH P", group: "MEPF - Pipefitter ", baseSt: null, st: 127.22, ot: 181.14, dt: 235.06, pd: 150 },
  { craftName: "PIPEFITTER, APPR 10TH P", group: "MEPF - Pipefitter ", baseSt: null, st: 127.22, ot: 181.14, dt: 235.06, pd: 150 },
  { craftName: "BM SUPERINTENDENT 1", group: "MECBA - CBA Represented - Staff", baseSt: null, st: 165.11, ot: 230.65, dt: 296.19, pd: 150 },
  { craftName: "PF SUPERINTTTENDENT (420) 2", group: "MECBA - CBA Represented - Staff", baseSt: null, st: 180.16, ot: 257.89, dt: 335.62, pd: 150 },
  { craftName: "BM PLANNER 1", group: "MECBA - CBA Represented - Staff", baseSt: null, st: 123.25, ot: 171.35, dt: 219.45, pd: 150 },
  { craftName: "PF PLANNER (420) 2", group: "MECBA - CBA Represented - Staff", baseSt: null, st: 177.25, ot: 253.76, dt: 330.28, pd: 150 },
  { craftName: "LEAD QA/QC (475) 1", group: "MECBA - CBA Represented - Staff", baseSt: null, st: 175.83, ot: 251.76, dt: 327.69, pd: 150 },
  { craftName: "LEAD, SITE (BM) 1", group: "MECBA - CBA Represented - Staff", baseSt: null, st: 183.87, ot: 257.22, dt: 330.56, pd: 150 },
  { craftName: "GENRAL SUPERINTENDENT 1", group: "MECBA - CBA Represented - Staff", baseSt: null, st: 180.98, ot: 253.13, dt: 325.27, pd: 150 },
  { craftName: "SITE-LEAD 01", group: "STAFF - General Field & Office - Staff", baseSt: null, st: 159.05, ot: 219.14, dt: 279.23, pd: 150 },
  { craftName: "MANAGER PROJECT 01", group: "STAFF - General Field & Office - Staff", baseSt: null, st: 156.08, ot: 214.97, dt: 273.87, pd: 150 },
  { craftName: "SUPERINTENDENT 01", group: "STAFF - General Field & Office - Staff", baseSt: null, st: 150.72, ot: 207.43, dt: 264.15, pd: 150 },
  { craftName: "SUPERINTENDENT 02", group: "STAFF - General Field & Office - Staff", baseSt: null, st: 153.12, ot: 210.81, dt: 268.5, pd: 150 },
  { craftName: "SUPERVISOR-01", group: "STAFF - General Field & Office - Staff", baseSt: null, st: 150.15, ot: 206.64, dt: 263.13, pd: 150 },
  { craftName: "SUPERVISOR-02", group: "STAFF - General Field & Office - Staff", baseSt: null, st: 147.75, ot: 203.27, dt: 258.78, pd: 150 },
  { craftName: "PLANNER/ESTIMATOR 01", group: "STAFF - General Field & Office - Staff", baseSt: null, st: 144.79, ot: 199.1, dt: 253.41, pd: 150 },
  { craftName: "PLANNER-SCHEDULER 01", group: "STAFF - General Field & Office - Staff", baseSt: null, st: 147.19, ot: 202.47, dt: 257.76, pd: 150 },
  { craftName: "LEAD QA/QC 01", group: "STAFF - General Field & Office - Staff", baseSt: null, st: 142.74, ot: 196.22, dt: 249.71, pd: 150 },
  { craftName: "LEAD QA/QC 02", group: "STAFF - General Field & Office - Staff", baseSt: null, st: 137.37, ot: 188.68, dt: 239.99, pd: 150 },
  { craftName: "COORDINATOR QA-QC 01", group: "STAFF - General Field & Office - Staff", baseSt: null, st: 107.13, ot: 146.18, dt: 185.23, pd: 150 },
  { craftName: "COORDINATOR QA-QC 02", group: "STAFF - General Field & Office - Staff", baseSt: null, st: 102.68, ot: 139.93, dt: 177.18, pd: 150 },
  { craftName: "LEAD SAFETY 001", group: "STAFF - General Field & Office - Staff", baseSt: null, st: 107.13, ot: 146.18, dt: 185.23, pd: 150 },
  { craftName: "COORDINATOR SAFETY 01", group: "STAFF - General Field & Office - Staff", baseSt: null, st: 102.68, ot: 139.93, dt: 177.18, pd: 150 },
  { craftName: "COORDINATOR SAFETY 02", group: "STAFF - General Field & Office - Staff", baseSt: null, st: 99.71, ot: 135.76, dt: 171.81, pd: 150 },
  { craftName: "COORDINATOR MATERIAL 01", group: "STAFF - General Field & Office - Staff", baseSt: null, st: 96.75, ot: 131.59, dt: 166.44, pd: 150 },
  { craftName: "ATTENDANT TOOLROOM 01", group: "STAFF - General Field & Office - Staff", baseSt: null, st: 96.75, ot: 131.59, dt: 166.44, pd: 150 },
  { craftName: "EXPEDITOR 01", group: "STAFF - General Field & Office - Staff", baseSt: null, st: 96.75, ot: 131.59, dt: 166.44, pd: 150 },
  { craftName: "CLERK FIELD 01", group: "STAFF - General Field & Office - Staff", baseSt: null, st: 70.06, ot: 94.09, dt: 118.12, pd: 150 },
  { craftName: "MANAGER OFFICE 01", group: "STAFF - General Field & Office - Staff", baseSt: null, st: 84.89, ot: 114.93, dt: 144.97, pd: 150 },
  { craftName: "CLERK TIMEKEEPER 01", group: "STAFF - General Field & Office - Staff", baseSt: null, st: 77.47, ot: 104.51, dt: 131.54, pd: 150 },
  { craftName: "CLERK TIMEKEEPER 02", group: "STAFF - General Field & Office - Staff", baseSt: null, st: 73.02, ot: 98.26, dt: 123.49, pd: 150 },
];

/**
 * Debbie Shahan TM OCIP — P66 Wood River (Roxana, IL).
 * Book: P66 Wood River - Roxanna IL - TM - OCIP UPDATED 8.25.26 DB (equip-tab-rev).
 *
 * Live T&M Wood River dollars. Not COMP billed, not Nathan CAT 2, not RRFF.
 * Wage lookup BW on verified rows is East Coast COMP Amendment 11 PCA0001103.
 * Labor tab is 159 rows. The compact catalog is filled from that sheet only —
 * do not invent ST / OT / DT. PT Bill Rate maps to desk DT.
 * Books stay in Drive. Never commit the xlsx / xlsm / PDF.
 */

import { computeRowHours, type HoursSplit } from "./hours-clock.ts";
import { defaultLaborClass } from "./labor-class.ts";

export const SHAHAN_BOOK_ID = "shahan-wood-river";
export const SHAHAN_BOOK_LABEL = "Shahan TM OCIP — Wood River";
export const SHAHAN_PLANT = "Wood River";
export const SHAHAN_STAFF_PD = 140;
export const SHAHAN_CRAFT_PD = 130;
export const SHAHAN_ONLY_BOOK_MESSAGE = "Only Wood River is loaded.";
export const SHAHAN_NO_BOOK_MESSAGE = "No book yet";
export const NO_COMP_WAGE_MESSAGE = "No COMP book yet";
export const SHAHAN_NO_RATE_LABEL = "No rate";
export const SHAHAN_OT_MULTIPLIER = 1.5;
export const SHAHAN_PT_MULTIPLIER = 2;

export const SHAHAN_LABOR_GROUPS = [
  "Staff|BM UNION STAFF",
  "Staff|PF UNION STAFF",
  "Staff|MERIT STAFF",
  "Staff|BM UNION",
  "Staff|PIPEFITTER UNION",
  "Staff|LABORER UNION",
  "CRAFT|OPERATOR UNION",
  "CRAFT|PIPEFITTER UNION",
  "CRAFT|BM UNION",
  "CRAFT|LABORER UNION",
  "CRAFT|TEAMSTER UNION",
] as const;

export type ShahanLaborGroup = (typeof SHAHAN_LABOR_GROUPS)[number] | string;

export type ShahanWageSource = "comp" | "shahan";

export type ShahanLaborRow = {
  craftName: string;
  group: ShahanLaborGroup;
  /** COMP Exhibit B-1 BW or sheeted Shahan Base ST. Never billed ST. */
  baseSt: number | null;
  st: number | null;
  ot: number | null;
  dt: number | null;
  pd: number | null;
  wageSource?: ShahanWageSource;
};

export type ShahanEquipmentRow = {
  description: string;
  daily: number | null;
  weekly: number | null;
  monthly: number | null;
  wet: boolean;
};

export type ShahanLookupOpts = {
  catalog?: ShahanLaborRow[];
  laborClass?: "Merit" | "Union" | null;
  group?: string;
};

/** Live labor catalog from Debbie Shahan TM OCIP. Exact sheet dollars. Do not invent. */
export const SHAHAN_LABOR: ShahanLaborRow[] = [
  { craftName: "Lead Site Boilermaker 01", group: "Staff|BM UNION STAFF", baseSt: 71, wageSource: "comp", st: 141.9, ot: 201.14, dt: 260.38, pd: 140 },
  { craftName: "Lead Site Boilermaker 02", group: "Staff|BM UNION STAFF", baseSt: null, st: 139.48, ot: 197.55, dt: 255.62, pd: 140 },
  { craftName: "Manager, Project 01", group: "Staff|BM UNION STAFF", baseSt: null, st: 133.42, ot: 188.57, dt: 243.72, pd: 140 },
  { craftName: "Manager, Project 02", group: "Staff|BM UNION STAFF", baseSt: null, st: 121.25, ot: 170.54, dt: 219.82, pd: 140 },
  { craftName: "Engineer, Project 01", group: "Staff|BM UNION STAFF", baseSt: null, st: 120.04, ot: 168.74, dt: 217.44, pd: 140 },
  { craftName: "Engineer, Project 02", group: "Staff|BM UNION STAFF", baseSt: null, st: 111.55, ot: 156.17, dt: 200.78, pd: 140 },
  { craftName: "Engineer, Field 01", group: "Staff|BM UNION STAFF", baseSt: null, st: 117.61, ot: 165.15, dt: 212.68, pd: 140 },
  { craftName: "Engineer, Field 02", group: "Staff|BM UNION STAFF", baseSt: null, st: 115.19, ot: 161.56, dt: 207.92, pd: 140 },
  { craftName: "Planner Estimator 01", group: "Staff|BM UNION STAFF", baseSt: null, st: 113.98, ot: 159.76, dt: 205.54, pd: 140 },
  { craftName: "Planner Estimator 02", group: "Staff|BM UNION STAFF", baseSt: null, st: 111.55, ot: 156.17, dt: 200.78, pd: 140 },
  { craftName: "Planner Scheduler 01", group: "Staff|BM UNION STAFF", baseSt: null, st: 115.19, ot: 161.56, dt: 207.92, pd: 140 },
  { craftName: "Planner Scheduler 02", group: "Staff|BM UNION STAFF", baseSt: null, st: 111.55, ot: 156.17, dt: 200.78, pd: 140 },
  { craftName: "Lead QA/QC Boilermaker 01", group: "Staff|BM UNION STAFF", baseSt: null, st: 128.57, ot: 181.39, dt: 234.2, pd: 140 },
  { craftName: "Lead QA/QC Boilermaker 02", group: "Staff|BM UNION STAFF", baseSt: null, st: 126.15, ot: 177.79, dt: 229.44, pd: 140 },
  { craftName: "Coordinator QA/QC Boilermaker 01", group: "Staff|BM UNION STAFF", baseSt: null, st: 124.93, ot: 176, dt: 227.06, pd: 140 },
  { craftName: "Coordinator QA/QC Boilermaker02", group: "Staff|BM UNION STAFF", baseSt: null, st: 122.51, ot: 172.41, dt: 222.3, pd: 140 },
  { craftName: "Lead Safety 01", group: "Staff|BM UNION STAFF", baseSt: null, st: 127.36, ot: 179.59, dt: 231.82, pd: 140 },
  { craftName: "Lead Safety 02", group: "Staff|BM UNION STAFF", baseSt: null, st: 124.93, ot: 176, dt: 227.06, pd: 140 },
  { craftName: "Coordinator Safety BLRMKR 01", group: "Staff|BM UNION STAFF", baseSt: null, st: 109.18, ot: 152.65, dt: 196.12, pd: 140 },
  { craftName: "Coordinator Safety BLRMKR 02", group: "Staff|BM UNION STAFF", baseSt: null, st: 106.75, ot: 149.06, dt: 191.36, pd: 140 },
  { craftName: "Coordinator Subcontract 01", group: "Staff|BM UNION STAFF", baseSt: null, st: 107.97, ot: 150.85, dt: 193.74, pd: 140 },
  { craftName: "Coordinator Subcontract 02", group: "Staff|BM UNION STAFF", baseSt: null, st: 105.54, ot: 147.26, dt: 188.98, pd: 140 },
  { craftName: "Coordinator Material BLRMKR 01", group: "Staff|BM UNION STAFF", baseSt: null, st: 118.87, ot: 167.02, dt: 215.16, pd: 140 },
  { craftName: "Coordinator Material BLRMKR 02", group: "Staff|BM UNION STAFF", baseSt: null, st: 116.45, ot: 163.43, dt: 210.4, pd: 140 },
  { craftName: "Superintendent Boilermaker 01", group: "Staff|BM UNION STAFF", baseSt: null, st: 127.36, ot: 179.59, dt: 231.82, pd: 140 },
  { craftName: "Superintendent Boilermaker 02", group: "Staff|BM UNION STAFF", baseSt: null, st: 124.93, ot: 176, dt: 227.06, pd: 140 },
  { craftName: "General Superintendent BM 01", group: "Staff|BM UNION STAFF", baseSt: null, st: 130.99, ot: 184.98, dt: 238.96, pd: 140 },
  { craftName: "General Superintendent BM 02", group: "Staff|BM UNION STAFF", baseSt: null, st: 128.57, ot: 181.39, dt: 234.2, pd: 140 },
  { craftName: "Manager, Project PF 01", group: "Staff|PF UNION STAFF", baseSt: null, st: 127.23, ot: 179.17, dt: 231.11, pd: 140 },
  { craftName: "Manager, Project PF 02", group: "Staff|PF UNION STAFF", baseSt: null, st: 124.04, ot: 174.46, dt: 224.89, pd: 140 },
  { craftName: "Manager, Project PF 03", group: "Staff|PF UNION STAFF", baseSt: null, st: 119.13, ot: 167.22, dt: 215.31, pd: 140 },
  { craftName: "General Superintendent PF 01", group: "Staff|PF UNION STAFF", baseSt: null, st: 123.45, ot: 173.59, dt: 223.74, pd: 140 },
  { craftName: "General Superintendent PF 02", group: "Staff|PF UNION STAFF", baseSt: null, st: 114.13, ot: 159.83, dt: 205.54, pd: 140 },
  { craftName: "General Superintendent PF 03", group: "Staff|PF UNION STAFF", baseSt: null, st: 115.35, ot: 161.64, dt: 207.94, pd: 140 },
  { craftName: "Superintendent PF 01", group: "Staff|PF UNION STAFF", baseSt: null, st: 111.67, ot: 156.21, dt: 200.75, pd: 140 },
  { craftName: "Superintendent PF 02", group: "Staff|PF UNION STAFF", baseSt: null, st: 109.22, ot: 152.59, dt: 195.96, pd: 140 },
  { craftName: "Superintendent PF 03", group: "Staff|PF UNION STAFF", baseSt: null, st: 106.77, ot: 148.97, dt: 191.17, pd: 140 },
  { craftName: "Engineer Project PIPFTR 01", group: "Staff|PF UNION STAFF", baseSt: null, st: 109.22, ot: 152.59, dt: 195.96, pd: 140 },
  { craftName: "Engineer Field PIPEFITTER 01", group: "Staff|PF UNION STAFF", baseSt: null, st: 106.77, ot: 148.97, dt: 191.17, pd: 140 },
  { craftName: "Planner/Estimator PIPFTR 01", group: "Staff|PF UNION STAFF", baseSt: null, st: 107.99, ot: 150.78, dt: 193.57, pd: 140 },
  { craftName: "Planner/Estimator PIPFTR 02", group: "Staff|PF UNION STAFF", baseSt: null, st: 105.54, ot: 147.16, dt: 188.78, pd: 140 },
  { craftName: "Planner/Estimator PIPFTR 03", group: "Staff|PF UNION STAFF", baseSt: null, st: 103.09, ot: 143.54, dt: 183.99, pd: 140 },
  { craftName: "Planner/Scheduler PIPFTR 01", group: "Staff|PF UNION STAFF", baseSt: null, st: 106.77, ot: 148.97, dt: 191.17, pd: 140 },
  { craftName: "Planner/Scheduler PIPFTR 02", group: "Staff|PF UNION STAFF", baseSt: null, st: 104.32, ot: 145.35, dt: 186.38, pd: 140 },
  { craftName: "Lead QA/QC PIPEFITTER 01", group: "Staff|PF UNION STAFF", baseSt: null, st: 117.32, ot: 164.54, dt: 211.77, pd: 140 },
  { craftName: "Lead QA/QC PIPEFITTER 02", group: "Staff|PF UNION STAFF", baseSt: null, st: 115.35, ot: 161.64, dt: 207.94, pd: 140 },
  { craftName: "Lead QA/QC PIPEFITTER 03", group: "Staff|PF UNION STAFF", baseSt: null, st: 112.9, ot: 158.02, dt: 203.15, pd: 140 },
  { craftName: "Coordinator QA/QC PIPEFITTER 01", group: "Staff|PF UNION STAFF", baseSt: null, st: 105.54, ot: 147.16, dt: 188.78, pd: 140 },
  { craftName: "Coordinator QA/QC PIPEFITTER 02", group: "Staff|PF UNION STAFF", baseSt: null, st: 105.05, ot: 146.44, dt: 187.82, pd: 140 },
  { craftName: "Coordinator QA/QC PIPEFITTER 03", group: "Staff|PF UNION STAFF", baseSt: null, st: 104.44, ot: 145.53, dt: 186.62, pd: 140 },
  { craftName: "Lead Safety PIPEFITTER 01", group: "Staff|PF UNION STAFF", baseSt: null, st: 107.39, ot: 149.9, dt: 192.39, pd: 140 },
  { craftName: "Coordinator Safety PIPFTR 01", group: "Staff|PF UNION STAFF", baseSt: null, st: 105.79, ot: 147.52, dt: 189.26, pd: 140 },
  { craftName: "Coordinator Safety PIPFTR 02", group: "Staff|PF UNION STAFF", baseSt: null, st: 105.17, ot: 146.62, dt: 188.06, pd: 140 },
  { craftName: "Coordinator Safety PIPFTR 03", group: "Staff|PF UNION STAFF", baseSt: null, st: 104.56, ot: 145.71, dt: 186.86, pd: 140 },
  { craftName: "Coordinator Material 01", group: "Staff|PF UNION STAFF", baseSt: null, st: 103.09, ot: 143.54, dt: 183.99, pd: 140 },
  { craftName: "Lead Site 01", group: "Staff|MERIT STAFF", baseSt: 90, wageSource: "comp", st: 139.09, ot: 192.55, dt: 246.01, pd: 140 },
  { craftName: "Lead Site 02", group: "Staff|MERIT STAFF", baseSt: null, st: 136.53, ot: 188.8, dt: 241.07, pd: 140 },
  { craftName: "Manager Project 01", group: "Staff|MERIT STAFF", baseSt: null, st: 130.76, ot: 180.36, dt: 229.96, pd: 140 },
  { craftName: "Manager Project 02", group: "Staff|MERIT STAFF", baseSt: null, st: 128.19, ot: 176.6, dt: 225.02, pd: 140 },
  { craftName: "Engineer Project 01", group: "Staff|MERIT STAFF", baseSt: null, st: 107.04, ot: 145.65, dt: 184.26, pd: 140 },
  { craftName: "Engineer Project 02", group: "Staff|MERIT STAFF", baseSt: null, st: 104.48, ot: 141.9, dt: 179.32, pd: 140 },
  { craftName: "Engineer Field 01", group: "Staff|MERIT STAFF", baseSt: null, st: 110.89, ot: 151.28, dt: 191.67, pd: 140 },
  { craftName: "Engineer Field 02", group: "Staff|MERIT STAFF", baseSt: null, st: 108.32, ot: 147.53, dt: 186.73, pd: 140 },
  { craftName: "Analyst Cost 01", group: "Staff|MERIT STAFF", baseSt: null, st: 130.12, ot: 179.42, dt: 228.72, pd: 140 },
  { craftName: "Analyst Cost 02", group: "Staff|MERIT STAFF", baseSt: null, st: 126.27, ot: 173.79, dt: 221.31, pd: 140 },
  { craftName: "Analyst Project Controls 01", group: "Staff|MERIT STAFF", baseSt: null, st: 132.68, ot: 183.17, dt: 233.66, pd: 140 },
  { craftName: "Analyst Project Controls 02", group: "Staff|MERIT STAFF", baseSt: null, st: 126.27, ot: 173.79, dt: 221.31, pd: 140 },
  { craftName: "Planner Estimator 01", group: "Staff|MERIT STAFF", baseSt: null, st: 85.89, ot: 114.7, dt: 143.51, pd: 140 },
  { craftName: "Planner Estimator 02", group: "Staff|MERIT STAFF", baseSt: null, st: 83.32, ot: 110.94, dt: 138.57, pd: 140 },
  { craftName: "Planner Scheduler 01", group: "Staff|MERIT STAFF", baseSt: null, st: 103.84, ot: 140.96, dt: 178.09, pd: 140 },
  { craftName: "Planner Scheduler 02", group: "Staff|MERIT STAFF", baseSt: null, st: 101.27, ot: 137.21, dt: 173.15, pd: 140 },
  { craftName: "Lead QA/QC 01", group: "Staff|MERIT STAFF", baseSt: null, st: 101.27, ot: 137.21, dt: 173.15, pd: 140 },
  { craftName: "Lead QA/QC 02", group: "Staff|MERIT STAFF", baseSt: null, st: 98.07, ot: 132.52, dt: 166.97, pd: 140 },
  { craftName: "Lead Safety 01", group: "Staff|MERIT STAFF", baseSt: null, st: 91.02, ot: 122.2, dt: 153.39, pd: 140 },
  { craftName: "Lead Safety 02", group: "Staff|MERIT STAFF", baseSt: null, st: 88.45, ot: 118.45, dt: 148.45, pd: 140 },
  { craftName: "Coordinator Safety 01", group: "Staff|MERIT STAFF", baseSt: null, st: 91.02, ot: 122.2, dt: 153.39, pd: 140 },
  { craftName: "Coordinator Safety 02", group: "Staff|MERIT STAFF", baseSt: null, st: 88.45, ot: 118.45, dt: 148.45, pd: 140 },
  { craftName: "Coordinator Material 01", group: "Staff|MERIT STAFF", baseSt: null, st: 81.4, ot: 108.13, dt: 134.86, pd: 140 },
  { craftName: "Coordinator Material 02", group: "Staff|MERIT STAFF", baseSt: null, st: 78.84, ot: 104.38, dt: 129.92, pd: 140 },
  { craftName: "Clerk Field 01", group: "Staff|MERIT STAFF", baseSt: null, st: 74.99, ot: 98.75, dt: 122.51, pd: 140 },
  { craftName: "Clerk Field 02", group: "Staff|MERIT STAFF", baseSt: null, st: 72.43, ot: 95, dt: 117.57, pd: 140 },
  { craftName: "Manager Office 01", group: "Staff|MERIT STAFF", baseSt: null, st: 94.22, ot: 126.89, dt: 159.56, pd: 140 },
  { craftName: "Manager Office 02", group: "Staff|MERIT STAFF", baseSt: null, st: 85.25, ot: 113.76, dt: 142.27, pd: 140 },
  { craftName: "Clerk Office 01", group: "Staff|MERIT STAFF", baseSt: null, st: 64.73, ot: 83.74, dt: 102.75, pd: 140 },
  { craftName: "Clerk Office 02", group: "Staff|MERIT STAFF", baseSt: null, st: 62.17, ot: 79.99, dt: 97.81, pd: 140 },
  { craftName: "Clerk Timekeeper 01", group: "Staff|MERIT STAFF", baseSt: null, st: 72.43, ot: 95, dt: 117.57, pd: 140 },
  { craftName: "Clerk Timekeeper 02", group: "Staff|MERIT STAFF", baseSt: null, st: 69.86, ot: 91.25, dt: 112.63, pd: 140 },
  { craftName: "Clerk Document 01", group: "Staff|MERIT STAFF", baseSt: null, st: 69.86, ot: 91.25, dt: 112.63, pd: 140 },
  { craftName: "Clerk Document 02", group: "Staff|MERIT STAFF", baseSt: null, st: 67.3, ot: 87.49, dt: 107.69, pd: 140 },
  { craftName: "General Superintendent 01", group: "Staff|MERIT STAFF", baseSt: null, st: 134.6, ot: 185.98, dt: 237.37, pd: 140 },
  { craftName: "General Superintendent 02", group: "Staff|MERIT STAFF", baseSt: null, st: 129.48, ot: 178.48, dt: 198.29, pd: 140 },
  { craftName: "Superintendent 01", group: "Staff|MERIT STAFF", baseSt: null, st: 121.78, ot: 167.22, dt: 212.67, pd: 140 },
  { craftName: "Superintendent 02", group: "Staff|MERIT STAFF", baseSt: null, st: 117.94, ot: 161.6, dt: 205.26, pd: 140 },
  { craftName: "Asst Superintendent 01", group: "Staff|MERIT STAFF", baseSt: null, st: 116.01, ot: 158.78, dt: 201.55, pd: 140 },
  { craftName: "Asst Superintendent 02", group: "Staff|MERIT STAFF", baseSt: null, st: 113.45, ot: 155.03, dt: 196.61, pd: 140 },
  { craftName: "Boilermaker General Foreman", group: "Staff|BM UNION", baseSt: null, st: 114.44, ot: 161.76, dt: 209.09, pd: 140 },
  { craftName: "Boilermaker Foreman", group: "CRAFT|BM UNION", baseSt: null, st: 112.62, ot: 159.07, dt: 205.52, pd: 130 },
  { craftName: "Boilermaker ASST Foreman", group: "CRAFT|BM UNION", baseSt: null, st: 111.71, ot: 157.72, dt: 203.73, pd: 130 },
  { craftName: "Boilermaker Journeyman", group: "CRAFT|BM UNION", baseSt: 45.6, wageSource: "comp", st: 108.38, ot: 152.78, dt: 197.19, pd: 130 },
  { craftName: "Boilermaker Apprentice Y1P1 70%", group: "CRAFT|BM UNION", baseSt: null, st: 93.83, ot: 131.23, dt: 168.63, pd: 130 },
  { craftName: "Boilermaker Apprentice Y1P2 72.5%", group: "CRAFT|BM UNION", baseSt: null, st: 95.29, ot: 133.39, dt: 171.48, pd: 130 },
  { craftName: "Boilermaker Apprentice Y2P3 75%", group: "CRAFT|BM UNION", baseSt: null, st: 96.74, ot: 135.54, dt: 174.34, pd: 130 },
  { craftName: "Boilermaker Apprentice Y2P4 77.5%", group: "CRAFT|BM UNION", baseSt: null, st: 98.2, ot: 137.7, dt: 177.2, pd: 130 },
  { craftName: "Boilermaker Apprentice Y3P5 80%", group: "CRAFT|BM UNION", baseSt: null, st: 99.65, ot: 139.85, dt: 180.05, pd: 130 },
  { craftName: "Boilermaker Apprentice Y3P6 85%", group: "CRAFT|BM UNION", baseSt: null, st: 102.56, ot: 144.16, dt: 185.76, pd: 130 },
  { craftName: "Boilermaker Apprentice Y4P7 90%", group: "CRAFT|BM UNION", baseSt: null, st: 105.47, ot: 148.47, dt: 191.48, pd: 130 },
  { craftName: "Boilermaker Apprentice Y4P8 95%", group: "CRAFT|BM UNION", baseSt: null, st: 105.61, ot: 148.69, dt: 191.76, pd: 130 },
  { craftName: "PIPEFITTER APPR 95%", group: "CRAFT|PIPEFITTER UNION", baseSt: null, st: 96.36, ot: 134.29, dt: 172.22, pd: 130 },
  { craftName: "PIPEFITTER APPR 90%", group: "CRAFT|PIPEFITTER UNION", baseSt: null, st: 96.21, ot: 134.06, dt: 171.91, pd: 130 },
  { craftName: "PIPEFITTER APPR 85%", group: "CRAFT|PIPEFITTER UNION", baseSt: null, st: 93.08, ot: 129.42, dt: 165.77, pd: 130 },
  { craftName: "PIPEFITTER APPR 80%", group: "CRAFT|PIPEFITTER UNION", baseSt: null, st: 89.95, ot: 124.79, dt: 159.63, pd: 130 },
  { craftName: "PIPEFITTER APPR 75%", group: "CRAFT|PIPEFITTER UNION", baseSt: null, st: 86.82, ot: 120.15, dt: 153.48, pd: 130 },
  { craftName: "PIPEFITTER APPR 70%", group: "CRAFT|PIPEFITTER UNION", baseSt: null, st: 83.7, ot: 115.52, dt: 147.34, pd: 130 },
  { craftName: "PIPEFITTER APPR 65%", group: "CRAFT|PIPEFITTER UNION", baseSt: null, st: 80.57, ot: 110.88, dt: 141.2, pd: 130 },
  { craftName: "PIPEFITTER APPR 60%", group: "CRAFT|PIPEFITTER UNION", baseSt: null, st: 77.44, ot: 106.25, dt: 135.06, pd: 130 },
  { craftName: "PIPEFITTER APPR 55%", group: "CRAFT|PIPEFITTER UNION", baseSt: null, st: 74.31, ot: 101.62, dt: 128.92, pd: 130 },
  { craftName: "PIPEFITTER APPR 50%", group: "CRAFT|PIPEFITTER UNION", baseSt: null, st: 71.19, ot: 96.98, dt: 122.78, pd: 130 },
  { craftName: "PIPEFITTER APPR 45%", group: "CRAFT|PIPEFITTER UNION", baseSt: null, st: 68.05, ot: 92.35, dt: 116.63, pd: 130 },
  { craftName: "PIPEFITTER JOURNEYMAN", group: "CRAFT|PIPEFITTER UNION", baseSt: null, st: 99.33, ot: 138.69, dt: 178.05, pd: 130 },
  { craftName: "PIPEFITTER FORMAN", group: "CRAFT|PIPEFITTER UNION", baseSt: null, st: 105.28, ot: 147.5, dt: 189.72, pd: 130 },
  { craftName: "Pipefitter General Foreman", group: "Staff|PIPEFITTER UNION", baseSt: null, st: 111.22, ot: 156.31, dt: 201.4, pd: 140 },
  { craftName: "Pipefitter Steward 01", group: "CRAFT|PIPEFITTER UNION", baseSt: null, st: 105.28, ot: 147.5, dt: 189.72, pd: 130 },
  { craftName: "TEAMSTERS GRP 01", group: "CRAFT|TEAMSTER UNION", baseSt: null, st: 97.6, ot: 115.65, dt: 142.39, pd: 130 },
  { craftName: "TEAMSTERS GRP 02", group: "CRAFT|TEAMSTER UNION", baseSt: null, st: 98.27, ot: 116.64, dt: 143.7, pd: 130 },
  { craftName: "TEAMSTERS GRP 03", group: "CRAFT|TEAMSTER UNION", baseSt: null, st: 98.64, ot: 117.18, dt: 144.43, pd: 130 },
  { craftName: "TEAMSTERS GRP 04", group: "CRAFT|TEAMSTER UNION", baseSt: null, st: 99.04, ot: 117.78, dt: 145.22, pd: 130 },
  { craftName: "TEAMSTERS GRP 05", group: "CRAFT|TEAMSTER UNION", baseSt: null, st: 100.32, ot: 119.67, dt: 147.73, pd: 130 },
  { craftName: "TEAMSTERS GRP 06", group: "CRAFT|TEAMSTER UNION", baseSt: null, st: 102.62, ot: 123.08, dt: 152.25, pd: 130 },
  { craftName: "Laborer General Foreman GRP1", group: "Staff|LABORER UNION", baseSt: null, st: 94.21, ot: 135.68, dt: 177.16, pd: 140 },
  { craftName: "Laborer General Foreman GRP 2", group: "Staff|LABORER UNION", baseSt: null, st: 94.82, ot: 136.58, dt: 178.35, pd: 140 },
  { craftName: "Laborer Foreman 10-20 GRP 1", group: "CRAFT|LABORER UNION", baseSt: null, st: 92.39, ot: 132.99, dt: 173.59, pd: 130 },
  { craftName: "Laborer Foreman Abate 10-20 GRP2", group: "CRAFT|LABORER UNION", baseSt: null, st: 93, ot: 133.89, dt: 174.78, pd: 130 },
  { craftName: "Laborer Foreman 03-09 GRP 1", group: "CRAFT|LABORER UNION", baseSt: null, st: 91.18, ot: 131.19, dt: 171.21, pd: 130 },
  { craftName: "Laborer Foreman Abate 03-09 GRP 2", group: "CRAFT|LABORER UNION", baseSt: null, st: 91.79, ot: 132.09, dt: 172.4, pd: 130 },
  { craftName: "Laborer Journeyman GRP1", group: "CRAFT|LABORER UNION", baseSt: null, st: 89.97, ot: 129.4, dt: 168.83, pd: 130 },
  { craftName: "Laborer Journeyman GRP2", group: "CRAFT|LABORER UNION", baseSt: null, st: 90.58, ot: 130.3, dt: 170.02, pd: 130 },
  { craftName: "LABORER APPRENTICE Y4", group: "CRAFT|LABORER UNION", baseSt: null, st: 87.88, ot: 126.3, dt: 164.72, pd: 130 },
  { craftName: "LABORER APPRENTICE Y3", group: "CRAFT|LABORER UNION", baseSt: null, st: 85.57, ot: 122.87, dt: 160.18, pd: 130 },
  { craftName: "LABORER APPRENTICE Y2", group: "CRAFT|LABORER UNION", baseSt: null, st: 83.37, ot: 119.61, dt: 155.86, pd: 130 },
  { craftName: "LABORER APPRENTICE Y1", group: "CRAFT|LABORER UNION", baseSt: null, st: 81.16, ot: 116.35, dt: 151.53, pd: 130 },
  { craftName: "Operating Eng Grp 01", group: "CRAFT|OPERATOR UNION", baseSt: null, st: 112.95, ot: 161.76, dt: 210.56, pd: 130 },
  { craftName: "Operating Eng Grp 02", group: "CRAFT|OPERATOR UNION", baseSt: null, st: 111.65, ot: 159.83, dt: 208.01, pd: 130 },
  { craftName: "Operating Eng Grp 03", group: "CRAFT|OPERATOR UNION", baseSt: null, st: 106.49, ot: 152.18, dt: 197.88, pd: 130 },
  { craftName: "Operating Eng Grp 04", group: "CRAFT|OPERATOR UNION", baseSt: null, st: 114.1, ot: 163.46, dt: 212.82, pd: 130 },
  { craftName: "Operating Eng Grp 05", group: "CRAFT|OPERATOR UNION", baseSt: null, st: 115.25, ot: 165.17, dt: 215.09, pd: 130 },
  { craftName: "Operating Eng Grp 05B", group: "CRAFT|OPERATOR UNION", baseSt: null, st: 115.54, ot: 165.59, dt: 215.65, pd: 130 },
  { craftName: "Operating Eng Grp 06", group: "CRAFT|OPERATOR UNION", baseSt: null, st: 115.88, ot: 166.11, dt: 216.33, pd: 130 },
  { craftName: "Operating Eng Grp 06B", group: "CRAFT|OPERATOR UNION", baseSt: null, st: 116.11, ot: 166.45, dt: 216.78, pd: 130 },
  { craftName: "Operating Eng Grp 07", group: "CRAFT|OPERATOR UNION", baseSt: null, st: 116.23, ot: 166.62, dt: 217.01, pd: 130 },
  { craftName: "Operating Eng Grp 07B", group: "CRAFT|OPERATOR UNION", baseSt: null, st: 116.34, ot: 166.79, dt: 217.23, pd: 130 },
  { craftName: "Operating Eng Grp 07C", group: "CRAFT|OPERATOR UNION", baseSt: null, st: 116.52, ot: 167.04, dt: 217.57, pd: 130 },
  { craftName: "Operating Eng Grp 08", group: "CRAFT|OPERATOR UNION", baseSt: null, st: 116.57, ot: 167.13, dt: 217.69, pd: 130 },
  { craftName: "Operating Eng Grp 08B", group: "CRAFT|OPERATOR UNION", baseSt: null, st: 116.69, ot: 167.3, dt: 217.91, pd: 130 },
  { craftName: "Operating Eng Grp 08C", group: "CRAFT|OPERATOR UNION", baseSt: null, st: 116.86, ot: 167.56, dt: 218.25, pd: 130 },
  { craftName: "Operating Eng Grp 08D", group: "CRAFT|OPERATOR UNION", baseSt: null, st: 117.27, ot: 168.15, dt: 219.04, pd: 130 },
  { craftName: "Operating Eng Grp 11", group: "CRAFT|OPERATOR UNION", baseSt: null, st: 115.25, ot: 165.17, dt: 215.09, pd: 130 },
  { craftName: "Operating Eng Grp 12", group: "CRAFT|OPERATOR UNION", baseSt: null, st: 116.4, ot: 166.87, dt: 217.35, pd: 130 },
  { craftName: "COORDINATOR QA-QC 1", group: "Staff|MERIT STAFF", baseSt: null, st: 105.76, ot: 143.77, dt: 181.79, pd: 140 },
  { craftName: "COORDINATOR QA-QC 2", group: "Staff|MERIT STAFF", baseSt: null, st: 96.78, ot: 130.64, dt: 164.5, pd: 140 },
];

/** Live equipment catalog from the same book. First WET table, then dry. Duplicates kept. */
export const SHAHAN_EQUIPMENT: ShahanEquipmentRow[] = [
  { description: "EXTRACTOR BUNDLE AERIAL <21FT REQUIRES OPERATOR", daily: 1592, weekly: 4776, monthly: 14328, wet: true },
  { description: "EXTRACTOR BUNDLE AERIAL <26FT REQUIRES OPERATOR", daily: 1592, weekly: 4776, monthly: 14328, wet: true },
  { description: "EXTRACTOR BUNDLE AERIAL <33FT REQUIRES OPERATOR", daily: 1592, weekly: 4776, monthly: 14328, wet: true },
  { description: "EXTRACTOR BUNDLE AERIAL 45 TON REQUIRES OPERATOR", daily: 2600, weekly: 7800, monthly: 23400, wet: true },
  { description: "EXTRACTOR SELF PROPELLED REQUIRES OPERATOR", daily: 3040, weekly: 9120, monthly: 27360, wet: true },
  { description: "EXTRACTOR TRUCK MOUNT REQUIRES OPERATOR", daily: 2240, weekly: 6720, monthly: 20160, wet: true },
  { description: "PUMP HYDROSTATIC TEST AIR DRIVEN", daily: 80, weekly: 240, monthly: 720, wet: true },
  { description: "PUMP TORQUE CONSOLE 10K PSI", daily: 1160, weekly: 3480, monthly: 10440, wet: true },
  { description: "TRUCK CREW", daily: 184, weekly: 552, monthly: 1656, wet: true },
  { description: "TRUCK RIG WELDER", daily: 0, weekly: 0, monthly: 0, wet: true },
  { description: "VAN 15 PASSENGER", daily: 216, weekly: 648, monthly: 1944, wet: true },
  { description: "WELDER AR 100-300 AMP DIESEL", daily: 56, weekly: 168, monthly: 504, wet: true },
  { description: "WELDER ARC 301-499 AMO DIESEL", daily: 64, weekly: 192, monthly: 576, wet: true },
  { description: "AIR MOVER", daily: 32, weekly: 96, monthly: 288, wet: false },
  { description: "EXTRACTOR BUNDLE AERIAL <21FT REQUIRES OPERATOR", daily: 1512, weekly: 4536, monthly: 13608, wet: false },
  { description: "EXTRACTOR BUNDLE AERIAL <26FT REQUIRES OPERATOR", daily: 1512, weekly: 4536, monthly: 13608, wet: false },
  { description: "EXTRACTOR BUNDLE AERIAL <33FT REQUIRES OPERATOR", daily: 1512, weekly: 4536, monthly: 13608, wet: false },
  { description: "EXTRACTOR BUNDLE AERIAL 45 TON REQUIRES OPERATOR", daily: 2520, weekly: 7560, monthly: 22680, wet: false },
  { description: "EXTRACTOR SELF PROPELLED REQUIRES OPERATOR", daily: 2960, weekly: 8880, monthly: 26640, wet: false },
  { description: "EXTRACTOR TRUCK MOUNT REQUIRES OPERATOR", daily: 2160, weekly: 6480, monthly: 19440, wet: false },
  { description: "MACHINE FLANGE FACING <24\" REQUIRES OPERATOR", daily: 960, weekly: 2880, monthly: 8640, wet: false },
  { description: "MACHINE FLANGE FACING 34\"-36\" REQUIRES OPERATOR", daily: 1120, weekly: 3360, monthly: 10080, wet: false },
  { description: "MACHINE FLANGE FACING 2\"-12\" REQUIRES OPERATOR", daily: 960, weekly: 2880, monthly: 8640, wet: false },
  { description: "MACHINE FLANGE FACING 24\"-60\" REQUIRES OPERATOR", daily: 960, weekly: 2880, monthly: 8640, wet: false },
  { description: "MACHINE FLANGE FACING 38\"-60\" REQUIRES OPERATOR", daily: 960, weekly: 2880, monthly: 8640, wet: false },
  { description: "MACHINE FLANGE FACING 60\"-80\" REQUIRES OPERATOR", daily: 960, weekly: 2880, monthly: 8640, wet: false },
  { description: "PRE CUT BEVEL 14\"-24\" REQUIRES OPERATOR", daily: 912, weekly: 2736, monthly: 8208, wet: false },
  { description: "PRE CUT BEVEL 26\"-36\" REQUIRES OPERATOR", daily: 1024, weekly: 3072, monthly: 9216, wet: false },
  { description: "PRE CUT BEVEL OVER 36\" REQUIRES OPERATOR", daily: 1120, weekly: 3360, monthly: 10080, wet: false },
  { description: "PRE CUT BEVEL TO 12\" REQUIRES OPERATOR", daily: 912, weekly: 2736, monthly: 8208, wet: false },
  { description: "PUMP HYDROSTATIC TEST AIR DRIVEN", daily: 208, weekly: 624, monthly: 1872, wet: false },
  { description: "PUMP TORQUE CONSOLE 10K PSI", daily: 1320, weekly: 3960, monthly: 11880, wet: false },
  { description: "TRAILER ALKY DECON", daily: 0, weekly: 0, monthly: 0, wet: false },
  { description: "TRAILER FLATBED", daily: 48, weekly: 144, monthly: 432, wet: false },
  { description: "TRAILER GOOSENECK", daily: 144, weekly: 432, monthly: 1296, wet: false },
  { description: "TRAILER TRAILER <40FT", daily: 208, weekly: 624, monthly: 1872, wet: false },
  { description: "TRAILER TRAILER >40FT", daily: 200, weekly: 600, monthly: 1800, wet: false },
  { description: "TRAILER TOWER TRAY HARDWARE CONSIGNMENT COST PLUS 6%", daily: 400, weekly: 1200, monthly: 3600, wet: false },
  { description: "TRAILER TUBE BUNDLE", daily: 232, weekly: 696, monthly: 2088, wet: false },
  { description: "TRAILER WELDING", daily: 0, weekly: 0, monthly: 0, wet: false },
  { description: "TRUCK CREW", daily: 104, weekly: 312, monthly: 936, wet: false },
  { description: "TRUCK RIG WELDER ", daily: 0, weekly: 0, monthly: 0, wet: false },
  { description: "VAN 15 PASSENGER", daily: 176, weekly: 528, monthly: 1584, wet: false },
  { description: "WELDER ARC 100-300 AMP ELECTRIC", daily: 68, weekly: 204, monthly: 612, wet: false },
  { description: "WELDER ARC 301-499 AMP ELECTRIC", daily: 88, weekly: 264, monthly: 792, wet: false },
  { description: "WELDER EIGHT BANK", daily: 120, weekly: 360, monthly: 1080, wet: false },
  { description: "PUMP TORQUE CONSOLE 10K PSI", daily: 1320, weekly: 3960, monthly: 11880, wet: false },
  { description: "PIPE THREADERS (535 AND LARGER) COST PLUS 6%", daily: 0, weekly: 0, monthly: 0, wet: false },
  { description: "SPREADER BARD COST PLUS 6%", daily: 0, weekly: 0, monthly: 0, wet: false },
  { description: "BUNDLE DAILY", daily: 232, weekly: 696, monthly: 2088, wet: false },
  { description: "RAD GUN TORQUE", daily: 496, weekly: 1488, monthly: 4464, wet: false },
  { description: "PORTA POWER >25 T COST PLUS 6%", daily: 0, weekly: 0, monthly: 0, wet: false },
  { description: "BAM TROLLEYS >5  T COST PLUS 6%", daily: 0, weekly: 0, monthly: 0, wet: false },
];

export const SHAHAN_WET_EQUIPMENT_HEADER = "EQUIPMENT RATES WITH FUEL (WET)";

export type JobRates = {
  staffPerDiemRate: number;
  craftPerDiemRate: number;
  staffMileageRate: number;
  craftMileageRate: number;
  rateBook: string;
};

export type CrewCardId = "staff" | "general-foreman" | "foreman" | "direct" | "support";

export function emptyJobRates(): JobRates {
  return {
    staffPerDiemRate: SHAHAN_STAFF_PD,
    craftPerDiemRate: SHAHAN_CRAFT_PD,
    staffMileageRate: 0,
    craftMileageRate: 0,
    rateBook: "",
  };
}

export function hydrateJobRates(raw: Partial<JobRates> | Record<string, unknown> | null | undefined): JobRates {
  const row = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const defaults = emptyJobRates();
  const num = (value: unknown, fallback: number) => {
    if (value == null || value === "") return fallback;
    const n = Number(value);
    return Number.isFinite(n) ? Math.max(0, n) : fallback;
  };
  const leftoverMileage = num(row.mileageRate, 0);
  return {
    staffPerDiemRate: num(row.staffPerDiemRate, defaults.staffPerDiemRate),
    craftPerDiemRate: num(row.craftPerDiemRate, defaults.craftPerDiemRate),
    staffMileageRate: "staffMileageRate" in row ? num(row.staffMileageRate, 0) : leftoverMileage,
    craftMileageRate: "craftMileageRate" in row ? num(row.craftMileageRate, 0) : leftoverMileage,
    rateBook: typeof row.rateBook === "string" ? row.rateBook : defaults.rateBook,
  };
}

/**
 * Test-only labor rows. Not in the live catalog. Dollars here are plumbing,
 * not a published Shahan rate.
 */
export const SHAHAN_LABOR_FIXTURE: ShahanLaborRow[] = [
  {
    craftName: "MANAGER, PROJECT 01",
    group: "Staff|MERIT STAFF",
    baseSt: null,
    st: 110,
    ot: 165,
    dt: 220,
    pd: SHAHAN_STAFF_PD,
  },
  {
    craftName: "COORDINATOR QA-QC 1",
    group: "Staff|MERIT STAFF",
    baseSt: null,
    st: 100,
    ot: 150,
    dt: 200,
    pd: SHAHAN_STAFF_PD,
  },
];

/**
 * Official B-1 / leftover Cat 2 working titles → exact Shahan craftName.
 * Name-only. Do not invent ST / OT / DT. Do not map comma vs no-comma
 * staff titles onto each other (BM vs Merit). Unaliased Merit 01 / 02 stay unmatched.
 */
const B1_TO_SHAHAN: Record<string, string> = {
  "coordinator qa qc 01": "COORDINATOR QA-QC 1",
  "coordinator qa qc 1": "COORDINATOR QA-QC 1",
  "coordinator qa qc 2": "COORDINATOR QA-QC 2",
  "coordinator qa qc merit 01": "COORDINATOR QA-QC 1",
  "lead qa qc 1": "Lead QA/QC 01",
  "lead qa qc 01": "Lead QA/QC 01",
  "lead qa qc 2": "Lead QA/QC 02",
  "lead qa qc 02": "Lead QA/QC 02",
  "coordinator safety merit 01": "Coordinator Safety 01",
  "pf general superintendent union 01": "General Superintendent PF 01",
  "bm general superintendent union": "General Superintendent BM 01",
  "boilermaker gf union": "Boilermaker General Foreman",
  "boilermaker general foreman": "Boilermaker General Foreman",
  "pipefitter gf union": "Pipefitter General Foreman",
  "pipefitter general foreman": "Pipefitter General Foreman",
  "boilermaker foreman": "Boilermaker Foreman",
  "pipefitter foreman": "PIPEFITTER FORMAN",
  "pipefitter forman": "PIPEFITTER FORMAN",
  "pipefitter journeyman": "PIPEFITTER JOURNEYMAN",
  "pipefitter direct": "PIPEFITTER JOURNEYMAN",
  "boilermaker direct": "Boilermaker Journeyman",
  "boilermaker indirect tool room": "Boilermaker Journeyman",
  "tool room attendant": "Boilermaker Journeyman",
  "laborer foreman 3 9": "Laborer Foreman 03-09 GRP 1",
  "laborer foreman 03 09": "Laborer Foreman 03-09 GRP 1",
  "laborer foreman 3 9 grp 1": "Laborer Foreman 03-09 GRP 1",
  "laborer foreman 03 09 grp 1": "Laborer Foreman 03-09 GRP 1",
  "laborer foreman 10 20 grp 1": "Laborer Foreman 10-20 GRP 1",
  "laborer journeyman grp1": "Laborer Journeyman GRP1",
  "laborer journeyman grp 1": "Laborer Journeyman GRP1",
  "operator foreman gr xii": "Operating Eng Grp 12",
  "operator foreman gr 12": "Operating Eng Grp 12",
  "operating eng grp 01": "Operating Eng Grp 01",
  "operating eng grp 1": "Operating Eng Grp 01",
  "operating eng grp 12": "Operating Eng Grp 12",
};

export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Nathan CAT 2 estimate names (Merit 01 / 02). Not Shahan craftName. */
export function isNathanEstimateTitle(title: string): boolean {
  return /\bmerit 0?\d+\b/.test(normalizeTitle(title));
}

function classNumberKeys(normalized: string): string[] {
  const match = /^(.*?) (\d+)$/.exec(normalized);
  if (!match) return [normalized];
  const n = String(Number(match[2]));
  const padded = n.padStart(2, "0");
  return Array.from(new Set([normalized, `${match[1]} ${n}`, `${match[1]} ${padded}`]));
}

export function exactTitleKey(title: string): string {
  return title.trim().toLowerCase().replace(/\s+/g, " ");
}

export function resolveShahanCraftName(title: string): string {
  const trimmed = title.trim();
  if (!trimmed) return "";
  const aliased = B1_TO_SHAHAN[normalizeTitle(trimmed)];
  if (aliased) return aliased;
  if (isNathanEstimateTitle(trimmed)) return "";
  return trimmed;
}

/** Support bills Billed as when set. Duty names only bill through an alias. */
export function shahanCrewTitle(row: { position?: string; billedAs?: string }): string {
  const billed = (row.billedAs ?? "").trim();
  if (billed) return billed;
  return (row.position ?? "").trim();
}

function rowKeys(row: ShahanLaborRow): string[] {
  return classNumberKeys(normalizeTitle(row.craftName));
}

function groupIsMerit(group: string): boolean {
  return /merit/i.test(group);
}

function pickAmong(rows: ShahanLaborRow[], title: string, opts: ShahanLookupOpts): ShahanLaborRow | null {
  if (!rows.length) return null;
  if (rows.length === 1) return rows[0];
  if (opts.group) {
    const wanted = normalizeTitle(opts.group);
    const byGroup = rows.filter((row) => normalizeTitle(row.group) === wanted || normalizeTitle(row.group).endsWith(wanted));
    if (byGroup.length === 1) return byGroup[0];
    if (byGroup.length > 1) rows = byGroup;
  }
  if (opts.laborClass === "Merit") {
    const merit = rows.filter((row) => groupIsMerit(row.group));
    if (merit.length === 1) return merit[0];
    if (merit.length > 1) rows = merit;
  } else if (opts.laborClass === "Union") {
    const union = rows.filter((row) => !groupIsMerit(row.group));
    if (union.length === 1) return union[0];
    if (union.length > 1) rows = union;
  }
  const comma = /,/.test(title);
  const byComma = rows.filter((row) => /,/.test(row.craftName) === comma);
  if (byComma.length === 1) return byComma[0];
  return null;
}

export function lookupShahanLabor(title: string, opts: ShahanLookupOpts = {}): ShahanLaborRow | null {
  const catalog = opts.catalog ?? SHAHAN_LABOR;
  if (!catalog.length) return null;
  const resolved = resolveShahanCraftName(title);
  if (!resolved) return null;
  const exact = exactTitleKey(resolved);
  const exactHits = catalog.filter((row) => exactTitleKey(row.craftName) === exact);
  const exactPick = pickAmong(exactHits, resolved, opts);
  if (exactPick) return exactPick;
  const keys = new Set(classNumberKeys(normalizeTitle(resolved)));
  const softHits = catalog.filter((row) => rowKeys(row).some((key) => keys.has(key)));
  return pickAmong(softHits, resolved, opts);
}

function priced(rate: number | null | undefined): rate is number {
  return typeof rate === "number" && Number.isFinite(rate) && rate > 0;
}

export function hasShahanBillRate(row: ShahanLaborRow | null | undefined): boolean {
  return Boolean(row && (priced(row.st) || priced(row.ot) || priced(row.dt)));
}

export function formatDeskDollars(amount: number): string {
  if (!Number.isFinite(amount) || amount <= 0) return "";
  return `$${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function shahanCrewCostAmount(
  title: string,
  hours: Pick<HoursSplit, "st" | "ot" | "dt">,
  opts: ShahanLookupOpts = {},
): number {
  const row = lookupShahanLabor(title, opts);
  if (!hasShahanBillRate(row)) return 0;
  const raw =
    (hours.st > 0 && priced(row!.st) ? hours.st * row!.st : 0) +
    (hours.ot > 0 && priced(row!.ot) ? hours.ot * row!.ot : 0) +
    (hours.dt > 0 && priced(row!.dt) ? hours.dt * row!.dt : 0);
  return Math.round(raw * 100) / 100;
}

export function formatShahanCrewCost(
  title: string,
  hours: Pick<HoursSplit, "st" | "ot" | "dt">,
  opts: ShahanLookupOpts = {},
): string {
  return formatDeskDollars(shahanCrewCostAmount(title, hours, opts));
}

export function shahanLaborByGroup(catalog: ShahanLaborRow[] = SHAHAN_LABOR): { group: string; rows: ShahanLaborRow[] }[] {
  const grouped = new Map<string, ShahanLaborRow[]>();
  for (const group of SHAHAN_LABOR_GROUPS) grouped.set(group, []);
  for (const row of catalog) {
    const group = SHAHAN_LABOR_GROUPS.includes(row.group as (typeof SHAHAN_LABOR_GROUPS)[number])
      ? row.group
      : row.group.startsWith("Staff")
        ? "Staff|OTHER"
        : row.group.startsWith("CRAFT")
          ? "CRAFT|OTHER"
          : row.group || "OTHER";
    const list = grouped.get(group) ?? [];
    list.push(row);
    grouped.set(group, list);
  }
  return [...grouped.entries()]
    .filter(([, rows]) => rows.length > 0 || catalog.length === 0)
    .map(([group, rows]) => ({ group, rows }));
}

export function shahanEquipmentRows(catalog: ShahanEquipmentRow[] = SHAHAN_EQUIPMENT): ShahanEquipmentRow[] {
  return catalog.filter((row) => normalizeTitle(row.description) !== normalizeTitle(SHAHAN_WET_EQUIPMENT_HEADER));
}

export function shahanEquipmentByFuel(catalog: ShahanEquipmentRow[] = SHAHAN_EQUIPMENT): {
  wet: ShahanEquipmentRow[];
  dry: ShahanEquipmentRow[];
} {
  const rows = shahanEquipmentRows(catalog);
  return {
    wet: rows.filter((row) => row.wet),
    dry: rows.filter((row) => !row.wet),
  };
}

export function isStaffPerDiemLane(lane: "staff" | "general-foreman" | "foreman" | "direct" | "support" | string): boolean {
  return lane === "staff" || lane === "general-foreman" || lane === "generalForeman";
}

type HourRow = {
  position: string;
  billedAs?: string;
  laborClassOverride?: "Merit" | "Union" | null;
  shift?: "Days" | "Nights" | "Days & nights";
  clockOverride?: "auto" | "comp" | "staff";
  ranges: {
    start: string;
    end: string;
    hoursPerShift: number;
    headcount: number;
    nightHeadcount: number;
    perDiemPeople: number;
    nightPerDiemPeople?: number;
    days: boolean[];
    otAfter8?: boolean;
    shift?: "Days" | "Nights" | "Days & nights";
    skipDates?: string[];
  }[];
};

export function laborDollarsFromCrew(
  crew: {
    staff?: HourRow[];
    generalForeman?: HourRow[];
    foreman?: HourRow[];
    direct?: HourRow[];
    support?: HourRow[];
    otAfter8?: boolean;
  },
  site = "",
  client = "",
  opts: ShahanLookupOpts = {},
): number {
  const rows = [
    ...(crew.staff ?? []),
    ...(crew.generalForeman ?? []),
    ...(crew.foreman ?? []),
    ...(crew.direct ?? []),
    ...(crew.support ?? []),
  ];
  return (
    Math.round(
      rows.reduce((sum, row) => {
        const hours = computeRowHours(row, site, client, crew.otAfter8);
        const title = shahanCrewTitle(row);
        return sum + shahanCrewCostAmount(title, hours, {
          ...opts,
          laborClass: row.laborClassOverride ?? opts.laborClass ?? defaultLaborClass(title),
        });
      }, 0) * 100,
    ) / 100
  );
}

export function perDiemDaysFromCrew(
  crew: {
    staff?: HourRow[];
    generalForeman?: HourRow[];
    foreman?: HourRow[];
    direct?: HourRow[];
    support?: HourRow[];
    otAfter8?: boolean;
  },
  site = "",
  client = "",
): { staff: number; craft: number } {
  const staffRows = [...(crew.staff ?? []), ...(crew.generalForeman ?? [])];
  const craftRows = [...(crew.foreman ?? []), ...(crew.direct ?? []), ...(crew.support ?? [])];
  const staff = staffRows.reduce((sum, row) => sum + computeRowHours(row, site, client, crew.otAfter8).pd, 0);
  const craft = craftRows.reduce((sum, row) => sum + computeRowHours(row, site, client, crew.otAfter8).pd, 0);
  return { staff, craft };
}

export function perDiemDollarsFromCrew(
  crew: Parameters<typeof perDiemDaysFromCrew>[0],
  rates: { staffPerDiemRate: number; craftPerDiemRate: number },
  site = "",
  client = "",
): number {
  const days = perDiemDaysFromCrew(crew, site, client);
  return Math.round((days.staff * Math.max(0, rates.staffPerDiemRate) + days.craft * Math.max(0, rates.craftPerDiemRate)) * 100) / 100;
}

export function uniqueSortedTitles(titles: readonly string[]): string[] {
  const seen = new Set<string>();
  const next: string[] = [];
  for (const title of titles) {
    const trimmed = title.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    next.push(trimmed);
  }
  return next.sort((a, b) => a.localeCompare(b, "en", { numeric: true, sensitivity: "base" }));
}

export function isWoodRiverSite(site = ""): boolean {
  return /wood\s*river/i.test(site);
}

export function offerRateBookForSite(site = ""):
  | { ok: true; bookId: string; bookLabel: string }
  | { ok: false; message: string } {
  const key = site.trim().toLowerCase();
  if (!key) return { ok: false, message: SHAHAN_NO_BOOK_MESSAGE };
  if (/wood\s*river|site-madison/.test(key)) {
    return { ok: true, bookId: SHAHAN_BOOK_ID, bookLabel: SHAHAN_BOOK_LABEL };
  }
  if (/\byates\b|site-yates/.test(key)) return { ok: true, bookId: "shahan-yates", bookLabel: "Shahan TM OCIP — Yates" };
  if (/\brodeo\b|site-rodeo/.test(key)) return { ok: true, bookId: "shahan-rodeo", bookLabel: "Shahan TM OCIP — Rodeo" };
  if (/\bbayway\b|site-bayway/.test(key)) return { ok: true, bookId: "shahan-bayway", bookLabel: "Shahan TM OCIP — Bayway" };
  if (/ferndale|site-ferndale/.test(key)) return { ok: true, bookId: "comp-ferndale", bookLabel: "West Coast COMP — Ferndale" };
  if (/monroe|site-monroe/.test(key)) return { ok: true, bookId: "shahan-monroe", bookLabel: "Shahan TM OCIP — Monroe Energy" };
  return { ok: false, message: SHAHAN_NO_BOOK_MESSAGE };
}

export function applyShahanJobRates<T extends JobRates>(rates: T): T {
  return {
    ...rates,
    staffPerDiemRate: SHAHAN_STAFF_PD,
    craftPerDiemRate: SHAHAN_CRAFT_PD,
    rateBook: SHAHAN_BOOK_ID,
  };
}

export function rematchShahanTitle(title: string, opts: ShahanLookupOpts = {}): string {
  const trimmed = title.trim();
  if (!trimmed) return title;
  const row = lookupShahanLabor(trimmed, opts);
  return row?.craftName ?? title;
}

export function rematchCrewToShahan<T extends {
  staff?: HourRow[];
  generalForeman?: HourRow[];
  foreman?: HourRow[];
  direct?: HourRow[];
  support?: HourRow[];
}>(crew: T, opts: ShahanLookupOpts = {}): T {
  const lookupOpts = (row: HourRow): ShahanLookupOpts => ({
    ...opts,
    laborClass: row.laborClassOverride ?? opts.laborClass,
  });
  const remap = <R extends HourRow>(rows: R[] | undefined): R[] | undefined =>
    rows?.map((row) => ({
      ...row,
      position: rematchShahanTitle(row.position, lookupOpts(row)),
    }));
  const remapSupport = <R extends HourRow>(rows: R[] | undefined): R[] | undefined =>
    rows?.map((row) => {
      const billed = (row.billedAs ?? "").trim();
      if (billed) {
        return { ...row, billedAs: rematchShahanTitle(row.billedAs ?? "", lookupOpts(row)) };
      }
      const looked = lookupShahanLabor(row.position, lookupOpts(row));
      if (looked && normalizeTitle(looked.craftName) !== normalizeTitle(row.position)) {
        return { ...row, billedAs: looked.craftName };
      }
      return { ...row, position: rematchShahanTitle(row.position, lookupOpts(row)) };
    });
  return {
    ...crew,
    staff: remap(crew.staff) ?? crew.staff,
    generalForeman: remap(crew.generalForeman) ?? crew.generalForeman,
    foreman: remap(crew.foreman) ?? crew.foreman,
    direct: remap(crew.direct) ?? crew.direct,
    support: remapSupport(crew.support) ?? crew.support,
  };
}

export function shahanTitleHasNoRate(title: string, opts: ShahanLookupOpts = {}): boolean {
  const trimmed = title.trim();
  if (!trimmed) return false;
  return !hasShahanBillRate(lookupShahanLabor(trimmed, opts));
}

function isGeneralForemanName(name: string): boolean {
  return /general\s*foreman|\bgf\b/i.test(name);
}

function isForemanName(name: string): boolean {
  return /(?:asst\s+)?fore?man/i.test(name) && !isGeneralForemanName(name);
}

function isStaffSupervisionRow(row: ShahanLaborRow): boolean {
  if (isGeneralForemanName(row.craftName) || isForemanName(row.craftName)) return false;
  if (/journeyman|apprentice|\bappr\b/i.test(row.craftName)) return false;
  return /^staff\|/i.test(row.group) && /staff/i.test(row.group);
}

function isSupportTypeRow(row: ShahanLaborRow): boolean {
  return /support|watch|attendant|handler|tool room/i.test(row.craftName);
}

export function shahanTitlesForCard(card: CrewCardId, catalog: ShahanLaborRow[] = SHAHAN_LABOR): string[] {
  const names = catalog
    .filter((row) => {
      if (card === "staff") return isStaffSupervisionRow(row);
      if (card === "general-foreman") return isGeneralForemanName(row.craftName);
      if (card === "foreman") return isForemanName(row.craftName);
      if (card === "support") return isSupportTypeRow(row);
      if (isGeneralForemanName(row.craftName) || isForemanName(row.craftName) || isStaffSupervisionRow(row)) {
        return false;
      }
      return (
        /^craft\|/i.test(row.group) ||
        /journeyman|apprentice|\bappr\b|operating eng|teamster|steward/i.test(row.craftName)
      );
    })
    .map((row) => row.craftName);
  return uniqueSortedTitles(names);
}

export const SHAHAN_STAFF_TITLES = shahanTitlesForCard("staff");
export const SHAHAN_GENERAL_FOREMAN_TITLES = shahanTitlesForCard("general-foreman");
export const SHAHAN_FOREMAN_TITLES = shahanTitlesForCard("foreman");
export const SHAHAN_CRAFT_TITLES = shahanTitlesForCard("direct");
export const SHAHAN_SUPPORT_TITLES = shahanTitlesForCard("support");

export function shahanEquipmentId(row: ShahanEquipmentRow, index: number): string {
  const slug = normalizeTitle(row.description).replace(/\s+/g, "-");
  return `${row.wet ? "wet" : "dry"}:${index}:${slug}`;
}

export function isShahanCostPlus(row: ShahanEquipmentRow): boolean {
  return /cost\s*plus/i.test(row.description);
}

export function shahanEquipmentHasRate(row: ShahanEquipmentRow | null | undefined): boolean {
  return Boolean(row && (priced(row.daily) || priced(row.weekly) || priced(row.monthly)));
}

export function shahanPeriodRate(row: ShahanEquipmentRow, period: "hourly" | "daily" | "weekly" | "monthly"): number | null {
  if (period === "hourly") return null;
  if (period === "daily") return row.daily;
  if (period === "weekly") return row.weekly;
  return row.monthly;
}

function equipmentNameKey(value: string): string {
  return normalizeTitle(value.replace(/^(wet|dry):\d+:/i, "").replace(/-/g, " "));
}

export function rematchShahanEquipment(
  itemId: string,
  catalog: ShahanEquipmentRow[] = SHAHAN_EQUIPMENT,
): ShahanEquipmentRow | null {
  const rows = shahanEquipmentRows(catalog);
  const key = equipmentNameKey(itemId);
  if (!key) return null;
  const exact = rows.filter((row) => normalizeTitle(row.description) === key);
  if (exact.length) return exact.find((row) => !row.wet) ?? exact[0];
  const starts = rows.filter((row) => {
    const name = normalizeTitle(row.description);
    return name.startsWith(key) || key.startsWith(name);
  });
  if (starts.length) return starts.find((row) => !row.wet) ?? starts[0];
  return null;
}

export function lookupShahanEquipment(
  itemId: string,
  catalog: ShahanEquipmentRow[] = SHAHAN_EQUIPMENT,
): ShahanEquipmentRow | null {
  if (!itemId) return null;
  const rows = shahanEquipmentRows(catalog);
  const exact = rows.find((row, index) => shahanEquipmentId(row, index) === itemId);
  if (exact) return exact;
  return rematchShahanEquipment(itemId, catalog);
}

export function rematchShahanEquipmentId(
  itemId: string,
  catalog: ShahanEquipmentRow[] = SHAHAN_EQUIPMENT,
): string {
  if (!itemId) return "";
  const rows = shahanEquipmentRows(catalog);
  if (rows.some((row, index) => shahanEquipmentId(row, index) === itemId)) return itemId;
  const row = rematchShahanEquipment(itemId, catalog);
  if (!row) return itemId;
  return shahanEquipmentId(row, rows.indexOf(row));
}

export function rematchEquipmentSheetToShahan<T extends { largeTools?: { itemId: string }[]; thirdParty?: unknown[] }>(
  sheet: T,
  catalog: ShahanEquipmentRow[] = SHAHAN_EQUIPMENT,
): T {
  return {
    ...sheet,
    largeTools: sheet.largeTools?.map((line) => ({
      ...line,
      itemId: rematchShahanEquipmentId(line.itemId, catalog),
    })),
  };
}

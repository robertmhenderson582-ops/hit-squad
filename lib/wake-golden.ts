/**
 * Golden fixtures for Rodeo / Monroe wake-up.
 * Official Gmail revisions lock filled totals. Unexplained mismatch is a P0 bug.
 * Numbers extracted from Drive text of the official books — binaries stay out of git.
 *
 * Family A (Madison contractor template) is the official lock for U110 / U250.
 * Family B (P66 RODEO ESTIMATE WORKBOOK) stays a separate face — do not collapse.
 */

import {
  OFFICIAL_MONROE_541V_REVISION_ID,
  OFFICIAL_MONROE_541V_REVISION_NAME,
  OFFICIAL_U110_REVISION_ID,
  OFFICIAL_U110_REVISION_NAME,
  OFFICIAL_U250_REVISION_ID,
  OFFICIAL_U250_REVISION_NAME,
  RODEO_WORKBOOK_BLANK_ID,
  RODEO_WORKBOOK_U110_ID,
  RODEO_WORKBOOK_U250_ID,
} from "./work-folder.ts";
import {
  isWakeIdentityOnly,
  MONROE_541V_PACK_ID,
  RODEO_U110_PACK_ID,
  RODEO_U250_PACK_ID,
  type WakePackHint,
  type WakeTemplateFamily,
} from "./rodeo-monroe-wake.ts";

export const GOLDEN_MONEY_TOLERANCE = 0.5;

export type GoldenMoneyStatus = "locked" | "formula-unavailable" | "pending-workbook-eval";

export type ContractorGoldenBuckets = {
  directHours: number;
  directDollars: number;
  directRate: number;
  indirectHours: number;
  indirectDollars: number;
  indirectRate: number;
  perDiem: number;
  mobDemob: number;
  materialsDirect: number;
  materialsIndirect: number;
  equipment: number;
  thirdParty: number;
  other: number;
  totalHours: number;
  grandTotal: number;
  allInRate: number;
};

export type WakeGoldenFixture = {
  packId: string;
  unit: string;
  family: WakeTemplateFamily;
  officialRevisionId: string;
  officialRevisionName: string;
  extraTemplateIds: string[];
  extractedFrom: "drive-text";
  dollarsStatus: GoldenMoneyStatus;
  note: string;
  buckets: ContractorGoldenBuckets | null;
  monroeHours?: {
    supervision: number;
    foremen: number;
    ipsDirect: number;
    support: number;
    totalLabor: number;
    mileage: number;
    misc: number;
    pivotManhours: number;
  };
};

function money(value: number) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

export function moneyEqual(a: number, b: number, tol = GOLDEN_MONEY_TOLERANCE) {
  return Math.abs(money(a) - money(b)) <= tol;
}

/** U110 Madison contractor R1 — official Gmail lock. */
export const U110_CONTRACTOR_GOLDEN: WakeGoldenFixture = {
  packId: RODEO_U110_PACK_ID,
  unit: "U110",
  family: "madison-contractor",
  officialRevisionId: OFFICIAL_U110_REVISION_ID,
  officialRevisionName: OFFICIAL_U110_REVISION_NAME,
  extraTemplateIds: [RODEO_WORKBOOK_U110_ID, RODEO_WORKBOOK_BLANK_ID],
  extractedFrom: "drive-text",
  dollarsStatus: "locked",
  note: "Family A official lock. Family B workbook is an additional face, not this total.",
  buckets: {
    directHours: 16730,
    directDollars: 2746343,
    directRate: 164.16,
    indirectHours: 9711,
    indirectDollars: 1735592,
    indirectRate: 178.72,
    perDiem: 429790,
    mobDemob: 150000,
    materialsDirect: 40000,
    materialsIndirect: 10000,
    equipment: 10862,
    thirdParty: 125000,
    other: 0,
    totalHours: 26441,
    grandTotal: 5247587,
    allInRate: 313.66,
  },
};

/** U250 Madison contractor R2 — official Gmail lock. */
export const U250_CONTRACTOR_GOLDEN: WakeGoldenFixture = {
  packId: RODEO_U250_PACK_ID,
  unit: "U250",
  family: "madison-contractor",
  officialRevisionId: OFFICIAL_U250_REVISION_ID,
  officialRevisionName: OFFICIAL_U250_REVISION_NAME,
  extraTemplateIds: [RODEO_WORKBOOK_U250_ID, RODEO_WORKBOOK_BLANK_ID],
  extractedFrom: "drive-text",
  dollarsStatus: "locked",
  note: "Family A official lock. Family B workbook is an additional face, not this total.",
  buckets: {
    directHours: 8315,
    directDollars: 1383800,
    directRate: 166.42,
    indirectHours: 4566,
    indirectDollars: 767540,
    indirectRate: 168.1,
    perDiem: 188740,
    mobDemob: 101000,
    materialsDirect: 20000,
    materialsIndirect: 0,
    equipment: 9600,
    thirdParty: 0,
    other: 0,
    totalHours: 12881,
    grandTotal: 2470680,
    allInRate: 297.14,
  },
};

/**
 * Monroe 541V POST REVIEW. Drive text SUMMARY title reads U542 VAC.
 * Dollar Grand Total is a workbook formula (#REF in the extract). Do not invent it.
 */
export const MONROE_541V_GOLDEN: WakeGoldenFixture = {
  packId: MONROE_541V_PACK_ID,
  unit: "541V",
  family: "monroe-workbook",
  officialRevisionId: OFFICIAL_MONROE_541V_REVISION_ID,
  officialRevisionName: OFFICIAL_MONROE_541V_REVISION_NAME,
  extraTemplateIds: [],
  extractedFrom: "drive-text",
  dollarsStatus: "formula-unavailable",
  note: "Hours locked from SUMMARY values. Grand $ stays unavailable until the live Excel cache evaluates. Do not invent a dollar baseline.",
  buckets: null,
  monroeHours: {
    supervision: 2452,
    foremen: 693,
    ipsDirect: 5000,
    support: 338,
    totalLabor: 8483,
    mileage: 45000,
    misc: 30000,
    pivotManhours: 9267,
  },
};

/** Family B filled U110 workbook — additional face. Totals not invented. */
export const U110_RODEO_WORKBOOK_GOLDEN: WakeGoldenFixture = {
  packId: RODEO_U110_PACK_ID,
  unit: "U110",
  family: "p66-rodeo-workbook",
  officialRevisionId: RODEO_WORKBOOK_U110_ID,
  officialRevisionName: "P66 RODEO ESTIMATE WORKBOOK Unit 110  1508 07222026 RH.xlsx",
  extraTemplateIds: [RODEO_WORKBOOK_BLANK_ID],
  extractedFrom: "drive-text",
  dollarsStatus: "pending-workbook-eval",
  note: "Family B additional face. 4.5MB book has no Drive text extract. Do not invent SUMMARY $ or collapse into family A.",
  buckets: null,
};

/** Family B filled U250 workbook — additional face. Totals not invented. */
export const U250_RODEO_WORKBOOK_GOLDEN: WakeGoldenFixture = {
  packId: RODEO_U250_PACK_ID,
  unit: "U250",
  family: "p66-rodeo-workbook",
  officialRevisionId: RODEO_WORKBOOK_U250_ID,
  officialRevisionName: "Copy of P66 RODEO ESTIMATE WORKBOOK  U-250  07.23.25 JB.xlsx",
  extraTemplateIds: [RODEO_WORKBOOK_BLANK_ID],
  extractedFrom: "drive-text",
  dollarsStatus: "pending-workbook-eval",
  note: "Family B additional face. 4.5MB book has no Drive text extract. Do not invent SUMMARY $ or collapse into family A.",
  buckets: null,
};

export const RODEO_WORKBOOK_BLANK_GOLDEN: WakeGoldenFixture = {
  packId: "",
  unit: "",
  family: "p66-rodeo-workbook",
  officialRevisionId: RODEO_WORKBOOK_BLANK_ID,
  officialRevisionName: "P66 RODEO ESTIMATE WORKBOOK Blank Needs Rates updated.xlsx",
  extraTemplateIds: [],
  extractedFrom: "drive-text",
  dollarsStatus: "pending-workbook-eval",
  note: "Family B blank Needs Rates. Not an official filled lock. Do not invent rates or totals.",
  buckets: null,
};

export function wakeGoldenFixtures(): WakeGoldenFixture[] {
  return [U110_CONTRACTOR_GOLDEN, U250_CONTRACTOR_GOLDEN, MONROE_541V_GOLDEN];
}

/** Official lock per reserved pack — family A for Rodeo, Monroe POST REVIEW for 541V. */
export function goldenForPackId(packId = "") {
  return wakeGoldenFixtures().find((row) => row.packId === packId) ?? null;
}

export function familyBWorkbookFixtures(): WakeGoldenFixture[] {
  return [U110_RODEO_WORKBOOK_GOLDEN, U250_RODEO_WORKBOOK_GOLDEN, RODEO_WORKBOOK_BLANK_GOLDEN];
}

export function materialsTotal(buckets: ContractorGoldenBuckets) {
  return money(buckets.materialsDirect + buckets.materialsIndirect);
}

export function bucketSum(buckets: ContractorGoldenBuckets) {
  return money(
    buckets.directDollars +
      buckets.indirectDollars +
      buckets.perDiem +
      buckets.mobDemob +
      materialsTotal(buckets) +
      buckets.equipment +
      buckets.thirdParty +
      buckets.other,
  );
}

export type HydratedWakeCheck = {
  ok: boolean;
  skipped?: "identity-only" | "dollars-unavailable";
  reason?: string;
};

/** Once a reserved slot is hydrated, desk totals must match the official fixture. */
export function checkHydratedWakeGolden(
  pack: WakePackHint | null | undefined,
  desk: {
    grandTotal?: number;
    totalHours?: number;
    directHours?: number;
    indirectHours?: number;
    directDollars?: number;
    indirectDollars?: number;
  } | null | undefined,
): HydratedWakeCheck {
  if (!pack) return { ok: true, skipped: "identity-only", reason: "no pack" };
  const fixture = goldenForPackId(pack.packId);
  if (!fixture) return { ok: true, skipped: "identity-only", reason: "not a wake pack" };
  if (isWakeIdentityOnly(pack)) {
    return { ok: true, skipped: "identity-only", reason: "reserved slot — no invented totals" };
  }
  if (fixture.dollarsStatus !== "locked" || !fixture.buckets) {
    return { ok: true, skipped: "dollars-unavailable", reason: fixture.note };
  }
  if (desk?.grandTotal == null) {
    return { ok: false, reason: "hydrated wake pack is missing a desk grand total" };
  }
  if (!moneyEqual(desk.grandTotal, fixture.buckets.grandTotal)) {
    return {
      ok: false,
      reason: `desk $${desk.grandTotal} ≠ official ${fixture.unit} $${fixture.buckets.grandTotal}`,
    };
  }
  if (desk.totalHours != null && !moneyEqual(desk.totalHours, fixture.buckets.totalHours, 0.05)) {
    return {
      ok: false,
      reason: `desk ${desk.totalHours} hrs ≠ official ${fixture.unit} ${fixture.buckets.totalHours} hrs`,
    };
  }
  if (desk.directHours != null && !moneyEqual(desk.directHours, fixture.buckets.directHours, 0.05)) {
    return { ok: false, reason: `desk direct hours drifted from official ${fixture.unit}` };
  }
  if (desk.indirectHours != null && !moneyEqual(desk.indirectHours, fixture.buckets.indirectHours, 0.05)) {
    return { ok: false, reason: `desk indirect hours drifted from official ${fixture.unit}` };
  }
  if (desk.directDollars != null && !moneyEqual(desk.directDollars, fixture.buckets.directDollars)) {
    return { ok: false, reason: `desk direct $ drifted from official ${fixture.unit}` };
  }
  if (desk.indirectDollars != null && !moneyEqual(desk.indirectDollars, fixture.buckets.indirectDollars)) {
    return { ok: false, reason: `desk indirect $ drifted from official ${fixture.unit}` };
  }
  return { ok: true };
}

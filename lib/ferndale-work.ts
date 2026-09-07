/**
 * Phillips 66 Ferndale Work Folder / vault facts.
 * Books stay in Drive. Never commit the xlsx / xlsm / PDF.
 * Client estimate / RFQ fill is parked — Ferndale is not a Rodeo clone.
 */

export const FERNDALE_SITE_ID = "site-ferndale";
export const FERNDALE_CLIENT = "Phillips 66";
export const FERNDALE_PLANT = "Ferndale, WA";
export const FERNDALE_ADDRESS = "3901 Unick Rd";
export const FERNDALE_COAST = "West Coast COMP PCA0001100 Amd 9";
export const FERNDALE_PCA = "PCA0001100";
export const FERNDALE_COMP_AMENDMENT = 9;

/** Work Folder Drive room (title Ferndale). */
export const FERNDALE_WORK_FOLDER_ID = "1PnaQioJO1Zy43MvCwuKaKQ6w8tZpTwAm";
export const FERNDALE_WORK_FOLDER_TITLE = "Ferndale";

export const FERNDALE_WORK_PILES = [
  "2028 TASO",
  "GEP Response",
  "Invitation to Bid",
  "Submitted",
] as const;

/** B-1 vault folder. Do not commit the workbook. */
export const FERNDALE_B1_FOLDER_ID = "1UIZ-HsWMGz2NvJFDZGkR8wqU0Mk_O2nS";
export const FERNDALE_B1_FILENAME =
  "04 - Exhibit B-1_Labor Burden Buildup_Ferndale Union Positions added RH 1516 07252025.xlsx";

/** Awarded 2028 work, no in-facility presence — competitive bid until marked Regular. */
export const FERNDALE_IS_REGULAR = false;

/** File-loaded per diem. Do not invent new dollars. */
export const FERNDALE_CRAFT_PD = 135;
export const FERNDALE_STAFF_PD = 145;

export const FERNDALE_CLIENT_TEMPLATE_NOTE =
  "Own client estimate / RFQ template (GEP / TASO — RFX, Turnaround Proposal Manual, RFQ letter). Not a Rodeo clone. Fill is parked.";

export const FERNDALE_STATUS_NOTE =
  "Competitive bid — awarded 2028 work, no in-facility Regular yet";

/** Park site-scoped Ferndale form fill behind the Jobs hierarchy. */
export const FERNDALE_CLIENT_TEMPLATE_PARKED = true;

export function showsFerndaleTab() {
  return !FERNDALE_CLIENT_TEMPLATE_PARKED;
}

export function ferndaleWorkFolderIds() {
  return [FERNDALE_WORK_FOLDER_ID, FERNDALE_B1_FOLDER_ID] as const;
}

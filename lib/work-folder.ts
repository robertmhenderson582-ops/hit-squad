/**
 * Work Folder Drive ids for Rodeo + Monroe wake-up.
 * Primary document pile. Official Gmail estimate revisions lock filled totals.
 * Ids only — never commit P66 / Monroe / Madison client xlsx or pdf.
 */

export const WORK_FOLDER_ID = "1_e5q1-ZpFTPE5LEWM9kv27a10gC16WbE";
export const WORK_FOLDER_CLIENTS_ID = "1cbbeGP-9oruYJyJ3JbH2r56Lj4PML1Ul";
export const WORK_FOLDER_P66_ID = "1tLqi03KY7tXJPZbw0BM3Q6GL-QL4XqS6";
export const WORK_FOLDER_RODEO_ID = "1uHhYyFdeu2N-QNYPKxEP9LzBQ1_JLjnk";
export const WORK_FOLDER_RODEO_PLA_CBA_ID = "1z-Nw_C53gJPGtu2tV4vvcTvBrHApbKax";
export const WORK_FOLDER_U110_TA_ID = "1JLlefSg4FPsNdkCGr8XZ3aWr-ZUNX4Oc";
export const WORK_FOLDER_U250_PARENT_ID = "1mu2ybDmiZTuZMkLWN5yoqHegQPPV5iGH";
export const WORK_FOLDER_U250_FALL_ID = "1a4tqDikHoTI3QjNYkpub-etjR7vFls4T";
export const WORK_FOLDER_RODEO_LATEST_WORKBOOK_ID = "1FLCSXAmJYbLCt-95mB-8s3_xd0H_n-OZ";
export const WORK_FOLDER_MONROE_ID = "1ABdF_NkurspzC7YTF2us-3syOt0MBMyZ";
export const WORK_FOLDER_MONROE_PLA_ID = "1NDjMfdotigHW4mY1iD3SbuoE7SQqG46L";
export const WORK_FOLDER_MONROE_541V_ID = "1dqQNs3SH2DCYuclP7_VaAhndJmdy2k87";

/** Official Gmail estimate revisions — lock filled totals. Robert locks. */
export const OFFICIAL_U110_REVISION_ID = "1Y9Y9xk6HGQycPBwUm6Xi4RM2dA0GfOej";
export const OFFICIAL_U110_REVISION_NAME =
  "MADISON U110 2026 Turnaround Contractor Estimate Template 1540 072222026R1.xlsx";
export const OFFICIAL_U250_REVISION_ID = "1JNH2TwVz-iiubkr86i9CUwVETQFVSQlg";
export const OFFICIAL_U250_REVISION_NAME =
  "MADISON U250 2026 Turnaround Contractor Estimate Template R2_08_17_2026_RH.xlsx";
export const OFFICIAL_MONROE_541V_REVISION_ID = "15NhD45FUvdFmfynkbqYGGsy0muhIcx3y";
export const OFFICIAL_MONROE_541V_REVISION_NAME =
  "Monroe Energy U541 VAC  Estimate Workbook POST REVIEW 1204 06162026.xlsx";

/**
 * Rodeo has MULTIPLE templates. Do not collapse.
 * A = Madison Turnaround Contractor Estimate Template (hours × composite rate).
 * B = P66 RODEO ESTIMATE WORKBOOK (~4.5MB).
 * C = Client Estimate Form family (U240 examples under Rodeo/U240).
 */
export const RODEO_WORKBOOK_BLANK_ID = "1X2ETYoUFx1gbVTX7GhFEyWD7nP0ABcBo";
export const RODEO_WORKBOOK_BLANK_NAME = "P66 RODEO ESTIMATE WORKBOOK Blank Needs Rates updated.xlsx";
export const RODEO_WORKBOOK_U110_ID = "1j0YaowDFQgZTspCY_yMT8oYeWjxEZQTs";
export const RODEO_WORKBOOK_U110_NAME = "P66 RODEO ESTIMATE WORKBOOK Unit 110  1508 07222026 RH.xlsx";
export const RODEO_WORKBOOK_U250_ID = "1gNw_YEzhBICk8TGiqANxXvw_NLTR-4Mu";
export const RODEO_WORKBOOK_U250_NAME = "Copy of P66 RODEO ESTIMATE WORKBOOK  U-250  07.23.25 JB.xlsx";

export const WESTERN_STATES_AGREEMENT_ID = "1wdYyt-qOEruPtosgiCSbkYO2yaTZnPfi";
export const WESTERN_STATES_AGREEMENT_NAME = "Western States Agreement.pdf";
export const WEST_COMP_AMEND9_ID = "1zWoijAW5hGx7-Ew2U77_7uYxjEHS3RqT";
export const WEST_COMP_AMEND9_NAME =
  "PCA0001100_COMP_Madison_GMTA_West Coast_Amendment 9_SIGNED_RH_08192026.pdf";

export type WorkFolderNode = {
  id: string;
  label: string;
  kind: "folder" | "file";
};

export function driveViewUrl(fileId: string) {
  return `https://drive.google.com/file/d/${fileId}/view`;
}

export function driveFolderUrl(folderId: string) {
  return `https://drive.google.com/drive/folders/${folderId}`;
}

export function workFolderRoots(): WorkFolderNode[] {
  return [
    { id: WORK_FOLDER_ID, label: "Live Work Folder", kind: "folder" },
    { id: WORK_FOLDER_CLIENTS_ID, label: "Clients", kind: "folder" },
    { id: WORK_FOLDER_P66_ID, label: "Phillips 66", kind: "folder" },
    { id: WORK_FOLDER_RODEO_ID, label: "Rodeo", kind: "folder" },
    { id: WORK_FOLDER_MONROE_ID, label: "Monroe Energy", kind: "folder" },
  ];
}

export function officialRevisionIds() {
  return [OFFICIAL_U110_REVISION_ID, OFFICIAL_U250_REVISION_ID, OFFICIAL_MONROE_541V_REVISION_ID];
}

export function rodeoWorkbookFamilyIds() {
  return [RODEO_WORKBOOK_BLANK_ID, RODEO_WORKBOOK_U110_ID, RODEO_WORKBOOK_U250_ID];
}

export function isOfficialRevisionId(fileId = "") {
  return officialRevisionIds().includes(fileId.trim());
}

export function isRodeoWorkbookFamilyId(fileId = "") {
  return rodeoWorkbookFamilyIds().includes(fileId.trim());
}

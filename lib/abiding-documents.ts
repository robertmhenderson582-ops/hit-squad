/**
 * Abiding documents — Contracts / Agreements the PM opens from the desk.
 * Company-scoped. Settings vault used to be room labels only.
 * Books stay in Drive. Never commit the xlsx / pdf.
 */

import { B2_WEST_PLANT } from "./b2-east-coast.ts";
import { assignedCompanyId, type CompanyScope } from "./companies.ts";
import { siteClockFromText, type SiteClock } from "./hours-clock.ts";
import {
  driveFolderUrl,
  driveViewUrl,
  WEST_COMP_AMEND9_ID,
  WEST_COMP_AMEND9_NAME,
  WESTERN_STATES_AGREEMENT_ID,
  WESTERN_STATES_AGREEMENT_NAME,
  WORK_FOLDER_MONROE_PLA_ID,
  WORK_FOLDER_RODEO_PLA_CBA_ID,
} from "./work-folder.ts";

export type AbidingKind = "pla" | "cba" | "msa" | "rate-sheet" | "folder";

export type AbidingDocument = {
  id: string;
  title: string;
  kind: AbidingKind;
  siteId: string;
  siteName: string;
  companyId: "madison";
  href: string;
  note: string;
};

export const WEST_COAST_ABIDING_AMENDMENT = 9;

export function abidingDocuments(): AbidingDocument[] {
  return [
    {
      id: WESTERN_STATES_AGREEMENT_ID,
      title: WESTERN_STATES_AGREEMENT_NAME,
      kind: "pla",
      siteId: "site-rodeo",
      siteName: "Rodeo",
      companyId: "madison",
      href: driveViewUrl(WESTERN_STATES_AGREEMENT_ID),
      note: "Western States Agreement. Vault-tie into the Rodeo West Coast clock.",
    },
    {
      id: WEST_COMP_AMEND9_ID,
      title: WEST_COMP_AMEND9_NAME,
      kind: "cba",
      siteId: "site-rodeo",
      siteName: "Rodeo",
      companyId: "madison",
      href: driveViewUrl(WEST_COMP_AMEND9_ID),
      note: `West COMP ${B2_WEST_PLANT} Amendment ${WEST_COAST_ABIDING_AMENDMENT} signed. Rate-book samples stay Amendment 8 until Robert remaps wages.`,
    },
    {
      id: WORK_FOLDER_RODEO_PLA_CBA_ID,
      title: "Rodeo PLA & CBAs",
      kind: "folder",
      siteId: "site-rodeo",
      siteName: "Rodeo",
      companyId: "madison",
      href: driveFolderUrl(WORK_FOLDER_RODEO_PLA_CBA_ID),
      note: "Work Folder PLA / CBA pile for Rodeo.",
    },
    {
      id: WORK_FOLDER_MONROE_PLA_ID,
      title: "Monroe Site PLA",
      kind: "folder",
      siteId: "site-monroe",
      siteName: "Monroe Energy",
      companyId: "madison",
      href: driveFolderUrl(WORK_FOLDER_MONROE_PLA_ID),
      note: "Monroe Energy Trainer site PLA pile.",
    },
  ];
}

export function canSeeAbidingDocuments(scope?: CompanyScope | null) {
  if (!scope || scope.isOwner) return true;
  return assignedCompanyId(scope) === "madison";
}

export function abidingDocumentsForScope(scope?: CompanyScope | null, siteId?: string) {
  if (!canSeeAbidingDocuments(scope)) return [];
  return abidingDocuments().filter((row) => (siteId ? row.siteId === siteId : true));
}

export function abidingDocumentsForSiteName(siteName = "", scope?: CompanyScope | null) {
  const hay = siteName.toLowerCase();
  if (!hay) return abidingDocumentsForScope(scope);
  if (/\brodeo\b/.test(hay)) return abidingDocumentsForScope(scope, "site-rodeo");
  if (/monroe/.test(hay)) return abidingDocumentsForScope(scope, "site-monroe");
  return [];
}

export type WestCoastClockBind = {
  clock: SiteClock;
  pca: string;
  amendment: number;
  plaId: string;
  cbaId: string;
  rateBookId: "shahan-rodeo";
  stub: false;
};

/** Vault-tie MSA/PLA/CBA into the Rodeo CA-daily clock. Does not change hour math. */
export function westCoastClockBind(site = "", client = "", plantCode = ""): WestCoastClockBind | null {
  if (siteClockFromText(site, client, plantCode) !== "ca-daily") return null;
  return {
    clock: "ca-daily",
    pca: B2_WEST_PLANT,
    amendment: WEST_COAST_ABIDING_AMENDMENT,
    plaId: WESTERN_STATES_AGREEMENT_ID,
    cbaId: WEST_COMP_AMEND9_ID,
    rateBookId: "shahan-rodeo",
    stub: false,
  };
}

export function westCoastClockNote(site = "", client = "", plantCode = "") {
  const bind = westCoastClockBind(site, client, plantCode);
  if (!bind) return "";
  return `West Coast COMP ${bind.pca} Amend ${bind.amendment} · Western States PLA · CA daily clock`;
}

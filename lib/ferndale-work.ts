/**
 * Phillips 66 Ferndale Work Folder / vault facts.
 * Books stay in Drive. Never commit the xlsx / xlsm / PDF.
 * Own GEP / TASO client template — not a Rodeo clone.
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

export type FerndaleWorkPile = (typeof FERNDALE_WORK_PILES)[number];

/** Pile rooms under the Ferndale Work Folder. Ids from Drive list — not invented. */
export const FERNDALE_TASO_FOLDER_ID = "15WcihsOz14AcH7Ec_LTpgauOlQrl9w_V";
export const FERNDALE_GEP_RESPONSE_FOLDER_ID = "1Oo_GPDP2AAG4E-c_HUy76ZB1ogEnpdNo";
export const FERNDALE_ITB_FOLDER_ID = "1xof59TiTwq9oTmLrif93hzahXX9ej8Iz";
export const FERNDALE_SUBMITTED_FOLDER_ID = "1u10nLS0QczbZyDhbvQiX0dJA3UGL90D6";
export const FERNDALE_COMPILED_FOLDER_ID = "1wVxnZAM5L6Hcula4-HFHw7fbmGQFTHkD";

export const FERNDALE_PILE_FOLDER_IDS = {
  "2028 TASO": FERNDALE_TASO_FOLDER_ID,
  "GEP Response": FERNDALE_GEP_RESPONSE_FOLDER_ID,
  "Invitation to Bid": FERNDALE_ITB_FOLDER_ID,
  Submitted: FERNDALE_SUBMITTED_FOLDER_ID,
} as const satisfies Record<FerndaleWorkPile, string>;

/** B-1 vault folder. Do not commit the workbook. */
export const FERNDALE_B1_FOLDER_ID = "1UIZ-HsWMGz2NvJFDZGkR8wqU0Mk_O2nS";
export const FERNDALE_B1_FILENAME =
  "04 - Exhibit B-1_Labor Burden Buildup_Ferndale Union Positions added RH 1516 07252025.xlsx";

/** Awarded 2028 work, no in-facility presence — competitive bid until marked Regular. */
export const FERNDALE_IS_REGULAR = false;

/** File-loaded per diem. Do not invent new dollars. */
export const FERNDALE_CRAFT_PD = 135;
export const FERNDALE_STAFF_PD = 145;

/** MSA number from compiled-documents filename (Amendment 1_CW2345531_MSA_…). */
export const FERNDALE_MSA = "CW2345531";

/** TASO PSO from 2028 TASO amendment filename. Not an RFX. */
export const FERNDALE_TASO_PSO = "PSO0002545";
export const FERNDALE_TASO_AMENDMENT_ID = "1B5J82URifY5SMbCKkczLkChjrely4q8V";
export const FERNDALE_TASO_AMENDMENT_NAME = "Madison - Amendment No. 1 to TASO PSO0002545.docx";

/** Blank Ferndale estimate workbook face. Cell map is TODO — do not invent totals. */
export const FERNDALE_ESTIMATE_WORKBOOK_ID = "1Pd_0eReJFO-0xBEXYR1raA3_oTPFkk3a";
export const FERNDALE_ESTIMATE_WORKBOOK_NAME = "Ferndale Estimate Workbook.xlsx";

/** Turnaround Proposal Manual (compiled pile). */
export const FERNDALE_PROPOSAL_MANUAL_ID = "1CjlPLvjkYe_RRKHwwneRaQi11LOyObKL";
export const FERNDALE_PROPOSAL_MANUAL_NAME = "04 - Turnaround Proposal Manual - Early Proposal Ph.pdf";

/** RFQ letter shape — Formal Proposal RFX0000270. Dollars in that letter stay out of code. */
export const FERNDALE_RFQ_LETTER_ID = "1jYtgrhWn9jG5xO4_isWz-ZcoqFQFrkno";
export const FERNDALE_RFQ_LETTER_NAME =
  "Formal Proposal for Reformer Piping Services 2028 Ferndale Major Turnaround RFX0000270.docx";

/** Addressee on the readable RFX0000270 letter. */
export const FERNDALE_LETTER_ADDRESSEE = "Marinn Young";
export const FERNDALE_LETTER_ADDRESSEE_TITLE = "Procurement Business Partner";
export const FERNDALE_LETTER_CONTRACTOR = "Madison Industrial Services Team LLC";

export const FERNDALE_CLIENT_TEMPLATE_NOTE =
  "Own client estimate / RFQ template (GEP / TASO — RFX, Turnaround Proposal Manual, RFQ letter). Not a Rodeo clone. Fill maps the live pack; unread workbook cells stay TODO on Drive ids.";

export const FERNDALE_STATUS_NOTE =
  "Competitive bid — awarded 2028 work, no in-facility Regular yet";

/** Site-scoped Ferndale form fill is live. */
export const FERNDALE_CLIENT_TEMPLATE_PARKED = false;

export type FerndaleRfxKind = "invitation-pack" | "est-workbook" | "rfq-letter";

export type FerndaleRfxSource = {
  rfx: string;
  label: string;
  folderId: string;
  kind: FerndaleRfxKind;
  fileId?: string;
  fileName?: string;
  todo?: string;
};

/**
 * RFX packs readable from Work Folder titles. Do not invent new RFX numbers.
 * Dollar totals are not recorded here — unread EST workbooks stay TODO.
 */
export const FERNDALE_RFX_SOURCES: readonly FerndaleRfxSource[] = [
  {
    rfx: "RFX0000266",
    label: "FRN GM 2028 FCC Gas Plant",
    folderId: "1eTI0E5Th1HawIg73GXu3-_Hwl4oY9Wo7",
    kind: "invitation-pack",
  },
  {
    rfx: "RFX0000267",
    label: "FRN GM 2028 Reformer",
    folderId: "1UnL_0XP8RG0F8Qxewp53R16mv94nRwwI",
    kind: "est-workbook",
    fileId: "1KA_7J7oj0_z_6HTWnqO3nvowGs2KWa40",
    fileName: "FRN GM 2028 Reformer RFX0000267 EST Workbook Phase Response to P66 RFI 1303 03222026 SHARED COPY.xlsx",
    todo: "TODO: cell map EST workbook 1KA_7J7oj0_z_6HTWnqO3nvowGs2KWa40 — do not invent RFX totals",
  },
  {
    rfx: "RFX0000270",
    label: "FRN Piping 2028 Reformer",
    folderId: "1kwHKmXnOEsDvLxz7JJuP-0kEyI6YuhtZ",
    kind: "rfq-letter",
    fileId: FERNDALE_RFQ_LETTER_ID,
    fileName: FERNDALE_RFQ_LETTER_NAME,
  },
];

export function ferndaleWorkFolderIds() {
  return [
    FERNDALE_WORK_FOLDER_ID,
    FERNDALE_B1_FOLDER_ID,
    FERNDALE_TASO_FOLDER_ID,
    FERNDALE_GEP_RESPONSE_FOLDER_ID,
    FERNDALE_ITB_FOLDER_ID,
    FERNDALE_SUBMITTED_FOLDER_ID,
  ] as const;
}

export function ferndaleRfxFromText(text = "") {
  const hay = text.toUpperCase().replace(/[\s-]+/g, "");
  return FERNDALE_RFX_SOURCES.find((row) => hay.includes(row.rfx.replace(/\s+/g, ""))) ?? null;
}

export function ferndaleWorkbookTodos() {
  return [
    `TODO: cell map ${FERNDALE_ESTIMATE_WORKBOOK_NAME} ${FERNDALE_ESTIMATE_WORKBOOK_ID} — do not invent RFX totals`,
    `TODO: cell map EST workbook 1KA_7J7oj0_z_6HTWnqO3nvowGs2KWa40 — do not invent RFX totals`,
    `TODO: Turnaround Proposal Manual face ${FERNDALE_PROPOSAL_MANUAL_ID}`,
    `TODO: TASO amendment face ${FERNDALE_TASO_AMENDMENT_ID} (${FERNDALE_TASO_PSO})`,
  ] as const;
}

/**
 * Wood River RRFF Exhibit B-1 hall sheets — Pay Tax / Ins / Misc / O/H / Profit
 * and Fringes Subtotal from the staged labor-burden workbook.
 * Not the TM labor-burden face. Not a placeholder Illinois composite.
 */

import { craftSheet, fringeLine } from "./rate-vault-b1.ts";
import type { RateVaultCraftSheet, RateVaultPreviewRow } from "./rate-vault.ts";

function hall(
  id: string,
  sheet: string,
  craft: string,
  local: string | null,
  group: string,
  lane: "union" | "merit",
  representativeWage: number,
  representativePosition: string,
  fringes: RateVaultCraftSheet["fringes"],
  extra: {
    ins?: Parameters<typeof craftSheet>[0]["ins"];
    misc?: Parameters<typeof craftSheet>[0]["misc"];
    oh?: number;
    profit?: number;
    revision?: string;
    effective?: string;
  } = {},
): RateVaultCraftSheet {
  return craftSheet({
    id,
    sheet,
    craft,
    local,
    lane,
    group,
    revision: extra.revision ?? "01/01/25",
    effective: extra.effective ?? "12/31/25",
    representativeWage,
    representativePosition,
    fringes,
    ins: extra.ins,
    misc: extra.misc,
    oh: extra.oh,
    profit: extra.profit,
  });
}

export function woodRiverB1CraftSheets(): RateVaultCraftSheet[] {
  const bmFringes = (sheet: string, craft: string, local: string | null) => [
    fringeLine({ id: `${sheet}-hw`, label: "H&W", amountHr: 7.07, craft, local, sheet, ridesOt: true }),
    fringeLine({ id: `${sheet}-pension`, label: "Pension", amountHr: 20.48, craft, local, sheet, ridesOt: true }),
    fringeLine({ id: `${sheet}-annuity`, label: "Annuity", amountHr: 7.35, craft, local, sheet, ridesOt: true }),
    fringeLine({ id: `${sheet}-appr`, label: "Appr", amountHr: 0.45, craft, local, sheet }),
    fringeLine({ id: `${sheet}-most`, label: "Common Arc/MOST", amountHr: 0.34, craft, local, sheet }),
    fringeLine({ id: `${sheet}-train`, label: "Local Training", amountHr: 0.4, craft, local, sheet }),
    fringeLine({ id: `${sheet}-cmrave`, label: "CMRAVE", amountHr: 0.05, craft, local, sheet }),
  ];
  const pfFringes = (sheet: string, craft: string, local: string | null) => [
    fringeLine({ id: `${sheet}-hw`, label: "H&W", amountHr: 7.55, craft, local, sheet, ridesOt: true }),
    fringeLine({ id: `${sheet}-pension`, label: "Pension", amountHr: 8.15, craft, local, sheet, ridesOt: true }),
    fringeLine({ id: `${sheet}-def`, label: "Def. Cont.", amountHr: 3.25, craft, local, sheet, ridesOt: true }),
    fringeLine({ id: `${sheet}-appr`, label: "Appr", amountHr: 1.2, craft, local, sheet, ridesOt: true }),
    fringeLine({ id: `${sheet}-cmrave`, label: "CMRAVE", amountHr: 0.05, craft, local, sheet }),
  ];

  return [
    hall("wr-bm-staff", "WOODRIVER BM STAFF RRFF", "Boilermaker", "363", "Staff OCIP", "union", 71, "Lead Site 01", bmFringes("WOODRIVER BM STAFF RRFF", "Boilermaker", "363"), {
      revision: "01/01/25",
      effective: "12/31/25",
    }),
    hall("wr-pf-staff", "WOODRIVER PF STAFF RRFF", "Pipefitter", "553", "Staff OCIP", "union", 70.58, "Manager, Project PF 01", pfFringes("WOODRIVER PF STAFF RRFF", "Pipefitter", "553")),
    hall(
      "wr-merit-staff",
      "WOODRIVER MERIT STAFF RRFF",
      "Merit Staff",
      null,
      "Staff OCIP",
      "merit",
      90,
      "Lead Site 01",
      [
        fringeLine({ id: "merit-401k", label: "401K", ratePct: 2, unit: "pct-taxable", craft: "Merit Staff", local: null, sheet: "WOODRIVER MERIT STAFF RRFF", ridesOt: true }),
        fringeLine({ id: "merit-health", label: "Health", amountHr: 4.75, craft: "Merit Staff", local: null, sheet: "WOODRIVER MERIT STAFF RRFF" }),
        fringeLine({ id: "merit-vac", label: "Vacation", ratePct: 3, unit: "pct-taxable", craft: "Merit Staff", local: null, sheet: "WOODRIVER MERIT STAFF RRFF" }),
        fringeLine({ id: "merit-hol", label: "Holiday Sick Pay", ratePct: 2, unit: "pct-taxable", craft: "Merit Staff", local: null, sheet: "WOODRIVER MERIT STAFF RRFF" }),
      ],
      { revision: "06/01/23", effective: "12/31/27" },
    ),
    hall(
      "wr-laborer",
      "WOODRIVER LABORER RRFF",
      "Laborer",
      null,
      "Laborer",
      "union",
      34.51,
      "Laborer Journeyman GRP1",
      [
        fringeLine({ id: "lab-hw", label: "Health & Welfare", amountHr: 8.25, craft: "Laborer", local: null, sheet: "WOODRIVER LABORER RRFF" }),
        fringeLine({ id: "lab-pension", label: "Pension", amountHr: 17.25, craft: "Laborer", local: null, sheet: "WOODRIVER LABORER RRFF" }),
        fringeLine({ id: "lab-annuity", label: "Annuity", amountHr: 4.29, craft: "Laborer", local: null, sheet: "WOODRIVER LABORER RRFF" }),
        fringeLine({ id: "lab-appr", label: "Apprentice", amountHr: 0.8, craft: "Laborer", local: null, sheet: "WOODRIVER LABORER RRFF" }),
        fringeLine({ id: "lab-lecet", label: "LECET", amountHr: 0.89, craft: "Laborer", local: null, sheet: "WOODRIVER LABORER RRFF" }),
        fringeLine({ id: "lab-cmrave", label: "CMRAVE", amountHr: 0.05, craft: "Laborer", local: null, sheet: "WOODRIVER LABORER RRFF" }),
      ],
      { revision: "08/01/24", effective: "07/31/25" },
    ),
    hall(
      "wr-teamster",
      "WOODRIVER TEAMSTER RRFF",
      "Teamster",
      null,
      "Wood River Craft OCIP",
      "union",
      49.94,
      "TEAMSTERS GRP 06",
      [
        fringeLine({ id: "tm-hw", label: "H&W", amountHr: 15.27, craft: "Teamster", local: null, sheet: "WOODRIVER TEAMSTER RRFF" }),
        fringeLine({ id: "tm-pension", label: "Pension", amountHr: 8.04, craft: "Teamster", local: null, sheet: "WOODRIVER TEAMSTER RRFF" }),
        fringeLine({ id: "tm-train", label: "Training", amountHr: 0.25, craft: "Teamster", local: null, sheet: "WOODRIVER TEAMSTER RRFF" }),
        fringeLine({ id: "tm-hra", label: "HRA", amountHr: 1, craft: "Teamster", local: null, sheet: "WOODRIVER TEAMSTER RRFF" }),
        fringeLine({ id: "tm-cmrave", label: "CMRAVE", amountHr: 0.05, craft: "Teamster", local: null, sheet: "WOODRIVER TEAMSTER RRFF" }),
      ],
    ),
    hall(
      "wr-oe",
      "WOODRIVER OPERATING ENG RRFF",
      "Operator",
      null,
      "Wood River Craft OCIP",
      "union",
      49.12,
      "Operating Eng Grp 01",
      [
        fringeLine({ id: "oe-hw", label: "H&W", amountHr: 14.95, craft: "Operator", local: null, sheet: "WOODRIVER OPERATING ENG RRFF", ridesOt: true }),
        fringeLine({ id: "oe-pension", label: "Pension", amountHr: 11.25, craft: "Operator", local: null, sheet: "WOODRIVER OPERATING ENG RRFF", ridesOt: true }),
        fringeLine({ id: "oe-trng", label: "Trng Fund", amountHr: 1.6, craft: "Operator", local: null, sheet: "WOODRIVER OPERATING ENG RRFF", ridesOt: true }),
        fringeLine({ id: "oe-annuity", label: "Annuity", amountHr: 9, craft: "Operator", local: null, sheet: "WOODRIVER OPERATING ENG RRFF", ridesOt: true }),
        fringeLine({ id: "oe-sicap", label: "SICAP", amountHr: 0.15, craft: "Operator", local: null, sheet: "WOODRIVER OPERATING ENG RRFF" }),
        fringeLine({ id: "oe-ntf", label: "NTF", amountHr: 0.1, craft: "Operator", local: null, sheet: "WOODRIVER OPERATING ENG RRFF" }),
        fringeLine({ id: "oe-cmrave", label: "CMRAVE", amountHr: 0.05, craft: "Operator", local: null, sheet: "WOODRIVER OPERATING ENG RRFF" }),
      ],
      { revision: "08/01/24", effective: "07/31/25" },
    ),
    hall("wr-pf", "WOODRIVER PIPEFITTER RRFF", "Pipefitter", "553", "PF L553", "union", 49.03, "PIPEFITTER JOURNEYMAN", pfFringes("WOODRIVER PIPEFITTER RRFF", "Pipefitter", "553")),
    hall("wr-bm", "WOODRIVER BOILERMAKER RRFF", "Boilermaker", "363", "BM L363", "union", 48.23, "Boilermaker General Foreman", bmFringes("WOODRIVER BOILERMAKER RRFF", "Boilermaker", "363"), {
      ins: { "gen-liab": 2.65, umbrella: 1.75 },
    }),
  ];
}

function seedRow(over: Partial<RateVaultPreviewRow> & Pick<RateVaultPreviewRow, "id" | "sheet" | "group" | "craft" | "position" | "wage">): RateVaultPreviewRow {
  return {
    local: null,
    fringe: 0,
    burden: 0,
    billRate: 0,
    billOt: null,
    billDt: null,
    lane: "union",
    ocip: /ocip/i.test(over.group || ""),
    clockNote: over.lane === "merit" ? "Staff clock" : "OT after 8 · Sunday DT",
    ...over,
  };
}

/** Position wages from the B-1 fill where present; otherwise hall wage-sheet seats. */
export function woodRiverB1SeedRows(): RateVaultPreviewRow[] {
  return [
    seedRow({
      id: "bm-staff-lead",
      sheet: "WOODRIVER BM STAFF RRFF",
      group: "Staff OCIP",
      craft: "Boilermaker",
      local: "363",
      position: "Lead Site 01",
      wage: 71,
      ocip: true,
    }),
    seedRow({
      id: "rs-supt-bm-01",
      sheet: "WOODRIVER BM STAFF RRFF",
      group: "Staff OCIP",
      craft: "Boilermaker",
      local: "363",
      position: "Superintendent Boilermaker 01",
      wage: 59,
      ocip: true,
    }),
    seedRow({
      id: "rs-pm-pf-01",
      sheet: "WOODRIVER PF STAFF RRFF",
      group: "Staff OCIP",
      craft: "Pipefitter",
      local: "553",
      position: "Manager, Project PF 01",
      wage: 70.58,
      ocip: true,
    }),
    seedRow({
      id: "rs-lead-site-01",
      sheet: "WOODRIVER MERIT STAFF RRFF",
      group: "Staff OCIP",
      craft: "Merit Staff",
      position: "Lead Site 01",
      wage: 90,
      lane: "merit",
      ocip: true,
      clockNote: "Staff clock",
    }),
    seedRow({
      id: "merit-asst-supt-01",
      sheet: "WOODRIVER MERIT STAFF RRFF",
      group: "Staff OCIP",
      craft: "Merit Staff",
      position: "Asst Superintendent 01",
      wage: 72,
      lane: "merit",
      ocip: true,
      clockNote: "Staff clock",
    }),
    seedRow({
      id: "bm-gf",
      sheet: "WOODRIVER BOILERMAKER RRFF",
      group: "BM L363",
      craft: "Boilermaker",
      local: "363",
      position: "Boilermaker General Foreman",
      wage: 48.23,
    }),
    seedRow({
      id: "bm-fm",
      sheet: "WOODRIVER BOILERMAKER RRFF",
      group: "BM L363",
      craft: "Boilermaker",
      local: "363",
      position: "Boilermaker Foreman",
      wage: 49.1,
    }),
    seedRow({
      id: "bm-jw",
      sheet: "WOODRIVER BOILERMAKER RRFF",
      group: "BM L363",
      craft: "Boilermaker",
      local: "363",
      position: "Boilermaker Journeyman",
      wage: 45.6,
    }),
    seedRow({
      id: "bm-app-80",
      sheet: "WOODRIVER BOILERMAKER RRFF",
      group: "BM L363",
      craft: "Boilermaker",
      local: "363",
      position: "Boilermaker Apprentice Y3P5 80%",
      wage: 38.4,
    }),
    seedRow({
      id: "pf-gf",
      sheet: "WOODRIVER PIPEFITTER RRFF",
      group: "PF L553",
      craft: "Pipefitter",
      local: "553",
      position: "Pipefitter General Foreman",
      wage: 58.84,
    }),
    seedRow({
      id: "pf-jw",
      sheet: "WOODRIVER PIPEFITTER RRFF",
      group: "PF L553",
      craft: "Pipefitter",
      local: "553",
      position: "PIPEFITTER JOURNEYMAN",
      wage: 49.03,
    }),
    seedRow({
      id: "pf-steward",
      sheet: "WOODRIVER PIPEFITTER RRFF",
      group: "PF L553",
      craft: "Pipefitter",
      local: "553",
      position: "Pipefitter Steward 01",
      wage: 53.93,
    }),
    seedRow({
      id: "pf-app-70",
      sheet: "WOODRIVER PIPEFITTER RRFF",
      group: "PF L553",
      craft: "Pipefitter",
      local: "553",
      position: "PIPEFITTER APPR 70%",
      wage: 36.13,
    }),
    seedRow({
      id: "lab-gf",
      sheet: "WOODRIVER LABORER RRFF",
      group: "Laborer",
      craft: "Laborer",
      position: "Laborer General Foreman GRP1",
      wage: 38.01,
    }),
    seedRow({
      id: "lab-jw",
      sheet: "WOODRIVER LABORER RRFF",
      group: "Laborer",
      craft: "Laborer",
      position: "Laborer Journeyman GRP1",
      wage: 34.51,
    }),
    seedRow({
      id: "lab-app-y1",
      sheet: "WOODRIVER LABORER RRFF",
      group: "Laborer",
      craft: "Laborer",
      position: "LABORER APPRENTICE Y1",
      wage: 27.25,
    }),
    seedRow({
      id: "oe-01",
      sheet: "WOODRIVER OPERATING ENG RRFF",
      group: "Wood River Craft OCIP",
      craft: "Operator",
      position: "Operating Eng Grp 01",
      wage: 49.12,
      ocip: true,
    }),
    seedRow({
      id: "tm-06",
      sheet: "WOODRIVER TEAMSTER RRFF",
      group: "Wood River Craft OCIP",
      craft: "Teamster",
      position: "TEAMSTERS GRP 06",
      wage: 49.94,
      ocip: true,
    }),
  ];
}

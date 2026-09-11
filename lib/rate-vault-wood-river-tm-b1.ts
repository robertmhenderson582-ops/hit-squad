/**
 * Wood River T&M / Union_TM Exhibit B-1 hall sheets — Pay Tax / Ins / Misc / O/H / Profit
 * and Fringes Subtotal from the staged Union_TM labor-burden workbook.
 * Not the RRFF labor-burden face. Does not invent H&W/Pension splits or an Illinois composite.
 */

import extract from "./rate-vault/wood-river-tm-b1-extract.json" with { type: "json" };
import { craftSheet, fringeLine } from "./rate-vault-b1.ts";
import type { RateVaultCraftSheet, RateVaultLane, RateVaultPreviewRow } from "./rate-vault.ts";

function inferLane(input: { craft?: string | null; group?: string | null; sheet?: string | null }): RateVaultLane {
  return /merit/i.test([input.craft, input.group, input.sheet].filter(Boolean).join(" ")) ? "merit" : "union";
}

function inferOcip(input: { group?: string | null; sheet?: string | null }) {
  return /ocip/i.test([input.group, input.sheet].filter(Boolean).join(" "));
}

function clockNote(lane: RateVaultLane) {
  return lane === "merit" ? "Staff clock" : "OT after 8 · Sunday DT";
}

type TmExtractFringe = {
  label: string;
  amountHr?: number | null;
  ratePct?: number | null;
  unit?: string;
  ridesOt?: boolean;
  note?: string;
};

type TmExtractHall = {
  id: string;
  sheet: string;
  banner: string;
  craft: string;
  local: string | null;
  group: string;
  lane: "union" | "merit";
  revision: string;
  effective: string;
  representativeWage: number;
  representativePosition: string;
  fringes: TmExtractFringe[];
  ins: { wc: number; empLiab: number; genLiab: number; umbrella: number; other: number };
  misc: { small: number; cons: number; ppe: number; other: number };
  oh: number;
  profit: number;
};

type TmExtractPosition = {
  id: string;
  position: string;
  craft: string;
  local: string | null;
  sheet: string;
  group: string;
  lane: "union" | "merit";
  wage: number;
  ocip?: boolean;
};

const halls = extract.craftSheets as TmExtractHall[];
const positions = extract.positions as TmExtractPosition[];

function slug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function tmBurdenNote(note: string) {
  return note.replace(/\bRRFF\b/g, "T&M");
}

function tabToBanner() {
  return new Map(halls.map((hall) => [hall.sheet, hall.banner]));
}

export function woodRiverTmB1CraftSheets(): RateVaultCraftSheet[] {
  return halls.map((hall) => {
    const sheet = hall.banner;
    const built = craftSheet({
      id: hall.id,
      sheet,
      craft: hall.craft,
      local: hall.local,
      lane: hall.lane,
      group: hall.group,
      revision: hall.revision,
      effective: hall.effective,
      representativeWage: hall.representativeWage,
      representativePosition: hall.representativePosition,
      fringes: hall.fringes.map((line) =>
        fringeLine({
          id: `${hall.id}-${slug(line.label)}`,
          label: line.label,
          amountHr: line.amountHr ?? 0,
          ratePct: line.ratePct ?? 0,
          unit: line.unit === "pct-taxable" ? "pct-taxable" : "amount-hr",
          craft: hall.craft,
          local: hall.local,
          sheet,
          ridesOt: Boolean(line.ridesOt),
          note:
            line.note ||
            (line.label === "Fringes Subtotal"
              ? "Hall sheet exposes Fringes Subtotal only — component H&W/Pension/etc. columns not present in this workbook face"
              : undefined),
        }),
      ),
      ins: {
        wc: hall.ins.wc,
        "emp-liab": hall.ins.empLiab,
        "gen-liab": hall.ins.genLiab,
        umbrella: hall.ins.umbrella,
        other: hall.ins.other,
      },
      misc: {
        small: hall.misc.small,
        cons: hall.misc.cons,
        ppe: hall.misc.ppe,
        other: hall.misc.other,
      },
      oh: hall.oh,
      profit: hall.profit,
    });
    return {
      ...built,
      burden: built.burden.map((line) => ({ ...line, note: tmBurdenNote(line.note) })),
    };
  });
}

function seedRow(over: Partial<RateVaultPreviewRow> & Pick<RateVaultPreviewRow, "id" | "sheet" | "group" | "craft" | "position" | "wage">): RateVaultPreviewRow {
  const lane = over.lane === "merit" || over.lane === "union" ? over.lane : inferLane(over);
  return {
    local: null,
    fringe: 0,
    burden: 0,
    billRate: 0,
    billOt: null,
    billDt: null,
    lane,
    ocip: typeof over.ocip === "boolean" ? over.ocip : inferOcip(over),
    clockNote: over.clockNote || clockNote(lane),
    ...over,
    lane,
  };
}

/** Position wages from the Union_TM B-1 extract. Sheet names are TM banners, not RRFF. */
export function woodRiverTmB1SeedRows(): RateVaultPreviewRow[] {
  const banners = tabToBanner();
  return positions.map((row) => {
    const sheet = banners.get(row.sheet) || row.sheet;
    const lane = row.lane === "merit" || row.lane === "union" ? row.lane : inferLane(row);
    return seedRow({
      id: row.id,
      sheet,
      group: row.group,
      craft: row.craft,
      local: row.local,
      position: row.position,
      wage: row.wage,
      lane,
      ocip: typeof row.ocip === "boolean" ? row.ocip : inferOcip({ group: row.group, sheet }),
      clockNote: clockNote(lane),
    });
  });
}

export const WOOD_RIVER_TM_B1_PACKAGE_NOTE =
  "Wood River T&M (Union_TM) Exhibit B-1 craft sheets — Pay Tax FICA-MC / FUI / SUI, Ins, Misc, O/H, Profit, and Fringes Subtotal as $/hr hall by hall. Union halls expose a single Fringes Subtotal (no H&W/Pension component columns on this workbook face) — not invented RRFF splits or a placeholder Illinois composite. Merit Staff keeps named 401K / Health / Vacation / Holiday Sick Pay lines from the file. Separate labor-burden book from RRFF — never mix wages or burden. Does not write live Rate Tables.";

export function woodRiverTmHallSheetKind(sheet: string, group: string) {
  return /staff/i.test(`${sheet} ${group}`) ? "staff-ocip" : "craft";
}

/** Compact Rate Vault package derived from the Union_TM extract. No workbook bytes. */
export function buildWoodRiverTmB1PreviewSource() {
  const craftSheets = woodRiverTmB1CraftSheets();
  const rows = woodRiverTmB1SeedRows();
  return {
    id: "wood-river-tm-b1-preview",
    title: extract.title,
    siteId: "wood-river" as const,
    sourceId: extract.driveId,
    sourceTitle: extract.title,
    effective: null as string | null,
    revision: null as string | null,
    extractedFrom: "wood-river-tm-b1-extract",
    note: WOOD_RIVER_TM_B1_PACKAGE_NOTE,
    writesRateBook: false,
    fixture: true,
    bookFace: "tm" as const,
    ocipFace: "both" as const,
    sheets: [
      { name: "Rate Summary", kind: "rate-summary" },
      { name: "Burden Summary", kind: "burden-summary" },
      { name: "Fringes", kind: "fringes" },
      ...craftSheets.map((sheet) => ({
        name: sheet.sheet,
        kind: woodRiverTmHallSheetKind(sheet.sheet, sheet.group),
      })),
    ],
    craftSheets,
    rows,
  };
}

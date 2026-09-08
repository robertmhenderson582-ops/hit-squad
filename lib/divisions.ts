import {
  canSeeCompany,
  companyIdFromName,
  isCompanyId,
  isRetiredPeerCompany,
  isStandaloneId,
  type CompanyId,
  type CompanyScope,
} from "./companies.ts";

/** P66 Wood River is the default desk mold for every new division / site. */
export const WOOD_RIVER_MOLD_ID = "wood-river";

export const WOOD_RIVER_MOLD = {
  id: WOOD_RIVER_MOLD_ID,
  label: "P66 Wood River",
  crew: "five-card",
  layout: "estimate",
  rates: "rate-sheet",
  tabs: "Jobs→estimate",
  note: "Same five-card crew, estimate layout, rate-sheet, and Jobs→estimate tabs. Rodeo paste, Ferndale GEP, and client forms stay additive tabs — not a different program per division.",
} as const;

export type DivisionMoldId = typeof WOOD_RIVER_MOLD_ID;

export type Division = {
  id: string;
  companyId: CompanyId;
  name: string;
  /** Madison seeds: 307000 / 303000 / 305000. Optional on company-owned rows. */
  code: string;
  mold: DivisionMoldId;
  seed?: boolean;
};

export const MECHANICAL_DIVISION_ID = "mechanical";
export const POWER_DIVISION_ID = "power";
export const PULP_AND_PAPER_DIVISION_ID = "pulp-and-paper";

export const MADISON_SEED_DIVISIONS: Division[] = [
  {
    id: MECHANICAL_DIVISION_ID,
    companyId: "madison",
    name: "Mechanical",
    code: "307000",
    mold: WOOD_RIVER_MOLD_ID,
    seed: true,
  },
  {
    id: POWER_DIVISION_ID,
    companyId: "madison",
    name: "Power",
    code: "303000",
    mold: WOOD_RIVER_MOLD_ID,
    seed: true,
  },
  {
    id: PULP_AND_PAPER_DIVISION_ID,
    companyId: "madison",
    name: "Pulp and Paper",
    code: "305000",
    mold: WOOD_RIVER_MOLD_ID,
    seed: true,
  },
];

export const MADISON_SEED_DIVISION_IDS = MADISON_SEED_DIVISIONS.map((row) => row.id);

export const DIVISION_ID_RE = /^[a-z][a-z0-9-]{0,39}$/;
export const DIVISION_CODE_RE = /^[A-Za-z0-9]{2,12}$/;

export function divisionKey(companyId: string, divisionId: string) {
  return `${companyId}:${divisionId}`;
}

export function isDivisionId(value: string): boolean {
  return DIVISION_ID_RE.test(value.trim());
}

export function divisionIdFromName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export function normalizeDivisionCode(value?: string | null): string {
  return (value ?? "").trim().replace(/\s+/g, "");
}

export function parseDivisionCode(value?: string | null): { code: string } | { error: string } {
  const code = normalizeDivisionCode(value);
  if (!code) return { code: "" };
  if (!DIVISION_CODE_RE.test(code)) return { error: "Use a short division code." };
  return { code };
}

export function parseDivisionName(value?: string | null): { name: string } | { error: string } {
  const name = (value ?? "").trim().replace(/\s+/g, " ");
  if (name.length < 2) return { error: "Type a division name." };
  if (name.length > 80) return { error: "That name is too long." };
  const id = divisionIdFromName(name);
  if (!isDivisionId(id) || isStandaloneId(id) || isRetiredPeerCompany(id)) {
    return { error: "Type a division name." };
  }
  return { name };
}

function haystack(...parts: Array<string | undefined | null>) {
  return parts
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Map live Madison plant work without writing divisionId onto packs.
 * Georgia Power / Yates is Power. P66 + Monroe industrial plants are Mechanical.
 * Pulp and Paper stays empty until a real mill is added — do not invent plants.
 */
export function inferDivisionId(
  companyId: string | undefined | null,
  ...parts: Array<string | undefined | null>
): string {
  if ((companyId ?? "").trim() !== "madison") return "";
  const hay = haystack(...parts);
  if (/pulp|paper|kraft/.test(hay)) return PULP_AND_PAPER_DIVISION_ID;
  if (/georgia power|\byates\b|\bbowen\b|\bscherer\b/.test(hay)) return POWER_DIVISION_ID;
  return MECHANICAL_DIVISION_ID;
}

export function hydrateDivision(raw: unknown): Division | null {
  const row = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const companyId = typeof row.companyId === "string" ? row.companyId.trim() : "";
  const name = typeof row.name === "string" ? row.name.trim().replace(/\s+/g, " ") : "";
  const idRaw = typeof row.id === "string" ? row.id.trim() : divisionIdFromName(name);
  if (!isCompanyId(companyId) || isStandaloneId(companyId) || isRetiredPeerCompany(companyId)) return null;
  if (!isDivisionId(idRaw) || !name) return null;
  const parsedCode = parseDivisionCode(typeof row.code === "string" ? row.code : "");
  if ("error" in parsedCode) return null;
  return {
    id: idRaw,
    companyId,
    name,
    code: parsedCode.code,
    mold: WOOD_RIVER_MOLD_ID,
    ...(row.seed === true ? { seed: true } : {}),
  };
}

export function divisionOverlay(row: Division): Division {
  return {
    id: row.id,
    companyId: row.companyId,
    name: row.name,
    code: row.code,
    mold: WOOD_RIVER_MOLD_ID,
    ...(row.seed ? { seed: true } : {}),
  };
}

export function seedDivisions(): Division[] {
  return MADISON_SEED_DIVISIONS.map(divisionOverlay);
}

/** Seeds plus company-owned overlays. Tombstones hide a seed without smashing live packs. */
export function mergeDivisions(stored: Division[] = [], removedKeys: string[] = []): Division[] {
  const removed = new Set(removedKeys.map((key) => key.trim()).filter(Boolean));
  const seen = new Map<string, Division>();
  for (const seed of seedDivisions()) {
    if (removed.has(divisionKey(seed.companyId, seed.id))) continue;
    seen.set(divisionKey(seed.companyId, seed.id), seed);
  }
  for (const row of stored) {
    const next = hydrateDivision(row);
    if (!next) continue;
    const key = divisionKey(next.companyId, next.id);
    if (removed.has(key)) continue;
    const prev = seen.get(key);
    seen.set(key, {
      ...next,
      mold: WOOD_RIVER_MOLD_ID,
      seed: Boolean(prev?.seed || next.seed),
    });
  }
  return [...seen.values()].sort((a, b) => {
    if (a.companyId !== b.companyId) return a.companyId.localeCompare(b.companyId);
    const aIdx = MADISON_SEED_DIVISION_IDS.indexOf(a.id);
    const bIdx = MADISON_SEED_DIVISION_IDS.indexOf(b.id);
    const aRank = a.companyId === "madison" && aIdx !== -1 ? aIdx : 100;
    const bRank = b.companyId === "madison" && bIdx !== -1 ? bIdx : 100;
    if (aRank !== bRank) return aRank - bRank;
    return a.name.localeCompare(b.name);
  });
}

export function divisionsForCompany(companyId: string, catalog: Division[] = seedDivisions()): Division[] {
  return catalog.filter((row) => row.companyId === companyId);
}

export function divisionsForScope(scope: CompanyScope | null | undefined, catalog: Division[] = seedDivisions()): Division[] {
  return catalog.filter((row) => canSeeCompany(scope, row.companyId));
}

export function uniqueDivisionId(name: string, existing: Division[], companyId: string): string {
  let id = divisionIdFromName(name) || companyIdFromName(name);
  if (!isDivisionId(id)) id = "division";
  if (!existing.some((row) => row.companyId === companyId && row.id === id)) return id;
  let n = 2;
  while (existing.some((row) => row.companyId === companyId && row.id === `${id}${n}`)) n += 1;
  return `${id}${n}`;
}

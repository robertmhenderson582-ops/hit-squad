import { LISTED_POSITIONS } from "./craft-labor.ts";
import { computeRangeHours } from "./hours-clock.ts";
import type { StorageLike } from "./local-estimates.ts";
import { liveJobSetupPhases, maskForPhaseDays, PHASE_IDS, PHASE_NAMES, type PhaseRow } from "./phase-schedule.ts";
import { resolvedCrafts } from "./rate-books.ts";
import { lookupShahanLabor, uniqueSortedTitles } from "./shahan-wood-river.ts";
import {
  bookForSite,
  bookForSiteId,
  estimateRateContext,
  wageLookupOpts,
  wageLookupPositions,
} from "./wage-lookup.ts";

/** Locked craft rate column — schedule-weighted ST/OT/DT, not billed ST. */
export const SCR_COMPOSITE_RATE_LABEL = "Composite $/hr";
export const SCR_COMPOSITE_RATE_HEADER = "COMPOSITE $/HR";
export const SCR_COMPOSITE_RATE_NOTE =
  "Schedule-weighted composite from the craft's ST/OT/DT for the active phase or shift — not billed ST alone.";

/** Job-pack / Rate Vault / plant-book composite ST/OT/DT. Do not invent rates. */
export function scrCompositeRates(craft: string, site = "", client = "") {
  const title = craft.trim();
  if (!title) return { st: 0, ot: 0, dt: 0 };
  const fromBook = wageLookupPositions(site, client).find((row) => row.title === title);
  const billed = lookupShahanLabor(title, wageLookupOpts(site));
  return {
    st: Math.max(0, Number(fromBook?.st) || Number(billed?.st) || 0),
    ot: Math.max(0, Number(fromBook?.ot) || Number(billed?.ot) || 0),
    dt: Math.max(0, Number(fromBook?.dt) || Number(billed?.dt) || 0),
  };
}

function trimmedTitles(titles: readonly string[]) {
  return titles.map((title) => title.trim()).filter(Boolean);
}

/** Rate Vault / builder crafts for this site. Empty when no live builder book. */
export function scrRateVaultTitles(site = "", client = "", store?: StorageLike | null) {
  const ctx = estimateRateContext(site, client);
  if (!ctx.siteId) return [];
  return trimmedTitles(resolvedCrafts(ctx.companyId, ctx.siteId, undefined, store).map((row) => row.craft));
}

/** Full plant billed labor catalog titles — not the COMP wage-only subset. */
export function scrPlantBilledTitles(site = "", client = "") {
  if (!site.trim() && !client.trim()) return [];
  const ctx = estimateRateContext(site, client);
  const plant = bookForSite(site) || bookForSite(client) || bookForSiteId(ctx.siteId);
  if (!plant?.catalog.length) return [];
  return trimmedTitles(plant.catalog.map((row) => row.craftName || ""));
}

/**
 * SCR craft picker. Wage lookup stays wage-catalog-first; this list does not.
 * 1. Live Rate Vault / builder crafts when present
 * 2. Estimate crew extras
 * 3. Full plant billed catalog as fill-in
 * 4. Static LISTED_POSITIONS only if nothing else resolves
 */
export function scrCraftOptions(
  site = "",
  client = "",
  extra: readonly string[] = [],
  store?: StorageLike | null,
) {
  const vault = scrRateVaultTitles(site, client, store);
  const extras = trimmedTitles(extra);
  const plant = scrPlantBilledTitles(site, client);
  if (vault.length || plant.length) {
    return uniqueSortedTitles([...vault, ...extras, ...plant]);
  }
  return uniqueSortedTitles([...LISTED_POSITIONS, ...extras]);
}

/** Optional schedule-impact presets. Same list on every client / site. */
export const SCR_SHIFT_PRESETS = [
  { id: "5x8", label: "5×8s", daysPerWeek: 5, hoursPerDay: 8, otAfter8: true },
  { id: "4x10", label: "4×10s", daysPerWeek: 4, hoursPerDay: 10, otAfter8: true },
  { id: "6x10", label: "6×10s", daysPerWeek: 6, hoursPerDay: 10, otAfter8: true },
  { id: "7x10", label: "7×10s", daysPerWeek: 7, hoursPerDay: 10, otAfter8: true },
  { id: "6x12", label: "6×12s", daysPerWeek: 6, hoursPerDay: 12, otAfter8: true },
  { id: "7x12", label: "7×12s", daysPerWeek: 7, hoursPerDay: 12, otAfter8: true },
] as const;

export type ScrShiftId = (typeof SCR_SHIFT_PRESETS)[number]["id"];

export type ScrSchedulePick = {
  daysPerWeek: number;
  hoursPerDay: number;
  otAfter8: boolean;
  phaseId?: string;
  label: string;
};

const SAMPLE_WEEK = { start: "2026-09-07", end: "2026-09-13" } as const;

function cents(value: number) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

export function scrShiftById(id: string | undefined) {
  return SCR_SHIFT_PRESETS.find((item) => item.id === id);
}

export function scrShiftLabel(id: string | undefined) {
  return scrShiftById(id)?.label || "";
}

export function scrPhaseOptions(schedule?: {
  multiUnits?: boolean;
  phases?: PhaseRow[];
  units?: Array<{ phases?: PhaseRow[] }>;
}): Array<{ id: string; name: string; daysPerWeek: number; hoursPerDay: number; otAfter8: boolean }> {
  const live = liveJobSetupPhases(schedule);
  if (live.length) {
    const seen = new Set<string>();
    return live
      .filter((row) => {
        if (seen.has(row.id)) return false;
        seen.add(row.id);
        return true;
      })
      .map((row) => ({
        id: row.id,
        name: row.name || PHASE_NAMES[row.id] || row.id,
        daysPerWeek: row.daysPerWeek,
        hoursPerDay: row.hoursPerDay,
        otAfter8: row.otAfter8,
      }));
  }
  return PHASE_IDS.map((id) => ({
    id,
    name: PHASE_NAMES[id],
    daysPerWeek: id === "pre" ? 4 : id === "post" ? 5 : id === "mech" ? 6 : 7,
    hoursPerDay: id === "post" ? 8 : id === "pre" || id === "mech" ? 10 : 12,
    otAfter8: id === "post",
  }));
}

export function scrActiveSchedule(
  row: { phaseId?: string; scheduleImpact?: boolean; shiftId?: string },
  phases: Array<{ id: string; name?: string; daysPerWeek: number; hoursPerDay: number; otAfter8: boolean }> = [],
): ScrSchedulePick {
  if (row.scheduleImpact) {
    const shift = scrShiftById(row.shiftId);
    if (shift) {
      return {
        daysPerWeek: shift.daysPerWeek,
        hoursPerDay: shift.hoursPerDay,
        otAfter8: shift.otAfter8,
        phaseId: row.phaseId,
        label: shift.label,
      };
    }
  }
  const phase = phases.find((item) => item.id === row.phaseId);
  if (phase) {
    return {
      daysPerWeek: phase.daysPerWeek,
      hoursPerDay: phase.hoursPerDay,
      otAfter8: phase.otAfter8,
      phaseId: phase.id,
      label: `${phase.name || phase.id} · ${phase.daysPerWeek}×${phase.hoursPerDay}s`,
    };
  }
  return { daysPerWeek: 5, hoursPerDay: 8, otAfter8: true, phaseId: row.phaseId, label: "5×8s" };
}

export function scrWeekSplit(
  schedule: Pick<ScrSchedulePick, "daysPerWeek" | "hoursPerDay" | "otAfter8" | "phaseId">,
  site = "",
  client = "",
  craft = "Craft",
) {
  const hours = computeRangeHours({
    position: craft.trim() || "Craft",
    site,
    client,
    start: SAMPLE_WEEK.start,
    end: SAMPLE_WEEK.end,
    hoursPerShift: schedule.hoursPerDay,
    days: maskForPhaseDays(schedule.daysPerWeek),
    otAfter8: schedule.otAfter8,
    phaseId: schedule.phaseId,
  });
  return { st: hours.st, ot: hours.ot, dt: hours.dt, hours: hours.hours };
}

/** Locked display $/hr — plant-book ST/OT/DT weighted by the active phase or shift week. */
export function scrCompositeHourlyRate(
  craft: string,
  site = "",
  client = "",
  schedule: Pick<ScrSchedulePick, "daysPerWeek" | "hoursPerDay" | "otAfter8" | "phaseId">,
) {
  const book = scrCompositeRates(craft, site, client);
  if (!craft.trim()) return 0;
  const split = scrWeekSplit(schedule, site, client, craft);
  const hours = split.st + split.ot + split.dt;
  if (!hours) return cents(book.st);
  return cents((split.st * book.st + split.ot * book.ot + split.dt * book.dt) / hours);
}

export function recomputeScrCraftRates<T extends { craft: string; rate: number }>(
  lines: T[],
  site: string,
  client: string,
  schedule: Pick<ScrSchedulePick, "daysPerWeek" | "hoursPerDay" | "otAfter8" | "phaseId">,
): T[] {
  return lines.map((line) => ({
    ...line,
    rate: line.craft.trim() ? scrCompositeHourlyRate(line.craft, site, client, schedule) : line.rate,
  }));
}

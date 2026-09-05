import { computeRowHours, sumSplits } from "./hours-clock.ts";
import { CREW_STORE_PREFIX } from "./phase-schedule.ts";
import type { CraftRow } from "./craft-labor.ts";
import type { EstimateRecord, SiteRecord } from "./types.ts";

type CrewLanes = {
  staff?: CraftRow[];
  generalForeman?: CraftRow[];
  foreman?: CraftRow[];
  direct?: CraftRow[];
};

export function craftRowsFromCrew(crew: CrewLanes): CraftRow[] {
  return [...(crew.staff ?? []), ...(crew.generalForeman ?? []), ...(crew.foreman ?? []), ...(crew.direct ?? [])];
}

export function hoursFromCrewRows(rows: CraftRow[], site = "", client = "", holidays: string[] = []) {
  return sumSplits(rows.map((row) => computeRowHours(row, site, client, false, "", holidays))).hours;
}

export function readStoredCrew(estimateKey: string): CrewLanes {
  if (typeof window === "undefined" || !estimateKey) return {};
  try {
    const raw = window.localStorage.getItem(`${CREW_STORE_PREFIX}${estimateKey}`);
    if (!raw) return {};
    return JSON.parse(raw) as CrewLanes;
  } catch {
    return {};
  }
}

export function storedCrewHours(estimateKey: string, site = "", client = "") {
  return hoursFromCrewRows(craftRowsFromCrew(readStoredCrew(estimateKey)), site, client);
}

export function deskStoredCrewHours(estimates: EstimateRecord[], sites: SiteRecord[]) {
  return estimates.reduce((sum, row) => {
    const site = sites.find((item) => item.id === row.siteId);
    return sum + storedCrewHours(row.id, site?.name ?? row.unit, row.client);
  }, 0);
}

import { canSeeCompany, companyScopeFor, type CompanyScope } from "./companies.ts";
import { hasBuildDesk, isOwner } from "./desk-role.ts";
import { QUALITY_BRIEFS_VAULT_NAME, QUALITY_BRIEFS_VAULT_KIND } from "./drive-data.ts";
import type { PublicLeadBrief } from "./lead-briefs.ts";
import { PHASE_IDS, PHASE_NAMES, type PhaseRow } from "./phase-schedule.ts";

export const QUALITY_DAY1_LABEL = "Quality Day-1";
export const QUALITY_LIVE_NOTE = "This job is live for Quality. Inspection plan, weld map, and traveler count sit on this package.";

export type QualityDay1 = {
  inspectionPlan: boolean;
  weldMap: boolean;
  travelerCount: string;
};

export function emptyQualityDay1(): QualityDay1 {
  return { inspectionPlan: false, weldMap: false, travelerCount: "" };
}

export function hydrateQualityDay1(raw: Partial<QualityDay1> | Record<string, unknown> | null | undefined): QualityDay1 {
  const row = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    inspectionPlan: Boolean(row.inspectionPlan),
    weldMap: Boolean(row.weldMap),
    travelerCount: typeof row.travelerCount === "string" ? row.travelerCount : row.travelerCount != null ? String(row.travelerCount) : "",
  };
}

/** Phase / work names only. No invented hold points. */
export function qualityWorkNames(phases: PhaseRow[] = []) {
  return PHASE_IDS.filter((id) => phases.some((phase) => phase.id === id && phase.on)).map((id) => PHASE_NAMES[id]);
}

export function qualityLive(status = "") {
  return status === "Awarded" || status === "Submitted" || status === "Estimate";
}

export function qualityNotify(status = "") {
  return status === "Awarded";
}

export function canSeeMadisonManuals(
  user?: { email?: string; role?: string } | null,
  scope?: CompanyScope | null,
) {
  if (isOwner(user) || hasBuildDesk(user)) return true;
  const next = scope ?? companyScopeFor(user);
  return canSeeCompany(next, "madison");
}

const VAULT_LEAK =
  /quality-briefs\.json|hse-briefs\.json|1y6Q3TOnpXzV|1zYl2dEvW21|drive\.google\.com|vault id|owner vault|\/tmp\/hit-squad/i;

export function qualitySurfaceLeaks(payload: unknown) {
  return VAULT_LEAK.test(JSON.stringify(payload ?? ""));
}

/** Names only. Never vault ids, bytes, or other testers' drops. */
export function publicQualityDrops(briefs: PublicLeadBrief[], who?: string): Array<{ name: string; files: string[] }> {
  const key = (who || "").trim().toLowerCase();
  return briefs
    .filter((brief) => !key || brief.who === key)
    .map((brief) => ({
      name: brief.describe || "Quality brief",
      files: brief.files.map((file) => file.name).filter(Boolean),
    }));
}

export function madisonManualLabel(kind: "quality" | "hse") {
  return kind === "hse" ? "Madison Safety Manual / HES SOPs" : "Madison QC manuals";
}

export function qualityPackageForSeat(
  pack: QualityDay1,
  user?: { email?: string; role?: string } | null,
  scope?: CompanyScope | null,
) {
  const surface = {
    inspectionPlan: pack.inspectionPlan,
    weldMap: pack.weldMap,
    travelerCount: pack.travelerCount,
    manuals: canSeeMadisonManuals(user, scope) ? [madisonManualLabel("quality")] : [],
  };
  if (qualitySurfaceLeaks(surface)) {
    return { inspectionPlan: pack.inspectionPlan, weldMap: pack.weldMap, travelerCount: pack.travelerCount, manuals: [] as string[] };
  }
  return surface;
}

export const QUALITY_VAULT_NAMES = {
  file: QUALITY_BRIEFS_VAULT_NAME,
  kind: QUALITY_BRIEFS_VAULT_KIND,
};

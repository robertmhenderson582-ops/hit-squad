import { canSeeCompany, companyScopeFor, type CompanyScope } from "./companies.ts";
import { hasBuildDesk, isOwner } from "./desk-role.ts";
import type { PublicLeadBrief } from "./lead-briefs.ts";
import { PHASE_IDS, PHASE_NAMES, type PhaseRow } from "./phase-schedule.ts";

export const QUALITY_DAY1_LABEL = "Quality Day-1";
export const QUALITY_LIVE_NOTE = "This job is live for Quality. Named forms and the rolling chart sit on this module.";

/** Chance’s 2.7.x Day-1 package. Names only — files stay in the owner vault. Do not invent extra numbers. */
export const QUALITY_PACKAGE_FORMS = [
  { id: "2.7.1", label: "2.7.1 Madison Pressure Test Record Rev 2" },
  { id: "2.7.11", label: "2.7.11 Madison Document Transmittal Form Rev. 2" },
  { id: "2.7.17", label: "2.7.17 ROD Issue Form Rev. 4" },
  { id: "2.7.19", label: "2.7.19 Madison Flange Log Rev.1" },
  { id: "2.7.22", label: "2.7.22 Weld Test Instruction Form Rev. 8" },
  { id: "2.7.34", label: "2.7.34 Job Completion Sign-off Form Rev 2" },
  { id: "2.7.5", label: "2.7.5 Madison Punch List Rev. 1" },
  { id: "nde-req", label: "NDE req spreadsheet" },
] as const;

export type QualityFormId = (typeof QUALITY_PACKAGE_FORMS)[number]["id"];

export type QualityFormSlot = {
  marked: boolean;
  fill: string;
  count: string;
};

export type QualityDay1 = {
  inspectionPlan: boolean;
  weldMap: boolean;
  travelerCount: string;
  forms: Partial<Record<QualityFormId, QualityFormSlot>>;
};

export function emptyQualityFormSlot(): QualityFormSlot {
  return { marked: false, fill: "", count: "" };
}

export function emptyQualityDay1(): QualityDay1 {
  return { inspectionPlan: false, weldMap: false, travelerCount: "", forms: {} };
}

function hydrateFormSlot(raw: unknown): QualityFormSlot {
  const row = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    marked: Boolean(row.marked),
    fill: typeof row.fill === "string" ? row.fill : "",
    count: typeof row.count === "string" ? row.count : row.count != null ? String(row.count) : "",
  };
}

export function hydrateQualityDay1(raw: Partial<QualityDay1> | Record<string, unknown> | null | undefined): QualityDay1 {
  const row = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const incoming = row.forms && typeof row.forms === "object" ? (row.forms as Record<string, unknown>) : {};
  const forms: Partial<Record<QualityFormId, QualityFormSlot>> = {};
  for (const item of QUALITY_PACKAGE_FORMS) {
    if (incoming[item.id] == null) continue;
    const slot = hydrateFormSlot(incoming[item.id]);
    if (slot.marked || slot.fill.trim() || slot.count.trim()) forms[item.id] = slot;
  }
  return {
    inspectionPlan: Boolean(row.inspectionPlan),
    weldMap: Boolean(row.weldMap),
    travelerCount: typeof row.travelerCount === "string" ? row.travelerCount : row.travelerCount != null ? String(row.travelerCount) : "",
    forms,
  };
}

export function qualityFormSlot(pack: QualityDay1, id: QualityFormId): QualityFormSlot {
  return pack.forms[id] ?? emptyQualityFormSlot();
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
  /quality-briefs\.json|hse-briefs\.json|1y6Q3TOnpXzV|1zYl2dEvW21|1k4xceUc5ihDuzSf7opdjEzwnt2ODJomC|drive\.google\.com|vault id|owner vault|\/tmp\/hit-squad/i;

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
    forms: QUALITY_PACKAGE_FORMS.map((item) => ({
      id: item.id,
      label: item.label,
      ...qualityFormSlot(pack, item.id),
    })),
    manuals: canSeeMadisonManuals(user, scope) ? [madisonManualLabel("quality")] : [],
  };
  if (qualitySurfaceLeaks(surface)) {
    return {
      inspectionPlan: pack.inspectionPlan,
      weldMap: pack.weldMap,
      travelerCount: pack.travelerCount,
      forms: QUALITY_PACKAGE_FORMS.map((item) => ({
        id: item.id,
        label: item.label,
        ...qualityFormSlot(pack, item.id),
      })),
      manuals: [] as string[],
    };
  }
  return surface;
}

export const QUALITY_VAULT_NAMES = {
  file: "quality-briefs.json",
  kind: "quality-briefs",
};

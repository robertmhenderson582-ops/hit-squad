import { canSeeCompany, companyScopeFor, type CompanyScope } from "./companies.ts";
import { hasBuildDesk, isOwner } from "./desk-role.ts";
import { qualitySurfaceLeaks } from "./quality-day1.ts";
import { PHASE_IDS, PHASE_NAMES, type PhaseRow } from "./phase-schedule.ts";

export const HSE_DAY1_LABEL = "HSE Day-1";
export const HSE_LIVE_NOTE = "This job is live for HSE. Mark the package and type talks, permits, and observations on this module.";

/** Empty slots until they fill. Do not invent a 29.1 sling form. */
export const HSE_PACKAGE_SLOTS = [
  { id: "orientation", label: "Site orientation" },
  { id: "jsa", label: "JSA" },
  { id: "toolbox", label: "Toolbox talk" },
  { id: "hot-work", label: "Hot work" },
  { id: "confined", label: "Confined space" },
  { id: "loto", label: "LOTO" },
  { id: "excavation", label: "Excavation" },
] as const;

export type HseSlotId = (typeof HSE_PACKAGE_SLOTS)[number]["id"];

export type HseSlot = {
  status: string;
  date: string;
  note: string;
  marked: boolean;
};

export const HSE_SLOT_STATUSES = [
  { id: "", label: "Blank" },
  { id: "complete", label: "Complete" },
  { id: "in-progress", label: "In progress" },
  { id: "scheduled", label: "Scheduled" },
  { id: "na", label: "N/A" },
] as const;

export function hseSlotMarked(status: string) {
  return status === "complete" || status === "in-progress";
}

export type HseDay1 = {
  slots: Partial<Record<HseSlotId, HseSlot>>;
};

export type HseJobSnapshot = {
  plant: string;
  phases: string[];
  crafts: string[];
  equipment: string[];
  subs: string[];
  hours: number;
};

export function emptyHseDay1(): HseDay1 {
  return { slots: {} };
}

export function emptyHseSlot(): HseSlot {
  return { status: "", date: "", note: "", marked: false };
}

function hydrateHseSlot(raw: unknown): HseSlot | null {
  if (typeof raw === "string") {
    const note = raw.trim();
    return note ? { status: "complete", date: "", note, marked: true } : null;
  }
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const note = typeof row.note === "string" ? row.note : typeof row.value === "string" ? row.value : "";
  const date = typeof row.date === "string" ? row.date : "";
  const statusRaw = typeof row.status === "string" ? row.status : "";
  const markedLegacy = Boolean(row.marked);
  const status =
    statusRaw ||
    (markedLegacy && note.trim() ? "complete" : markedLegacy ? "in-progress" : "");
  const marked = hseSlotMarked(status) || (markedLegacy && Boolean(note.trim()));
  if (!status && !date.trim() && !note.trim() && !marked) return null;
  return { status, date, note, marked };
}

export function hydrateHseDay1(raw: Partial<HseDay1> | Record<string, unknown> | null | undefined): HseDay1 {
  const row = (raw && typeof raw === "object" ? raw : {}) as { slots?: Record<string, unknown> };
  const slots: Partial<Record<HseSlotId, HseSlot>> = {};
  const incoming = row.slots && typeof row.slots === "object" ? row.slots : {};
  for (const item of HSE_PACKAGE_SLOTS) {
    const slot = hydrateHseSlot(incoming[item.id]);
    if (slot) slots[item.id] = slot;
  }
  return { slots };
}

export function hseSlot(pack: HseDay1, id: HseSlotId): HseSlot {
  return pack.slots[id] ?? emptyHseSlot();
}

/** Estimate → HSE notify hinge. Kept inactive. Do not delete. */
export function hseNotify(status = "") {
  return status === "Awarded";
}

export function canSeeHesRoster(user?: { role?: string } | null) {
  return isOwner(user) || hasBuildDesk(user);
}

export function canSeeMadisonSafetyManuals(
  user?: { email?: string; role?: string } | null,
  scope?: CompanyScope | null,
) {
  if (isOwner(user) || hasBuildDesk(user)) return true;
  const next = scope ?? companyScopeFor(user);
  return canSeeCompany(next, "madison");
}

export function hseWorkNames(phases: PhaseRow[] = []) {
  return PHASE_IDS.filter((id) => phases.some((phase) => phase.id === id && phase.on)).map((id) => PHASE_NAMES[id]);
}

export function hseJobSnapshot(input: {
  plant?: string;
  phases?: PhaseRow[];
  crafts?: string[];
  equipment?: string[];
  subs?: string[];
  hours?: number;
}): HseJobSnapshot {
  return {
    plant: (input.plant || "").trim(),
    phases: hseWorkNames(input.phases ?? []),
    crafts: (input.crafts ?? []).map((name) => name.trim()).filter(Boolean),
    equipment: (input.equipment ?? []).map((name) => name.trim()).filter(Boolean),
    subs: (input.subs ?? []).map((name) => name.trim()).filter(Boolean),
    hours: Math.max(0, Number(input.hours) || 0),
  };
}

/** No scoreboard until real hours exist. Never invent hours. */
export function hseScoreboardHours(hours: number) {
  return hours > 0 ? hours : null;
}

export function hsePackageForSeat(
  pack: HseDay1,
  snapshot: HseJobSnapshot,
  user?: { email?: string; role?: string } | null,
  scope?: CompanyScope | null,
) {
  const surface = {
    slots: HSE_PACKAGE_SLOTS.map((item) => ({
      id: item.id,
      label: item.label,
      status: hseSlot(pack, item.id).status,
      date: hseSlot(pack, item.id).date,
      marked: hseSlot(pack, item.id).marked,
      note: hseSlot(pack, item.id).note,
      value: hseSlot(pack, item.id).note,
    })),
    plant: snapshot.plant,
    phases: snapshot.phases,
    crafts: snapshot.crafts,
    equipment: snapshot.equipment,
    subs: snapshot.subs,
    hours: hseScoreboardHours(snapshot.hours),
    manuals: canSeeMadisonSafetyManuals(user, scope) ? ["Madison Safety Manual / HES SOPs"] : [],
    hesRoster: canSeeHesRoster(user),
  };
  if (qualitySurfaceLeaks(surface) || /29\.1|sling form/i.test(JSON.stringify(surface))) {
    return { ...surface, manuals: [] as string[], hesRoster: canSeeHesRoster(user) };
  }
  return surface;
}

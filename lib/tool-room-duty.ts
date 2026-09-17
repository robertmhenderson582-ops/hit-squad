import { canAssignSitePeople, type ModuleAccessUser } from "./module-access.ts";
import { addDays, formatYmd, liveJobSetupPhases, parseYmd, PHASE_STORE_PREFIX, type PhaseScheduleState } from "./phase-schedule.ts";
import { fieldAccessTimeboxedFor, normalizeSiteId } from "./site-access.ts";

export const TOOL_ROOM_AFTER_POST_DAYS = 14;
export const TOOL_ROOM_OWNER_PM_COPY = "Owner and Project Manager seats are not time-boxed.";
export const TOOL_ROOM_WINDOW_COPY =
  "General Foreman → Tool Room attendant. PM sets the window. Default is Job Setup Post end plus about two weeks.";

export type ToolRoomDuty = {
  id: string;
  siteId: string;
  email: string;
  name: string;
  fromGf: true;
  timeboxed: boolean;
  startYmd: string | null;
  endYmd: string | null;
  assignedByEmail: string;
  createdAt: number;
};

export function toolRoomDutyId(siteId: string, email: string): string {
  return `${normalizeSiteId(siteId)}::tool-room::${email.trim().toLowerCase()}`;
}

export function defaultToolRoomWindow(postEndYmd?: string | null, todayYmd?: string): { start: string; end: string } {
  const today = todayYmd && parseYmd(todayYmd) ? todayYmd : formatYmd(new Date());
  const start = postEndYmd && parseYmd(postEndYmd) ? postEndYmd : today;
  return { start, end: addDays(start, TOOL_ROOM_AFTER_POST_DAYS) };
}

export function latestJobSetupPostEnd(packs: Array<{ schedule?: unknown }> = []): string | null {
  let latest: string | null = null;
  for (const pack of packs) {
    const phases = liveJobSetupPhases(pack.schedule as PhaseScheduleState | undefined);
    for (const phase of phases) {
      if (phase.id !== "post" || !phase.stop || !parseYmd(phase.stop)) continue;
      if (!latest || phase.stop > latest) latest = phase.stop;
    }
  }
  return latest;
}

function schedulesFromStore(
  packs: Array<{ key?: string; schedule?: unknown }> = [],
  store?: { getItem(key: string): string | null } | null,
): Array<{ schedule?: unknown }> {
  return packs.map((pack) => {
    if (pack.schedule) return { schedule: pack.schedule };
    if (!store || !pack.key) return {};
    try {
      const raw = store.getItem(`${PHASE_STORE_PREFIX}${pack.key}`);
      return raw ? { schedule: JSON.parse(raw) } : {};
    } catch {
      return {};
    }
  });
}

export function latestJobSetupPostEndFromStore(
  packs: Array<{ key?: string; schedule?: unknown }> = [],
  store?: { getItem(key: string): string | null } | null,
): string | null {
  return latestJobSetupPostEnd(schedulesFromStore(packs, store));
}

export function earliestJobSetupStart(packs: Array<{ schedule?: unknown }> = []): string | null {
  let earliest: string | null = null;
  for (const pack of packs) {
    const phases = liveJobSetupPhases(pack.schedule as PhaseScheduleState | undefined);
    for (const phase of phases) {
      if (!phase.start || !parseYmd(phase.start)) continue;
      if (!earliest || phase.start < earliest) earliest = phase.start;
    }
  }
  return earliest;
}

export function earliestJobSetupStartFromStore(
  packs: Array<{ key?: string; schedule?: unknown }> = [],
  store?: { getItem(key: string): string | null } | null,
): string | null {
  return earliestJobSetupStart(schedulesFromStore(packs, store));
}

/** Same band as site-access grants: GF → Tool Room attendant only. Owner/PM never. */
export function toolRoomTimeboxedFor(user?: ModuleAccessUser | null): boolean {
  return fieldAccessTimeboxedFor(user);
}

export function createToolRoomDuty(input: {
  siteId: string;
  email: string;
  name?: string;
  assignedByEmail: string;
  assignee?: ModuleAccessUser | null;
  startYmd?: string | null;
  endYmd?: string | null;
  postEndYmd?: string | null;
  todayYmd?: string;
  now?: number;
}): ToolRoomDuty {
  const email = input.email.trim().toLowerCase();
  const siteId = normalizeSiteId(input.siteId);
  const timeboxed = toolRoomTimeboxedFor(input.assignee);
  const fallback = defaultToolRoomWindow(input.postEndYmd, input.todayYmd);
  const start = input.startYmd && parseYmd(input.startYmd) ? input.startYmd : fallback.start;
  const end = input.endYmd && parseYmd(input.endYmd) ? input.endYmd : fallback.end;
  return {
    id: toolRoomDutyId(siteId, email),
    siteId,
    email,
    name: (input.name || "").trim(),
    fromGf: true,
    timeboxed,
    startYmd: timeboxed ? start : null,
    endYmd: timeboxed ? end : null,
    assignedByEmail: input.assignedByEmail.trim().toLowerCase(),
    createdAt: input.now ?? Date.now(),
  };
}

export function parseToolRoomDuty(raw: unknown): ToolRoomDuty | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Partial<ToolRoomDuty>;
  const siteId = normalizeSiteId(row.siteId);
  const email = typeof row.email === "string" ? row.email.trim().toLowerCase() : "";
  if (!siteId || !email.includes("@")) return null;
  const startYmd = typeof row.startYmd === "string" && parseYmd(row.startYmd) ? row.startYmd : null;
  const endYmd = typeof row.endYmd === "string" && parseYmd(row.endYmd) ? row.endYmd : null;
  return {
    id: typeof row.id === "string" && row.id.trim() ? row.id.trim() : toolRoomDutyId(siteId, email),
    siteId,
    email,
    name: typeof row.name === "string" ? row.name.trim() : "",
    fromGf: true,
    timeboxed: row.timeboxed !== false,
    startYmd,
    endYmd,
    assignedByEmail: typeof row.assignedByEmail === "string" ? row.assignedByEmail.trim().toLowerCase() : "",
    createdAt: typeof row.createdAt === "number" && Number.isFinite(row.createdAt) ? row.createdAt : Date.now(),
  };
}

export function toolRoomDutyIsActive(duty: ToolRoomDuty, todayYmd?: string): boolean {
  if (!duty.timeboxed) return true;
  const today = todayYmd && parseYmd(todayYmd) ? todayYmd : formatYmd(new Date());
  if (duty.startYmd && today < duty.startYmd) return false;
  if (duty.endYmd && today > duty.endYmd) return false;
  return true;
}

export function canWriteToolRoomDuty(user?: ModuleAccessUser | null): boolean {
  return canAssignSitePeople(user);
}

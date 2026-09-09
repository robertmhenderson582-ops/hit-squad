import { isProjectManager } from "./desk-role.ts";
import { peopleVisibleTo, seatsVisibleTo } from "./desk-people.ts";
import type { Division } from "./divisions.ts";
import { divisionKey } from "./divisions.ts";
import type { PrivilegeViewer } from "./privileges.ts";
import type { PrivilegeId } from "./types.ts";

/** Field desks ship now. Corporate is plumbing only — no Corporate desk UI. */
export const ORG_DESK_LANES = ["field", "corporate"] as const;
export type OrgDeskLane = (typeof ORG_DESK_LANES)[number];

export const ORG_POSITION_KINDS = ["president", "division-head", "project-manager", "custom"] as const;
export type OrgPositionKind = (typeof ORG_POSITION_KINDS)[number];

export const PRESIDENT_POSITION_ID = "president";
export const PROJECT_MANAGER_POSITION_ID = "project-manager";

export const POSITION_ID_RE = /^[a-z][a-z0-9:-]{0,79}$/;

export const SEAT_RANKS = {
  owner: 100,
  operator: 90,
  president: 80,
  "division-head": 70,
  "project-manager": 60,
  tester: 20,
} as const;

export type SeatRankName = keyof typeof SEAT_RANKS;

export type OrgPosition = {
  id: string;
  kind: OrgPositionKind;
  label: string;
  companyId?: string;
  divisionId?: string;
  desk: OrgDeskLane;
  seed?: boolean;
};

export type OrgPositionHold = {
  id: string;
  positionId: string;
  email: string;
};

export type OrgPositionFile = {
  positions: OrgPosition[];
  holds: OrgPositionHold[];
  removedIds: string[];
};

export type OrgPositionPerson = {
  id: string;
  email: string;
  name: string;
  role: string;
  companyId?: string;
};

export type OrgPositionView = OrgPosition & {
  holders: Array<OrgPositionHold & { name: string; role: string; companyId?: string }>;
  defaultLabel: string;
};

export type SeatGrantActor = {
  rank: number;
  canAddUsers: boolean;
  canManagePositions: boolean;
  canIssuePasswords: boolean;
  canAddCompany: boolean;
  addableRoles: Array<"tester" | "president">;
  addableCompanyIds: string[];
};

export function isOrgPositionKind(value: unknown): value is OrgPositionKind {
  return typeof value === "string" && (ORG_POSITION_KINDS as readonly string[]).includes(value);
}

export function isOrgDeskLane(value: unknown): value is OrgDeskLane {
  return value === "field" || value === "corporate";
}

export function isPositionId(value: string): boolean {
  return POSITION_ID_RE.test(value.trim());
}

export function divisionHeadPositionId(companyId: string, divisionId: string) {
  return `division-head:${companyId}:${divisionId}`;
}

export function parseDivisionHeadPositionId(id: string): { companyId: string; divisionId: string } | null {
  const match = /^division-head:([a-z][a-z0-9-]{0,39}):([a-z][a-z0-9-]{0,39})$/.exec(id.trim());
  if (!match) return null;
  return { companyId: match[1], divisionId: match[2] };
}

export function positionIdFromName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export function kindRank(kind: OrgPositionKind): number {
  if (kind === "president") return SEAT_RANKS.president;
  if (kind === "division-head") return SEAT_RANKS["division-head"];
  if (kind === "project-manager") return SEAT_RANKS["project-manager"];
  return SEAT_RANKS.tester;
}

export function roleRank(role?: string | null): number {
  if (role === "owner") return SEAT_RANKS.owner;
  if (role === "operator") return SEAT_RANKS.operator;
  if (role === "president") return SEAT_RANKS.president;
  return SEAT_RANKS.tester;
}

export function actorRank(
  actor?: (PrivilegeViewer & { email?: string; role?: string }) | null,
  holds: OrgPositionHold[] = [],
  catalog: OrgPosition[] = [],
): number {
  if (!actor) return 0;
  let rank = roleRank(actor.role);
  if (isProjectManager(actor)) rank = Math.max(rank, SEAT_RANKS["project-manager"]);
  const email = (actor.email || "").trim().toLowerCase();
  if (!email) return rank;
  for (const hold of holds) {
    if (hold.email !== email) continue;
    const position = catalog.find((row) => row.id === hold.positionId);
    if (position) rank = Math.max(rank, kindRank(position.kind));
  }
  return rank;
}

export function parsePositionLabel(value?: string | null): { label: string } | { error: string } {
  const label = (value ?? "").trim().replace(/\s+/g, " ");
  if (label.length < 2) return { error: "Type a position name." };
  if (label.length > 80) return { error: "That name is too long." };
  return { label };
}

export function defaultPositionLabel(position: Pick<OrgPosition, "kind" | "label" | "divisionId">, divisions: Division[] = []) {
  if (position.kind === "division-head") {
    const division = divisions.find((row) => row.id === position.divisionId);
    return division ? `Division Head · ${division.name}` : "Division Head";
  }
  if (position.kind === "president") return "President";
  if (position.kind === "project-manager") return "Project Manager";
  return position.label;
}

export function seedPositions(divisions: Division[] = []): OrgPosition[] {
  const seeds: OrgPosition[] = [
    {
      id: PRESIDENT_POSITION_ID,
      kind: "president",
      label: "President",
      companyId: "madison",
      desk: "field",
      seed: true,
    },
    {
      id: PROJECT_MANAGER_POSITION_ID,
      kind: "project-manager",
      label: "Project Manager",
      desk: "field",
      seed: true,
    },
  ];
  for (const division of divisions) {
    seeds.push({
      id: divisionHeadPositionId(division.companyId, division.id),
      kind: "division-head",
      label: defaultPositionLabel({ kind: "division-head", label: "Division Head", divisionId: division.id }, [division]),
      companyId: division.companyId,
      divisionId: division.id,
      desk: "field",
      seed: true,
    });
  }
  return seeds;
}

export function emptyPositionFile(): OrgPositionFile {
  return { positions: [], holds: [], removedIds: [] };
}

export function hydratePosition(raw: unknown): OrgPosition | null {
  const row = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const id = typeof row.id === "string" ? row.id.trim() : "";
  const label = typeof row.label === "string" ? row.label.trim().replace(/\s+/g, " ") : "";
  if (!isPositionId(id) || !label) return null;
  const kind = isOrgPositionKind(row.kind) ? row.kind : parseDivisionHeadPositionId(id) ? "division-head" : "custom";
  const companyId = typeof row.companyId === "string" && row.companyId.trim() ? row.companyId.trim() : undefined;
  const divisionId = typeof row.divisionId === "string" && row.divisionId.trim() ? row.divisionId.trim() : undefined;
  const parsedHead = parseDivisionHeadPositionId(id);
  return {
    id,
    kind,
    label,
    ...(companyId ? { companyId } : parsedHead ? { companyId: parsedHead.companyId } : {}),
    ...(divisionId ? { divisionId } : parsedHead ? { divisionId: parsedHead.divisionId } : {}),
    desk: isOrgDeskLane(row.desk) ? row.desk : "field",
    ...(row.seed === true ? { seed: true } : {}),
  };
}

export function hydrateHold(raw: unknown): OrgPositionHold | null {
  const row = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const positionId = typeof row.positionId === "string" ? row.positionId.trim() : "";
  const email = typeof row.email === "string" ? row.email.trim().toLowerCase() : "";
  const id = typeof row.id === "string" && row.id.trim() ? row.id.trim() : holdId(positionId, email);
  if (!isPositionId(positionId) || !email.includes("@")) return null;
  return { id, positionId, email };
}

export function holdId(positionId: string, email: string) {
  return `${positionId}:${email.trim().toLowerCase()}`;
}

export function parsePositionFile(raw: unknown): OrgPositionFile {
  const row = raw && typeof raw === "object" ? (raw as Partial<OrgPositionFile>) : {};
  const positions: OrgPosition[] = [];
  const seen = new Set<string>();
  for (const item of row.positions ?? []) {
    const next = hydratePosition(item);
    if (!next || seen.has(next.id)) continue;
    seen.add(next.id);
    positions.push(next);
  }
  const holds: OrgPositionHold[] = [];
  const holdSeen = new Set<string>();
  for (const item of row.holds ?? []) {
    const next = hydrateHold(item);
    if (!next) continue;
    const key = holdId(next.positionId, next.email);
    if (holdSeen.has(key)) continue;
    holdSeen.add(key);
    holds.push({ ...next, id: key });
  }
  const removedIds = [...new Set((row.removedIds ?? []).filter((id): id is string => typeof id === "string" && isPositionId(id)))];
  return { positions, holds, removedIds };
}

export function mergePositions(
  stored: OrgPosition[] = [],
  removedIds: string[] = [],
  divisions: Division[] = [],
): OrgPosition[] {
  const removed = new Set(removedIds);
  const seen = new Map<string, OrgPosition>();
  for (const seed of seedPositions(divisions)) {
    if (removed.has(seed.id)) continue;
    seen.set(seed.id, seed);
  }
  for (const row of stored) {
    const next = hydratePosition(row);
    if (!next || removed.has(next.id)) continue;
    const prev = seen.get(next.id);
    if (prev?.seed) {
      seen.set(next.id, {
        ...prev,
        label: next.label || prev.label,
        desk: next.desk || prev.desk,
      });
      continue;
    }
    seen.set(next.id, {
      ...next,
      seed: Boolean(prev?.seed || next.seed),
    });
  }
  return [...seen.values()].sort((a, b) => {
    const rank = kindRank(b.kind) - kindRank(a.kind);
    if (rank) return rank;
    if (a.companyId !== b.companyId) return (a.companyId || "").localeCompare(b.companyId || "");
    return a.label.localeCompare(b.label);
  });
}

export function uniquePositionId(name: string, existing: OrgPosition[]): string {
  let id = positionIdFromName(name) || "position";
  if (!isPositionId(id)) id = "position";
  if (!existing.some((row) => row.id === id)) return id;
  let n = 2;
  while (existing.some((row) => row.id === `${id}-${n}`)) n += 1;
  return `${id}-${n}`;
}

export function withPresidentSeatHolds(
  holds: OrgPositionHold[],
  seats: Array<{ email?: string; role?: string }>,
): OrgPositionHold[] {
  const next = [...holds];
  const seen = new Set(next.map((row) => holdId(row.positionId, row.email)));
  for (const seat of seats) {
    if (seat.role !== "president") continue;
    const email = (seat.email || "").trim().toLowerCase();
    if (!email.includes("@")) continue;
    const id = holdId(PRESIDENT_POSITION_ID, email);
    if (seen.has(id)) continue;
    seen.add(id);
    next.push({ id, positionId: PRESIDENT_POSITION_ID, email });
  }
  return next;
}

export function holdsForPosition(holds: OrgPositionHold[], positionId: string) {
  return holds.filter((row) => row.positionId === positionId);
}

export function holdsForEmail(holds: OrgPositionHold[], email: string) {
  const key = email.trim().toLowerCase();
  return holds.filter((row) => row.email === key);
}

export function alreadyHolds(holds: OrgPositionHold[], positionId: string, email: string) {
  return holds.some((row) => row.positionId === positionId && row.email === email.trim().toLowerCase());
}

/** Login role is never replaced. Owner + Division Head (or any other title) stack. */
export function stackedRoles(loginRole: string | undefined, holds: OrgPositionHold[], catalog: OrgPosition[]): string[] {
  const labels: string[] = [];
  if (loginRole === "owner") labels.push("Owner");
  else if (loginRole === "operator") labels.push("Operator");
  else if (loginRole === "president") labels.push("President");
  const held = new Set<string>();
  for (const hold of holds) {
    const position = catalog.find((row) => row.id === hold.positionId);
    if (!position || held.has(position.id)) continue;
    held.add(position.id);
    if (position.kind === "president" && loginRole === "president") continue;
    labels.push(position.label);
  }
  return labels;
}

export function positionVisibleTo(
  viewer: PrivilegeViewer | null | undefined,
  position: OrgPosition,
  canSeeCompany: (companyId?: string) => boolean,
): boolean {
  if (!viewer) return true;
  if (!position.companyId) return true;
  return canSeeCompany(position.companyId);
}

export function orgPeopleForAssign(
  viewer: PrivilegeViewer | null | undefined,
  people: OrgPositionPerson[],
): OrgPositionPerson[] {
  const withoutNovus = people.filter((row) => row.role !== "operator");
  return peopleVisibleTo(viewer, seatsVisibleTo(viewer, withoutNovus));
}

export function canGrantPosition(
  actor: (PrivilegeViewer & { email?: string; role?: string }) | null | undefined,
  position: OrgPosition | null | undefined,
  target: OrgPositionPerson | null | undefined,
  holds: OrgPositionHold[],
  catalog: OrgPosition[],
  opts?: { canSeeTarget?: boolean; canSeeCompany?: boolean },
): { ok: true } | { error: string } {
  if (!actor) return { error: "Not signed in." };
  if (!position) return { error: "Pick a position." };
  if (!target) return { error: "Pick someone on this desk." };
  if (target.role === "operator") return { error: "Novus is not assigned from this form." };
  if (opts?.canSeeCompany === false) return { error: "Pick a company on this desk." };
  if (opts?.canSeeTarget === false) return { error: "Hit Squad seats stay on the owner desk." };
  if (alreadyHolds(holds, position.id, target.email)) return { error: "That seat already holds this position." };
  const rank = actorRank(actor, holds, catalog);
  if (rank < kindRank(position.kind)) return { error: "That permission is above your seat." };
  return { ok: true };
}

export function canRevokeHold(
  actor: (PrivilegeViewer & { email?: string; role?: string }) | null | undefined,
  position: OrgPosition | null | undefined,
  holds: OrgPositionHold[],
  catalog: OrgPosition[],
): { ok: true } | { error: string } {
  if (!actor) return { error: "Not signed in." };
  if (!position) return { error: "Pick a position." };
  const rank = actorRank(actor, holds, catalog);
  if (rank < kindRank(position.kind)) return { error: "That permission is above your seat." };
  return { ok: true };
}

export function canRenamePosition(
  actor: (PrivilegeViewer & { email?: string; role?: string }) | null | undefined,
  position: OrgPosition | null | undefined,
  holds: OrgPositionHold[],
  catalog: OrgPosition[],
  label?: string | null,
): { ok: true; label: string } | { error: string } {
  if (!actor) return { error: "Not signed in." };
  if (!position) return { error: "Pick a position." };
  const parsed = parsePositionLabel(label);
  if ("error" in parsed) return parsed;
  const rank = actorRank(actor, holds, catalog);
  if (rank < kindRank(position.kind) && actor.role !== "owner") return { error: "That permission is above your seat." };
  return { ok: true, label: parsed.label };
}

export function canCreateCustomPosition(
  actor: (PrivilegeViewer & { email?: string; role?: string }) | null | undefined,
  holds: OrgPositionHold[],
  catalog: OrgPosition[],
  name?: string | null,
): { ok: true; label: string } | { error: string } {
  if (!actor) return { error: "Not signed in." };
  const parsed = parsePositionLabel(name);
  if ("error" in parsed) return parsed;
  const rank = actorRank(actor, holds, catalog);
  if (rank < SEAT_RANKS["project-manager"] && actor.role !== "owner") {
    return { error: "That permission is above your seat." };
  }
  return { ok: true, label: parsed.label };
}

export function canRemovePosition(position: OrgPosition | null | undefined): { ok: true } | { error: string } {
  if (!position) return { error: "Pick a position." };
  if (position.seed || position.kind !== "custom") return { error: "Seeded seats stay on the catalog. Revoke people instead." };
  return { ok: true };
}

export function canCreateSeatAs(
  actor: (PrivilegeViewer & { email?: string; role?: string }) | null | undefined,
  input: { role?: string; companyId?: string },
  holds: OrgPositionHold[],
  catalog: OrgPosition[],
  addableCompanyIds: string[],
): { ok: true } | { error: string } {
  if (!actor) return { error: "Not signed in." };
  const rank = actorRank(actor, holds, catalog);
  if (rank < SEAT_RANKS["project-manager"] && actor.role !== "owner") {
    return { error: "That permission is above your seat." };
  }
  const role = input.role === "president" ? "president" : "tester";
  if (role === "president" && rank < SEAT_RANKS.president) {
    return { error: "That permission is above your seat." };
  }
  const companyId = (input.companyId || (role === "president" ? "madison" : "")).trim();
  if (!companyId) return { error: "Pick a company on this desk." };
  if (!addableCompanyIds.includes(companyId)) {
    return { error: "Hit Squad seats stay on the owner desk." };
  }
  return { ok: true };
}

export function addableRolesForRank(rank: number): Array<"tester" | "president"> {
  return rank >= SEAT_RANKS.president ? ["tester", "president"] : ["tester"];
}

export function canGrantPrivilegeAs(
  actor: (PrivilegeViewer & { role?: string }) | null | undefined,
  privilege: PrivilegeId,
): boolean {
  if (!actor) return false;
  if (actor.role === "owner") return true;
  return (actor.privileges ?? []).includes(privilege);
}

export function positionViews(
  catalog: OrgPosition[],
  holds: OrgPositionHold[],
  people: OrgPositionPerson[],
  divisions: Division[] = [],
): OrgPositionView[] {
  const byEmail = new Map(people.map((row) => [row.email, row]));
  return catalog.map((position) => {
    const defaultLabel = defaultPositionLabel(position, divisions);
    const holders = holdsForPosition(holds, position.id).map((hold) => {
      const person = byEmail.get(hold.email);
      return {
        ...hold,
        name: person?.name || hold.email,
        role: person?.role || "tester",
        companyId: person?.companyId,
      };
    });
    return { ...position, defaultLabel, holders };
  });
}

export function headsForDivision(
  views: OrgPositionView[],
  companyId: string,
  divisionId: string,
) {
  return views.find((row) => row.id === divisionHeadPositionId(companyId, divisionId))?.holders ?? [];
}

export function divisionKeyForPosition(position: Pick<OrgPosition, "companyId" | "divisionId">) {
  if (!position.companyId || !position.divisionId) return "";
  return divisionKey(position.companyId, position.divisionId);
}

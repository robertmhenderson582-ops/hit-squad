import { hasBuildDesk, hasWorkingDesk, isHseVaultSeat, isProjectManager } from "./desk-role.ts";

/** Locals. Phase 1 activates 553 only; 363 stays structurally ready. */
export const ONBOARD_LOCALS = [
  { id: "553", label: "Local 553", craft: "Pipefitter", short: "PF553", union: "UA", phase1: true },
  { id: "363", label: "Local 363", craft: "Boilermaker", short: "BM363", union: "IBB", phase1: false },
] as const;

export type OnboardLocalId = (typeof ONBOARD_LOCALS)[number]["id"];

export const ONBOARD_STAGES = [
  { id: "registered", label: "Registered", owner: null, hallOwned: true },
  { id: "waiting-drug", label: "Waiting on drug screen", owner: "Tom Fried", hallOwned: false },
  { id: "waiting-background", label: "Waiting on background", owner: "Tom Fried", hallOwned: false },
  { id: "techsolve", label: "Going to TechSolve", owner: "Tom Fried", hallOwned: false },
  { id: "notify-badge", label: "P66 badge notify", owner: "Tom Fried", hallOwned: false },
  { id: "ready", label: "Ready / cleared for dispatch", owner: null, hallOwned: false },
  { id: "blocked", label: "Blocked / failed", owner: null, hallOwned: false },
] as const;

export type OnboardStageId = (typeof ONBOARD_STAGES)[number]["id"];

export const TOM_FRIED_NAME = "Tom Fried";
export const TOM_FRIED_EMAIL = "friedt@madisonltd.com";
export const TOM_FRIED_SEAT_ID = "tester-tom-fried";
export const TOM_FRIED_TITLE = "HSE Dispatcher";

export const JOHN_BATTUELLO_NAME = "John Battuello Jr.";
export const JOHN_BATTUELLO_EMAIL = "jbattuello@ualocal553.org";
export const JOHN_BATTUELLO_SEAT_ID = "tester-john-battuello";

export const ONBOARD_PHASE1_LOCAL_IDS = ["553"] as const;

export type OnboardSeedSeat = {
  id: string;
  email: string;
  name: string;
  jobTitle: string;
  company: "madison";
};

/** Seeded login seats. Not TESTER_SEATS — that list stays locked at 12. */
export const ONBOARD_SEED_SEATS: readonly OnboardSeedSeat[] = [
  {
    id: JOHN_BATTUELLO_SEAT_ID,
    email: JOHN_BATTUELLO_EMAIL,
    name: JOHN_BATTUELLO_NAME,
    jobTitle: "Hall Local 553",
    company: "madison",
  },
  {
    id: TOM_FRIED_SEAT_ID,
    email: TOM_FRIED_EMAIL,
    name: TOM_FRIED_NAME,
    jobTitle: TOM_FRIED_TITLE,
    company: "madison",
  },
];

export const DEFAULT_ONBOARD_PLANT = {
  siteId: "wood-river",
  site: "Wood River",
  client: "Phillips 66",
  plant: "Wood River refining complex",
} as const;

export const ONBOARD_CLASSIFICATIONS = ["Journeyman", "Apprentice", "Foreman", "General Foreman"] as const;

export const ONBOARD_VAULT_WRITE_ERROR =
  "Could not save the onboarding board. The last known people stay on this desk.";

export type OnboardActor = {
  id?: string;
  email?: string;
  name?: string;
  role?: string;
  jobTitle?: string;
};

export type OnboardEvent = {
  id: string;
  at: string;
  actorName: string;
  actorEmail: string;
  fromStage: OnboardStageId | null;
  toStage: OnboardStageId;
  note: string;
};

export type OnboardPerson = {
  id: string;
  name: string;
  localId: OnboardLocalId;
  craft: string;
  classification: string;
  phone: string;
  email: string;
  referredFor: string;
  siteId: string;
  site: string;
  client: string;
  stage: OnboardStageId;
  blockedReason: string;
  createdAt: string;
  updatedAt: string;
  createdByName: string;
  createdByEmail: string;
  events: OnboardEvent[];
};

export type OnboardFile = {
  people: OnboardPerson[];
};

export type OnboardViewer = OnboardActor;

const LOCAL_IDS = new Set<string>(ONBOARD_LOCALS.map((row) => row.id));
const STAGE_IDS = new Set<string>(ONBOARD_STAGES.map((row) => row.id));

const ADVANCE_ORDER: OnboardStageId[] = [
  "registered",
  "waiting-drug",
  "waiting-background",
  "techsolve",
  "notify-badge",
  "ready",
];

export function isOnboardLocalId(value: unknown): value is OnboardLocalId {
  return typeof value === "string" && LOCAL_IDS.has(value);
}

export function isOnboardPhase1Local(value: unknown): value is OnboardLocalId {
  return value === "553";
}

export function selectableOnboardLocals() {
  return ONBOARD_LOCALS.filter((row) => row.phase1);
}

export function onboardSeedByEmail(email?: string | null) {
  const key = (email || "").trim().toLowerCase();
  return ONBOARD_SEED_SEATS.find((row) => row.email === key);
}

export function onboardSeedCompanyForEmail(email?: string | null) {
  return onboardSeedByEmail(email)?.company;
}

export function isOnboardStageId(value: unknown): value is OnboardStageId {
  return typeof value === "string" && STAGE_IDS.has(value);
}

export function onboardLocal(id: OnboardLocalId) {
  return ONBOARD_LOCALS.find((row) => row.id === id) ?? ONBOARD_LOCALS[0];
}

export function onboardStage(id: OnboardStageId) {
  return ONBOARD_STAGES.find((row) => row.id === id) ?? ONBOARD_STAGES[0];
}

export function onboardStageOwner(id: OnboardStageId): string | null {
  return onboardStage(id).owner;
}

export function defaultCraftForLocal(localId: OnboardLocalId) {
  return onboardLocal(localId).craft;
}

export function hallContactForLocal(localId: OnboardLocalId) {
  if (localId === "553") {
    return { name: JOHN_BATTUELLO_NAME, email: JOHN_BATTUELLO_EMAIL, title: "Hall Local 553" };
  }
  return null;
}

export function hallLocalForSeat(user?: OnboardViewer | null): OnboardLocalId | null {
  if (!user) return null;
  const email = (user.email || "").trim().toLowerCase();
  if (email === JOHN_BATTUELLO_EMAIL) return "553";
  const hay = `${user.jobTitle || ""} ${user.name || ""} ${email}`;
  if (/\b553\b|pf553|pipefitter hall|hall local 553/i.test(hay)) return "553";
  if (/\b363\b|bm363|boilermaker hall|hall local 363/i.test(hay)) return "363";
  return null;
}

export function isHallSeat(user?: OnboardViewer | null): boolean {
  return hallLocalForSeat(user) != null;
}

export function isTomFriedSeat(user?: OnboardViewer | null): boolean {
  if (!user) return false;
  if (user.id === TOM_FRIED_SEAT_ID) return true;
  if ((user.email || "").trim().toLowerCase() === TOM_FRIED_EMAIL) return true;
  const hay = `${user.name || ""} ${user.jobTitle || ""}`;
  return /tom\s+fried/i.test(hay) || new RegExp(TOM_FRIED_TITLE, "i").test(hay);
}

export function canSeeOnboardBoard(user?: OnboardViewer | null): boolean {
  if (!user) return false;
  return (
    hasWorkingDesk(user) ||
    isHseVaultSeat(user) ||
    isProjectManager(user) ||
    isHallSeat(user) ||
    isTomFriedSeat(user)
  );
}

/** Home dock tile — HSE, halls, Tom, and the build desk. Testers keep the four public doors. */
export function canSeeOnboardDoor(
  session?: OnboardViewer | null,
  lens?: OnboardViewer | null,
): boolean {
  const viewer = lens ?? session;
  return hasBuildDesk(viewer) || isHseVaultSeat(viewer) || isHallSeat(viewer) || isTomFriedSeat(viewer);
}

export function canRegisterOnboard(user?: OnboardViewer | null): boolean {
  return canSeeOnboardBoard(user);
}

export function canAdvanceOnboard(user?: OnboardViewer | null): boolean {
  if (!user) return false;
  return hasBuildDesk(user) || isHseVaultSeat(user) || isTomFriedSeat(user);
}

export function visibleOnboardPeople(people: readonly OnboardPerson[], user?: OnboardViewer | null) {
  const local = hallLocalForSeat(user);
  if (!local) return [...people];
  if (hasBuildDesk(user) || isHseVaultSeat(user) || isTomFriedSeat(user) || hasWorkingDesk(user) || isProjectManager(user)) {
    return [...people];
  }
  return people.filter((person) => person.localId === local);
}

export function nextOnboardStage(stage: OnboardStageId): OnboardStageId | null {
  const index = ADVANCE_ORDER.indexOf(stage);
  if (index < 0 || index >= ADVANCE_ORDER.length - 1) return null;
  return ADVANCE_ORDER[index + 1] ?? null;
}

export function actorStamp(user?: OnboardViewer | null) {
  const name = (user?.name || "").trim() || (user?.email || "").trim() || "Desk";
  const email = (user?.email || "").trim().toLowerCase();
  return { actorName: name, actorEmail: email };
}

export function newOnboardId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function appendOnboardEvent(
  events: readonly OnboardEvent[],
  input: {
    actor?: OnboardViewer | null;
    fromStage: OnboardStageId | null;
    toStage: OnboardStageId;
    note?: string;
    at?: string;
    id?: string;
  },
): OnboardEvent[] {
  const stamp = actorStamp(input.actor);
  const event: OnboardEvent = {
    id: input.id || newOnboardId("evt"),
    at: input.at || new Date().toISOString(),
    actorName: stamp.actorName,
    actorEmail: stamp.actorEmail,
    fromStage: input.fromStage,
    toStage: input.toStage,
    note: (input.note || "").trim(),
  };
  return [...events, event];
}

export function parseOnboardEvent(raw: unknown): OnboardEvent | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Partial<OnboardEvent>;
  if (typeof row.id !== "string" || !row.id.trim()) return null;
  if (typeof row.at !== "string" || !row.at.trim()) return null;
  if (typeof row.actorName !== "string" || !row.actorName.trim()) return null;
  if (!isOnboardStageId(row.toStage)) return null;
  if (row.fromStage != null && !isOnboardStageId(row.fromStage)) return null;
  return {
    id: row.id.trim(),
    at: row.at,
    actorName: row.actorName.trim(),
    actorEmail: typeof row.actorEmail === "string" ? row.actorEmail.trim().toLowerCase() : "",
    fromStage: row.fromStage ?? null,
    toStage: row.toStage,
    note: typeof row.note === "string" ? row.note : "",
  };
}

export function parseOnboardPerson(raw: unknown): OnboardPerson | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Partial<OnboardPerson>;
  if (typeof row.id !== "string" || !row.id.trim()) return null;
  if (typeof row.name !== "string" || !row.name.trim()) return null;
  if (!isOnboardLocalId(row.localId)) return null;
  const stage = isOnboardStageId(row.stage) ? row.stage : "registered";
  const events: OnboardEvent[] = [];
  const seen = new Set<string>();
  for (const item of Array.isArray(row.events) ? row.events : []) {
    const event = parseOnboardEvent(item);
    if (!event || seen.has(event.id)) continue;
    seen.add(event.id);
    events.push(event);
  }
  const local = onboardLocal(row.localId);
  return {
    id: row.id.trim(),
    name: row.name.trim(),
    localId: row.localId,
    craft: typeof row.craft === "string" && row.craft.trim() ? row.craft.trim() : local.craft,
    classification: typeof row.classification === "string" ? row.classification.trim() : "",
    phone: typeof row.phone === "string" ? row.phone.trim() : "",
    email: typeof row.email === "string" ? row.email.trim() : "",
    referredFor: typeof row.referredFor === "string" ? row.referredFor.trim() : "",
    siteId: typeof row.siteId === "string" && row.siteId.trim() ? row.siteId.trim() : DEFAULT_ONBOARD_PLANT.siteId,
    site: typeof row.site === "string" && row.site.trim() ? row.site.trim() : DEFAULT_ONBOARD_PLANT.site,
    client: typeof row.client === "string" && row.client.trim() ? row.client.trim() : DEFAULT_ONBOARD_PLANT.client,
    stage,
    blockedReason: typeof row.blockedReason === "string" ? row.blockedReason.trim() : "",
    createdAt: typeof row.createdAt === "string" && row.createdAt.trim() ? row.createdAt : new Date().toISOString(),
    updatedAt: typeof row.updatedAt === "string" && row.updatedAt.trim() ? row.updatedAt : new Date().toISOString(),
    createdByName: typeof row.createdByName === "string" ? row.createdByName.trim() : "",
    createdByEmail: typeof row.createdByEmail === "string" ? row.createdByEmail.trim().toLowerCase() : "",
    events,
  };
}

export function parseOnboardFile(raw: unknown): OnboardFile {
  const parsed = raw && typeof raw === "object" ? (raw as Partial<OnboardFile>) : {};
  const people: OnboardPerson[] = [];
  const seen = new Set<string>();
  for (const item of Array.isArray(parsed.people) ? parsed.people : []) {
    const person = parseOnboardPerson(item);
    if (!person || seen.has(person.id)) continue;
    seen.add(person.id);
    people.push(person);
  }
  return { people };
}

export function createOnboardPerson(input: {
  name: string;
  localId: OnboardLocalId;
  craft?: string;
  classification?: string;
  phone?: string;
  email?: string;
  referredFor?: string;
  siteId?: string;
  site?: string;
  client?: string;
  actor?: OnboardViewer | null;
  at?: string;
  id?: string;
}): OnboardPerson | { error: string } {
  const name = input.name.trim();
  if (name.length < 2) return { error: "Enter the person's name." };
  if (!isOnboardLocalId(input.localId)) return { error: "Pick Local 553." };
  if (!isOnboardPhase1Local(input.localId)) return { error: "Phase 1 is Local 553 only." };
  const hallLocal = hallLocalForSeat(input.actor);
  if (hallLocal && hallLocal !== input.localId) {
    return { error: `Hall seats can only register Local ${hallLocal}.` };
  }
  const hallContact = hallContactForLocal(input.localId);
  if (hallContact && isHallSeat(input.actor)) {
    const email = (input.actor?.email || "").trim().toLowerCase();
    if (email !== hallContact.email) {
      return { error: `Local ${input.localId} register is gated to ${hallContact.email}.` };
    }
  }
  const at = input.at || new Date().toISOString();
  const stamp = actorStamp(input.actor);
  const local = onboardLocal(input.localId);
  const person: OnboardPerson = {
    id: input.id || newOnboardId("ob"),
    name,
    localId: input.localId,
    craft: (input.craft || "").trim() || local.craft,
    classification: (input.classification || "").trim(),
    phone: (input.phone || "").trim(),
    email: (input.email || "").trim(),
    referredFor: (input.referredFor || "").trim(),
    siteId: (input.siteId || "").trim() || DEFAULT_ONBOARD_PLANT.siteId,
    site: (input.site || "").trim() || DEFAULT_ONBOARD_PLANT.site,
    client: (input.client || "").trim() || DEFAULT_ONBOARD_PLANT.client,
    stage: "registered",
    blockedReason: "",
    createdAt: at,
    updatedAt: at,
    createdByName: stamp.actorName,
    createdByEmail: stamp.actorEmail,
    events: [],
  };
  person.events = appendOnboardEvent(person.events, {
    actor: input.actor,
    fromStage: null,
    toStage: "registered",
    note: "Hall registered",
    at,
  });
  return person;
}

export function changeOnboardStage(
  person: OnboardPerson,
  input: {
    toStage: OnboardStageId;
    note?: string;
    actor?: OnboardViewer | null;
    at?: string;
  },
): OnboardPerson | { error: string } {
  if (!isOnboardStageId(input.toStage)) return { error: "Pick a stage." };
  if (input.toStage === person.stage) return { error: "That person is already in that stage." };
  if (input.toStage === "blocked") {
    const reason = (input.note || "").trim();
    if (!reason) return { error: "Blocked / failed needs a reason." };
  }
  if (person.stage === "blocked" && input.toStage !== "registered" && input.toStage !== "waiting-drug") {
    return { error: "Reopen a blocked person to Registered or Waiting on drug screen." };
  }
  if (person.stage !== "blocked" && input.toStage !== "blocked") {
    const expected = nextOnboardStage(person.stage);
    if (expected !== input.toStage) {
      return { error: expected ? `Next step is ${onboardStage(expected).label}.` : "That person is already cleared." };
    }
  }
  const at = input.at || new Date().toISOString();
  return {
    ...person,
    stage: input.toStage,
    blockedReason: input.toStage === "blocked" ? (input.note || "").trim() : "",
    updatedAt: at,
    events: appendOnboardEvent(person.events, {
      actor: input.actor,
      fromStage: person.stage,
      toStage: input.toStage,
      note: input.note,
      at,
    }),
  };
}

export function peopleByStage(people: readonly OnboardPerson[]) {
  const groups = Object.fromEntries(ONBOARD_STAGES.map((stage) => [stage.id, [] as OnboardPerson[]])) as Record<
    OnboardStageId,
    OnboardPerson[]
  >;
  for (const person of people) {
    groups[person.stage].push(person);
  }
  return groups;
}

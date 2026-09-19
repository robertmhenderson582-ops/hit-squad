import { hasBuildDesk, hasWorkingDesk, isHseVaultSeat, isProjectManager } from "./desk-role.ts";
import { isRateVaultOnlyViewer } from "./rate-vault.ts";
import { TESTER_SEATS } from "./tester-seats.ts";

/** User-facing Phase 1 board / module title. Product family stays Hit Squad. */
export const CONTROL_CENTER_TITLE = "Hit Squad Control Center";
export const CONTROL_CENTER_CHROME = "HIT SQUAD CONTROL CENTER";

/** Locals. Phase 1 activates 553 only; 363 stays structurally ready. */
export const ONBOARD_LOCALS = [
  { id: "553", label: "Local 553", craft: "Pipefitter", short: "PF553", union: "UA", phase1: true },
  { id: "363", label: "Local 363", craft: "Boilermaker", short: "BM363", union: "IBB", phase1: false },
] as const;

export type OnboardLocalId = string;

export type OnboardHall = {
  id: OnboardLocalId;
  label: string;
  craft: string;
  union: string;
  short: string;
  phase1: boolean;
  contactName: string;
  contactEmail: string;
  contactTitle: string;
};

/**
 * Benny + Robert dictation 2026-09-18. Board columns are completed-step states.
 * Training vendor spelling lock: TekSolv (official teksolv.com brand). Prior lock used Tecsolv; do not use Texolve / TechSolve.
 */
export const TEKSOLV_NAME = "TekSolv";
export const TEKSOLV_LOCATION = "Collinsville, Illinois";

export const HIRE_IN_VERIFIED_FIELD_LABEL = "Verified Employee Received HireIn Link";
export const HIRE_IN_OUTREACH_OWNERS = "Robert Henderson / Ben Peffley / Nathan Boyte";

export const ONBOARD_STAGES = [
  { id: "step-1", label: "Submitted to DISA DER", owner: "Site → Tom Fried", hallOwned: false, step: 1 },
  { id: "step-2", label: "DISA identity verified / DISA scheduled", owner: "Tom Fried", hallOwned: false, step: 2 },
  {
    id: "step-3",
    label: "Payroll verified / TekSolv scheduled",
    owner: "On-site payroll",
    hallOwned: false,
    step: 3,
  },
  {
    id: "step-4",
    label: "Hire-end outreach (Robert / Ben / Nathan)",
    owner: HIRE_IN_OUTREACH_OWNERS,
    hallOwned: false,
    step: 4,
  },
  { id: "step-5", label: "TekSolv complete / Badged", owner: `${TEKSOLV_NAME} / P66`, hallOwned: false, step: 5 },
  { id: "blocked", label: "Blocked / failed", owner: null, hallOwned: false, step: 0 },
] as const;

export type OnboardStageId = (typeof ONBOARD_STAGES)[number]["id"];

/** DISA DER. Stage owner for identity / drug / background. Review-session email is separate. */
export const TOM_FRIED_NAME = "Tom Fried";
export const TOM_FRIED_EMAIL = "friedt@madisonltd.com";
export const TOM_FRIED_SEAT_ID = "tester-tom-fried";
export const TOM_FRIED_TITLE = "DISA DER";

const BENNY_CAMP_SEAT = TESTER_SEATS.find((row) => row.email === "bccamp2@gmail.com");

/** Existing Hit Squad seat — temp Madison dispatcher until Donnie. */
export const BENNY_CAMP_NAME = BENNY_CAMP_SEAT?.name ?? "Benny Camp";
export const BENNY_CAMP_EMAIL = BENNY_CAMP_SEAT?.email ?? "bccamp2@gmail.com";
export const BENNY_CAMP_SEAT_ID = BENNY_CAMP_SEAT?.id ?? "tester-benny";

/** Last name spelling lock: Battuello only. Do not use the common misspellings. */
export const BATTUELLO_LAST_NAME = "Battuello";
export const JOHN_BATTUELLO_NAME = "John Battuello Jr.";
export const JOHNNY_BATTUELLO_NAME = "Johnny Battuello Jr.";
export const JOHN_BATTUELLO_EMAIL = "jbattuello@ualocal553.org";
export const JOHN_BATTUELLO_SEAT_ID = "tester-john-battuello";

/** Tracker keeper. Name match only — do not invent a login. */
export const DEBBIE_TRACKER_NAME = "Debbie";

/** Outreach. Nathan is a seeded PM. Ben Peffley is name-only (cannot git-seed). */
export const NATHAN_BOYTE_NAME = "Nathan Boyte";
export const NATHAN_BOYTE_EMAIL = "nathanboyte@gmail.com";
export const BEN_PEFFLEY_NAME = "Ben Peffley";

export const ONBOARD_PHASE1_LOCAL_IDS = ["553"] as const;

export function seedOnboardHalls(): OnboardHall[] {
  return ONBOARD_LOCALS.map((row) => {
    if (row.id === "553") {
      return {
        id: row.id,
        label: row.label,
        craft: row.craft,
        union: row.union,
        short: row.short,
        phase1: row.phase1,
        contactName: JOHN_BATTUELLO_NAME,
        contactEmail: JOHN_BATTUELLO_EMAIL,
        contactTitle: "Hall Local 553",
      };
    }
    return {
      id: row.id,
      label: row.label,
      craft: row.craft,
      union: row.union,
      short: row.short,
      phase1: row.phase1,
      contactName: "",
      contactEmail: "",
      contactTitle: `Hall Local ${row.id}`,
    };
  });
}

let runtimeHalls: OnboardHall[] | null = null;

export function setRuntimeOnboardHalls(halls: OnboardHall[] | null) {
  runtimeHalls = halls;
}

export function hallShort(craft: string, localId: string, union = "") {
  const fromCraft = craft.replace(/[^a-z]/gi, "").slice(0, 2).toUpperCase();
  const fromUnion = union.replace(/[^a-z]/gi, "").slice(0, 2).toUpperCase();
  return `${fromCraft || fromUnion || "HL"}${localId}`;
}

export function mergeOnboardHalls(...lists: Array<readonly OnboardHall[] | null | undefined>): OnboardHall[] {
  const seen = new Map<string, OnboardHall>();
  for (const list of lists) {
    for (const row of list ?? []) {
      if (!row?.id) continue;
      seen.set(row.id, { ...row });
    }
  }
  return [...seen.values()].sort((left, right) => left.id.localeCompare(right.id, undefined, { numeric: true }));
}

export function mergedOnboardHalls(extra?: readonly OnboardHall[] | null): OnboardHall[] {
  return mergeOnboardHalls(seedOnboardHalls(), extra ?? runtimeHalls);
}

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

/** Placeholder only — Robert will supply the hiring package later. Do not treat as final. */
export const MANPOWER_CERTS_PLACEHOLDER = "Required certs (placeholder — hiring package later)";
export const MANPOWER_SCREENING_PLACEHOLDER =
  "Drug screen, background, and other screenings (placeholder — hiring package later)";
export const MANPOWER_PACKAGE_PLACEHOLDER =
  "Requirements from hiring package (placeholder — Robert will supply later)";

export const ONBOARD_VAULT_WRITE_ERROR =
  "Could not save the onboarding board. The last known people stay on this desk.";

export type Step1Submitter = "site" | "hall";
export type TrainingStatus = "not-started" | "scheduled" | "complete";

/** Owner-configurable. Empty until Owner fills them — do not invent addresses. */
export type OnboardSettings = {
  step1Submitter: Step1Submitter;
  corporateEmails: string[];
  pmEmails: string[];
};

export const DEFAULT_ONBOARD_SETTINGS: OnboardSettings = {
  step1Submitter: "site",
  corporateEmails: [],
  pmEmails: [],
};

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
  requestId: string;
  legalName: string;
  dateOfBirth: string;
  /**
   * RESTRICTED PII. Digits-only 9-digit Social Security number when known.
   * Empty when the record only has a legacy last-4. Never log this value.
   */
  ssn: string;
  /** Derived last four of `ssn`, or a preserved last-4 from records that never stored a full SSN. */
  ssnLast4: string;
  identityVerifiedBy: string;
  identityVerifiedAt: string;
  p66CorporateTraining: TrainingStatus;
  p66SiteTraining: TrainingStatus;
  p66PrecertTraining: TrainingStatus;
  hireInLinkSent: boolean;
  hireInLinkSentAt: string;
  hireInDeliveryConfirmed: boolean;
  hireInDeliveryConfirmedAt: string;
  verifiedEmployeeReceivedHireInLink: boolean;
  tomFriedContactConfirmed: boolean;
  problemCase: boolean;
  problemCaseNote: string;
  events: OnboardEvent[];
};

export type OnboardPersonPatch = {
  legalName?: string;
  dateOfBirth?: string;
  /** RESTRICTED PII. Full 9-digit SSN preferred; last-4 still accepted for legacy saves. */
  ssn?: string;
  ssnLast4?: string;
  identityVerified?: boolean;
  p66CorporateTraining?: TrainingStatus;
  p66SiteTraining?: TrainingStatus;
  p66PrecertTraining?: TrainingStatus;
  hireInLinkSent?: boolean;
  hireInDeliveryConfirmed?: boolean;
  verifiedEmployeeReceivedHireInLink?: boolean;
  tomFriedContactConfirmed?: boolean;
  problemCase?: boolean;
  problemCaseNote?: string;
  note?: string;
};

export type ManpowerRequestStatus = "open" | "responded";

export type ManpowerRequestEvent = {
  id: string;
  at: string;
  actorName: string;
  actorEmail: string;
  action: "created" | "responded";
  note: string;
};

export type ManpowerRequest = {
  id: string;
  localId: OnboardLocalId;
  dateNeeded: string;
  headcount: number;
  trade: string;
  classification: string;
  site: string;
  job: string;
  requiredCerts: string;
  requiredScreenings: string;
  hiringPackageNotes: string;
  status: ManpowerRequestStatus;
  createdAt: string;
  createdByName: string;
  createdByEmail: string;
  fillCount: number | null;
  fillDate: string;
  respondedAt: string;
  respondedByName: string;
  respondedByEmail: string;
  events: ManpowerRequestEvent[];
};

export type OnboardFile = {
  people: OnboardPerson[];
  requests: ManpowerRequest[];
  settings: OnboardSettings;
  halls: OnboardHall[];
};

export type OnboardViewer = OnboardActor;

const STAGE_IDS = new Set<string>(ONBOARD_STAGES.map((row) => row.id));
const LOCAL_ID_RE = /^\d{2,5}$/;

const LEGACY_STAGE_MAP: Record<string, OnboardStageId> = {
  registered: "step-1",
  "waiting-drug": "step-2",
  "waiting-background": "step-2",
  /** Stored stage id from the first pipeline fold-in — not the vendor brand. */
  techsolve: "step-3",
  "notify-badge": "step-4",
  ready: "step-5",
  blocked: "blocked",
};

const ADVANCE_ORDER: OnboardStageId[] = ["step-1", "step-2", "step-3", "step-4", "step-5"];

export function isOnboardLocalId(value: unknown, halls?: readonly OnboardHall[] | null): value is OnboardLocalId {
  if (typeof value !== "string" || !LOCAL_ID_RE.test(value.trim())) return false;
  return mergedOnboardHalls(halls).some((row) => row.id === value.trim());
}

export function isOnboardPhase1Local(value: unknown, halls?: readonly OnboardHall[] | null): value is OnboardLocalId {
  if (typeof value !== "string") return false;
  return mergedOnboardHalls(halls).some((row) => row.id === value && row.phase1);
}

export function selectableOnboardLocals(halls?: readonly OnboardHall[] | null) {
  return mergedOnboardHalls(halls).filter((row) => row.phase1);
}

export function onboardSeedByEmail(email?: string | null) {
  const key = (email || "").trim().toLowerCase();
  return ONBOARD_SEED_SEATS.find((row) => row.email === key);
}

export function onboardSeedCompanyForEmail(email?: string | null) {
  return onboardSeedByEmail(email)?.company;
}

export function normalizeOnboardStageId(value: unknown): OnboardStageId | null {
  if (typeof value !== "string" || !value.trim()) return null;
  if (STAGE_IDS.has(value)) return value as OnboardStageId;
  return LEGACY_STAGE_MAP[value] ?? null;
}

export function isOnboardStageId(value: unknown): value is OnboardStageId {
  return normalizeOnboardStageId(value) != null && STAGE_IDS.has(String(value));
}

export function onboardLocal(id: OnboardLocalId, halls?: readonly OnboardHall[] | null) {
  return mergedOnboardHalls(halls).find((row) => row.id === id) ?? seedOnboardHalls()[0];
}

export function onboardStage(id: OnboardStageId) {
  return ONBOARD_STAGES.find((row) => row.id === id) ?? ONBOARD_STAGES[0];
}

export function onboardStageOwner(id: OnboardStageId): string | null {
  return onboardStage(id).owner;
}

export function onboardStepNumber(id: OnboardStageId): number {
  return onboardStage(id).step;
}

export function defaultCraftForLocal(localId: OnboardLocalId) {
  return onboardLocal(localId).craft;
}

export function hallContactForLocal(localId: OnboardLocalId, halls?: readonly OnboardHall[] | null) {
  const hall = mergedOnboardHalls(halls).find((row) => row.id === localId);
  if (hall && (hall.contactEmail || hall.contactName)) {
    return { name: hall.contactName, email: hall.contactEmail, title: hall.contactTitle || `Hall Local ${hall.id}` };
  }
  if (localId === "553") {
    return { name: JOHN_BATTUELLO_NAME, email: JOHN_BATTUELLO_EMAIL, title: "Hall Local 553" };
  }
  return null;
}

export function hallLocalForSeat(user?: OnboardViewer | null, halls?: readonly OnboardHall[] | null): OnboardLocalId | null {
  if (!user) return null;
  const email = (user.email || "").trim().toLowerCase();
  const catalog = mergedOnboardHalls(halls);
  if (email) {
    const byEmail = catalog.find((row) => row.contactEmail && row.contactEmail === email);
    if (byEmail) return byEmail.id;
  }
  if (email === JOHN_BATTUELLO_EMAIL) return "553";
  if (/johnny\s+battuello|john\s+battuello/i.test(user.name || "")) return "553";
  const hay = `${user.jobTitle || ""} ${user.name || ""} ${email}`;
  for (const hall of catalog) {
    const title = (hall.contactTitle || "").trim();
    if (title && new RegExp(title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(hay)) return hall.id;
    if (new RegExp(`\\b${hall.id}\\b|hall local ${hall.id}`, "i").test(hay)) return hall.id;
    if (hall.short && new RegExp(`\\b${hall.short}\\b`, "i").test(hay)) return hall.id;
    if (hall.contactName && new RegExp(hall.contactName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(user.name || "")) {
      return hall.id;
    }
  }
  const titled = /\bhall local (\d{2,5})\b/i.exec(hay);
  if (titled?.[1]) return titled[1];
  if (/\b553\b|pf553|pipefitter hall/i.test(hay)) return "553";
  if (/\b363\b|bm363|boilermaker hall/i.test(hay)) return "363";
  return null;
}

export function isHallSeat(user?: OnboardViewer | null, halls?: readonly OnboardHall[] | null): boolean {
  return hallLocalForSeat(user, halls) != null;
}

export function isTomFriedSeat(user?: OnboardViewer | null): boolean {
  if (!user) return false;
  if (user.id === TOM_FRIED_SEAT_ID) return true;
  if ((user.email || "").trim().toLowerCase() === TOM_FRIED_EMAIL) return true;
  return /tom\s+fried/i.test(`${user.name || ""} ${user.jobTitle || ""}`);
}

export function isBennyCampSeat(user?: OnboardViewer | null): boolean {
  if (!user) return false;
  if (user.id === BENNY_CAMP_SEAT_ID) return true;
  if ((user.email || "").trim().toLowerCase() === BENNY_CAMP_EMAIL) return true;
  return /benny\s+camp/i.test(`${user.name || ""} ${user.jobTitle || ""}`);
}

export function isDebbieTrackerSeat(user?: OnboardViewer | null): boolean {
  if (!user) return false;
  return /\bdebbie\b/i.test(`${user.name || ""} ${user.jobTitle || ""}`);
}

export function isTrackerKeeper(user?: OnboardViewer | null): boolean {
  return isTomFriedSeat(user) || isDebbieTrackerSeat(user);
}

export function isOutreachSeat(user?: OnboardViewer | null): boolean {
  if (!user) return false;
  if (user.role === "owner") return true;
  const email = (user.email || "").trim().toLowerCase();
  if (email === NATHAN_BOYTE_EMAIL) return true;
  return /nathan\s+boyte/i.test(user.name || "") || /ben\s+peffley/i.test(user.name || "");
}

export function canSeeOnboardBoard(user?: OnboardViewer | null): boolean {
  if (!user) return false;
  if (isRateVaultOnlyViewer(user)) return false;
  return Boolean((user.email || "").trim() || (user.id || "").trim() || (user.name || "").trim());
}

/** Dispatch is a public Home tile. Rate-Vault-only James stays off this door. */
export function canSeeOnboardDoor(
  session?: OnboardViewer | null,
  lens?: OnboardViewer | null,
): boolean {
  const viewer = lens ?? session;
  if (!viewer || isRateVaultOnlyViewer(viewer)) return false;
  return Boolean((viewer.email || "").trim() || (viewer.id || "").trim() || (viewer.name || "").trim() || viewer.role);
}

/** Company working-desk / PM / HSE / dispatcher seats — not hall-only, not Owner-only. */
export function isCompanyOnboardWriter(user?: OnboardViewer | null): boolean {
  if (!user) return false;
  return (
    hasBuildDesk(user) ||
    hasWorkingDesk(user) ||
    isHseVaultSeat(user) ||
    isProjectManager(user) ||
    isBennyCampSeat(user) ||
    isTomFriedSeat(user)
  );
}

export function canManageOnboardHalls(user?: OnboardViewer | null): boolean {
  if (!user || !canSeeOnboardBoard(user)) return false;
  if (isHallSeat(user) && !isCompanyOnboardWriter(user)) return false;
  return isCompanyOnboardWriter(user);
}

export function canRegisterOnboard(user?: OnboardViewer | null, settings?: OnboardSettings | null): boolean {
  if (!user || !canSeeOnboardBoard(user)) return false;
  if (isCompanyOnboardWriter(user)) return true;
  const submitter = settings?.step1Submitter ?? DEFAULT_ONBOARD_SETTINGS.step1Submitter;
  return submitter === "hall" && isHallSeat(user);
}

export function canAdvanceOnboard(user?: OnboardViewer | null): boolean {
  if (!user) return false;
  return (
    hasBuildDesk(user) ||
    isHseVaultSeat(user) ||
    isBennyCampSeat(user) ||
    isTomFriedSeat(user) ||
    isDebbieTrackerSeat(user)
  );
}

export function canUpdateTracker(user?: OnboardViewer | null): boolean {
  if (!user) return false;
  return canAdvanceOnboard(user);
}

export function canUpdateOutreach(user?: OnboardViewer | null): boolean {
  if (!user) return false;
  return canUpdateTracker(user) || isOutreachSeat(user);
}

export function canSeeRestrictedPii(user?: OnboardViewer | null): boolean {
  if (!user) return false;
  if (isHallSeat(user) && !hasBuildDesk(user) && !isHseVaultSeat(user) && !isTomFriedSeat(user)) return false;
  return (
    hasBuildDesk(user) ||
    isHseVaultSeat(user) ||
    isTomFriedSeat(user) ||
    isDebbieTrackerSeat(user) ||
    isBennyCampSeat(user)
  );
}

export function canConfigureOnboard(user?: OnboardViewer | null): boolean {
  return hasBuildDesk(user);
}

export function canCreateManpowerRequest(user?: OnboardViewer | null): boolean {
  if (!user) return false;
  return hasBuildDesk(user) || isHseVaultSeat(user) || isBennyCampSeat(user) || isTomFriedSeat(user);
}

export function canRespondManpowerRequest(user?: OnboardViewer | null): boolean {
  if (!user) return false;
  return isHallSeat(user) || hasBuildDesk(user);
}

export function parseEmailList(value: unknown): string[] {
  const items = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[,;\n]+/)
      : [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const email = String(item || "")
      .trim()
      .toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) continue;
    if (seen.has(email)) continue;
    seen.add(email);
    out.push(email);
  }
  return out;
}

export function parseOnboardSettings(raw: unknown): OnboardSettings {
  const row = raw && typeof raw === "object" ? (raw as Partial<OnboardSettings>) : {};
  return {
    step1Submitter: row.step1Submitter === "hall" ? "hall" : "site",
    corporateEmails: parseEmailList(row.corporateEmails),
    pmEmails: parseEmailList(row.pmEmails),
  };
}

export function isTrainingStatus(value: unknown): value is TrainingStatus {
  return value === "not-started" || value === "scheduled" || value === "complete";
}

export function parseTrainingStatus(value: unknown): TrainingStatus {
  return isTrainingStatus(value) ? value : "not-started";
}

/** RESTRICTED PII. Digits-only 9-digit SSN. Empty when a full SSN is not present. */
export function parseSsn(value: unknown): string {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (digits.length >= 9) return digits.slice(-9);
  return "";
}

export function parseSsnLast4(value: unknown): string {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (digits.length >= 4) return digits.slice(-4);
  return "";
}

/** Mask any stored SSN or last-4 as •••-••-1234. Safe for unauthorized-adjacent UI. */
export function maskSsnLast4(ssnOrLast4: string): string {
  const last4 = parseSsnLast4(ssnOrLast4);
  return last4 ? `•••-••-${last4}` : "";
}

/** Format digits for the focused SSN input. Last-4 stays ungrouped; 5+ uses XXX-XX-XXXX. */
export function formatSsnInput(value: unknown): string {
  const digits = String(value ?? "").replace(/\D/g, "").slice(0, 9);
  if (digits.length <= 4) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
}

/**
 * Read stored SSN fields. Full 9-digit `ssn` wins; otherwise keep a legacy last-4
 * on `ssnLast4` without wiping it.
 */
export function parseStoredOnboardSsn(row: { ssn?: unknown; ssnLast4?: unknown }): {
  ssn: string;
  ssnLast4: string;
} {
  const ssn = parseSsn(row.ssn);
  if (ssn) return { ssn, ssnLast4: ssn.slice(-4) };
  return { ssn: "", ssnLast4: parseSsnLast4(row.ssnLast4 || row.ssn) };
}

function applyOnboardSsnPatch(
  current: Pick<OnboardPerson, "ssn" | "ssnLast4">,
  raw: unknown,
): { ssn: string; ssnLast4: string } | { error: string } {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (!digits) return { ssn: "", ssnLast4: "" };
  if (digits.length >= 9) {
    const ssn = digits.slice(-9);
    return { ssn, ssnLast4: ssn.slice(-4) };
  }
  if (digits.length === 4) {
    if (current.ssn.length === 9 && current.ssn.endsWith(digits)) {
      return { ssn: current.ssn, ssnLast4: digits };
    }
    return { ssn: "", ssnLast4: digits };
  }
  return { error: "Enter a full 9-digit Social Security number." };
}

export function displayOnboardName(person: Pick<OnboardPerson, "name" | "legalName" | "identityVerifiedAt">) {
  const legal = (person.legalName || "").trim();
  if (legal && person.identityVerifiedAt) return legal;
  return person.name;
}

function emptyIdentity(): Pick<
  OnboardPerson,
  | "legalName"
  | "dateOfBirth"
  | "ssn"
  | "ssnLast4"
  | "identityVerifiedBy"
  | "identityVerifiedAt"
  | "p66CorporateTraining"
  | "p66SiteTraining"
  | "p66PrecertTraining"
  | "hireInLinkSent"
  | "hireInLinkSentAt"
  | "hireInDeliveryConfirmed"
  | "hireInDeliveryConfirmedAt"
  | "verifiedEmployeeReceivedHireInLink"
  | "tomFriedContactConfirmed"
  | "problemCase"
  | "problemCaseNote"
> {
  return {
    legalName: "",
    dateOfBirth: "",
    ssn: "",
    ssnLast4: "",
    identityVerifiedBy: "",
    identityVerifiedAt: "",
    p66CorporateTraining: "not-started",
    p66SiteTraining: "not-started",
    p66PrecertTraining: "not-started",
    hireInLinkSent: false,
    hireInLinkSentAt: "",
    hireInDeliveryConfirmed: false,
    hireInDeliveryConfirmedAt: "",
    verifiedEmployeeReceivedHireInLink: false,
    tomFriedContactConfirmed: false,
    problemCase: false,
    problemCaseNote: "",
  };
}

export function redactOnboardPerson(person: OnboardPerson, user?: OnboardViewer | null): OnboardPerson {
  if (canSeeRestrictedPii(user)) return person;
  return {
    ...person,
    legalName: "",
    dateOfBirth: "",
    ssn: "",
    ssnLast4: "",
    identityVerifiedBy: person.identityVerifiedAt ? "restricted" : "",
  };
}

export function visibleOnboardPeople(people: readonly OnboardPerson[], user?: OnboardViewer | null) {
  const local = hallLocalForSeat(user);
  let rows = [...people];
  if (
    local &&
    !hasBuildDesk(user) &&
    !isHseVaultSeat(user) &&
    !isBennyCampSeat(user) &&
    !isTomFriedSeat(user) &&
    !hasWorkingDesk(user) &&
    !isProjectManager(user) &&
    !isOutreachSeat(user) &&
    !isDebbieTrackerSeat(user)
  ) {
    rows = rows.filter((person) => person.localId === local);
  }
  return rows.map((person) => redactOnboardPerson(person, user));
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
  const toStage = normalizeOnboardStageId(row.toStage);
  if (!toStage) return null;
  const fromStage = row.fromStage == null ? null : normalizeOnboardStageId(row.fromStage);
  if (row.fromStage != null && !fromStage) return null;
  return {
    id: row.id.trim(),
    at: row.at,
    actorName: row.actorName.trim(),
    actorEmail: typeof row.actorEmail === "string" ? row.actorEmail.trim().toLowerCase() : "",
    fromStage,
    toStage,
    note: typeof row.note === "string" ? row.note : "",
  };
}

function parseBool(value: unknown): boolean {
  return value === true || value === "true" || value === 1 || value === "1";
}

export function parseOnboardHall(raw: unknown): OnboardHall | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Partial<OnboardHall>;
  const id = String(row.id ?? "").trim();
  if (!LOCAL_ID_RE.test(id)) return null;
  const label = typeof row.label === "string" && row.label.trim() ? row.label.trim() : `Local ${id}`;
  const craft = typeof row.craft === "string" ? row.craft.trim() : "";
  const union = typeof row.union === "string" ? row.union.trim() : "";
  const contactEmail = typeof row.contactEmail === "string" ? row.contactEmail.trim().toLowerCase() : "";
  if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) return null;
  return {
    id,
    label,
    craft,
    union,
    short:
      typeof row.short === "string" && row.short.trim() ? row.short.trim() : hallShort(craft, id, union),
    phase1: row.phase1 === true,
    contactName: typeof row.contactName === "string" ? row.contactName.trim() : "",
    contactEmail,
    contactTitle:
      typeof row.contactTitle === "string" && row.contactTitle.trim()
        ? row.contactTitle.trim()
        : `Hall Local ${id}`,
  };
}

export function parseOnboardHallList(raw: unknown): OnboardHall[] {
  if (!Array.isArray(raw)) return [];
  const out: OnboardHall[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const hall = parseOnboardHall(item);
    if (!hall || seen.has(hall.id)) continue;
    seen.add(hall.id);
    out.push(hall);
  }
  return out;
}

export function parseOnboardHallInput(raw: unknown): OnboardHall | { error: string } {
  if (!raw || typeof raw !== "object") return { error: "Enter the hall fields." };
  const row = raw as Partial<OnboardHall> & { localNumber?: unknown; jobTitle?: unknown; phaseOne?: unknown };
  const id = String(row.id ?? row.localNumber ?? "").replace(/\D/g, "");
  if (!LOCAL_ID_RE.test(id)) return { error: "Enter a local number (2–5 digits)." };
  const label = typeof row.label === "string" ? row.label.trim() : "";
  if (label.length < 2) return { error: "Enter the hall name / label." };
  const craft = typeof row.craft === "string" ? row.craft.trim() : "";
  if (!craft) return { error: "Enter the craft / trade." };
  const union = typeof row.union === "string" ? row.union.trim() : "";
  if (!union) return { error: "Enter the union." };
  const contactName = typeof row.contactName === "string" ? row.contactName.trim() : "";
  const contactEmail = typeof row.contactEmail === "string" ? row.contactEmail.trim().toLowerCase() : "";
  if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
    return { error: "Enter a valid hall contact email, or leave it blank." };
  }
  const contactTitle =
    typeof row.contactTitle === "string" && row.contactTitle.trim()
      ? row.contactTitle.trim()
      : typeof row.jobTitle === "string" && row.jobTitle.trim()
        ? row.jobTitle.trim()
        : `Hall Local ${id}`;
  return {
    id,
    label,
    craft,
    union,
    short: hallShort(craft, id, union),
    phase1: row.phase1 === true || row.phaseOne === true,
    contactName,
    contactEmail,
    contactTitle,
  };
}

export function parseOnboardPerson(raw: unknown, halls?: readonly OnboardHall[] | null): OnboardPerson | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Partial<OnboardPerson> & { stage?: unknown };
  if (typeof row.id !== "string" || !row.id.trim()) return null;
  if (typeof row.name !== "string" || !row.name.trim()) return null;
  if (!isOnboardLocalId(row.localId, halls)) return null;
  const stage = normalizeOnboardStageId(row.stage) ?? "step-1";
  const events: OnboardEvent[] = [];
  const seen = new Set<string>();
  for (const item of Array.isArray(row.events) ? row.events : []) {
    const event = parseOnboardEvent(item);
    if (!event || seen.has(event.id)) continue;
    seen.add(event.id);
    events.push(event);
  }
  const local = onboardLocal(row.localId, halls);
  const identity = emptyIdentity();
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
    requestId: typeof row.requestId === "string" ? row.requestId.trim() : "",
    legalName: typeof row.legalName === "string" ? row.legalName.trim() : identity.legalName,
    dateOfBirth: typeof row.dateOfBirth === "string" ? row.dateOfBirth.trim() : identity.dateOfBirth,
    ...parseStoredOnboardSsn(row),
    identityVerifiedBy: typeof row.identityVerifiedBy === "string" ? row.identityVerifiedBy.trim() : "",
    identityVerifiedAt: typeof row.identityVerifiedAt === "string" ? row.identityVerifiedAt.trim() : "",
    p66CorporateTraining: parseTrainingStatus(row.p66CorporateTraining),
    p66SiteTraining: parseTrainingStatus(row.p66SiteTraining),
    p66PrecertTraining: parseTrainingStatus(row.p66PrecertTraining),
    hireInLinkSent: parseBool(row.hireInLinkSent),
    hireInLinkSentAt: typeof row.hireInLinkSentAt === "string" ? row.hireInLinkSentAt.trim() : "",
    hireInDeliveryConfirmed: parseBool(row.hireInDeliveryConfirmed),
    hireInDeliveryConfirmedAt: typeof row.hireInDeliveryConfirmedAt === "string" ? row.hireInDeliveryConfirmedAt.trim() : "",
    verifiedEmployeeReceivedHireInLink: parseBool(row.verifiedEmployeeReceivedHireInLink),
    tomFriedContactConfirmed: parseBool(row.tomFriedContactConfirmed),
    problemCase: parseBool(row.problemCase),
    problemCaseNote: typeof row.problemCaseNote === "string" ? row.problemCaseNote.trim() : "",
    events,
  };
}

export function parseOnboardFile(raw: unknown): OnboardFile {
  const parsed = raw && typeof raw === "object" ? (raw as Partial<OnboardFile>) : {};
  const halls = mergeOnboardHalls(seedOnboardHalls(), parseOnboardHallList(parsed.halls));
  const people: OnboardPerson[] = [];
  const seen = new Set<string>();
  for (const item of Array.isArray(parsed.people) ? parsed.people : []) {
    const person = parseOnboardPerson(item, halls);
    if (!person || seen.has(person.id)) continue;
    seen.add(person.id);
    people.push(person);
  }
  const requests: ManpowerRequest[] = [];
  const seenRequests = new Set<string>();
  for (const item of Array.isArray(parsed.requests) ? parsed.requests : []) {
    const request = parseManpowerRequest(item, halls);
    if (!request || seenRequests.has(request.id)) continue;
    seenRequests.add(request.id);
    requests.push(request);
  }
  return { people, requests, settings: parseOnboardSettings(parsed.settings), halls };
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
  requestId?: string;
  actor?: OnboardViewer | null;
  settings?: OnboardSettings | null;
  halls?: readonly OnboardHall[] | null;
  at?: string;
  id?: string;
}): OnboardPerson | { error: string } {
  if (!canRegisterOnboard(input.actor, input.settings)) {
    return {
      error:
        (input.settings?.step1Submitter ?? DEFAULT_ONBOARD_SETTINGS.step1Submitter) === "hall"
          ? "This seat cannot register people."
          : "Step 1 name and phone are submitted by site (Owner-configurable).",
    };
  }
  const name = input.name.trim();
  if (name.length < 2) return { error: "Enter the person's name." };
  const phone = (input.phone || "").trim();
  if (phone.length < 7) return { error: "Enter the phone number submitted to the DISA DER." };
  if (!isOnboardLocalId(input.localId, input.halls)) return { error: "Pick a hall that is on this desk." };
  if (!isOnboardPhase1Local(input.localId, input.halls)) return { error: "That local is not phase-one yet." };
  const hallLocal = hallLocalForSeat(input.actor, input.halls);
  if (hallLocal && hallLocal !== input.localId) {
    return { error: `Hall seats can only register Local ${hallLocal}.` };
  }
  const hallContact = hallContactForLocal(input.localId, input.halls);
  if (hallContact && isHallSeat(input.actor, input.halls) && !hasBuildDesk(input.actor)) {
    const email = (input.actor?.email || "").trim().toLowerCase();
    if (email !== hallContact.email) {
      return { error: `Local ${input.localId} register is gated to ${hallContact.email}.` };
    }
  }
  const at = input.at || new Date().toISOString();
  const stamp = actorStamp(input.actor);
  const local = onboardLocal(input.localId, input.halls);
  const person: OnboardPerson = {
    id: input.id || newOnboardId("ob"),
    name,
    localId: input.localId,
    craft: (input.craft || "").trim() || local.craft,
    classification: (input.classification || "").trim(),
    phone,
    email: (input.email || "").trim(),
    referredFor: (input.referredFor || "").trim(),
    siteId: (input.siteId || "").trim() || DEFAULT_ONBOARD_PLANT.siteId,
    site: (input.site || "").trim() || DEFAULT_ONBOARD_PLANT.site,
    client: (input.client || "").trim() || DEFAULT_ONBOARD_PLANT.client,
    stage: "step-1",
    blockedReason: "",
    createdAt: at,
    updatedAt: at,
    createdByName: stamp.actorName,
    createdByEmail: stamp.actorEmail,
    requestId: (input.requestId || "").trim(),
    ...emptyIdentity(),
    events: [],
  };
  person.events = appendOnboardEvent(person.events, {
    actor: input.actor,
    fromStage: null,
    toStage: "step-1",
    note: person.requestId
      ? `Submitted name + phone to DISA DER · request ${person.requestId}`
      : "Submitted name + phone to DISA DER",
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
  const toStage = normalizeOnboardStageId(input.toStage);
  if (!toStage) return { error: "Pick a stage." };
  if (toStage === person.stage) return { error: "That person is already in that stage." };
  if (toStage === "blocked") {
    const reason = (input.note || "").trim();
    if (!reason) return { error: "Blocked / failed needs a reason." };
  }
  if (person.stage === "blocked" && toStage !== "step-1" && toStage !== "step-2") {
    return { error: "Reopen a blocked person to Submitted to DISA DER." };
  }
  if (person.stage !== "blocked" && toStage !== "blocked") {
    const expected = nextOnboardStage(person.stage);
    if (expected !== toStage) {
      return { error: expected ? `Next step is ${onboardStage(expected).label}.` : "That person is already cleared." };
    }
  }
  const at = input.at || new Date().toISOString();
  return {
    ...person,
    stage: toStage,
    blockedReason: toStage === "blocked" ? (input.note || "").trim() : "",
    updatedAt: at,
    events: appendOnboardEvent(person.events, {
      actor: input.actor,
      fromStage: person.stage,
      toStage,
      note: input.note,
      at,
    }),
  };
}

export function updateOnboardPerson(
  person: OnboardPerson,
  patch: OnboardPersonPatch,
  actor?: OnboardViewer | null,
  at = new Date().toISOString(),
): OnboardPerson | { error: string } {
  if (!canUpdateOutreach(actor)) {
    return { error: "Tracker fields are updated by Tom Fried, Debbie, or the outreach team." };
  }
  const tracker = canUpdateTracker(actor);
  const pii = canSeeRestrictedPii(actor);
  const next: OnboardPerson = { ...person, updatedAt: at };
  const notes: string[] = [];

  if (tracker && pii) {
    if (patch.legalName != null) next.legalName = patch.legalName.trim();
    if (patch.dateOfBirth != null) next.dateOfBirth = patch.dateOfBirth.trim();
    if (patch.ssn != null || patch.ssnLast4 != null) {
      const applied = applyOnboardSsnPatch(next, patch.ssn ?? patch.ssnLast4);
      if ("error" in applied) return applied;
      const changed = applied.ssn !== next.ssn || applied.ssnLast4 !== next.ssnLast4;
      next.ssn = applied.ssn;
      next.ssnLast4 = applied.ssnLast4;
      if (changed) notes.push("SSN updated");
    }
    if (patch.identityVerified === true) {
      const stamp = actorStamp(actor);
      next.identityVerifiedBy = stamp.actorName;
      next.identityVerifiedAt = at;
      notes.push("Legal name / DOB / SSN verified");
    }
    if (patch.p66CorporateTraining && isTrainingStatus(patch.p66CorporateTraining)) {
      next.p66CorporateTraining = patch.p66CorporateTraining;
      notes.push(`P66 corporate training ${patch.p66CorporateTraining}`);
    }
    if (patch.p66SiteTraining && isTrainingStatus(patch.p66SiteTraining)) {
      next.p66SiteTraining = patch.p66SiteTraining;
      notes.push(`P66 site-specific training ${patch.p66SiteTraining}`);
    }
    if (patch.p66PrecertTraining && isTrainingStatus(patch.p66PrecertTraining)) {
      next.p66PrecertTraining = patch.p66PrecertTraining;
      notes.push(`P66 pre-cert training ${patch.p66PrecertTraining}`);
    }
  } else if (
    patch.legalName != null ||
    patch.dateOfBirth != null ||
    patch.ssn != null ||
    patch.ssnLast4 != null ||
    patch.identityVerified ||
    patch.p66CorporateTraining ||
    patch.p66SiteTraining ||
    patch.p66PrecertTraining
  ) {
    return { error: "Restricted PII and training statuses are least-privilege." };
  }

  if (patch.hireInLinkSent != null) {
    next.hireInLinkSent = Boolean(patch.hireInLinkSent);
    next.hireInLinkSentAt = next.hireInLinkSent ? at : "";
    notes.push(next.hireInLinkSent ? "HireIn link sent" : "HireIn link cleared");
  }
  if (patch.hireInDeliveryConfirmed != null) {
    next.hireInDeliveryConfirmed = Boolean(patch.hireInDeliveryConfirmed);
    next.hireInDeliveryConfirmedAt = next.hireInDeliveryConfirmed ? at : "";
    notes.push(next.hireInDeliveryConfirmed ? "HireIn delivery confirmed" : "HireIn delivery cleared");
  }
  if (patch.verifiedEmployeeReceivedHireInLink != null) {
    next.verifiedEmployeeReceivedHireInLink = Boolean(patch.verifiedEmployeeReceivedHireInLink);
    notes.push(
      next.verifiedEmployeeReceivedHireInLink
        ? HIRE_IN_VERIFIED_FIELD_LABEL
        : `${HIRE_IN_VERIFIED_FIELD_LABEL} cleared`,
    );
  }
  if (patch.tomFriedContactConfirmed != null) {
    next.tomFriedContactConfirmed = Boolean(patch.tomFriedContactConfirmed);
    notes.push(
      next.tomFriedContactConfirmed
        ? "Employee confirmed contact with Tom Fried"
        : "Tom Fried contact cleared",
    );
  }
  if (tracker || isOutreachSeat(actor)) {
    if (patch.problemCase != null) {
      next.problemCase = Boolean(patch.problemCase);
      notes.push(next.problemCase ? "Problem case" : "Problem case cleared");
    }
    if (patch.problemCaseNote != null) next.problemCaseNote = patch.problemCaseNote.trim();
  }

  const extra = (patch.note || "").trim();
  if (extra) notes.push(extra);
  if (!notes.length) return { error: "Nothing to update." };
  next.events = appendOnboardEvent(next.events, {
    actor,
    fromStage: person.stage,
    toStage: person.stage,
    note: notes.join(" · "),
    at,
  });
  return next;
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

export function visibleManpowerRequests(requests: readonly ManpowerRequest[], user?: OnboardViewer | null) {
  const local = hallLocalForSeat(user);
  if (!local) return [...requests];
  if (
    hasBuildDesk(user) ||
    isHseVaultSeat(user) ||
    isBennyCampSeat(user) ||
    isTomFriedSeat(user) ||
    hasWorkingDesk(user) ||
    isProjectManager(user)
  ) {
    return [...requests];
  }
  return requests.filter((row) => row.localId === local);
}

function parseManpowerEvent(raw: unknown): ManpowerRequestEvent | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Partial<ManpowerRequestEvent>;
  if (typeof row.id !== "string" || !row.id.trim()) return null;
  if (typeof row.at !== "string" || !row.at.trim()) return null;
  if (typeof row.actorName !== "string" || !row.actorName.trim()) return null;
  if (row.action !== "created" && row.action !== "responded") return null;
  return {
    id: row.id.trim(),
    at: row.at,
    actorName: row.actorName.trim(),
    actorEmail: typeof row.actorEmail === "string" ? row.actorEmail.trim().toLowerCase() : "",
    action: row.action,
    note: typeof row.note === "string" ? row.note : "",
  };
}

export function parseManpowerRequest(raw: unknown, halls?: readonly OnboardHall[] | null): ManpowerRequest | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Partial<ManpowerRequest> & { fillCount?: unknown; headcount?: unknown };
  if (typeof row.id !== "string" || !row.id.trim()) return null;
  if (!isOnboardLocalId(row.localId, halls)) return null;
  const events: ManpowerRequestEvent[] = [];
  const seen = new Set<string>();
  for (const item of Array.isArray(row.events) ? row.events : []) {
    const event = parseManpowerEvent(item);
    if (!event || seen.has(event.id)) continue;
    seen.add(event.id);
    events.push(event);
  }
  const headcount = typeof row.headcount === "number" ? row.headcount : Number(row.headcount);
  const rawFill = row.fillCount as unknown;
  const fillCount =
    rawFill == null || rawFill === ""
      ? null
      : typeof rawFill === "number"
        ? rawFill
        : Number(rawFill);
  return {
    id: row.id.trim(),
    localId: row.localId,
    dateNeeded: typeof row.dateNeeded === "string" ? row.dateNeeded.trim() : "",
    headcount: Number.isFinite(headcount) && headcount > 0 ? Math.floor(headcount) : 0,
    trade: typeof row.trade === "string" && row.trade.trim() ? row.trade.trim() : onboardLocal(row.localId, halls).craft,
    classification: typeof row.classification === "string" ? row.classification.trim() : "",
    site: typeof row.site === "string" && row.site.trim() ? row.site.trim() : DEFAULT_ONBOARD_PLANT.site,
    job: typeof row.job === "string" ? row.job.trim() : "",
    requiredCerts: typeof row.requiredCerts === "string" ? row.requiredCerts.trim() : "",
    requiredScreenings: typeof row.requiredScreenings === "string" ? row.requiredScreenings.trim() : "",
    hiringPackageNotes: typeof row.hiringPackageNotes === "string" ? row.hiringPackageNotes.trim() : "",
    status: row.status === "responded" ? "responded" : "open",
    createdAt: typeof row.createdAt === "string" && row.createdAt.trim() ? row.createdAt : new Date().toISOString(),
    createdByName: typeof row.createdByName === "string" ? row.createdByName.trim() : "",
    createdByEmail: typeof row.createdByEmail === "string" ? row.createdByEmail.trim().toLowerCase() : "",
    fillCount: fillCount != null && Number.isFinite(fillCount) && fillCount >= 0 ? Math.floor(fillCount) : null,
    fillDate: typeof row.fillDate === "string" ? row.fillDate.trim() : "",
    respondedAt: typeof row.respondedAt === "string" ? row.respondedAt.trim() : "",
    respondedByName: typeof row.respondedByName === "string" ? row.respondedByName.trim() : "",
    respondedByEmail: typeof row.respondedByEmail === "string" ? row.respondedByEmail.trim().toLowerCase() : "",
    events,
  };
}

export function createManpowerRequest(input: {
  localId: OnboardLocalId;
  dateNeeded: string;
  headcount: number | string;
  trade?: string;
  classification?: string;
  site?: string;
  job?: string;
  requiredCerts?: string;
  requiredScreenings?: string;
  hiringPackageNotes?: string;
  actor?: OnboardViewer | null;
  halls?: readonly OnboardHall[] | null;
  at?: string;
  id?: string;
}): ManpowerRequest | { error: string } {
  if (!canCreateManpowerRequest(input.actor)) {
    return { error: "Manpower requests are created by Tom / Benny / HSE." };
  }
  if (!isOnboardLocalId(input.localId, input.halls)) return { error: "Pick a hall that is on this desk." };
  if (!isOnboardPhase1Local(input.localId, input.halls)) return { error: "That local is not phase-one yet." };
  const dateNeeded = input.dateNeeded.trim();
  if (!dateNeeded) return { error: "Enter the date needed." };
  const headcount = typeof input.headcount === "number" ? input.headcount : Number(input.headcount);
  if (!Number.isFinite(headcount) || headcount < 1) return { error: "Enter how many people are needed." };
  const at = input.at || new Date().toISOString();
  const stamp = actorStamp(input.actor);
  const local = onboardLocal(input.localId, input.halls);
  const request: ManpowerRequest = {
    id: input.id || newOnboardId("mr"),
    localId: input.localId,
    dateNeeded,
    headcount: Math.floor(headcount),
    trade: (input.trade || "").trim() || local.craft,
    classification: (input.classification || "").trim(),
    site: (input.site || "").trim() || DEFAULT_ONBOARD_PLANT.site,
    job: (input.job || "").trim(),
    requiredCerts: (input.requiredCerts || "").trim(),
    requiredScreenings: (input.requiredScreenings || "").trim(),
    hiringPackageNotes: (input.hiringPackageNotes || "").trim(),
    status: "open",
    createdAt: at,
    createdByName: stamp.actorName,
    createdByEmail: stamp.actorEmail,
    fillCount: null,
    fillDate: "",
    respondedAt: "",
    respondedByName: "",
    respondedByEmail: "",
    events: [
      {
        id: newOnboardId("mre"),
        at,
        actorName: stamp.actorName,
        actorEmail: stamp.actorEmail,
        action: "created",
        note: `${Math.floor(headcount)} ${local.craft} needed ${dateNeeded}`,
      },
    ],
  };
  return request;
}

export function respondManpowerRequest(
  request: ManpowerRequest,
  input: {
    fillCount: number | string;
    fillDate: string;
    actor?: OnboardViewer | null;
    halls?: readonly OnboardHall[] | null;
    at?: string;
  },
): ManpowerRequest | { error: string } {
  if (!canRespondManpowerRequest(input.actor)) {
    return { error: "Hall seats respond to manpower requests." };
  }
  const hallLocal = hallLocalForSeat(input.actor, input.halls);
  if (hallLocal && hallLocal !== request.localId) {
    return { error: `Hall seats can only respond to Local ${hallLocal}.` };
  }
  const hallContact = hallContactForLocal(request.localId, input.halls);
  if (hallContact && isHallSeat(input.actor, input.halls) && !hasBuildDesk(input.actor)) {
    const email = (input.actor?.email || "").trim().toLowerCase();
    if (email !== hallContact.email) {
      return { error: `Local ${request.localId} response is gated to ${hallContact.email}.` };
    }
  }
  if (request.status === "responded") return { error: "That request already has a hall response." };
  const fillCount = typeof input.fillCount === "number" ? input.fillCount : Number(input.fillCount);
  if (!Number.isFinite(fillCount) || fillCount < 0) return { error: "Enter how many the hall can fill." };
  const fillDate = input.fillDate.trim();
  if (!fillDate) return { error: "Enter when the hall can fill." };
  const at = input.at || new Date().toISOString();
  const stamp = actorStamp(input.actor);
  return {
    ...request,
    status: "responded",
    fillCount: Math.floor(fillCount),
    fillDate,
    respondedAt: at,
    respondedByName: stamp.actorName,
    respondedByEmail: stamp.actorEmail,
    events: [
      ...request.events,
      {
        id: newOnboardId("mre"),
        at,
        actorName: stamp.actorName,
        actorEmail: stamp.actorEmail,
        action: "responded",
        note: `Can fill ${Math.floor(fillCount)} on ${fillDate}`,
      },
    ],
  };
}

export function manpowerRequestLabel(request: ManpowerRequest) {
  const fill =
    request.status === "responded" && request.fillCount != null
      ? ` · hall fill ${request.fillCount}${request.fillDate ? ` on ${request.fillDate}` : ""}`
      : " · open";
  return `${request.id} · ${request.headcount} ${request.trade} by ${request.dateNeeded}${fill}`;
}

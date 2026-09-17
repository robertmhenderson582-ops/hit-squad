import { computeRangeHours, seatKind, type ClockOverride, type HoursSplit } from "./hours-clock.ts";
import { notifyEstimateSheets } from "./sheet-events.ts";

export const FCR_STORE_PREFIX = "hs_fcr_v1:";
export const MILEAGE_YES_FLAT = 2500;
export const DEFAULT_CHANGE_ORDER_SHELL = "Log";

/** Browser cache or a test store. Vault hydrate writes this key; vault is source of truth after merge. */
export type FcrStoreLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

export const LOG_STATUSES = ["Open", "Pending", "Cancelled"] as const;
export const IMPACT_LEVELS = ["Low", "High", "Critical"] as const;
export const APPROVAL_STATUSES = ["Approved", "Pending"] as const;
export const FCR_BLOCKS = ["Staff Day", "Staff Night", "Craft Day", "Craft Night"] as const;
export const FCR_DAYS = ["mo", "tu", "we", "th", "fr", "sa", "su"] as const;
export const FCR_DAY_LABELS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"] as const;

/** Pass-through / claimable cost types on an SCR estimate. Custom types stay allowed. */
export const CLAIMABLE_COST_TYPES = [
  "Subcontractor",
  "Third-party rental",
  "Equipment",
  "Material",
  "Travel",
  "Other",
] as const;
export type ClaimableCostType = (typeof CLAIMABLE_COST_TYPES)[number];

export type LogStatus = (typeof LOG_STATUSES)[number];
export type ImpactLevel = (typeof IMPACT_LEVELS)[number];
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];
export type FcrBlock = (typeof FCR_BLOCKS)[number];
export type FcrDayKey = (typeof FCR_DAYS)[number];
export type FcrDayHours = { st: number; ot: number; dt: number };
export type FcrWeek = Record<FcrDayKey, FcrDayHours>;

const DOW_TO_DAY: FcrDayKey[] = ["su", "mo", "tu", "we", "th", "fr", "sa"];

export type FcrLogHeader = {
  pm: string;
  costTracker: string;
  publishDate: string;
  nte: string;
  projectScope: string;
};

export type FcrLogRow = {
  id: string;
  scr: string;
  requestDate: string;
  requestedBy: string;
  reviewedBy: string;
  status: LogStatus;
  scope: string;
  impact: string;
  impactLevel: ImpactLevel;
  approvedBy: string;
  approvalStatus: ApprovalStatus;
  approvalDate: string;
  approvedMh: number;
  approvedCost: number;
  planChanges: string;
  revisedComp: string;
  notes: string;
  loggedBy: string;
  /** Scope-change hours. Workbook lines overwrite this when present. */
  scopeHours: number;
  /** Scope-change money. Workbook lines overwrite this when present. */
  scopeCost: number;
  craftLines: ScrCraftLine[];
  claimLines: ScrClaimLine[];
};

/** Simple SCR craft line — hours × composite ST/OT (DT optional). Not a day-grid. */
export type ScrCraftLine = {
  id: string;
  craft: string;
  stHours: number;
  otHours: number;
  dtHours: number;
  stRate: number;
  otRate: number;
  dtRate: number;
};

/** Claimable pass-through line. Dollars required; hours when the type needs them. */
export type ScrClaimLine = {
  id: string;
  type: string;
  description: string;
  amount: number;
  hours: number;
};

export type FcrPeopleRow = {
  id: string;
  block: FcrBlock;
  position: string;
  weeks: number;
  mileage: boolean;
  daysPd: number;
  headcount: number;
  week: FcrWeek;
  st: number;
  ot: number;
  dt: number;
};

export type FcrScr = {
  taRm: string;
  categories: string;
  moc: string;
  sap: string;
  costNote: string;
  scheduleNote: string;
  signOff: string;
};

export type FcrPacket = {
  header: FcrLogHeader;
  log: FcrLogRow[];
  people: FcrPeopleRow[];
  sub: number;
  equipment: number;
  misc: number;
  scr: FcrScr;
};

export type FcrJobRow = {
  id: string;
  position: string;
  shift: string;
  clockOverride?: ClockOverride;
  st?: number;
  ot?: number;
  dt?: number;
  pd?: number;
  hours?: HoursSplit | number;
  ranges?: {
    start: string;
    end: string;
    hoursPerShift: number;
    headcount: number;
    nightHeadcount: number;
    perDiemPeople: number;
    nightPerDiemPeople?: number;
    days: boolean[];
    otAfter8?: boolean;
    phaseId?: string;
    shift?: "Days" | "Nights" | "Days & nights";
    skipDates?: string[];
  }[];
};

function fallbackSplit(row: FcrJobRow): FcrDayHours & { pd: number } {
  if (row.hours && typeof row.hours === "object") {
    return { st: row.hours.st, ot: row.hours.ot, dt: row.hours.dt, pd: row.hours.pd };
  }
  return { st: row.st ?? 0, ot: row.ot ?? 0, dt: row.dt ?? 0, pd: row.pd ?? 0 };
}

function uid(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

export function emptyWeek(): FcrWeek {
  return {
    mo: { st: 0, ot: 0, dt: 0 },
    tu: { st: 0, ot: 0, dt: 0 },
    we: { st: 0, ot: 0, dt: 0 },
    th: { st: 0, ot: 0, dt: 0 },
    fr: { st: 0, ot: 0, dt: 0 },
    sa: { st: 0, ot: 0, dt: 0 },
    su: { st: 0, ot: 0, dt: 0 },
  };
}

export function weekTotals(week: FcrWeek): FcrDayHours {
  return FCR_DAYS.reduce(
    (sum, day) => ({
      st: sum.st + week[day].st,
      ot: sum.ot + week[day].ot,
      dt: sum.dt + week[day].dt,
    }),
    { st: 0, ot: 0, dt: 0 },
  );
}

export function peopleHours(row: FcrPeopleRow) {
  const totals = row.week ? weekTotals(row.week) : { st: row.st, ot: row.ot, dt: row.dt };
  return totals.st + totals.ot + totals.dt;
}

export function emptyFcrHeader(): FcrLogHeader {
  return { pm: "", costTracker: "", publishDate: "", nte: "", projectScope: "" };
}

export function blankLogRow(): FcrLogRow {
  return {
    id: uid("fcr"),
    scr: "",
    requestDate: "",
    requestedBy: "",
    reviewedBy: "",
    status: "Open",
    scope: "",
    impact: "",
    impactLevel: "Low",
    approvedBy: "",
    approvalStatus: "Pending",
    approvalDate: "",
    approvedMh: 0,
    approvedCost: 0,
    planChanges: "",
    revisedComp: "",
    notes: "",
    loggedBy: "",
    scopeHours: 0,
    scopeCost: 0,
    craftLines: [],
    claimLines: [],
  };
}

export function blankCraftLine(patch: Partial<ScrCraftLine> = {}): ScrCraftLine {
  return {
    id: typeof patch.id === "string" && patch.id.trim() ? patch.id : uid("scr-craft"),
    craft: typeof patch.craft === "string" ? patch.craft : "",
    stHours: Math.max(0, Number(patch.stHours) || 0),
    otHours: Math.max(0, Number(patch.otHours) || 0),
    dtHours: Math.max(0, Number(patch.dtHours) || 0),
    stRate: Math.max(0, Number(patch.stRate) || 0),
    otRate: Math.max(0, Number(patch.otRate) || 0),
    dtRate: Math.max(0, Number(patch.dtRate) || 0),
  };
}

export function blankClaimLine(patch: Partial<ScrClaimLine> = {}): ScrClaimLine {
  return {
    id: typeof patch.id === "string" && patch.id.trim() ? patch.id : uid("scr-claim"),
    type: typeof patch.type === "string" && patch.type.trim() ? patch.type.trim() : "Subcontractor",
    description: typeof patch.description === "string" ? patch.description : "",
    amount: Math.max(0, Number(patch.amount) || 0),
    hours: Math.max(0, Number(patch.hours) || 0),
  };
}

/** Subcontractor (and labor-like types) take hours; rentals and materials are dollars only. */
export function claimTypeNeedsHours(type = "") {
  return /subcontractor|\blabor\b/i.test(type.trim());
}

export function craftLineHours(line: Pick<ScrCraftLine, "stHours" | "otHours" | "dtHours">) {
  return Math.max(0, Number(line.stHours) || 0) + Math.max(0, Number(line.otHours) || 0) + Math.max(0, Number(line.dtHours) || 0);
}

export function craftLineLabor(line: Pick<ScrCraftLine, "stHours" | "otHours" | "dtHours" | "stRate" | "otRate" | "dtRate">) {
  const st = Math.max(0, Number(line.stHours) || 0) * Math.max(0, Number(line.stRate) || 0);
  const ot = Math.max(0, Number(line.otHours) || 0) * Math.max(0, Number(line.otRate) || 0);
  const dt = Math.max(0, Number(line.dtHours) || 0) * Math.max(0, Number(line.dtRate) || 0);
  return st + ot + dt;
}

export function logRowScope(row: Pick<FcrLogRow, "scopeHours" | "scopeCost" | "craftLines" | "claimLines">) {
  const craftLines = Array.isArray(row.craftLines) ? row.craftLines : [];
  const claimLines = Array.isArray(row.claimLines) ? row.claimLines : [];
  const labor = craftLines.reduce((sum, line) => sum + craftLineLabor(line), 0);
  const claims = claimLines.reduce((sum, line) => sum + Math.max(0, Number(line.amount) || 0), 0);
  const hours =
    craftLines.reduce((sum, line) => sum + craftLineHours(line), 0) +
    claimLines.reduce((sum, line) => sum + Math.max(0, Number(line.hours) || 0), 0);
  const hasLines = craftLines.length > 0 || claimLines.length > 0;
  return {
    hours: hasLines ? hours : Math.max(0, Number(row.scopeHours) || 0),
    cost: hasLines ? labor + claims : Math.max(0, Number(row.scopeCost) || 0),
    labor,
    claims,
    hasLines,
  };
}

function withSyncedScope(row: FcrLogRow): FcrLogRow {
  const scope = logRowScope(row);
  return { ...row, scopeHours: scope.hours, scopeCost: scope.cost };
}

export function patchLogRow(
  packet: FcrPacket,
  id: string,
  patch: Partial<FcrLogRow> | ((row: FcrLogRow) => FcrLogRow),
): FcrPacket {
  return {
    ...packet,
    log: packet.log.map((row) => {
      if (row.id !== id) return row;
      const next = typeof patch === "function" ? patch(row) : { ...row, ...patch };
      return withSyncedScope(next);
    }),
  };
}

export function addCraftLine(packet: FcrPacket, logId: string, patch: Partial<ScrCraftLine> = {}): FcrPacket {
  return patchLogRow(packet, logId, (row) => ({ ...row, craftLines: [...row.craftLines, blankCraftLine(patch)] }));
}

export function addClaimLine(packet: FcrPacket, logId: string, patch: Partial<ScrClaimLine> = {}): FcrPacket {
  return patchLogRow(packet, logId, (row) => ({ ...row, claimLines: [...row.claimLines, blankClaimLine(patch)] }));
}

/** P66 / Wood River field path — and the default when site/client are unset. */
export function usesEcrCopy(client = "", site = ""): boolean {
  const hay = `${client} ${site}`.toLowerCase();
  if (!hay.trim()) return true;
  return /wood river|phillips 66|\bp66\b/.test(hay);
}

export function changeOrderNoun(client = "", site = ""): "ECR" | "FCR" {
  return usesEcrCopy(client, site) ? "ECR" : "FCR";
}

/** Contractor log tab — not a client change-order register. ECR/FCR math stays under the hood. */
export function changeOrderTabLabel(_client = "", _site = ""): string {
  return "Change Orders";
}

export const CONTRACTOR_LOG_FIELDS = ["scr", "requestDate", "requestedBy", "status", "scope"] as const;
export type ContractorLogField = (typeof CONTRACTOR_LOG_FIELDS)[number];

export const CONTRACTOR_LOG_COLUMNS: Array<{ key: ContractorLogField; label: string }> = [
  { key: "scr", label: "SCR #" },
  { key: "requestDate", label: "Request Date" },
  { key: "requestedBy", label: "Requested By" },
  { key: "status", label: "Status" },
  { key: "scope", label: "Scope Change Description" },
];

export function addLogRow(packet: FcrPacket, patch: Partial<FcrLogRow> = {}): FcrPacket {
  return { ...packet, log: [...packet.log, normalizeLogRow({ ...blankLogRow(), ...patch })] };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function filledText(value: unknown) {
  return typeof value === "string" && value.trim().length > 0;
}

export function fcrPacketHasWork(value: unknown) {
  const row = asRecord(value);
  if (!row) return false;
  if (Array.isArray(row.log) && row.log.length > 0) return true;
  if (Array.isArray(row.people) && row.people.length > 0) return true;
  if (Number(row.sub) > 0 || Number(row.equipment) > 0 || Number(row.misc) > 0) return true;
  const header = asRecord(row.header);
  if (header && Object.values(header).some(filledText)) return true;
  const scr = asRecord(row.scr);
  return Boolean(scr && Object.values(scr).some(filledText));
}

function normalizeLogRow(row: Partial<FcrLogRow> | null | undefined): FcrLogRow {
  const blank = blankLogRow();
  if (!row || typeof row !== "object") return blank;
  return withSyncedScope({
    ...blank,
    ...row,
    id: typeof row.id === "string" && row.id.trim() ? row.id : blank.id,
    status: LOG_STATUSES.includes(row.status as LogStatus) ? (row.status as LogStatus) : blank.status,
    impactLevel: IMPACT_LEVELS.includes(row.impactLevel as ImpactLevel)
      ? (row.impactLevel as ImpactLevel)
      : blank.impactLevel,
    approvalStatus: APPROVAL_STATUSES.includes(row.approvalStatus as ApprovalStatus)
      ? (row.approvalStatus as ApprovalStatus)
      : blank.approvalStatus,
    approvedMh: Number(row.approvedMh) || 0,
    approvedCost: Number(row.approvedCost) || 0,
    scopeHours: Number(row.scopeHours) || 0,
    scopeCost: Number(row.scopeCost) || 0,
    craftLines: Array.isArray(row.craftLines) ? row.craftLines.map((line) => blankCraftLine(line)) : [],
    claimLines: Array.isArray(row.claimLines) ? row.claimLines.map((line) => blankClaimLine(line)) : [],
  });
}

export function parseFcrPacket(raw: unknown): FcrPacket {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return emptyFcrPacket();
  const parsed = raw as Partial<FcrPacket>;
  return {
    header: { ...emptyFcrHeader(), ...parsed.header },
    log: Array.isArray(parsed.log) ? parsed.log.map((row) => normalizeLogRow(row)) : [],
    people: Array.isArray(parsed.people) ? normalizePeople(parsed.people) : [],
    sub: Number(parsed.sub) || 0,
    equipment: Number(parsed.equipment) || 0,
    misc: Number(parsed.misc) || 0,
    scr: { ...emptyScr(), ...parsed.scr },
  };
}

function browserStore(store?: FcrStoreLike | null): FcrStoreLike | null {
  if (store) return store;
  if (typeof window === "undefined") return null;
  return window.localStorage;
}

export function emptyScr(): FcrScr {
  return { taRm: "", categories: "", moc: "", sap: "", costNote: "", scheduleNote: "", signOff: "" };
}

export function emptyFcrPacket(): FcrPacket {
  return { header: emptyFcrHeader(), log: [], people: [], sub: 0, equipment: 0, misc: 0, scr: emptyScr() };
}

export function mileageDollars(mileage: boolean) {
  return mileage ? MILEAGE_YES_FLAT : 0;
}

export function fcrBlockFor(position: string, shift: string): FcrBlock {
  const staff = seatKind(position) === "staff";
  const night = /^nights?$/i.test(shift.trim());
  if (staff && night) return "Staff Night";
  if (staff) return "Staff Day";
  if (night) return "Craft Night";
  return "Craft Day";
}

function addDay(week: FcrWeek, weekday: number, split: FcrDayHours) {
  const key = DOW_TO_DAY[weekday];
  if (!key) return;
  week[key].st += split.st;
  week[key].ot += split.ot;
  week[key].dt += split.dt;
}

function weekFromRanges(
  row: FcrJobRow,
  shift: "Days" | "Nights",
  site = "",
  client = "",
  crewOtAfter8 = false,
): { week: FcrWeek; pd: number; headcount: number } {
  const week = emptyWeek();
  let pd = 0;
  let headcount = 0;
  for (const range of row.ranges ?? []) {
    const night = shift === "Nights";
    const hours = computeRangeHours({
      position: row.position,
      site,
      client,
      start: range.start,
      end: range.end,
      hoursPerShift: range.hoursPerShift,
      headcount: night ? range.nightHeadcount : range.headcount,
      shift,
      days: range.days,
      perDiemPeople: night ? range.nightPerDiemPeople ?? 0 : range.perDiemPeople,
      otAfter8: range.otAfter8 ?? crewOtAfter8,
      phaseId: range.phaseId,
      clockOverride: row.clockOverride ?? "auto",
      skipDates: range.skipDates,
    });
    for (const day of hours.days) addDay(week, day.weekday, day);
    pd += hours.pd;
    headcount = Math.max(headcount, night ? range.nightHeadcount : range.headcount);
  }
  return { week, pd, headcount: headcount || 1 };
}

function peopleRowFromShift(
  row: FcrJobRow,
  shift: "Days" | "Nights",
  site = "",
  client = "",
  crewOtAfter8 = false,
): FcrPeopleRow {
  const fallback = fallbackSplit(row);
  const computed = row.ranges?.length
    ? weekFromRanges(row, shift, site, client, crewOtAfter8)
    : { week: emptyWeek(), pd: fallback.pd, headcount: 1 };
  const totals = row.ranges?.length
    ? weekTotals(computed.week)
    : { st: fallback.st, ot: fallback.ot, dt: fallback.dt };
  return {
    id: `${row.id}-${shift === "Nights" ? "n" : "d"}`,
    block: fcrBlockFor(row.position, shift),
    position: row.position,
    weeks: 1,
    mileage: false,
    daysPd: computed.pd,
    headcount: computed.headcount,
    week: computed.week,
    st: totals.st,
    ot: totals.ot,
    dt: totals.dt,
  };
}

export function peopleFromJob(rows: FcrJobRow[], site = "", client = "", crewOtAfter8 = false): FcrPeopleRow[] {
  const out: FcrPeopleRow[] = [];
  for (const row of rows) {
    if (!row.position.trim()) continue;
    const dual = /days\s*&\s*nights/i.test(row.shift);
    if (dual && row.ranges?.length) {
      out.push(peopleRowFromShift(row, "Days", site, client, crewOtAfter8));
      out.push(peopleRowFromShift(row, "Nights", site, client, crewOtAfter8));
      continue;
    }
    const night = /^nights?$/i.test(row.shift.trim());
    out.push(peopleRowFromShift(row, night ? "Nights" : "Days", site, client, crewOtAfter8));
  }
  return out;
}

export function normalizePeople(rows: Array<Partial<FcrPeopleRow>>): FcrPeopleRow[] {
  return rows.map((row) => {
    const week = row.week ?? emptyWeek();
    const totals = weekTotals(week);
    const usedWeek = totals.st + totals.ot + totals.dt > 0;
    return {
      id: row.id || uid("ppl"),
      block: row.block || "Craft Day",
      position: row.position || "",
      weeks: Number(row.weeks) || 1,
      mileage: Boolean(row.mileage),
      daysPd: Number(row.daysPd) || 0,
      headcount: Number(row.headcount) || 1,
      week,
      st: usedWeek ? totals.st : Number(row.st) || 0,
      ot: usedWeek ? totals.ot : Number(row.ot) || 0,
      dt: usedWeek ? totals.dt : Number(row.dt) || 0,
    };
  });
}

export function fcrSummary(packet: FcrPacket, laborRate = 0, pdRate = 0) {
  const staff = packet.people.filter((row) => row.block.startsWith("Staff"));
  const craft = packet.people.filter((row) => row.block.startsWith("Craft"));
  const hours = (rows: FcrPeopleRow[]) => rows.reduce((sum, row) => sum + peopleHours(row), 0);
  const pdDays = packet.people.reduce((sum, row) => sum + Math.max(0, row.daysPd), 0);
  const mileage = packet.people.reduce((sum, row) => sum + mileageDollars(row.mileage), 0);
  const staffHours = hours(staff);
  const craftHours = hours(craft);
  const scopes = (packet.log ?? []).map((row) => logRowScope(row));
  const scrHours = scopes.reduce((sum, row) => sum + row.hours, 0);
  const scrLabor = scopes.reduce((sum, row) => sum + row.labor, 0);
  const scrClaims = scopes.reduce((sum, row) => sum + row.claims, 0);
  const scrTyped = scopes.reduce((sum, row) => sum + (row.hasLines ? 0 : row.cost), 0);
  const scrCost = scrLabor + scrClaims + scrTyped;
  return {
    staffHours,
    craftHours,
    staffLabor: staffHours * laborRate,
    craftLabor: craftHours * laborRate,
    perDiem: pdDays * pdRate,
    mileage,
    sub: Math.max(0, packet.sub),
    equipment: Math.max(0, packet.equipment),
    misc: Math.max(0, packet.misc),
    scrHours,
    scrLabor,
    scrClaims,
    scrTyped,
    scrCost,
    total:
      staffHours * laborRate +
      craftHours * laborRate +
      pdDays * pdRate +
      mileage +
      Math.max(0, packet.sub) +
      Math.max(0, packet.equipment) +
      Math.max(0, packet.misc) +
      scrCost,
  };
}

export function readFcrPacket(key: string, store?: FcrStoreLike | null): FcrPacket {
  const target = browserStore(store);
  if (!target || !key) return emptyFcrPacket();
  try {
    const raw = target.getItem(`${FCR_STORE_PREFIX}${key}`);
    if (!raw) return emptyFcrPacket();
    return parseFcrPacket(JSON.parse(raw));
  } catch {
    return emptyFcrPacket();
  }
}

/** Cache locally, then notify the live pack so vault upsert follows the estimate — not a parallel book. */
export function writeFcrPacket(key: string, packet: FcrPacket, store?: FcrStoreLike | null) {
  const target = browserStore(store);
  if (!target || !key) return;
  try {
    target.setItem(`${FCR_STORE_PREFIX}${key}`, JSON.stringify(parseFcrPacket(packet)));
    notifyEstimateSheets();
  } catch {
    // keep the previous copy
  }
}

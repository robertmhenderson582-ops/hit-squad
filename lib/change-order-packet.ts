import { computeRangeHours, seatKind, type ClockOverride, type HoursSplit } from "./hours-clock.ts";
import { notifyEstimateSheets } from "./sheet-events.ts";

export const FCR_STORE_PREFIX = "hs_fcr_v1:";
export const MILEAGE_YES_FLAT = 2500;
export const CHANGE_ORDER_SHELLS = ["Log", "Estimate"] as const;
export type ChangeOrderShell = (typeof CHANGE_ORDER_SHELLS)[number];
export const DEFAULT_CHANGE_ORDER_SHELL: ChangeOrderShell = "Log";
export const CHANGE_ORDER_SHELL_LABELS: Record<ChangeOrderShell, string> = {
  Log: "SCR Log",
  Estimate: "Estimate workbook",
};

/** Browser cache or a test store. Vault hydrate writes this key; vault is source of truth after merge. */
export type FcrStoreLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

/** Client-facing SCR status. Legacy Open/Pending → Submitted; Cancelled → Rejected. */
export const SCR_STATUSES = ["Submitted", "Approved", "Rejected"] as const;
export const LOG_STATUSES = SCR_STATUSES;
export const SCR_TYPES = ["Addition", "Credit"] as const;
export const SCR_TYPE_LABELS: Record<(typeof SCR_TYPES)[number], string> = {
  Addition: "Addition",
  Credit: "Credit / deletion",
};
export const SCR_WHY_REASONS = [
  "Pipe / equipment bust",
  "Missed in estimate",
  "Owner directed scope add",
  "Field discovery",
  "Design change / IFC late",
  "Other",
] as const;
export const DEFAULT_SCOPE_ID_LABEL = "Scope ID #";
export const P66_SCOPE_ID_LABEL = "IPS #";
export const IMPACT_LEVELS = ["Low", "High", "Critical"] as const;
export const APPROVAL_STATUSES = ["Approved", "Pending"] as const;
export const FCR_BLOCKS = ["Staff Day", "Staff Night", "Craft Day", "Craft Night"] as const;
export const FCR_DAYS = ["mo", "tu", "we", "th", "fr", "sa", "su"] as const;
export const FCR_DAY_LABELS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"] as const;

/** Named first-class claim types. Catalog stays extensible beyond these. */
export const CLAIMABLE_COST_PRESETS = [
  "Subcontractor",
  "Third-party rental",
  "Material",
] as const;

/** Pass-through / claimable cost types on an SCR estimate. Custom types stay allowed. */
export const CLAIMABLE_COST_TYPES = [
  ...CLAIMABLE_COST_PRESETS,
  "Equipment",
  "Travel",
  "Other",
] as const;
export type ClaimableCostType = (typeof CLAIMABLE_COST_TYPES)[number];

export type ScrStatus = (typeof SCR_STATUSES)[number];
export type LogStatus = ScrStatus;
export type ScrType = (typeof SCR_TYPES)[number];
export type ScrWhyReason = (typeof SCR_WHY_REASONS)[number];
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
  status: ScrStatus;
  /** Client-issued identifier (P66 or other). Same field on every job. */
  clientScrId: string;
  /** Addition grows scope; Credit / deletion is presented signed. */
  scrType: ScrType;
  /** Plant / association number. Label is packet.scopeIdLabel (Scope ID # or IPS #). */
  scopeId: string;
  scope: string;
  whyReasons: ScrWhyReason[];
  whyOther: string;
  phaseId: string;
  scheduleImpact: boolean;
  shiftId: string;
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
  /**
   * Backup docs for this SCR (PDF, photos, IPS pack, quotes).
   * Metadata rides on the packet; bytes live in the estimate Drive vault.
   */
  attachments: ScrAttachment[];
  /**
   * When set, the row is on the SCR Log. Empty = draft workbook only.
   * Revise keeps this stamp and the same SCR #.
   */
  submittedAt: string;
};

/** Simple SCR craft line — one hours box × locked schedule-aware composite $/hr. */
export type ScrCraftLine = {
  id: string;
  craft: string;
  hours: number;
  rate: number;
};

/** Legacy ST/OT/DT craft fields. Hours migrate by summing; rate from weighted labor. */
export type LegacyScrCraftPatch = Partial<ScrCraftLine> & {
  stHours?: number;
  otHours?: number;
  dtHours?: number;
  stRate?: number;
  otRate?: number;
  dtRate?: number;
};

/** Claimable pass-through line. Dollars required; hours when the type needs them. */
export type ScrClaimLine = {
  id: string;
  type: string;
  description: string;
  amount: number;
  hours: number;
};

/** Backup file on an SCR estimate. Drive id is set after the vault write. */
export type ScrAttachment = {
  id: string;
  name: string;
  type: string;
  size: number;
  addedBy: string;
  addedAt: string;
  driveId: string;
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
  /** Renamable Scope ID # label. P66 may seed IPS #. Same field on every client. */
  scopeIdLabel?: string;
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
    status: "Submitted",
    clientScrId: "",
    scrType: "Addition",
    scopeId: "",
    scope: "",
    whyReasons: [],
    whyOther: "",
    phaseId: "",
    scheduleImpact: false,
    shiftId: "",
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
    attachments: [],
    submittedAt: "",
  };
}

function cents(value: number) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function legacyCraftHours(patch: LegacyScrCraftPatch) {
  return (
    Math.max(0, Number(patch.stHours) || 0) +
    Math.max(0, Number(patch.otHours) || 0) +
    Math.max(0, Number(patch.dtHours) || 0)
  );
}

function legacyCraftLabor(patch: LegacyScrCraftPatch) {
  const st = Math.max(0, Number(patch.stHours) || 0) * Math.max(0, Number(patch.stRate) || 0);
  const ot = Math.max(0, Number(patch.otHours) || 0) * Math.max(0, Number(patch.otRate) || 0);
  const dt = Math.max(0, Number(patch.dtHours) || 0) * Math.max(0, Number(patch.dtRate) || 0);
  return cents(st + ot + dt);
}

export function migrateCraftHours(patch: LegacyScrCraftPatch = {}) {
  if (patch.hours != null && String(patch.hours) !== "") {
    return Math.max(0, Number(patch.hours) || 0);
  }
  return legacyCraftHours(patch);
}

export function migrateCraftRate(patch: LegacyScrCraftPatch = {}) {
  if (patch.rate != null && Number(patch.rate) > 0) return cents(Number(patch.rate) || 0);
  const hours = migrateCraftHours(patch);
  const labor = legacyCraftLabor(patch);
  if (hours > 0 && labor > 0) return cents(labor / hours);
  return Math.max(0, Number(patch.stRate) || 0);
}

export function blankCraftLine(patch: LegacyScrCraftPatch = {}): ScrCraftLine {
  return {
    id: typeof patch.id === "string" && patch.id.trim() ? patch.id : uid("scr-craft"),
    craft: typeof patch.craft === "string" ? patch.craft : "",
    hours: migrateCraftHours(patch),
    rate: migrateCraftRate(patch),
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

export function scrSign(type: string | undefined) {
  return type === "Credit" ? -1 : 1;
}

export function craftLineHours(line: Pick<ScrCraftLine, "hours"> | LegacyScrCraftPatch) {
  return migrateCraftHours(line);
}

export function craftLineLabor(line: Pick<ScrCraftLine, "hours" | "rate"> | LegacyScrCraftPatch, sign = 1) {
  const hours = migrateCraftHours(line);
  const rate = migrateCraftRate(line);
  return cents(sign * hours * rate);
}

export function logRowScope(
  row: Pick<FcrLogRow, "scopeHours" | "scopeCost" | "craftLines" | "claimLines"> & { scrType?: string },
) {
  const craftLines = Array.isArray(row.craftLines) ? row.craftLines : [];
  const claimLines = Array.isArray(row.claimLines) ? row.claimLines : [];
  const sign = scrSign(row.scrType);
  const labor = cents(craftLines.reduce((sum, line) => sum + craftLineLabor(line, sign), 0));
  const claims = cents(
    sign * claimLines.reduce((sum, line) => sum + Math.max(0, Number(line.amount) || 0), 0),
  );
  const hours =
    craftLines.reduce((sum, line) => sum + craftLineHours(line), 0) +
    claimLines.reduce((sum, line) => sum + Math.max(0, Number(line.hours) || 0), 0);
  const hasLines = craftLines.length > 0 || claimLines.length > 0;
  const typed = cents(Number(row.scopeCost) || 0);
  return {
    hours: hasLines ? hours : Math.max(0, Number(row.scopeHours) || 0),
    cost: hasLines ? cents(labor + claims) : cents(sign * Math.abs(typed)),
    labor,
    claims,
    hasLines,
    sign,
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

export function addCraftLine(packet: FcrPacket, logId: string, patch: LegacyScrCraftPatch = {}): FcrPacket {
  return patchLogRow(packet, logId, (row) => ({ ...row, craftLines: [...row.craftLines, blankCraftLine(patch)] }));
}

export function addClaimLine(packet: FcrPacket, logId: string, patch: Partial<ScrClaimLine> = {}): FcrPacket {
  return patchLogRow(packet, logId, (row) => ({ ...row, claimLines: [...row.claimLines, blankClaimLine(patch)] }));
}

export function blankAttachment(patch: Partial<ScrAttachment> = {}): ScrAttachment {
  return {
    id: typeof patch.id === "string" && patch.id.trim() ? patch.id : uid("scr-att"),
    name: typeof patch.name === "string" ? patch.name.replace(/\\/g, "/").split("/").pop()?.trim() || "" : "",
    type: typeof patch.type === "string" && patch.type.trim() ? patch.type.trim() : "application/octet-stream",
    size: Math.max(0, Number(patch.size) || 0),
    addedBy: typeof patch.addedBy === "string" ? patch.addedBy.trim() : "",
    addedAt: typeof patch.addedAt === "string" ? patch.addedAt : "",
    driveId: typeof patch.driveId === "string" ? patch.driveId.trim() : "",
  };
}

export function addScrAttachments(
  packet: FcrPacket,
  logId: string,
  files: Array<Partial<ScrAttachment>>,
  when = new Date(),
): FcrPacket {
  const stamp = when.toISOString();
  const incoming = files
    .map((file) => blankAttachment({ ...file, addedAt: file.addedAt || stamp }))
    .filter((file) => file.name);
  if (!incoming.length) return packet;
  return patchLogRow(packet, logId, (row) => ({ ...row, attachments: [...row.attachments, ...incoming] }));
}

export function removeScrAttachment(packet: FcrPacket, logId: string, attachmentId: string): FcrPacket {
  const id = attachmentId.trim();
  if (!id) return packet;
  return patchLogRow(packet, logId, (row) => ({
    ...row,
    attachments: row.attachments.filter((item) => item.id !== id),
  }));
}

export function scrAttachmentNames(row: Pick<FcrLogRow, "attachments">) {
  return (Array.isArray(row.attachments) ? row.attachments : [])
    .map((item) => (item.name || "").trim())
    .filter(Boolean);
}

export function scrAttachmentOpenUrl(driveId: string) {
  const id = driveId.trim();
  return id ? `https://drive.google.com/file/d/${id}/view` : "";
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
  { key: "scr", label: "Hit Squad SCR #" },
  { key: "requestDate", label: "Request Date" },
  { key: "requestedBy", label: "Requested By" },
  { key: "status", label: "Status" },
  { key: "scope", label: "SCR issue" },
];

export function seedScopeIdLabel(client = "", site = "", existing = "") {
  if ((existing || "").trim()) return (existing || "").trim();
  const hay = `${client} ${site}`.toLowerCase();
  if (/phillips 66|\bp66\b/.test(hay)) return P66_SCOPE_ID_LABEL;
  return DEFAULT_SCOPE_ID_LABEL;
}

export function clientScrIdPlaceholder(client = "", site = "") {
  const hay = `${client} ${site}`.toLowerCase();
  if (/phillips 66|\bp66\b/.test(hay)) return "P66 SCR #";
  return "Client SCR ID";
}

export function clientScrIdHelp(client = "", site = "") {
  void client;
  void site;
  return "Fill once the client issues it — after our submit / their review.";
}

export function applyScrClientLabels(packet: FcrPacket, client = "", site = ""): FcrPacket {
  return { ...packet, scopeIdLabel: seedScopeIdLabel(client, site, packet.scopeIdLabel) };
}

export function isScrWhyReason(value: string): value is ScrWhyReason {
  return (SCR_WHY_REASONS as readonly string[]).includes(value);
}

export function toggleScrWhy(reasons: readonly string[] | undefined, reason: string): ScrWhyReason[] {
  const current = (reasons ?? []).filter(isScrWhyReason);
  if (!isScrWhyReason(reason)) return current;
  return current.includes(reason) ? current.filter((item) => item !== reason) : [...current, reason];
}

export function scrWhyText(row: Pick<FcrLogRow, "whyReasons" | "whyOther">) {
  const reasons = (row.whyReasons ?? []).filter(isScrWhyReason);
  const note = (row.whyOther || "").trim();
  return reasons
    .map((reason) => (reason === "Other" && note ? `Other: ${note}` : reason))
    .join("; ");
}

export function formatScrMoney(value: number) {
  const amount = Math.round((Number(value) || 0) * 100) / 100;
  if (!amount) return "—";
  const abs = Math.abs(amount).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return amount < 0 ? `($${abs})` : `$${abs}`;
}

export function addLogRow(packet: FcrPacket, patch: Partial<FcrLogRow> = {}): FcrPacket {
  const merged = { ...blankLogRow(), ...patch };
  if (!("submittedAt" in patch) && rowHasFiledIdentity(merged)) {
    merged.submittedAt = merged.requestDate.trim() || "legacy";
  }
  return { ...packet, log: [...packet.log, normalizeLogRow(merged)] };
}

export function logRowIsSubmitted(row: Pick<FcrLogRow, "submittedAt">) {
  return Boolean(String(row.submittedAt || "").trim());
}

export function submittedLogRows(packet: Pick<FcrPacket, "log">) {
  return packet.log.filter((row) => logRowIsSubmitted(row));
}

function rowHasFiledIdentity(row: Partial<FcrLogRow>) {
  return Boolean(
    (typeof row.scr === "string" && row.scr.trim()) ||
      (typeof row.scope === "string" && row.scope.trim()) ||
      (typeof row.requestDate === "string" && row.requestDate.trim()) ||
      (typeof row.requestedBy === "string" && row.requestedBy.trim()) ||
      Number(row.scopeHours) ||
      Number(row.scopeCost) ||
      (Array.isArray(row.craftLines) && row.craftLines.length) ||
      (Array.isArray(row.claimLines) && row.claimLines.length),
  );
}

export function nextScrNumber(packet: Pick<FcrPacket, "log">) {
  let max = 0;
  for (const row of packet.log) {
    const match = /^(?:SCR|ECR)-(\d+)$/i.exec(String(row.scr || "").trim());
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `SCR-${max + 1}`;
}

export function ensureScrIdentity(packet: FcrPacket, id: string): FcrPacket {
  const row = packet.log.find((item) => item.id === id);
  if (!row || row.scr.trim()) return packet;
  return patchLogRow(packet, id, { scr: nextScrNumber(packet) });
}

export function ensureDraftRow(packet: FcrPacket): { packet: FcrPacket; id: string } {
  const draft = packet.log.find((row) => !logRowIsSubmitted(row));
  if (draft) {
    const next = ensureScrIdentity(packet, draft.id);
    return { packet: next, id: draft.id };
  }
  const next = addLogRow(packet, { submittedAt: "", scr: nextScrNumber(packet) });
  return { packet: next, id: next.log[next.log.length - 1]!.id };
}

/** Promote a workbook row onto the SCR Log. Already-submitted rows stay the same SCR #. */
export function submitScrEstimate(packet: FcrPacket, id: string, when = new Date()): FcrPacket {
  return patchLogRow(packet, id, (row) => {
    if (logRowIsSubmitted(row)) return row;
    const stamp = when.toISOString();
    return {
      ...row,
      submittedAt: stamp,
      requestDate: row.requestDate.trim() || stamp.slice(0, 10),
      scr: row.scr.trim() || nextScrNumber(packet),
      status: SCR_STATUSES.includes(row.status) ? row.status : "Submitted",
    };
  });
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

function normalizeScrStatus(value: unknown): ScrStatus {
  if (value === "Approved") return "Approved";
  if (value === "Rejected" || value === "Cancelled") return "Rejected";
  return "Submitted";
}

function normalizeScrType(value: unknown): ScrType {
  return value === "Credit" ? "Credit" : "Addition";
}

function normalizeWhyReasons(value: unknown): ScrWhyReason[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isScrWhyReason);
}

function normalizeLogRow(row: Partial<FcrLogRow> | null | undefined): FcrLogRow {
  const blank = blankLogRow();
  if (!row || typeof row !== "object") return blank;
  const rawHasSubmitted = "submittedAt" in row;
  let submittedAt = typeof row.submittedAt === "string" ? row.submittedAt : "";
  if (!rawHasSubmitted && rowHasFiledIdentity(row)) {
    submittedAt = (typeof row.requestDate === "string" && row.requestDate.trim()) || "legacy";
  }
  const raw = row as Partial<FcrLogRow> & Record<string, unknown>;
  return withSyncedScope({
    ...blank,
    ...row,
    id: typeof row.id === "string" && row.id.trim() ? row.id : blank.id,
    status: normalizeScrStatus(row.status),
    clientScrId: typeof raw.clientScrId === "string" ? raw.clientScrId : blank.clientScrId,
    scrType: normalizeScrType(raw.scrType),
    scopeId: typeof raw.scopeId === "string" ? raw.scopeId : blank.scopeId,
    whyReasons: normalizeWhyReasons(raw.whyReasons),
    whyOther: typeof raw.whyOther === "string" ? raw.whyOther : blank.whyOther,
    phaseId: typeof raw.phaseId === "string" ? raw.phaseId : blank.phaseId,
    scheduleImpact: Boolean(raw.scheduleImpact),
    shiftId: typeof raw.shiftId === "string" ? raw.shiftId : blank.shiftId,
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
    attachments: Array.isArray(row.attachments)
      ? row.attachments.map((file) => blankAttachment(file)).filter((file) => file.name)
      : [],
    submittedAt,
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
    scopeIdLabel: typeof parsed.scopeIdLabel === "string" ? parsed.scopeIdLabel : "",
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
  return {
    header: emptyFcrHeader(),
    log: [],
    people: [],
    sub: 0,
    equipment: 0,
    misc: 0,
    scr: emptyScr(),
    scopeIdLabel: "",
  };
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
  const scrLabor = cents(scopes.reduce((sum, row) => sum + row.labor, 0));
  const scrClaims = cents(scopes.reduce((sum, row) => sum + row.claims, 0));
  const scrTyped = cents(scopes.reduce((sum, row) => sum + (row.hasLines ? 0 : row.cost), 0));
  const scrCost = cents(scrLabor + scrClaims + scrTyped);
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

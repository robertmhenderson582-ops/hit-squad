/**
 * Rate Vault — partitioned B-1 / rate builder workshop.
 *
 * Owns its own types and stub store. Do not import estimate packs, Jobs,
 * Quality, HSE, seats, Inbox, or Rate Tables from this module. A later
 * break-off app can consume this file (and `/api/rate-vault`) as the
 * public boundary.
 */

export const RATE_VAULT_PRIVILEGE = "rate-vault" as const;
export const RATE_VAULT_HREF = "/rate-vault";
export const RATE_VAULT_API = "/api/rate-vault";
export const RATE_VAULT_TITLE = "Rate Vault";
export const RATE_VAULT_KICKER = "B-1 Builder";
export const RATE_VAULT_OWNER_NOTE = "Private workshop — not for testers.";
export const RATE_VAULT_CLIENT = "Phillips 66" as const;
export const RATE_VAULT_SCOPE_NOTE =
  "Rate Vault is Phillips 66 exclusive — James Hutton / P66 procurement lane. Other clients get their own vault later if ever.";

/** First-class workshop module — not nested under P66 / site rules. */
export const RATE_VAULT_CBA_PLA_ID = "cba-pla" as const;

export const RATE_VAULT_CBA_PLA_RULES = [
  { id: "ot", label: "OT" },
  { id: "fringes", label: "Fringes" },
  { id: "eligibility", label: "Eligibility" },
  { id: "clock", label: "Clock" },
] as const;

export const RATE_VAULT_CBA_PLA_SECTION = {
  id: RATE_VAULT_CBA_PLA_ID,
  label: "CBA / PLA",
  title: "CBA & PLA vault",
  note: "For sites without a dedicated P66 rate book (Wood River, Bayway), hall CBA/PLA rules drive OT, fringes, eligibility, and clock — and must feed the published rate package.",
} as const;

/** First-class workshop module — keyed by site location / state, not nested under P66. */
export const RATE_VAULT_STATE_LAW_ID = "state-law" as const;

export const RATE_VAULT_STATE_LAW_RULES = [
  { id: "ot", label: "OT" },
  { id: "wage", label: "Wage" },
  { id: "rest", label: "Rest" },
  { id: "holiday", label: "Holiday" },
] as const;

export const RATE_VAULT_STATE_LAW_SITES = [
  { site: "Wood River", state: "Illinois" },
  { site: "Rodeo", state: "California" },
  { site: "Ferndale", state: "California" },
  { site: "Bayway", state: "New Jersey" },
  { site: "Billings", state: "Montana" },
] as const;

export const RATE_VAULT_STATE_LAW_SECTION = {
  id: RATE_VAULT_STATE_LAW_ID,
  label: "State law",
  title: "State law vault",
  note: "Recognize OT, wage, rest, and holiday rules by site location / state — Illinois (Wood River), California (Rodeo, Ferndale), New Jersey (Bayway), Montana (Billings). These sit alongside CBA/PLA when site-specific P66 rates are thin, and must feed the published rate package later.",
} as const;

export const RATE_VAULT_LIBRARY_ID = "library" as const;

export const RATE_VAULT_LIBRARY_SECTION = {
  id: RATE_VAULT_LIBRARY_ID,
  label: "Source library",
  title: "Source library",
  note: "Phillips 66 Drive-indexed agreements, wage sheets, and B-1 exemplars. Catalog by file id — binaries stay on Drive.",
} as const;

export const RATE_VAULT_SECTIONS = [
  RATE_VAULT_LIBRARY_SECTION,
  {
    id: "halls",
    label: "Hall uploads",
    note: "Hall books also appear in the source library. Link a Drive id — do not commit the file.",
  },
  {
    id: "contractor",
    label: "Contractor books",
    note: "Contractor rate books land here later. Link through the source library for now.",
  },
  RATE_VAULT_CBA_PLA_SECTION,
  RATE_VAULT_STATE_LAW_SECTION,
  {
    id: "p66",
    label: "P66 / site rules",
    note: "Phillips 66 and site rules land here later. CBA / PLA and State law are their own vaults — not this pane.",
  },
  {
    id: "publish",
    label: "Publish rate package",
    note: "Stub only — does not write live estimate Rate Tables.",
  },
] as const;

export const RATE_VAULT_SOURCE_KINDS = [
  "cba",
  "pla",
  "gppma",
  "local-craft-sheet",
  "b1-exhibit",
  "rate-builder",
  "comp",
  "union-terms",
  "other",
] as const;

export type RateVaultSourceKind = (typeof RATE_VAULT_SOURCE_KINDS)[number];

export const RATE_VAULT_SOURCE_KIND_LABEL: Record<RateVaultSourceKind, string> = {
  cba: "CBA",
  pla: "PLA",
  gppma: "GPPMA",
  "local-craft-sheet": "Local craft sheet",
  "b1-exhibit": "B-1 exhibit",
  "rate-builder": "Rate builder",
  comp: "COMP",
  "union-terms": "Union terms",
  other: "Other",
};

/** Phillips 66 plants + East Coast COMP. Monroe / Yates / other clients are out of this vault. */
export const RATE_VAULT_SITES = [
  { id: "wood-river", label: "Wood River", region: "Illinois" },
  { id: "bayway", label: "Bayway", region: "New Jersey" },
  { id: "rodeo", label: "Rodeo", region: "California" },
  { id: "ferndale", label: "Ferndale", region: "Washington" },
  { id: "billings", label: "Billings", region: "Montana" },
  { id: "east-coast", label: "East Coast", region: "COMP" },
] as const;

export type RateVaultSiteId = (typeof RATE_VAULT_SITES)[number]["id"];

const FOREIGN_RATE_VAULT_SITE =
  /\bmonroe(?:\s+energy)?\b|\byates\b|\bgeorgia\s+power\b|\bharbor\s+fuels\b|\bridge\s+station\b/i;

/** True when hay names a non-P66 client / refinery. Those stay out of Rate Vault. */
export function looksLikeForeignRateVaultSite(hay: string) {
  return FOREIGN_RATE_VAULT_SITE.test(hay);
}

export const RATE_VAULT_BUILDER_STEPS = [
  {
    id: "sources",
    label: "Sources",
    note: "Browse and link Drive books. Files stay on Drive.",
  },
  {
    id: "recognize",
    label: "Recognize",
    note: "Read the sheet, then review guesses. Nothing writes a rate book yet.",
  },
  {
    id: "map-crafts",
    label: "Map crafts",
    note: "Confirm craft / local / columns. Layouts are not universal.",
  },
  {
    id: "burden",
    label: "Burden / build",
    note: "Visual rate pack — wage, fringe, burden, and bill. Live tables stay off.",
  },
  {
    id: "publish",
    label: "Publish preview",
    note: "Scroll the filled package. Live Rate Tables stay on Jobs / Rates.",
  },
] as const;

export type RateVaultBuilderStepId = (typeof RATE_VAULT_BUILDER_STEPS)[number]["id"];

export const RATE_VAULT_ACCEPT = ".pdf,.doc,.docx,.xls,.xlsx,.xlsb,.xlsm";
export const RATE_VAULT_MAX_FILE_BYTES = 15 * 1024 * 1024;
export const RATE_VAULT_DROP_TYPE_ERROR = "Use PDF, Word, or Excel (xlsx / xlsm / xls / xlsb).";
export const RATE_VAULT_DROP_SIZE_ERROR = "File is too large for Rate Vault (15 MB).";
export const RATE_VAULT_SOURCE_DRAG = "application/x-hitsquad-rate-source";
export const RATE_VAULT_CRAFT_DRAG = "application/x-hitsquad-rate-craft";

export const RATE_VAULT_MIME: Record<string, readonly string[]> = {
  pdf: ["application/pdf"],
  doc: ["application/msword"],
  docx: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  xls: ["application/vnd.ms-excel"],
  xlsx: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  xlsm: ["application/vnd.ms-excel.sheet.macroenabled.12"],
  xlsb: ["application/vnd.ms-excel.sheet.binary.macroenabled.12"],
};

export type RateVaultFormat = keyof typeof RATE_VAULT_MIME | "unknown";

export function isRateVaultSourceKind(value: unknown): value is RateVaultSourceKind {
  return typeof value === "string" && (RATE_VAULT_SOURCE_KINDS as readonly string[]).includes(value);
}

export function isRateVaultSiteId(value: unknown): value is RateVaultSiteId {
  return typeof value === "string" && RATE_VAULT_SITES.some((site) => site.id === value);
}

export function isRateVaultDriveId(value: string) {
  return /^[A-Za-z0-9_-]{20,80}$/.test(value.trim());
}

export function rateVaultDriveUrl(driveId: string, driveKind: "file" | "folder" = "file") {
  const id = driveId.trim();
  if (driveKind === "folder") return `https://drive.google.com/drive/folders/${id}`;
  return `https://drive.google.com/file/d/${id}/view`;
}

export function rateVaultSiteLabel(siteId: string | null | undefined) {
  return RATE_VAULT_SITES.find((site) => site.id === siteId)?.label ?? "";
}

export function rateVaultPathHint(input: {
  siteId?: string | null;
  craft?: string | null;
  local?: string | null;
  kind?: RateVaultSourceKind | null;
}) {
  const local = input.local?.trim() ? `L ${input.local.trim()}` : "";
  return [
    rateVaultSiteLabel(input.siteId),
    input.craft?.trim() || "",
    local,
    input.kind ? RATE_VAULT_SOURCE_KIND_LABEL[input.kind] : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

export type RateVaultSourceOrigin = "seed" | "owner";

export type RateVaultSourceEntry = {
  id: string;
  title: string;
  driveId: string;
  driveKind: "file" | "folder";
  href: string;
  kind: RateVaultSourceKind;
  siteId: RateVaultSiteId | null;
  craft: string | null;
  local: string | null;
  primary: boolean;
  archived: boolean;
  origin: RateVaultSourceOrigin;
  confirmed: boolean;
  note: string;
  pathHint: string;
};

export type RateVaultConfirmedReview = {
  sourceId: string;
  kind: RateVaultSourceKind;
  siteId: RateVaultSiteId | null;
  craft: string | null;
  local: string | null;
  confirmedAt: string;
  writesRateBook: false;
};

export type RateVaultColumnRole = "craft" | "position" | "wage" | "fringe" | "burden" | "local" | "ot" | "dt" | "bill" | "unknown";

export const RATE_VAULT_DEFAULT_SITE_ID = "wood-river" as const;

export type RateVaultPreviewSheetKind = "rate-summary" | "burden-summary" | "craft" | "staff-ocip" | "craft-ocip" | "other";

export type RateVaultPreviewSheet = {
  name: string;
  kind: string;
};

export type RateVaultPreviewRow = {
  id: string;
  sheet: string;
  group: string;
  craft: string;
  local: string | null;
  position: string;
  wage: number;
  fringe: number;
  burden: number;
  billRate: number;
  billOt: number | null;
  billDt: number | null;
};

export type RateVaultBurdenLine = {
  id: string;
  label: string;
  ratePct: number;
  note: string;
};

export type RateVaultPreviewPackage = {
  id: string;
  title: string;
  siteId: RateVaultSiteId;
  sourceId: string | null;
  sourceTitle: string;
  effective: string | null;
  revision: string | null;
  extractedFrom: string;
  note: string;
  writesRateBook: false;
  fixture: boolean;
  sheets: RateVaultPreviewSheet[];
  burden: RateVaultBurdenLine[];
  rows: RateVaultPreviewRow[];
};

export type RateVaultSheetSniff = {
  name: string;
  headerRow: number | null;
  headers: string[];
  columns: Array<{ header: string; role: RateVaultColumnRole }>;
};

export type RateVaultRecognitionReview = {
  sourceId: string | null;
  fileName: string;
  mime: string;
  extension: string;
  format: RateVaultFormat;
  guessedKind: RateVaultSourceKind | "unknown";
  guessedSiteId: RateVaultSiteId | null;
  guessedCraft: string | null;
  guessedLocal: string | null;
  confidence: number;
  sheets: RateVaultSheetSniff[];
  snippets: string[];
  needsConfirm: true;
  writesRateBook: false;
  extractNote: string;
};

export type RateVaultSourceOverride = {
  sourceId: string;
  siteId?: RateVaultSiteId | null;
  kind?: RateVaultSourceKind;
};

export type RateVaultLibrary = {
  entries: RateVaultSourceEntry[];
  extras: RateVaultSourceEntry[];
  reviews: RateVaultConfirmedReview[];
  overrides: RateVaultSourceOverride[];
};

export function rateVaultDragTypes(types: ArrayLike<string> | null | undefined) {
  return Array.from(types ?? []);
}

export function rateVaultHasFileDrag(types: ArrayLike<string> | null | undefined) {
  return rateVaultDragTypes(types).includes("Files");
}

export function rateVaultHasSourceDrag(types: ArrayLike<string> | null | undefined) {
  return rateVaultDragTypes(types).includes(RATE_VAULT_SOURCE_DRAG);
}

export function reorderRateVaultItems<T>(items: readonly T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) return items.slice();
  const next = items.slice();
  const [row] = next.splice(from, 1);
  if (row === undefined) return items.slice();
  next.splice(to, 0, row);
  return next;
}

export function moveRateVaultSource(
  entries: readonly RateVaultSourceEntry[],
  sourceId: string,
  bucket: { siteId?: RateVaultSiteId | null; kind?: RateVaultSourceKind },
): RateVaultSourceEntry[] {
  return entries.map((entry) => {
    if (entry.id !== sourceId) return entry;
    const next = {
      ...entry,
      siteId: bucket.siteId !== undefined ? bucket.siteId : entry.siteId,
      kind: bucket.kind ?? entry.kind,
    };
    return { ...next, pathHint: rateVaultPathHint(next) };
  });
}

export type RateVaultSectionId = (typeof RATE_VAULT_SECTIONS)[number]["id"];
export type RateVaultCbaPlaRuleId = (typeof RATE_VAULT_CBA_PLA_RULES)[number]["id"];

export type RateVaultCbaPlaEntry = {
  id: string;
  name: string;
  siteHint: string | null;
  captured: false;
};

export type RateVaultCbaPlaVault = {
  id: typeof RATE_VAULT_CBA_PLA_ID;
  label: typeof RATE_VAULT_CBA_PLA_SECTION.label;
  entries: readonly RateVaultCbaPlaEntry[];
  rules: ReadonlyArray<(typeof RATE_VAULT_CBA_PLA_RULES)[number] & { captured: false }>;
};

export function emptyCbaPlaVault(): RateVaultCbaPlaVault {
  return {
    id: RATE_VAULT_CBA_PLA_ID,
    label: RATE_VAULT_CBA_PLA_SECTION.label,
    entries: [],
    rules: RATE_VAULT_CBA_PLA_RULES.map((rule) => ({ ...rule, captured: false as const })),
  };
}

export type RateVaultStateLawRuleId = (typeof RATE_VAULT_STATE_LAW_RULES)[number]["id"];

export type RateVaultStateLawEntry = {
  id: string;
  site: string;
  state: string;
  captured: false;
};

export type RateVaultStateLawVault = {
  id: typeof RATE_VAULT_STATE_LAW_ID;
  label: typeof RATE_VAULT_STATE_LAW_SECTION.label;
  entries: readonly RateVaultStateLawEntry[];
  sites: typeof RATE_VAULT_STATE_LAW_SITES;
  rules: ReadonlyArray<(typeof RATE_VAULT_STATE_LAW_RULES)[number] & { captured: false }>;
};

export function emptyStateLawVault(): RateVaultStateLawVault {
  return {
    id: RATE_VAULT_STATE_LAW_ID,
    label: RATE_VAULT_STATE_LAW_SECTION.label,
    entries: [],
    sites: RATE_VAULT_STATE_LAW_SITES,
    rules: RATE_VAULT_STATE_LAW_RULES.map((rule) => ({ ...rule, captured: false as const })),
  };
}

export type RateVaultPublishStub = {
  status: "stub";
  published: false;
  packageId: null;
  note: string;
};

export type RateVaultWorkshop = {
  id: "rate-vault";
  name: typeof RATE_VAULT_TITLE;
  purpose: "B-1 / rate builder workshop";
  ownerNote: typeof RATE_VAULT_OWNER_NOTE;
  sections: typeof RATE_VAULT_SECTIONS;
  steps: typeof RATE_VAULT_BUILDER_STEPS;
  library: RateVaultLibrary;
  review: RateVaultRecognitionReview | null;
  preview: RateVaultPreviewPackage | null;
  cbaPla: RateVaultCbaPlaVault;
  stateLaw: RateVaultStateLawVault;
  publish: RateVaultPublishStub;
};

export function emptyRateVaultLibrary(): RateVaultLibrary {
  return { entries: [], extras: [], reviews: [], overrides: [] };
}

export function emptyRateVaultWorkshop(): RateVaultWorkshop {
  return {
    id: "rate-vault",
    name: RATE_VAULT_TITLE,
    purpose: "B-1 / rate builder workshop",
    ownerNote: RATE_VAULT_OWNER_NOTE,
    sections: RATE_VAULT_SECTIONS,
    steps: RATE_VAULT_BUILDER_STEPS,
    library: emptyRateVaultLibrary(),
    review: null,
    preview: null,
    cbaPla: emptyCbaPlaVault(),
    stateLaw: emptyStateLawVault(),
    publish: {
      status: "stub",
      published: false,
      packageId: null,
      note: "Publish is a stub. Live Rate Tables stay on Jobs / Rates.",
    },
  };
}

export function rateVaultFileExtension(name: string) {
  const base = name.replace(/\\/g, "/").split("/").pop() || "";
  const dot = base.lastIndexOf(".");
  if (dot <= 0 || dot === base.length - 1) return "";
  return base.slice(dot + 1).toLowerCase();
}

export function rateVaultDropByteLength(data: string) {
  const compact = data.replace(/\s/g, "");
  if (!compact) return 0;
  const padding = compact.endsWith("==") ? 2 : compact.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((compact.length * 3) / 4) - padding);
}

export function checkRateVaultDropFile(file: { name: string; type?: string; bytes?: number; data?: string }) {
  const ext = rateVaultFileExtension(file.name);
  const allowed = RATE_VAULT_MIME[ext];
  const mime = (file.type || "").split(";")[0].trim().toLowerCase();
  if (!allowed) return { ok: false as const, error: RATE_VAULT_DROP_TYPE_ERROR, name: file.name };
  if (mime && mime !== "application/octet-stream" && !allowed.includes(mime)) {
    return { ok: false as const, error: RATE_VAULT_DROP_TYPE_ERROR, name: file.name };
  }
  const bytes = typeof file.bytes === "number" ? file.bytes : rateVaultDropByteLength(file.data || "");
  if (!Number.isFinite(bytes) || bytes < 0 || bytes > RATE_VAULT_MAX_FILE_BYTES) {
    return { ok: false as const, error: RATE_VAULT_DROP_SIZE_ERROR, name: file.name };
  }
  return { ok: true as const, name: file.name, bytes, format: ext as RateVaultFormat };
}

export function stubPublishRateVault(): RateVaultPublishStub {
  return {
    status: "stub",
    published: false,
    packageId: null,
    note: "Publish is a stub. Live Rate Tables stay on Jobs / Rates.",
  };
}

export function rateVaultAccess(user: { role?: string; privileges?: readonly string[] | null } | null | undefined) {
  if (!user) return { ok: false as const, status: 401 as const, error: "Not signed in." };
  const owner = user.role === "owner";
  const granted = (user.privileges ?? []).includes(RATE_VAULT_PRIVILEGE);
  if (!owner && !granted) {
    return { ok: false as const, status: 403 as const, error: "Rate Vault is owner-eyes-only." };
  }
  return { ok: true as const, status: 200 as const };
}

import type { CompanyId } from "./companies.ts";
import type { LeadFile } from "./lead-briefs.ts";

/**
 * Reusable Quality module catalog. Company templates clone this list.
 * Madison is the live template now; Chance’s labels are the default labels.
 * Do not bake a contractor name into the ids — the next company clones these.
 */
export const QUALITY_MODULE_CATALOG = [
  { id: "packages", label: "Packages" },
  { id: "package-tracker", label: "Package Tracker" },
  { id: "welds-nde", label: "Welds / NDE" },
  { id: "welders", label: "Welders" },
  { id: "nde-request", label: "NDE Request" },
  { id: "wps", label: "WPS" },
  { id: "gauges", label: "Gauges" },
  { id: "weld-log", label: "Weld Log" },
  { id: "flange-log", label: "Flange Log" },
  { id: "travelers", label: "Travelers" },
  { id: "job-completion", label: "Job Completion" },
  { id: "rolling-chart", label: "Rolling Chart" },
] as const;

export type QualityFolderId = (typeof QUALITY_MODULE_CATALOG)[number]["id"];
export type QualityFolderDef = { id: QualityFolderId; label: string };

/** Desk radios — the catalog is the nav. No Board / NCR / Day-1 register tabs. */
export const QUALITY_DESK_RADIOS = QUALITY_MODULE_CATALOG;
export type QualityDeskRadioId = QualityFolderId;

export type QualityFolderTemplate = {
  companyId: CompanyId;
  live: boolean;
  folders: readonly QualityFolderDef[];
};

/** Madison Quality is the only live company template. Other companies clone later. */
export const QUALITY_FOLDER_TEMPLATES: readonly QualityFolderTemplate[] = [
  { companyId: "madison", live: true, folders: QUALITY_MODULE_CATALOG },
];

/** Chance’s Madison labels — same rows as the reusable catalog. */
export const QUALITY_FOLDERS = QUALITY_MODULE_CATALOG;

export function qualityFolderTemplateFor(companyId?: string | null): QualityFolderTemplate | null {
  const id = (companyId || "").trim().toLowerCase();
  if (!id) return null;
  return QUALITY_FOLDER_TEMPLATES.find((row) => row.companyId === id) ?? null;
}

export function qualityFoldersFor(companyId?: string | null): readonly QualityFolderDef[] {
  const template = qualityFolderTemplateFor(companyId);
  if (!template?.live) return [];
  return template.folders;
}

export function showsQualityFolderDesk(companyId?: string | null) {
  return qualityFoldersFor(companyId).length > 0;
}

/** API / UI list. Missing company → default catalog (Chance’s Madison labels). Unknown company → none. */
export function qualityFoldersListedFor(companyId?: string | null): readonly QualityFolderDef[] {
  if (!(companyId || "").trim()) return QUALITY_FOLDERS;
  return qualityFoldersFor(companyId);
}

/** Clone a live template for another company without inventing new modules. */
export function cloneQualityFolderTemplate(companyId: CompanyId, source = "madison"): QualityFolderTemplate {
  const folders = qualityFolderTemplateFor(source)?.folders ?? QUALITY_MODULE_CATALOG;
  return {
    companyId,
    live: false,
    folders: folders.map((folder) => ({ id: folder.id, label: folder.label })),
  };
}

export const QUALITY_FOLDER_SCOPE_KEY = "hs_quality_folder_v1";

export const QUALITY_DROP_MAX_FILE_BYTES = 15 * 1024 * 1024;
export const QUALITY_DROP_MAX_BYTES = 50 * 1024 * 1024;
export const QUALITY_DROP_TYPE_ERROR = "file type not allowed";
export const QUALITY_DROP_SIZE_ERROR = "file too large";
export const QUALITY_DROP_ACCEPT = ".pdf,.doc,.docx,.xls,.xlsx,.csv,.png,.jpg,.jpeg,.webp,.gif,.txt";

const QUALITY_DROP_MIME: Record<string, readonly string[]> = {
  pdf: ["application/pdf"],
  doc: ["application/msword"],
  docx: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  xls: ["application/vnd.ms-excel"],
  xlsx: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  csv: ["text/csv", "application/csv", "text/plain"],
  png: ["image/png"],
  jpg: ["image/jpeg"],
  jpeg: ["image/jpeg"],
  webp: ["image/webp"],
  gif: ["image/gif"],
  txt: ["text/plain"],
};

const FOLDER_SYNONYMS: Record<string, QualityFolderId> = {
  packages: "packages",
  package: "packages",
  "day-1 package": "packages",
  "day1 package": "packages",
  "package tracker": "package-tracker",
  packagetracker: "package-tracker",
  "welds / nde": "welds-nde",
  "welds/nde": "welds-nde",
  "welds-nde": "welds-nde",
  welders: "welders",
  "nde request": "nde-request",
  "nde-request": "nde-request",
  "nde req": "nde-request",
  "nde req spreadsheet": "nde-request",
  wps: "wps",
  gauges: "gauges",
  "calibration / gauges": "gauges",
  calibration: "gauges",
  "weld log": "weld-log",
  "weld-log": "weld-log",
  "flange log": "flange-log",
  "flange-log": "flange-log",
  "2.7.19": "flange-log",
  "2.7.19 madison flange log": "flange-log",
  connections: "flange-log",
  "connections / flanges": "flange-log",
  travelers: "travelers",
  "job completion": "job-completion",
  "job-completion": "job-completion",
  "2.7.34": "job-completion",
  "2.7.34 job completion sign-off": "job-completion",
  "rolling chart": "rolling-chart",
  "rolling-chart": "rolling-chart",
  rolling: "rolling-chart",
};

export type QualityFolderFile = { name: string; type: string };
export type QualityFolderDrop = {
  jobId: string;
  folderId: QualityFolderId;
  files: QualityFolderFile[];
  savedAt: string;
};

export function isQualityFolderId(value: unknown, companyId?: string | null): value is QualityFolderId {
  if (typeof value !== "string") return false;
  const catalog = companyId ? qualityFoldersFor(companyId) : QUALITY_MODULE_CATALOG;
  return catalog.some((folder) => folder.id === value);
}

export function isQualityDeskRadio(value: string, companyId?: string | null): value is QualityDeskRadioId {
  return isQualityFolderId(value, companyId);
}

export function qualityFolderLabel(id: QualityFolderId, companyId?: string | null) {
  const catalog = companyId ? qualityFoldersFor(companyId) : QUALITY_FOLDERS;
  return catalog.find((folder) => folder.id === id)?.label ?? QUALITY_FOLDERS.find((folder) => folder.id === id)?.label ?? id;
}

function folderAllowed(id: QualityFolderId, companyId?: string | null) {
  if (!companyId) return true;
  return qualityFoldersFor(companyId).some((folder) => folder.id === id);
}

/** Catalog ids plus shipped 1:1 synonyms. Madison form names stay synonyms, not folder ids. */
export function resolveQualityFolder(value: string, companyId?: string | null): QualityFolderId | "" {
  const raw = value.trim();
  if (isQualityFolderId(raw, companyId || undefined)) return raw as QualityFolderId;
  const key = raw.toLowerCase().replace(/\s+/g, " ");
  const compact = key.replace(/\s*\/\s*/g, "/");
  if (FOLDER_SYNONYMS[key] && folderAllowed(FOLDER_SYNONYMS[key], companyId)) return FOLDER_SYNONYMS[key];
  if (FOLDER_SYNONYMS[compact] && folderAllowed(FOLDER_SYNONYMS[compact], companyId)) return FOLDER_SYNONYMS[compact];
  const matches = Object.entries(FOLDER_SYNONYMS)
    .filter(([alias, id]) => folderAllowed(id, companyId) && (key === alias || key.startsWith(`${alias} `) || compact === alias))
    .sort((left, right) => right[0].length - left[0].length);
  return matches[0]?.[1] ?? "";
}

export function qualityFolderBriefId(who: string, jobId: string, folderId: QualityFolderId) {
  const email = who.trim().toLowerCase();
  return `brief-quality-${email}-job:${jobId.trim()}-folder:${folderId}`;
}

export function qualityFolderLocalKey(jobId: string, folderId: QualityFolderId) {
  return `hs_quality_folder_v1:${jobId.trim()}:${folderId}`;
}

export function readQualityFolderFiles(
  jobId: string,
  folderId: QualityFolderId,
  store?: { getItem(key: string): string | null } | null,
): LeadFile[] {
  const target = store ?? (typeof window === "undefined" ? null : window.localStorage);
  if (!target || !jobId.trim()) return [];
  try {
    const raw = target.getItem(qualityFolderLocalKey(jobId, folderId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { files?: LeadFile[] };
    return Array.isArray(parsed.files) ? parsed.files.filter((file) => file?.name && file?.data) : [];
  } catch {
    return [];
  }
}

export function writeQualityFolderFiles(
  jobId: string,
  folderId: QualityFolderId,
  files: LeadFile[],
  store?: { setItem(key: string, value: string): void } | null,
) {
  const target = store ?? (typeof window === "undefined" ? null : window.localStorage);
  if (!target || !jobId.trim()) return;
  try {
    target.setItem(qualityFolderLocalKey(jobId, folderId), JSON.stringify({ files }));
  } catch {
    // keep the previous copy
  }
}

export function readQualityFolderPick(jobId: string, store?: { getItem(key: string): string | null } | null): QualityFolderId {
  const target = store ?? (typeof window === "undefined" ? null : window.localStorage);
  if (!target || !jobId.trim()) return QUALITY_FOLDERS[0].id;
  try {
    const raw = target.getItem(`${QUALITY_FOLDER_SCOPE_KEY}:${jobId.trim()}`);
    return resolveQualityFolder(raw || "") || QUALITY_FOLDERS[0].id;
  } catch {
    return QUALITY_FOLDERS[0].id;
  }
}

export function writeQualityFolderPick(
  jobId: string,
  folderId: QualityFolderId,
  store?: { setItem(key: string, value: string): void } | null,
) {
  const target = store ?? (typeof window === "undefined" ? null : window.localStorage);
  if (!target || !jobId.trim()) return;
  try {
    target.setItem(`${QUALITY_FOLDER_SCOPE_KEY}:${jobId.trim()}`, folderId);
  } catch {
    // keep the previous pick
  }
}

function fileExtension(name: string) {
  const base = name.replace(/\\/g, "/").split("/").pop() || "";
  const dot = base.lastIndexOf(".");
  if (dot <= 0 || dot === base.length - 1) return "";
  return base.slice(dot + 1).toLowerCase();
}

function normalizeMime(type: string) {
  return type.split(";")[0].trim().toLowerCase();
}

export function qualityDropByteLength(data: string) {
  const compact = data.replace(/\s/g, "");
  if (!compact) return 0;
  const padding = compact.endsWith("==") ? 2 : compact.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((compact.length * 3) / 4) - padding);
}

export function checkQualityDropFile(file: { name: string; type?: string; bytes?: number; data?: string }) {
  const ext = fileExtension(file.name);
  const allowed = QUALITY_DROP_MIME[ext];
  const mime = normalizeMime(file.type || "");
  if (!allowed) return { ok: false as const, error: QUALITY_DROP_TYPE_ERROR, name: file.name };
  if (mime && mime !== "application/octet-stream" && !allowed.includes(mime)) {
    return { ok: false as const, error: QUALITY_DROP_TYPE_ERROR, name: file.name };
  }
  const bytes = typeof file.bytes === "number" ? file.bytes : qualityDropByteLength(file.data || "");
  if (!Number.isFinite(bytes) || bytes < 0 || bytes > QUALITY_DROP_MAX_FILE_BYTES) {
    return { ok: false as const, error: QUALITY_DROP_SIZE_ERROR, name: file.name };
  }
  return { ok: true as const, name: file.name, bytes };
}

export function checkQualityDrop(files: Array<{ name: string; type?: string; bytes?: number; data?: string }>) {
  let total = 0;
  const rejected: Array<{ name: string; error: string }> = [];
  const accepted: typeof files = [];
  for (const file of files) {
    const check = checkQualityDropFile(file);
    if (!check.ok) {
      rejected.push({ name: check.name, error: check.error });
      continue;
    }
    total += check.bytes;
    accepted.push(file);
  }
  if (total > QUALITY_DROP_MAX_BYTES) {
    return {
      ok: false as const,
      error: QUALITY_DROP_SIZE_ERROR,
      accepted: [] as typeof files,
      rejected: files.map((file) => ({ name: file.name, error: QUALITY_DROP_SIZE_ERROR })),
    };
  }
  if (!accepted.length && rejected.length) {
    return { ok: false as const, error: rejected[0].error, accepted, rejected };
  }
  return { ok: true as const, accepted, rejected };
}

export function mergeQualityFolderFiles(current: LeadFile[], incoming: LeadFile[]): LeadFile[] {
  const byName = new Map(current.map((file) => [file.name, file]));
  for (const file of incoming) {
    if (!file.name || !file.data) continue;
    byName.set(file.name, file);
  }
  return [...byName.values()];
}

export type QualityFolderBriefRow = {
  kind?: string;
  who?: string;
  jobId?: string;
  folderId?: string;
  savedAt?: string;
  files?: Array<{ name?: string; type?: string }>;
};

export function publicQualityFolderDrop(brief: QualityFolderBriefRow): QualityFolderDrop | null {
  if (brief.kind && brief.kind !== "quality") return null;
  const folderId = resolveQualityFolder(brief.folderId || "");
  const jobId = typeof brief.jobId === "string" ? brief.jobId.trim() : "";
  if (!folderId || !jobId) return null;
  return {
    jobId,
    folderId,
    savedAt: typeof brief.savedAt === "string" ? brief.savedAt : "",
    files: (brief.files ?? [])
      .map((file) => ({ name: file.name || "", type: file.type || "" }))
      .filter((file) => file.name),
  };
}

export function qualityFolderDropsFor(
  briefs: QualityFolderBriefRow[],
  jobId: string,
  folderId: QualityFolderId,
  who?: string,
): QualityFolderDrop[] {
  const job = jobId.trim();
  const key = (who || "").trim().toLowerCase();
  return briefs
    .filter((brief) => {
      if (brief.kind && brief.kind !== "quality") return false;
      if (key && (brief.who || "").trim().toLowerCase() !== key) return false;
      return brief.jobId === job && resolveQualityFolder(brief.folderId || "") === folderId;
    })
    .map(publicQualityFolderDrop)
    .filter((row): row is QualityFolderDrop => Boolean(row));
}

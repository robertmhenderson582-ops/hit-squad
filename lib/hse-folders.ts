import type { CompanyId } from "./companies.ts";
import type { LeadFile } from "./lead-briefs.ts";
import { HSE_EXECUTE_LANES } from "./hse-module.ts";
import { HSE_PACKAGE_SLOTS } from "./hse-day1.ts";
import {
  QUALITY_DROP_ACCEPT,
  QUALITY_DROP_MAX_BYTES,
  QUALITY_DROP_MAX_FILE_BYTES,
  QUALITY_DROP_SIZE_ERROR,
  QUALITY_DROP_TYPE_ERROR,
  checkQualityDrop,
  checkQualityDropFile,
  mergeQualityFolderFiles,
  qualityDropByteLength,
} from "./quality-folders.ts";

/**
 * Reusable HSE module catalog. Company templates clone this list.
 * Ids come from the existing HSE package slots + execute lanes — no invented forms.
 * Madison is the live template; Wendell / Benny labels are the default labels.
 */
export const HSE_MODULE_CATALOG = [
  { id: "packages", label: "Packages" },
  { id: "orientation", label: "Site orientation" },
  { id: "jsa", label: "JSA" },
  { id: "toolbox", label: "Toolbox talk" },
  { id: "hot-work", label: "Hot work" },
  { id: "confined", label: "Confined space" },
  { id: "loto", label: "LOTO" },
  { id: "excavation", label: "Excavation" },
  { id: "incidents", label: "Incidents / near misses" },
  { id: "observations", label: "Observations" },
] as const;

export type HseFolderId = (typeof HSE_MODULE_CATALOG)[number]["id"];
export type HseFolderDef = { id: HseFolderId; label: string };

/** Desk radios — the catalog is the nav. No Board / Day-1 register tabs. */
export const HSE_DESK_RADIOS = HSE_MODULE_CATALOG;
export type HseDeskRadioId = HseFolderId;

export type HseFolderTemplate = {
  companyId: CompanyId;
  live: boolean;
  folders: readonly HseFolderDef[];
};

/** Madison HSE is the only live company template. Other companies clone later. */
export const HSE_FOLDER_TEMPLATES: readonly HseFolderTemplate[] = [
  { companyId: "madison", live: true, folders: HSE_MODULE_CATALOG },
];

/** Wendell / Benny Madison labels — same rows as the reusable catalog. */
export const HSE_FOLDERS = HSE_MODULE_CATALOG;

export function hseFolderTemplateFor(companyId?: string | null): HseFolderTemplate | null {
  const id = (companyId || "").trim().toLowerCase();
  if (!id) return null;
  return HSE_FOLDER_TEMPLATES.find((row) => row.companyId === id) ?? null;
}

export function hseFoldersFor(companyId?: string | null): readonly HseFolderDef[] {
  const template = hseFolderTemplateFor(companyId);
  if (!template?.live) return [];
  return template.folders;
}

export function showsHseFolderDesk(companyId?: string | null) {
  return hseFoldersFor(companyId).length > 0;
}

/** Madison is the live template. Radios stay up for HSE seats even before a job is picked. */
export function hseDeskVaultCompanyId(
  companyId?: string | null,
  opts?: { hseSeat?: boolean },
): string | undefined {
  if (showsHseFolderDesk(companyId)) return companyId || undefined;
  if (opts?.hseSeat) return "madison";
  return companyId || undefined;
}

/** API / UI list. Missing company → default catalog. Unknown company → none. */
export function hseFoldersListedFor(companyId?: string | null): readonly HseFolderDef[] {
  if (!(companyId || "").trim()) return HSE_FOLDERS;
  return hseFoldersFor(companyId);
}

/** Clone a live template for another company without inventing new modules. */
export function cloneHseFolderTemplate(companyId: CompanyId, source = "madison"): HseFolderTemplate {
  const folders = hseFolderTemplateFor(source)?.folders ?? HSE_MODULE_CATALOG;
  return {
    companyId,
    live: false,
    folders: folders.map((folder) => ({ id: folder.id, label: folder.label })),
  };
}

export const HSE_FOLDER_SCOPE_KEY = "hs_hse_folder_v1";

export const HSE_DROP_MAX_FILE_BYTES = QUALITY_DROP_MAX_FILE_BYTES;
export const HSE_DROP_MAX_BYTES = QUALITY_DROP_MAX_BYTES;
export const HSE_DROP_TYPE_ERROR = QUALITY_DROP_TYPE_ERROR;
export const HSE_DROP_SIZE_ERROR = QUALITY_DROP_SIZE_ERROR;
export const HSE_DROP_ACCEPT = QUALITY_DROP_ACCEPT;

export const hseDropByteLength = qualityDropByteLength;
export const checkHseDropFile = checkQualityDropFile;
export const checkHseDrop = checkQualityDrop;
export const mergeHseFolderFiles = mergeQualityFolderFiles;

const FOLDER_SYNONYMS: Record<string, HseFolderId> = {
  packages: "packages",
  package: "packages",
  "hse package": "packages",
  "hse kit": "packages",
  orientation: "orientation",
  "site orientation": "orientation",
  jsa: "jsa",
  "madison jsa": "jsa",
  jsas: "jsa",
  toolbox: "toolbox",
  "toolbox talk": "toolbox",
  "toolbox talks": "toolbox",
  "hot-work": "hot-work",
  "hot work": "hot-work",
  confined: "confined",
  "confined space": "confined",
  loto: "loto",
  excavation: "excavation",
  incidents: "incidents",
  "incidents / near misses": "incidents",
  "near misses": "incidents",
  observations: "observations",
};

export type HseFolderFile = { name: string; type: string };
export type HseFolderDrop = {
  jobId: string;
  folderId: HseFolderId;
  files: HseFolderFile[];
  savedAt: string;
};

export function isHseFolderId(value: unknown, companyId?: string | null): value is HseFolderId {
  if (typeof value !== "string") return false;
  const catalog = companyId ? hseFoldersFor(companyId) : HSE_MODULE_CATALOG;
  return catalog.some((folder) => folder.id === value);
}

export function isHseDeskRadio(value: string, companyId?: string | null): value is HseDeskRadioId {
  return isHseFolderId(value, companyId);
}

export function hseFolderLabel(id: HseFolderId, companyId?: string | null) {
  const catalog = companyId ? hseFoldersFor(companyId) : HSE_FOLDERS;
  return catalog.find((folder) => folder.id === id)?.label ?? HSE_FOLDERS.find((folder) => folder.id === id)?.label ?? id;
}

function folderAllowed(id: HseFolderId, companyId?: string | null) {
  if (!companyId) return true;
  return hseFoldersFor(companyId).some((folder) => folder.id === id);
}

/** Catalog ids plus shipped 1:1 synonyms. Do not invent extra folder ids. */
export function resolveHseFolder(value: string, companyId?: string | null): HseFolderId | "" {
  const raw = value.trim();
  if (isHseFolderId(raw, companyId || undefined)) return raw as HseFolderId;
  const key = raw.toLowerCase().replace(/\s+/g, " ");
  const compact = key.replace(/\s*\/\s*/g, "/");
  if (FOLDER_SYNONYMS[key] && folderAllowed(FOLDER_SYNONYMS[key], companyId)) return FOLDER_SYNONYMS[key];
  if (FOLDER_SYNONYMS[compact] && folderAllowed(FOLDER_SYNONYMS[compact], companyId)) return FOLDER_SYNONYMS[compact];
  const matches = Object.entries(FOLDER_SYNONYMS)
    .filter(([alias, id]) => folderAllowed(id, companyId) && (key === alias || key.startsWith(`${alias} `) || compact === alias))
    .sort((left, right) => right[0].length - left[0].length);
  return matches[0]?.[1] ?? "";
}

export function hseFolderBriefId(who: string, jobId: string, folderId: HseFolderId) {
  const email = who.trim().toLowerCase();
  return `brief-hse-${email}-job:${jobId.trim()}-folder:${folderId}`;
}

export function hseFolderLocalKey(jobId: string, folderId: HseFolderId) {
  return `hs_hse_folder_v1:${jobId.trim()}:${folderId}`;
}

export function readHseFolderFiles(
  jobId: string,
  folderId: HseFolderId,
  store?: { getItem(key: string): string | null } | null,
): LeadFile[] {
  const target = store ?? (typeof window === "undefined" ? null : window.localStorage);
  if (!target || !jobId.trim()) return [];
  try {
    const raw = target.getItem(hseFolderLocalKey(jobId, folderId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { files?: LeadFile[] };
    return Array.isArray(parsed.files) ? parsed.files.filter((file) => file?.name && file?.data) : [];
  } catch {
    return [];
  }
}

export function writeHseFolderFiles(
  jobId: string,
  folderId: HseFolderId,
  files: LeadFile[],
  store?: { setItem(key: string, value: string): void } | null,
) {
  const target = store ?? (typeof window === "undefined" ? null : window.localStorage);
  if (!target || !jobId.trim()) return;
  try {
    target.setItem(hseFolderLocalKey(jobId, folderId), JSON.stringify({ files }));
  } catch {
    // keep the previous copy
  }
}

export function readHseFolderPick(jobId: string, store?: { getItem(key: string): string | null } | null): HseFolderId {
  const target = store ?? (typeof window === "undefined" ? null : window.localStorage);
  if (!target || !jobId.trim()) return HSE_FOLDERS[0].id;
  try {
    const raw = target.getItem(`${HSE_FOLDER_SCOPE_KEY}:${jobId.trim()}`);
    return resolveHseFolder(raw || "") || HSE_FOLDERS[0].id;
  } catch {
    return HSE_FOLDERS[0].id;
  }
}

export function writeHseFolderPick(
  jobId: string,
  folderId: HseFolderId,
  store?: { setItem(key: string, value: string): void } | null,
) {
  const target = store ?? (typeof window === "undefined" ? null : window.localStorage);
  if (!target || !jobId.trim()) return;
  try {
    target.setItem(`${HSE_FOLDER_SCOPE_KEY}:${jobId.trim()}`, folderId);
  } catch {
    // keep the previous pick
  }
}

export type HseFolderBriefRow = {
  kind?: string;
  who?: string;
  jobId?: string;
  folderId?: string;
  savedAt?: string;
  files?: Array<{ name?: string; type?: string }>;
};

export function publicHseFolderDrop(brief: HseFolderBriefRow): HseFolderDrop | null {
  if (brief.kind && brief.kind !== "hse") return null;
  const folderId = resolveHseFolder(brief.folderId || "");
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

export function hseFolderDropsFor(
  briefs: HseFolderBriefRow[],
  jobId: string,
  folderId: HseFolderId,
  who?: string,
): HseFolderDrop[] {
  const job = jobId.trim();
  const key = (who || "").trim().toLowerCase();
  return briefs
    .filter((brief) => {
      if (brief.kind && brief.kind !== "hse") return false;
      if (key && (brief.who || "").trim().toLowerCase() !== key) return false;
      return brief.jobId === job && resolveHseFolder(brief.folderId || "") === folderId;
    })
    .map(publicHseFolderDrop)
    .filter((row): row is HseFolderDrop => Boolean(row));
}

/** Catalog ids must stay a superset of shipped package slots + execute lanes (minus unused aliases). */
export function hseCatalogCoversShippedSafetyFiles() {
  const shipped = new Set<string>([
    ...HSE_PACKAGE_SLOTS.map((slot) => slot.id),
    ...HSE_EXECUTE_LANES.map((lane) => lane.id),
    "packages",
  ]);
  return HSE_MODULE_CATALOG.every((row) => shipped.has(row.id)) && shipped.size === HSE_MODULE_CATALOG.length;
}

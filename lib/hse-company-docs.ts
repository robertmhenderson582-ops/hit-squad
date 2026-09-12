import type { CompanyId } from "./companies.ts";
import type { LeadFile } from "./lead-briefs.ts";
import { HSE_FOLDERS, mergeHseFolderFiles, type HseFolderFile } from "./hse-folders.ts";
import {
  QUALITY_COMPANY_DOC_GOOGLE_NATIVE_ERROR,
  primaryQualityCompanyDocFile,
  qualityCompanyDocArchiveName,
  qualityCompanyDocFileName,
  qualityCompanyDocGoogleNativeType,
  qualityCompanyDocMime,
  qualityCompanyDocPreviewType,
  qualityCompanyDocViewKind,
  type QualityCompanyDocViewKind,
} from "./quality-company-docs.ts";

/**
 * Standing HSE company-doc buckets. Wendell / Benny / Robert safety-file set:
 * manuals, JSAs, forms, updates. Briefs stay on the vault index (hse-briefs.json).
 * Madison is the live template; the next company clones these ids.
 */
export const HSE_COMPANY_DOC_CATALOG = [
  { id: "safety-manual", label: "Madison Safety Manual" },
  { id: "jsas", label: "JSAs" },
  { id: "forms", label: "Forms" },
  { id: "hse-updates", label: "HSE Updates" },
] as const;

export type HseCompanyDocId = (typeof HSE_COMPANY_DOC_CATALOG)[number]["id"];
export type HseCompanyDocDef = { id: HseCompanyDocId; label: string };

export type HseCompanyDocTemplate = {
  companyId: CompanyId;
  live: boolean;
  docs: readonly HseCompanyDocDef[];
};

export const HSE_COMPANY_DOC_TEMPLATES: readonly HseCompanyDocTemplate[] = [
  { companyId: "madison", live: true, docs: HSE_COMPANY_DOC_CATALOG },
];

export const HSE_COMPANY_DOCS = HSE_COMPANY_DOC_CATALOG;

export const HSE_COMPANY_DOC_SCOPE_KEY = "hs_hse_company_doc_v1";

export const HSE_COMPANY_DOC_GOOGLE_NATIVE_ERROR = QUALITY_COMPANY_DOC_GOOGLE_NATIVE_ERROR;

export type HseCompanyDocViewKind = QualityCompanyDocViewKind;

export const hseCompanyDocFileName = qualityCompanyDocFileName;
export const hseCompanyDocMime = qualityCompanyDocMime;
export const hseCompanyDocGoogleNativeType = qualityCompanyDocGoogleNativeType;
export const hseCompanyDocViewKind = qualityCompanyDocViewKind;
export const hseCompanyDocPreviewType = qualityCompanyDocPreviewType;
export const hseCompanyDocArchiveName = qualityCompanyDocArchiveName;
export const primaryHseCompanyDocFile = primaryQualityCompanyDocFile;

export function hseCompanyDocTemplateFor(companyId?: string | null): HseCompanyDocTemplate | null {
  const id = (companyId || "").trim().toLowerCase();
  if (!id) return null;
  return HSE_COMPANY_DOC_TEMPLATES.find((row) => row.companyId === id) ?? null;
}

export function hseCompanyDocsFor(companyId?: string | null): readonly HseCompanyDocDef[] {
  const template = hseCompanyDocTemplateFor(companyId);
  if (!template?.live) return [];
  return template.docs;
}

export function showsHseCompanyDocs(companyId?: string | null) {
  return hseCompanyDocsFor(companyId).length > 0;
}

export function hseCompanyDocsListedFor(companyId?: string | null): readonly HseCompanyDocDef[] {
  const live = hseCompanyDocsFor(companyId);
  return live.length ? live : HSE_COMPANY_DOCS;
}

export function hseCompanyDocHome(companyId?: string | null): CompanyId {
  const id = (companyId || "").trim().toLowerCase();
  if (id && showsHseCompanyDocs(id)) return id;
  return "madison";
}

/**
 * Left rail is company-wide. Job / site must never remap the Madison home.
 * Assigned company wins only when it has a live HSE catalog; otherwise Madison.
 */
export function hseRailCompanyId(_jobCompanyId?: string | null, assignedCompanyId?: string | null): CompanyId {
  if (showsHseCompanyDocs(assignedCompanyId)) return (assignedCompanyId || "").trim().toLowerCase();
  return "madison";
}

export function hseCompanyDocViewPath(companyId: string, docId: HseCompanyDocId, fileName: string) {
  const home = hseCompanyDocHome(companyId);
  const file = hseCompanyDocFileName(fileName);
  return `/api/desk/briefs?kind=hse&scope=company-docs&company=${encodeURIComponent(home)}&folder=${encodeURIComponent(docId)}&file=${encodeURIComponent(file)}`;
}

export function publicHseCompanyDocFile(file: { name?: string; type?: string; data?: string } | null) {
  const name = hseCompanyDocFileName(file?.name);
  const data = typeof file?.data === "string" ? file.data : "";
  if (!name || !data) return null;
  if (hseCompanyDocGoogleNativeType(file?.type)) return null;
  return {
    name,
    type: hseCompanyDocPreviewType({ name, type: file?.type }),
    data,
  };
}

export function cloneHseCompanyDocTemplate(companyId: CompanyId, source = "madison"): HseCompanyDocTemplate {
  const docs = hseCompanyDocTemplateFor(source)?.docs ?? HSE_COMPANY_DOC_CATALOG;
  return {
    companyId,
    live: false,
    docs: docs.map((doc) => ({ id: doc.id, label: doc.label })),
  };
}

export function isHseCompanyDocId(value: unknown, companyId?: string | null): value is HseCompanyDocId {
  if (typeof value !== "string") return false;
  return hseCompanyDocsListedFor(companyId).some((doc) => doc.id === value);
}

export function hseCompanyDocLabel(id: HseCompanyDocId, companyId?: string | null) {
  return (
    hseCompanyDocsListedFor(companyId).find((doc) => doc.id === id)?.label ??
    HSE_COMPANY_DOCS.find((doc) => doc.id === id)?.label ??
    id
  );
}

export function hseCompanyDocsJobId(companyId?: string | null) {
  return `company-docs:${hseCompanyDocHome(companyId)}`;
}

export function isHseCompanyDocsJobId(jobId?: string | null) {
  return (jobId || "").trim().startsWith("company-docs:");
}

export function hseCompanyDocBriefId(who: string, companyId: string, docId: HseCompanyDocId) {
  const email = who.trim().toLowerCase();
  return `brief-hse-${email}-job:${hseCompanyDocsJobId(companyId)}-folder:${docId}`;
}

export function hseCompanyDocLocalKey(companyId: string, docId: HseCompanyDocId) {
  return `${HSE_COMPANY_DOC_SCOPE_KEY}:${hseCompanyDocHome(companyId)}:${docId}`;
}

export function readHseCompanyDocFiles(
  companyId: string,
  docId: HseCompanyDocId,
  store?: { getItem(key: string): string | null } | null,
): LeadFile[] {
  const target = store ?? (typeof window === "undefined" ? null : window.localStorage);
  if (!target) return [];
  try {
    const raw = target.getItem(hseCompanyDocLocalKey(companyId, docId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { files?: LeadFile[] };
    return Array.isArray(parsed.files) ? parsed.files.filter((file) => file?.name && file?.data) : [];
  } catch {
    return [];
  }
}

export function writeHseCompanyDocFiles(
  companyId: string,
  docId: HseCompanyDocId,
  files: LeadFile[],
  store?: { setItem(key: string, value: string): void } | null,
) {
  const target = store ?? (typeof window === "undefined" ? null : window.localStorage);
  if (!target) return;
  try {
    target.setItem(hseCompanyDocLocalKey(companyId, docId), JSON.stringify({ files }));
  } catch {
    // keep the previous copy
  }
}

export function readHseCompanyDocPick(
  companyId: string,
  store?: { getItem(key: string): string | null } | null,
): HseCompanyDocId {
  const target = store ?? (typeof window === "undefined" ? null : window.localStorage);
  const fallback = HSE_COMPANY_DOCS[0].id;
  if (!target) return fallback;
  try {
    const raw = target.getItem(`${HSE_COMPANY_DOC_SCOPE_KEY}:${hseCompanyDocHome(companyId)}`);
    return isHseCompanyDocId(raw, companyId) ? raw : fallback;
  } catch {
    return fallback;
  }
}

export function writeHseCompanyDocPick(
  companyId: string,
  docId: HseCompanyDocId,
  store?: { setItem(key: string, value: string): void } | null,
) {
  const target = store ?? (typeof window === "undefined" ? null : window.localStorage);
  if (!target) return;
  try {
    target.setItem(`${HSE_COMPANY_DOC_SCOPE_KEY}:${hseCompanyDocHome(companyId)}`, docId);
  } catch {
    // keep the previous pick
  }
}

export function hseCompanyDocDropsFor(
  briefs: Array<{
    kind?: string;
    who?: string;
    jobId?: string;
    folderId?: string;
    files?: HseFolderFile[];
  }>,
  companyId: string,
  docId: HseCompanyDocId,
  who?: string,
) {
  const job = hseCompanyDocsJobId(companyId);
  const key = (who || "").trim().toLowerCase();
  return briefs.filter((brief) => {
    if (brief.kind && brief.kind !== "hse") return false;
    if (key && (brief.who || "").trim().toLowerCase() !== key) return false;
    return brief.jobId === job && brief.folderId === docId;
  });
}

export function mergeHseCompanyDocFiles(current: LeadFile[], incoming: LeadFile[]) {
  return mergeHseFolderFiles(current, incoming);
}

export function hseCompanyDocCollidesWithJobFolder(id: string) {
  return HSE_FOLDERS.some((folder) => folder.id === id);
}

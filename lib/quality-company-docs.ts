import type { CompanyId } from "./companies.ts";
import type { LeadFile } from "./lead-briefs.ts";
import { QUALITY_FOLDERS, mergeQualityFolderFiles, type QualityFolderFile } from "./quality-folders.ts";

/**
 * Standing Quality company-doc buckets. Chance’s four labels are the default.
 * Madison is the live template; the next company clones these ids, not Madison form names.
 */
export const QUALITY_COMPANY_DOC_CATALOG = [
  { id: "quality-control-manual", label: "Quality Control Manual" },
  { id: "code-documents", label: "Code Documents" },
  { id: "forms", label: "Forms" },
  { id: "quality-updates", label: "Quality Updates" },
] as const;

export type QualityCompanyDocId = (typeof QUALITY_COMPANY_DOC_CATALOG)[number]["id"];
export type QualityCompanyDocDef = { id: QualityCompanyDocId; label: string };

export type QualityCompanyDocTemplate = {
  companyId: CompanyId;
  live: boolean;
  docs: readonly QualityCompanyDocDef[];
};

export const QUALITY_COMPANY_DOC_TEMPLATES: readonly QualityCompanyDocTemplate[] = [
  { companyId: "madison", live: true, docs: QUALITY_COMPANY_DOC_CATALOG },
];

/** Chance’s four company-file labels — same rows as the reusable catalog. */
export const QUALITY_COMPANY_DOCS = QUALITY_COMPANY_DOC_CATALOG;

export const QUALITY_COMPANY_DOC_SCOPE_KEY = "hs_quality_company_doc_v1";

export function qualityCompanyDocTemplateFor(companyId?: string | null): QualityCompanyDocTemplate | null {
  const id = (companyId || "").trim().toLowerCase();
  if (!id) return null;
  return QUALITY_COMPANY_DOC_TEMPLATES.find((row) => row.companyId === id) ?? null;
}

export function qualityCompanyDocsFor(companyId?: string | null): readonly QualityCompanyDocDef[] {
  const template = qualityCompanyDocTemplateFor(companyId);
  if (!template?.live) return [];
  return template.docs;
}

export function showsQualityCompanyDocs(companyId?: string | null) {
  return qualityCompanyDocsFor(companyId).length > 0;
}

/** Left rail always lists Chance’s four. Live company uses its template; everyone else sees the catalog. */
export function qualityCompanyDocsListedFor(companyId?: string | null): readonly QualityCompanyDocDef[] {
  const live = qualityCompanyDocsFor(companyId);
  return live.length ? live : QUALITY_COMPANY_DOCS;
}

export function qualityCompanyDocHome(companyId?: string | null): CompanyId {
  const id = (companyId || "").trim().toLowerCase();
  if (id && showsQualityCompanyDocs(id)) return id;
  return "madison";
}

/**
 * Left rail is company-wide. Job / site must never remap Chance’s Madison home.
 * Assigned company wins only when it has a live Quality catalog; otherwise Madison.
 */
export function qualityRailCompanyId(_jobCompanyId?: string | null, assignedCompanyId?: string | null): CompanyId {
  if (showsQualityCompanyDocs(assignedCompanyId)) return (assignedCompanyId || "").trim().toLowerCase();
  return "madison";
}

export type QualityCompanyDocViewKind = "pdf" | "image" | "office" | "text" | "zip" | "other";

/** Native Google Docs/Sheets mime — not a binary PDF from OneDrive/zip. */
export const QUALITY_COMPANY_DOC_GOOGLE_NATIVE_ERROR =
  "That file is a Google Doc, not a PDF. Upload the PDF file itself.";

export function qualityCompanyDocFileName(value: unknown) {
  if (typeof value !== "string") return "";
  return value.replace(/\\/g, "/").split("/").pop()?.trim() || "";
}

export function qualityCompanyDocMime(type?: string) {
  return (type || "").split(";")[0].trim();
}

export function qualityCompanyDocGoogleNativeType(type?: string) {
  const mime = qualityCompanyDocMime(type).toLowerCase();
  return mime.startsWith("application/vnd.google-apps.") && !mime.endsWith(".folder");
}

export function qualityCompanyDocViewKind(file: { name?: string; type?: string }): QualityCompanyDocViewKind {
  const name = qualityCompanyDocFileName(file.name).toLowerCase();
  const type = qualityCompanyDocMime(file.type).toLowerCase();
  if (qualityCompanyDocGoogleNativeType(type)) return "other";
  if (type.includes("pdf") || name.endsWith(".pdf")) return "pdf";
  if (type.startsWith("image/") || /\.(png|jpe?g|gif|webp)$/.test(name)) return "image";
  if (
    type.includes("word") ||
    type.includes("excel") ||
    type.includes("spreadsheet") ||
    type.includes("msword") ||
    /\.(docx?|xlsx?|csv)$/.test(name)
  ) {
    return "office";
  }
  if (type.includes("zip") || name.endsWith(".zip")) return "zip";
  if (type.startsWith("text/") || name.endsWith(".txt")) return "text";
  return "other";
}

/**
 * Blob / object-URL MIME from view kind, not Drive’s listed type.
 * A file named x.pdf with type text/plain still previews as application/pdf.
 */
export function qualityCompanyDocPreviewType(file: { name?: string; type?: string }) {
  const name = qualityCompanyDocFileName(file.name);
  const type = qualityCompanyDocMime(file.type);
  if (qualityCompanyDocGoogleNativeType(type)) return type || "application/octet-stream";
  const kind = qualityCompanyDocViewKind({ name, type });
  if (kind === "pdf") return "application/pdf";
  if (kind === "image") {
    const lower = name.toLowerCase();
    if (lower.endsWith(".png")) return "image/png";
    if (lower.endsWith(".gif")) return "image/gif";
    if (lower.endsWith(".webp")) return "image/webp";
    if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
    if (type.toLowerCase().startsWith("image/")) return type;
    return "image/jpeg";
  }
  if (kind === "text") return "text/plain";
  return type || "application/octet-stream";
}

export function qualityCompanyDocArchiveName(value: unknown) {
  return qualityCompanyDocFileName(value).toLowerCase().endsWith(".zip");
}

export function primaryQualityCompanyDocFile<T extends { name?: string; vaulted?: boolean }>(
  files: readonly T[],
): T | null {
  const listed = files.filter((file) => qualityCompanyDocFileName(file.name));
  if (!listed.length) return null;
  const vaulted = listed.filter((file) => file.vaulted);
  const pool = vaulted.length ? vaulted : listed;
  return pool[pool.length - 1] ?? null;
}

export function qualityCompanyDocViewPath(companyId: string, docId: QualityCompanyDocId, fileName: string) {
  const home = qualityCompanyDocHome(companyId);
  const file = qualityCompanyDocFileName(fileName);
  return `/api/desk/briefs?kind=quality&scope=company-docs&company=${encodeURIComponent(home)}&folder=${encodeURIComponent(docId)}&file=${encodeURIComponent(file)}`;
}

export function publicQualityCompanyDocFile(file: { name?: string; type?: string; data?: string } | null) {
  const name = qualityCompanyDocFileName(file?.name);
  const data = typeof file?.data === "string" ? file.data : "";
  if (!name || !data) return null;
  if (qualityCompanyDocGoogleNativeType(file?.type)) return null;
  return {
    name,
    type: qualityCompanyDocPreviewType({ name, type: file?.type }),
    data,
  };
}

export function cloneQualityCompanyDocTemplate(companyId: CompanyId, source = "madison"): QualityCompanyDocTemplate {
  const docs = qualityCompanyDocTemplateFor(source)?.docs ?? QUALITY_COMPANY_DOC_CATALOG;
  return {
    companyId,
    live: false,
    docs: docs.map((doc) => ({ id: doc.id, label: doc.label })),
  };
}

export function isQualityCompanyDocId(value: unknown, companyId?: string | null): value is QualityCompanyDocId {
  if (typeof value !== "string") return false;
  return qualityCompanyDocsListedFor(companyId).some((doc) => doc.id === value);
}

export function qualityCompanyDocLabel(id: QualityCompanyDocId, companyId?: string | null) {
  return (
    qualityCompanyDocsListedFor(companyId).find((doc) => doc.id === id)?.label ??
    QUALITY_COMPANY_DOCS.find((doc) => doc.id === id)?.label ??
    id
  );
}

/** Synthetic job key so company docs never mix with a real job folder drop. */
export function qualityCompanyDocsJobId(companyId?: string | null) {
  return `company-docs:${qualityCompanyDocHome(companyId)}`;
}

export function isQualityCompanyDocsJobId(jobId?: string | null) {
  return (jobId || "").trim().startsWith("company-docs:");
}

export function qualityCompanyDocBriefId(who: string, companyId: string, docId: QualityCompanyDocId) {
  const email = who.trim().toLowerCase();
  return `brief-quality-${email}-job:${qualityCompanyDocsJobId(companyId)}-folder:${docId}`;
}

export function qualityCompanyDocLocalKey(companyId: string, docId: QualityCompanyDocId) {
  return `${QUALITY_COMPANY_DOC_SCOPE_KEY}:${qualityCompanyDocHome(companyId)}:${docId}`;
}

export function readQualityCompanyDocFiles(
  companyId: string,
  docId: QualityCompanyDocId,
  store?: { getItem(key: string): string | null } | null,
): LeadFile[] {
  const target = store ?? (typeof window === "undefined" ? null : window.localStorage);
  if (!target) return [];
  try {
    const raw = target.getItem(qualityCompanyDocLocalKey(companyId, docId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { files?: LeadFile[] };
    return Array.isArray(parsed.files) ? parsed.files.filter((file) => file?.name && file?.data) : [];
  } catch {
    return [];
  }
}

export function writeQualityCompanyDocFiles(
  companyId: string,
  docId: QualityCompanyDocId,
  files: LeadFile[],
  store?: { setItem(key: string, value: string): void } | null,
) {
  const target = store ?? (typeof window === "undefined" ? null : window.localStorage);
  if (!target) return;
  try {
    target.setItem(qualityCompanyDocLocalKey(companyId, docId), JSON.stringify({ files }));
  } catch {
    // keep the previous copy
  }
}

export function readQualityCompanyDocPick(
  companyId: string,
  store?: { getItem(key: string): string | null } | null,
): QualityCompanyDocId {
  const target = store ?? (typeof window === "undefined" ? null : window.localStorage);
  const fallback = QUALITY_COMPANY_DOCS[0].id;
  if (!target) return fallback;
  try {
    const raw = target.getItem(`${QUALITY_COMPANY_DOC_SCOPE_KEY}:${qualityCompanyDocHome(companyId)}`);
    return isQualityCompanyDocId(raw, companyId) ? raw : fallback;
  } catch {
    return fallback;
  }
}

export function writeQualityCompanyDocPick(
  companyId: string,
  docId: QualityCompanyDocId,
  store?: { setItem(key: string, value: string): void } | null,
) {
  const target = store ?? (typeof window === "undefined" ? null : window.localStorage);
  if (!target) return;
  try {
    target.setItem(`${QUALITY_COMPANY_DOC_SCOPE_KEY}:${qualityCompanyDocHome(companyId)}`, docId);
  } catch {
    // keep the previous pick
  }
}

export function qualityCompanyDocDropsFor(
  briefs: Array<{
    kind?: string;
    who?: string;
    jobId?: string;
    folderId?: string;
    files?: QualityFolderFile[];
  }>,
  companyId: string,
  docId: QualityCompanyDocId,
  who?: string,
) {
  const job = qualityCompanyDocsJobId(companyId);
  const key = (who || "").trim().toLowerCase();
  return briefs.filter((brief) => {
    if (brief.kind && brief.kind !== "quality") return false;
    if (key && (brief.who || "").trim().toLowerCase() !== key) return false;
    return brief.jobId === job && brief.folderId === docId;
  });
}

export function mergeQualityCompanyDocFiles(current: LeadFile[], incoming: LeadFile[]) {
  return mergeQualityFolderFiles(current, incoming);
}

export function qualityCompanyDocCollidesWithJobFolder(id: string) {
  return QUALITY_FOLDERS.some((folder) => folder.id === id);
}

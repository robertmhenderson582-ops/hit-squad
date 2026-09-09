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

export function qualityRailCompanyId(jobCompanyId?: string | null, assignedCompanyId?: string | null): CompanyId {
  if (showsQualityCompanyDocs(jobCompanyId)) return (jobCompanyId || "").trim().toLowerCase();
  if (showsQualityCompanyDocs(assignedCompanyId)) return (assignedCompanyId || "").trim().toLowerCase();
  return "madison";
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

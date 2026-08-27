export type LeadKind = "quality" | "hse";
export type LeadFile = { name: string; type: string; data: string };
export type LeadBrief = { describe: string; files: LeadFile[]; savedAt: string | null };
export type BriefDropFile = { name: string; type: string; bytes: number };

export const BRIEF_MAX_FILE_BYTES = 15 * 1024 * 1024;
export const BRIEF_MAX_DROP_BYTES = 50 * 1024 * 1024;
export const BRIEF_TYPE_ERROR = "file type not allowed";
export const BRIEF_SIZE_ERROR = "file too large";
export const BRIEF_FILE_ACCEPT = ".pdf,.xlsx,.xls,.csv,.jpg,.jpeg,.png,.webp,.heic,.gif";

export const BRIEF_ALLOWED_MIME: Record<string, string> = {
  pdf: "application/pdf",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xls: "application/vnd.ms-excel",
  csv: "text/csv",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  gif: "image/gif",
};

export function isLeadKind(value: unknown): value is LeadKind {
  return value === "quality" || value === "hse";
}

export function isLeadFile(value: unknown): value is LeadFile {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<LeadFile>;
  return typeof row.name === "string" && row.name.length > 0 && typeof row.data === "string";
}

export function fileExtension(name: string) {
  const base = name.replace(/\\/g, "/").split("/").pop() || "";
  const dot = base.lastIndexOf(".");
  if (dot <= 0 || dot === base.length - 1) return "";
  return base.slice(dot + 1).toLowerCase();
}

export function normalizeMime(type: string) {
  return type.split(";")[0].trim().toLowerCase();
}

export function base64ByteLength(data: string) {
  const compact = data.replace(/\s/g, "");
  if (!compact) return 0;
  const padding = compact.endsWith("==") ? 2 : compact.endsWith("=") ? 1 : 0;
  return Math.floor((compact.length * 3) / 4) - padding;
}

export function dropFileFromLead(file: LeadFile): BriefDropFile {
  return { name: file.name, type: file.type, bytes: base64ByteLength(file.data) };
}

export function dropFileFromBrowser(file: { name: string; type: string; size: number }): BriefDropFile {
  return { name: file.name, type: file.type, bytes: file.size };
}

export function checkBriefFile(file: BriefDropFile) {
  const expected = BRIEF_ALLOWED_MIME[fileExtension(file.name)];
  const mime = normalizeMime(file.type || "");
  if (!expected || !mime || mime !== expected) {
    return { ok: false as const, error: BRIEF_TYPE_ERROR };
  }
  if (!Number.isFinite(file.bytes) || file.bytes < 0 || file.bytes > BRIEF_MAX_FILE_BYTES) {
    return { ok: false as const, error: BRIEF_SIZE_ERROR };
  }
  return { ok: true as const };
}

export function checkBriefDrop(files: BriefDropFile[]) {
  let total = 0;
  for (const file of files) {
    const check = checkBriefFile(file);
    if (!check.ok) return check;
    total += file.bytes;
  }
  if (total > BRIEF_MAX_DROP_BYTES) return { ok: false as const, error: BRIEF_SIZE_ERROR };
  return { ok: true as const };
}

export function checkLeadFiles(files: LeadFile[]) {
  return checkBriefDrop(files.map(dropFileFromLead));
}

export function assertBriefDrop(files: LeadFile[]) {
  const check = checkLeadFiles(files);
  if (!check.ok) throw new Error(check.error);
}

export function briefDownloadContentType(name: string, type: string) {
  const mime = normalizeMime(type || "");
  const expected = BRIEF_ALLOWED_MIME[fileExtension(name)];
  if (!expected || mime !== expected) return "application/octet-stream";
  return expected;
}

export function briefKey(kind: string) {
  return `hs_lead_${kind}`;
}

export function mergeLeadFiles(current: LeadFile[], incoming: LeadFile[]) {
  const byName = new Map(current.map((file) => [file.name, file]));
  for (const file of incoming) byName.set(file.name, file);
  return [...byName.values()];
}

export function readBrief(kind: string): LeadBrief {
  if (typeof window === "undefined") return { describe: "", files: [], savedAt: null };
  try {
    const raw = window.localStorage.getItem(briefKey(kind));
    if (!raw) return { describe: "", files: [], savedAt: null };
    const parsed = JSON.parse(raw) as Partial<LeadBrief>;
    return {
      describe: parsed.describe ?? "",
      files: parsed.files ?? [],
      savedAt: parsed.savedAt ?? null,
    };
  } catch {
    return { describe: "", files: [], savedAt: null };
  }
}

export function writeBrief(kind: string, brief: LeadBrief) {
  window.localStorage.setItem(briefKey(kind), JSON.stringify(brief));
}

export async function fileToLead(file: File): Promise<LeadFile> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return { name: file.name, type: file.type || "application/octet-stream", data: btoa(binary) };
}

export function leadToBytes(file: LeadFile) {
  const binary = atob(file.data);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

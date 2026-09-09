export type LeadFile = { name: string; type: string; data: string };
export type LeadBrief = { describe: string; files: LeadFile[]; savedAt: string | null };
export type PublicLeadFile = { name: string; type: string };
export type PublicLeadBrief = {
  id: string;
  kind: "quality" | "hse";
  who: string;
  whoName: string;
  describe: string;
  files: PublicLeadFile[];
  savedAt: string;
  jobId?: string;
  folderId?: string;
  companyId?: string;
};

export function briefKey(kind: string, jobId = "") {
  const id = jobId.trim();
  return id ? `hs_lead_${kind}:job:${id}` : `hs_lead_${kind}`;
}

export function briefLegacyClaimKey(kind: string) {
  return `hs_lead_${kind}:legacy-claim`;
}

function emptyBrief(): LeadBrief {
  return { describe: "", files: [], savedAt: null };
}

function parseBrief(raw: string | null): LeadBrief {
  if (!raw) return emptyBrief();
  const parsed = JSON.parse(raw) as Partial<LeadBrief>;
  return {
    describe: parsed.describe ?? "",
    files: parsed.files ?? [],
    savedAt: parsed.savedAt ?? null,
  };
}

export function readBrief(
  kind: string,
  jobId = "",
  store?: { getItem(key: string): string | null; setItem(key: string, value: string): void } | null,
): LeadBrief {
  const target = store ?? (typeof window === "undefined" ? null : window.localStorage);
  if (!target) return emptyBrief();
  try {
    const jobRaw = jobId.trim() ? target.getItem(briefKey(kind, jobId)) : null;
    if (jobRaw) return parseBrief(jobRaw);
    if (jobId.trim() && target.setItem && !target.getItem(briefLegacyClaimKey(kind))) {
      const legacy = target.getItem(briefKey(kind));
      if (legacy) {
        target.setItem(briefKey(kind, jobId), legacy);
        target.setItem(briefLegacyClaimKey(kind), JSON.stringify({ jobId, at: new Date().toISOString() }));
        return parseBrief(legacy);
      }
    }
    if (jobId.trim()) return emptyBrief();
    return parseBrief(target.getItem(briefKey(kind)));
  } catch {
    return emptyBrief();
  }
}

export function writeBrief(kind: string, brief: LeadBrief, jobId = "", store?: { setItem(key: string, value: string): void } | null) {
  const target = store ?? (typeof window === "undefined" ? null : window.localStorage);
  if (!target) return;
  target.setItem(briefKey(kind, jobId), JSON.stringify(brief));
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

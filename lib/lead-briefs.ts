export type LeadFile = { name: string; type: string; data: string };
export type LeadBrief = { describe: string; files: LeadFile[]; savedAt: string | null };

export function briefKey(kind: string) {
  return `hs_lead_${kind}`;
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

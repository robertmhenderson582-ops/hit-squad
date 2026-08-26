import type { LandedBrief } from "./drive-briefs.ts";
import type { LeadBrief, LeadKind } from "./lead-briefs.ts";

export async function postBriefToVault(kind: LeadKind, brief: LeadBrief) {
  const response = await fetch("/api/desk/briefs", {
    method: "POST",
    credentials: "include",
    cache: "no-store",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      kind,
      describe: brief.describe,
      files: brief.files,
    }),
  });
  const data = (await response.json().catch(() => ({}))) as {
    ok?: boolean;
    stored?: boolean;
    store?: string;
    error?: string;
  };
  if (!response.ok) throw new Error(data.error || "Could not store that brief.");
  return { stored: Boolean(data.stored), store: data.store ?? null };
}

export async function listLandedBriefs(kind: LeadKind): Promise<{
  briefs: LandedBrief[];
  store: string | null;
}> {
  const response = await fetch(`/api/desk/briefs?kind=${kind}`, {
    credentials: "include",
    cache: "no-store",
  });
  if (!response.ok) return { briefs: [], store: null };
  const data = (await response.json()) as { briefs?: LandedBrief[]; store?: string };
  return {
    briefs: Array.isArray(data.briefs) ? data.briefs : [],
    store: typeof data.store === "string" ? data.store : null,
  };
}

export async function downloadLandedFile(fileId: string, name: string) {
  const response = await fetch(`/api/desk/briefs/file?id=${encodeURIComponent(fileId)}`, {
    credentials: "include",
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Could not open that file.");
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

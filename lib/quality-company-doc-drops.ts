import { hasBuildDesk } from "./desk-role.ts";
import { listStoredBriefs, publicBrief, saveStoredBrief } from "./lead-brief-store.ts";
import type { LeadFile, PublicLeadBrief } from "./lead-briefs.ts";
import {
  isQualityCompanyDocId,
  mergeQualityCompanyDocFiles,
  qualityCompanyDocBriefId,
  qualityCompanyDocDropsFor,
  qualityCompanyDocHome,
  qualityCompanyDocLabel,
  qualityCompanyDocsJobId,
  qualityCompanyDocsListedFor,
  type QualityCompanyDocId,
} from "./quality-company-docs.ts";
import { parseQualityDropFiles, qualityDropLeaks } from "./quality-folder-drops.ts";
import { checkQualityDrop } from "./quality-folders.ts";
import type { PublicUser } from "./types.ts";

export type QualityDocUser = Pick<PublicUser, "email" | "name" | "role">;

export type QualityCompanyDocSaveInput = {
  companyId?: unknown;
  folderId?: unknown;
  files?: unknown;
};

function qualityDocCompanyId(input: { companyId?: unknown }) {
  return typeof input.companyId === "string" && input.companyId.trim() ? input.companyId.trim() : undefined;
}

export async function saveQualityCompanyDocDrop(user: QualityDocUser, input: QualityCompanyDocSaveInput) {
  const home = qualityCompanyDocHome(qualityDocCompanyId(input));
  const folderId = input.folderId;
  if (!isQualityCompanyDocId(folderId, home)) {
    return { ok: false as const, status: 400, error: "Pick a Quality file." };
  }
  const incoming = parseQualityDropFiles(input.files);
  const check = checkQualityDrop(incoming);
  if (!check.accepted.length) {
    return {
      ok: false as const,
      status: 400,
      error: check.rejected[0]?.error || "Drop at least one file.",
      rejected: check.rejected,
    };
  }
  const jobId = qualityCompanyDocsJobId(home);
  const who = user.email.trim().toLowerCase();
  const existing = await listStoredBriefs("quality", who, { jobId, folderId, companyId: home });
  const prior = existing[0];
  const merged = mergeQualityCompanyDocFiles(prior?.files ?? [], check.accepted as LeadFile[]);
  try {
    const brief = await saveStoredBrief({
      kind: "quality",
      who,
      whoName: user.name,
      describe: qualityCompanyDocLabel(folderId, home),
      files: merged,
      jobId,
      folderId,
      companyId: home,
      mergeFiles: true,
    });
    return {
      ok: true as const,
      brief: publicBrief(brief),
      rejected: check.rejected,
      kept: merged.map((file) => file.name),
    };
  } catch {
    return {
      ok: false as const,
      status: 503,
      error: "Could not save. Those files are still on this desk — try again.",
      rejected: check.rejected,
    };
  }
}

export async function listQualityCompanyDocDrop(
  user: QualityDocUser,
  docId: QualityCompanyDocId,
  companyId?: string,
) {
  const home = qualityCompanyDocHome(companyId);
  if (!isQualityCompanyDocId(docId, home)) {
    return { briefs: [] as PublicLeadBrief[], files: [] as Array<{ name: string; type: string }> };
  }
  const jobId = qualityCompanyDocsJobId(home);
  const who = hasBuildDesk(user) ? undefined : user.email;
  const briefs = await listStoredBriefs("quality", who, { jobId, folderId: docId, companyId: home });
  const mine = qualityCompanyDocDropsFor(briefs, home, docId, hasBuildDesk(user) ? undefined : user.email);
  return {
    briefs: briefs.map(publicBrief),
    files: mine.flatMap((row) => (row.files ?? []).filter((file) => file.name)),
  };
}

export async function listQualityCompanyDocDrops(user: QualityDocUser, companyId?: string) {
  const home = qualityCompanyDocHome(companyId);
  const folders = qualityCompanyDocsListedFor(home);
  const filesByFolder: Record<string, Array<{ name: string; type: string }>> = {};
  for (const folder of folders) {
    const listed = await listQualityCompanyDocDrop(user, folder.id, home);
    filesByFolder[folder.id] = listed.files;
  }
  return { folders, filesByFolder, companyId: home };
}

export function qualityCompanyDocRowId(who: string, companyId: string, docId: QualityCompanyDocId) {
  return qualityCompanyDocBriefId(who, companyId, docId);
}

export { qualityDropLeaks };

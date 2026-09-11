import { hasBuildDesk } from "./desk-role.ts";
import { leadBriefAdapter, listStoredBriefs, publicBrief, saveStoredBrief } from "./lead-brief-store.ts";
import type { LeadFile, PublicLeadBrief } from "./lead-briefs.ts";
import { DriveApiError } from "./drive-estimates.ts";
import {
  listQualityCompanyDocVaultFolders,
  listQualityVaultFiles,
  persistQualityVaultFiles,
  qualityVaultWriteUserError,
  readQualityVaultFile,
} from "./quality-vault.ts";
import {
  QUALITY_COMPANY_DOC_GOOGLE_NATIVE_ERROR,
  isQualityCompanyDocId,
  mergeQualityCompanyDocFiles,
  publicQualityCompanyDocFile,
  qualityCompanyDocBriefId,
  qualityCompanyDocDropsFor,
  qualityCompanyDocFileName,
  qualityCompanyDocGoogleNativeType,
  qualityCompanyDocHome,
  qualityCompanyDocLabel,
  qualityCompanyDocPreviewType,
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
  const folderId = typeof input.folderId === "string" ? input.folderId : "";
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
    await persistQualityVaultFiles(leadBriefAdapter("quality"), {
      companyId: home,
      folderId,
      jobId,
      companyDocs: true,
      who,
    }, check.accepted as LeadFile[]);
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
      stored: true as const,
      store: "drive" as const,
    };
  } catch (error) {
    const status = error instanceof DriveApiError ? error.status : 0;
    console.warn(`quality-vault: company-doc write failed; ${status || "err"}`);
    return {
      ok: false as const,
      status: 503,
      error: qualityVaultWriteUserError(error, hasBuildDesk(user)),
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
  const [briefs, vault] = await Promise.all([
    listStoredBriefs("quality", undefined, { jobId, folderId: docId, companyId: home }),
    listQualityVaultFiles(leadBriefAdapter("quality"), {
      companyId: home,
      folderId: docId,
      jobId,
      companyDocs: true,
    }),
  ]);
  const mine = qualityCompanyDocDropsFor(briefs, home, docId);
  const briefFiles = mine.flatMap((row) => (row.files ?? []).filter((file) => file.name));
  const files = vault.stored
    ? mergeCompanyDocListedFiles(vault.files, briefFiles)
    : [];
  return {
    briefs: briefs.map(publicBrief),
    files,
    store: vault.store === "drive" ? "drive" as const : "server-json-file" as const,
    stored: vault.stored,
  };
}

function mergeCompanyDocListedFiles(
  vault: Array<{ name: string; type?: string }>,
  extra: Array<{ name: string; type?: string }>,
) {
  const seen = new Set<string>();
  const files: Array<{ name: string; type: string }> = [];
  for (const file of [...vault, ...extra]) {
    const name = (file.name || "").trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    files.push({ name, type: qualityCompanyDocPreviewType(file) });
  }
  return files;
}

export async function listQualityCompanyDocDrops(_user: QualityDocUser, companyId?: string) {
  const home = qualityCompanyDocHome(companyId);
  const folders = qualityCompanyDocsListedFor(home);
  const jobId = qualityCompanyDocsJobId(home);
  const filesByFolder: Record<string, Array<{ name: string; type: string }>> = Object.fromEntries(
    folders.map((folder) => [folder.id, []]),
  );
  const [briefs, vault] = await Promise.all([
    listStoredBriefs("quality", undefined, { jobId, companyId: home }),
    listQualityCompanyDocVaultFolders(leadBriefAdapter("quality"), { companyId: home }),
  ]);
  for (const folder of folders) {
    const mine = qualityCompanyDocDropsFor(briefs, home, folder.id);
    const briefFiles = mine.flatMap((row) => (row.files ?? []).filter((file) => file.name));
    filesByFolder[folder.id] = vault.stored
      ? mergeCompanyDocListedFiles(vault.filesByFolder[folder.id] ?? [], briefFiles)
      : [];
  }
  return {
    folders,
    filesByFolder,
    companyId: home,
    store: vault.store === "drive" ? "drive" as const : "server-json-file" as const,
    stored: vault.stored,
  };
}

export async function readQualityCompanyDocFile(
  _user: QualityDocUser,
  docId: QualityCompanyDocId,
  fileName: string,
  companyId?: string,
) {
  const home = qualityCompanyDocHome(companyId);
  const wanted = qualityCompanyDocFileName(fileName);
  if (!wanted || !isQualityCompanyDocId(docId, home)) {
    return { file: null, store: "unconfigured" as const, stored: false as const };
  }
  const jobId = qualityCompanyDocsJobId(home);
  const vault = await readQualityVaultFile(
    leadBriefAdapter("quality"),
    { companyId: home, folderId: docId, jobId, companyDocs: true },
    wanted,
  );
  if (("error" in vault && vault.error) || qualityCompanyDocGoogleNativeType(vault.file?.type)) {
    return {
      file: null,
      store: vault.store,
      stored: vault.stored,
      error: ("error" in vault && vault.error) || QUALITY_COMPANY_DOC_GOOGLE_NATIVE_ERROR,
    };
  }
  const fromVault = publicQualityCompanyDocFile(vault.file);
  if (fromVault) {
    return { file: fromVault, store: vault.store, stored: vault.stored };
  }
  const briefs = await listStoredBriefs("quality", undefined, { jobId, folderId: docId, companyId: home });
  const mine = qualityCompanyDocDropsFor(briefs, home, docId);
  for (const brief of mine) {
    const match = (brief.files ?? []).find((file) => qualityCompanyDocFileName(file.name) === wanted);
    const fromBrief = publicQualityCompanyDocFile(
      match && "data" in match
        ? { name: match.name, type: match.type, data: typeof match.data === "string" ? match.data : "" }
        : null,
    );
    if (fromBrief) {
      return {
        file: fromBrief,
        store: vault.store === "drive" ? ("drive" as const) : ("server-json-file" as const),
        stored: vault.stored,
      };
    }
  }
  return { file: null, store: vault.store, stored: vault.stored };
}

export function qualityCompanyDocRowId(who: string, companyId: string, docId: QualityCompanyDocId) {
  return qualityCompanyDocBriefId(who, companyId, docId);
}

export { qualityDropLeaks };

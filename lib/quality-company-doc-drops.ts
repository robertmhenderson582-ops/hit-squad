import { hasBuildDesk } from "./desk-role.ts";
import { leadBriefAdapter, listStoredBriefs, publicBrief, removeFileFromStoredBriefs, saveStoredBrief } from "./lead-brief-store.ts";
import type { LeadFile, PublicLeadBrief } from "./lead-briefs.ts";
import { DriveApiError } from "./drive-estimates.ts";
import { hydratePositionStore } from "./org-positions-store.ts";
import { mergePositions } from "./org-positions.ts";
import {
  QUALITY_COMPANY_DOC_EDIT_ERROR,
  QUALITY_COMPANY_DOC_KEEP_ERROR,
  QUALITY_COMPANY_DOC_LOCK_ERROR,
  QUALITY_COMPANY_DOC_LOCKED_NOTE,
  canMutateQualityCompanyDoc,
  qualityCompanyDocAcl,
  qualityCompanyDocMutateError,
  type QualityCompanyDocAcl,
  type QualityCompanyDocActor,
} from "./quality-company-doc-acl.ts";
import {
  listQualityCompanyDocVaultFolders,
  listQualityVaultFiles,
  persistQualityVaultFiles,
  qualityVaultWriteUserError,
  readQualityVaultFile,
  trashQualityVaultFile,
  writeQualityCompanyDocLock,
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
import { isQualityLibraryLockName } from "./quality-vault-shared.ts";

export type QualityDocUser = QualityCompanyDocActor;

export {
  QUALITY_COMPANY_DOC_EDIT_ERROR,
  QUALITY_COMPANY_DOC_KEEP_ERROR,
  QUALITY_COMPANY_DOC_LOCK_ERROR,
  QUALITY_COMPANY_DOC_LOCKED_NOTE,
  canMutateQualityCompanyDoc,
  qualityCompanyDocAcl,
  type QualityCompanyDocAcl,
};

export async function resolveQualityCompanyDocAcl(user: QualityDocUser): Promise<QualityCompanyDocAcl> {
  try {
    const data = await hydratePositionStore();
    return qualityCompanyDocAcl(user, {
      holds: data.holds,
      catalog: mergePositions(data.positions, data.removedIds),
    });
  } catch {
    return qualityCompanyDocAcl(user);
  }
}

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
  const gate = await qualityCompanyDocWriteGate(user, folderId, home);
  if (gate) return gate;
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
    return { briefs: [] as PublicLeadBrief[], files: [] as Array<{ name: string; type: string; protected?: boolean }> };
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
    locked: Boolean(vault.locked),
    locksKnown: vault.locksKnown !== false && vault.stored,
    store: vault.store === "drive" ? "drive" as const : "server-json-file" as const,
    stored: vault.stored,
  };
}

function mergeCompanyDocListedFiles(
  vault: Array<{ name: string; type?: string; protected?: boolean }>,
  extra: Array<{ name: string; type?: string; protected?: boolean }>,
) {
  const seen = new Set<string>();
  const files: Array<{ name: string; type: string; protected?: boolean }> = [];
  for (const file of [...vault, ...extra]) {
    const name = (file.name || "").trim();
    if (!name || isQualityLibraryLockName(name)) continue;
    const listed = {
      name,
      type: qualityCompanyDocPreviewType(file),
      ...(file.protected ? { protected: true as const } : {}),
    };
    if (seen.has(name)) {
      const row = files.find((item) => item.name === name);
      if (row && !file.protected) delete row.protected;
      continue;
    }
    seen.add(name);
    files.push(listed);
  }
  return files;
}

export async function listQualityCompanyDocDrops(_user: QualityDocUser, companyId?: string) {
  const home = qualityCompanyDocHome(companyId);
  const folders = qualityCompanyDocsListedFor(home);
  const jobId = qualityCompanyDocsJobId(home);
  const filesByFolder: Record<string, Array<{ name: string; type: string; protected?: boolean }>> = Object.fromEntries(
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
    locksByFolder: vault.locksByFolder ?? Object.fromEntries(folders.map((folder) => [folder.id, !vault.stored])),
    locksKnown: vault.locksKnown !== false && vault.stored,
    companyId: home,
    store: vault.store === "drive" ? "drive" as const : "server-json-file" as const,
    stored: vault.stored,
  };
}

async function qualityCompanyDocWriteGate(user: QualityDocUser, folderId: QualityCompanyDocId, home: string) {
  const acl = await resolveQualityCompanyDocAcl(user);
  const listed = await listQualityVaultFiles(leadBriefAdapter("quality"), {
    companyId: home,
    folderId,
    jobId: qualityCompanyDocsJobId(home),
    companyDocs: true,
  });
  const locked = Boolean(listed.locked);
  const lockKnown = listed.locksKnown !== false && listed.stored;
  const error = qualityCompanyDocMutateError(acl, locked, lockKnown);
  if (error) {
    return { ok: false as const, status: 403, error, rejected: [] as Array<{ name: string; error: string }> };
  }
  return null;
}

export async function removeQualityCompanyDocFile(
  user: QualityDocUser,
  input: { companyId?: unknown; folderId?: unknown; fileName?: unknown },
) {
  const home = qualityCompanyDocHome(qualityDocCompanyId(input));
  const folderId = typeof input.folderId === "string" ? input.folderId : "";
  const fileName = qualityCompanyDocFileName(input.fileName);
  if (!isQualityCompanyDocId(folderId, home) || !fileName || isQualityLibraryLockName(fileName)) {
    return { ok: false as const, status: 400, error: "Pick a Quality file." };
  }
  const gate = await qualityCompanyDocWriteGate(user, folderId, home);
  if (gate) return { ok: false as const, status: gate.status, error: gate.error };
  const jobId = qualityCompanyDocsJobId(home);
  try {
    const trashed = await trashQualityVaultFile(
      leadBriefAdapter("quality"),
      { companyId: home, folderId, jobId, companyDocs: true },
      fileName,
    );
    await removeFileFromStoredBriefs("quality", fileName, { jobId, folderId, companyId: home });
    const listed = await listQualityCompanyDocDrop(user, folderId, home);
    const leftover = listed.files.filter((file) => file.name === fileName);
    if (leftover.some((file) => !file.protected)) {
      return { ok: false as const, status: 503, error: qualityVaultWriteUserError(new Error("leftover"), hasBuildDesk(user)) };
    }
    if (leftover.length && !trashed.trashed) {
      return { ok: false as const, status: 400, error: QUALITY_COMPANY_DOC_KEEP_ERROR };
    }
    return {
      ok: true as const,
      files: listed.files,
      stored: listed.stored,
      store: listed.store,
    };
  } catch (error) {
    const status = error instanceof DriveApiError ? error.status : 0;
    console.warn(`quality-vault: company-doc delete failed; ${status || "err"}`);
    return {
      ok: false as const,
      status: 503,
      error: qualityVaultWriteUserError(error, hasBuildDesk(user)),
    };
  }
}

export async function lockQualityCompanyDoc(
  user: QualityDocUser,
  input: { companyId?: unknown; folderId?: unknown; locked?: unknown },
) {
  const home = qualityCompanyDocHome(qualityDocCompanyId(input));
  const folderId = typeof input.folderId === "string" ? input.folderId : "";
  if (!isQualityCompanyDocId(folderId, home)) {
    return { ok: false as const, status: 400, error: "Pick a Quality file." };
  }
  const acl = await resolveQualityCompanyDocAcl(user);
  if (!acl.canLock) {
    return { ok: false as const, status: 403, error: QUALITY_COMPANY_DOC_LOCK_ERROR };
  }
  try {
    const written = await writeQualityCompanyDocLock(
      leadBriefAdapter("quality"),
      { companyId: home, folderId, jobId: qualityCompanyDocsJobId(home), companyDocs: true },
      input.locked === true,
      user.email,
    );
    return { ok: true as const, locked: written.locked, stored: written.stored, store: written.store };
  } catch (error) {
    const status = error instanceof DriveApiError ? error.status : 0;
    console.warn(`quality-vault: company-doc lock failed; ${status || "err"}`);
    return {
      ok: false as const,
      status: 503,
      error: qualityVaultWriteUserError(error, hasBuildDesk(user)),
    };
  }
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

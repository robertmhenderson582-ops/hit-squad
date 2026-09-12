import { hasBuildDesk } from "./desk-role.ts";
import { leadBriefAdapter, listStoredBriefs, publicBrief, removeFileFromStoredBriefs, saveStoredBrief } from "./lead-brief-store.ts";
import type { LeadFile, PublicLeadBrief } from "./lead-briefs.ts";
import { DriveApiError } from "./drive-estimates.ts";
import { hydratePositionStore } from "./org-positions-store.ts";
import { mergePositions } from "./org-positions.ts";
import {
  HSE_COMPANY_DOC_EDIT_ERROR,
  HSE_COMPANY_DOC_KEEP_ERROR,
  HSE_COMPANY_DOC_LOCK_ERROR,
  HSE_COMPANY_DOC_LOCKED_NOTE,
  canMutateHseCompanyDoc,
  hseCompanyDocAcl,
  hseCompanyDocMutateError,
  type HseCompanyDocAcl,
  type HseCompanyDocActor,
} from "./hse-company-doc-acl.ts";
import {
  listHseCompanyDocVaultFolders,
  listHseVaultFiles,
  persistHseVaultFiles,
  hseVaultWriteUserError,
  readHseVaultFile,
  trashHseVaultFile,
  writeHseCompanyDocLock,
} from "./hse-vault.ts";
import {
  HSE_COMPANY_DOC_GOOGLE_NATIVE_ERROR,
  isHseCompanyDocId,
  mergeHseCompanyDocFiles,
  publicHseCompanyDocFile,
  hseCompanyDocBriefId,
  hseCompanyDocDropsFor,
  hseCompanyDocFileName,
  hseCompanyDocGoogleNativeType,
  hseCompanyDocHome,
  hseCompanyDocLabel,
  hseCompanyDocPreviewType,
  hseCompanyDocsJobId,
  hseCompanyDocsListedFor,
  type HseCompanyDocId,
} from "./hse-company-docs.ts";
import { parseHseDropFiles, hseDropLeaks } from "./hse-folder-drops.ts";
import { checkHseDrop } from "./hse-folders.ts";
import { isHseLibraryLockName } from "./hse-vault-shared.ts";

export type HseDocUser = HseCompanyDocActor;

export {
  HSE_COMPANY_DOC_EDIT_ERROR,
  HSE_COMPANY_DOC_KEEP_ERROR,
  HSE_COMPANY_DOC_LOCK_ERROR,
  HSE_COMPANY_DOC_LOCKED_NOTE,
  canMutateHseCompanyDoc,
  hseCompanyDocAcl,
  type HseCompanyDocAcl,
};

export async function resolveHseCompanyDocAcl(user: HseDocUser): Promise<HseCompanyDocAcl> {
  try {
    const data = await hydratePositionStore();
    return hseCompanyDocAcl(user, {
      holds: data.holds,
      catalog: mergePositions(data.positions, data.removedIds),
    });
  } catch {
    return hseCompanyDocAcl(user);
  }
}

export type HseCompanyDocSaveInput = {
  companyId?: unknown;
  folderId?: unknown;
  files?: unknown;
};

function hseDocCompanyId(input: { companyId?: unknown }) {
  return typeof input.companyId === "string" && input.companyId.trim() ? input.companyId.trim() : undefined;
}

export async function saveHseCompanyDocDrop(user: HseDocUser, input: HseCompanyDocSaveInput) {
  const home = hseCompanyDocHome(hseDocCompanyId(input));
  const folderId = typeof input.folderId === "string" ? input.folderId : "";
  if (!isHseCompanyDocId(folderId, home)) {
    return { ok: false as const, status: 400, error: "Pick a HSE file." };
  }
  const gate = await hseCompanyDocWriteGate(user, folderId, home);
  if (gate) return gate;
  const incoming = parseHseDropFiles(input.files);
  const check = checkHseDrop(incoming);
  if (!check.accepted.length) {
    return {
      ok: false as const,
      status: 400,
      error: check.rejected[0]?.error || "Drop at least one file.",
      rejected: check.rejected,
    };
  }
  const jobId = hseCompanyDocsJobId(home);
  const who = user.email.trim().toLowerCase();
  const existing = await listStoredBriefs("hse", who, { jobId, folderId, companyId: home });
  const prior = existing[0];
  const merged = mergeHseCompanyDocFiles(prior?.files ?? [], check.accepted as LeadFile[]);
  try {
    await persistHseVaultFiles(leadBriefAdapter("hse"), {
      companyId: home,
      folderId,
      jobId,
      companyDocs: true,
      who,
    }, check.accepted as LeadFile[]);
    const brief = await saveStoredBrief({
      kind: "hse",
      who,
      whoName: user.name,
      describe: hseCompanyDocLabel(folderId, home),
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
    console.warn(`hse-vault: company-doc write failed; ${status || "err"}`);
    return {
      ok: false as const,
      status: 503,
      error: hseVaultWriteUserError(error, hasBuildDesk(user)),
      rejected: check.rejected,
    };
  }
}

export async function listHseCompanyDocDrop(
  user: HseDocUser,
  docId: HseCompanyDocId,
  companyId?: string,
) {
  const home = hseCompanyDocHome(companyId);
  if (!isHseCompanyDocId(docId, home)) {
    return { briefs: [] as PublicLeadBrief[], files: [] as Array<{ name: string; type: string; protected?: boolean }> };
  }
  const jobId = hseCompanyDocsJobId(home);
  const [briefs, vault] = await Promise.all([
    listStoredBriefs("hse", undefined, { jobId, folderId: docId, companyId: home }),
    listHseVaultFiles(leadBriefAdapter("hse"), {
      companyId: home,
      folderId: docId,
      jobId,
      companyDocs: true,
    }),
  ]);
  const mine = hseCompanyDocDropsFor(briefs, home, docId);
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
    if (!name || isHseLibraryLockName(name)) continue;
    const listed = {
      name,
      type: hseCompanyDocPreviewType(file),
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

export async function listHseCompanyDocDrops(_user: HseDocUser, companyId?: string) {
  const home = hseCompanyDocHome(companyId);
  const folders = hseCompanyDocsListedFor(home);
  const jobId = hseCompanyDocsJobId(home);
  const filesByFolder: Record<string, Array<{ name: string; type: string; protected?: boolean }>> = Object.fromEntries(
    folders.map((folder) => [folder.id, []]),
  );
  const [briefs, vault] = await Promise.all([
    listStoredBriefs("hse", undefined, { jobId, companyId: home }),
    listHseCompanyDocVaultFolders(leadBriefAdapter("hse"), { companyId: home }),
  ]);
  for (const folder of folders) {
    const mine = hseCompanyDocDropsFor(briefs, home, folder.id);
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

async function hseCompanyDocWriteGate(user: HseDocUser, folderId: HseCompanyDocId, home: string) {
  const acl = await resolveHseCompanyDocAcl(user);
  const listed = await listHseVaultFiles(leadBriefAdapter("hse"), {
    companyId: home,
    folderId,
    jobId: hseCompanyDocsJobId(home),
    companyDocs: true,
  });
  const locked = Boolean(listed.locked);
  const lockKnown = listed.locksKnown !== false && listed.stored;
  const error = hseCompanyDocMutateError(acl, locked, lockKnown);
  if (error) {
    return { ok: false as const, status: 403, error, rejected: [] as Array<{ name: string; error: string }> };
  }
  return null;
}

export async function removeHseCompanyDocFile(
  user: HseDocUser,
  input: { companyId?: unknown; folderId?: unknown; fileName?: unknown },
) {
  const home = hseCompanyDocHome(hseDocCompanyId(input));
  const folderId = typeof input.folderId === "string" ? input.folderId : "";
  const fileName = hseCompanyDocFileName(input.fileName);
  if (!isHseCompanyDocId(folderId, home) || !fileName || isHseLibraryLockName(fileName)) {
    return { ok: false as const, status: 400, error: "Pick a HSE file." };
  }
  const gate = await hseCompanyDocWriteGate(user, folderId, home);
  if (gate) return { ok: false as const, status: gate.status, error: gate.error };
  const jobId = hseCompanyDocsJobId(home);
  try {
    const trashed = await trashHseVaultFile(
      leadBriefAdapter("hse"),
      { companyId: home, folderId, jobId, companyDocs: true },
      fileName,
    );
    await removeFileFromStoredBriefs("hse", fileName, { jobId, folderId, companyId: home });
    const listed = await listHseCompanyDocDrop(user, folderId, home);
    const leftover = listed.files.filter((file) => file.name === fileName);
    if (leftover.some((file) => !file.protected)) {
      return { ok: false as const, status: 503, error: hseVaultWriteUserError(new Error("leftover"), hasBuildDesk(user)) };
    }
    if (leftover.length && !trashed.trashed) {
      return { ok: false as const, status: 400, error: HSE_COMPANY_DOC_KEEP_ERROR };
    }
    return {
      ok: true as const,
      files: listed.files,
      stored: listed.stored,
      store: listed.store,
    };
  } catch (error) {
    const status = error instanceof DriveApiError ? error.status : 0;
    console.warn(`hse-vault: company-doc delete failed; ${status || "err"}`);
    return {
      ok: false as const,
      status: 503,
      error: hseVaultWriteUserError(error, hasBuildDesk(user)),
    };
  }
}

export async function lockHseCompanyDoc(
  user: HseDocUser,
  input: { companyId?: unknown; folderId?: unknown; locked?: unknown },
) {
  const home = hseCompanyDocHome(hseDocCompanyId(input));
  const folderId = typeof input.folderId === "string" ? input.folderId : "";
  if (!isHseCompanyDocId(folderId, home)) {
    return { ok: false as const, status: 400, error: "Pick a HSE file." };
  }
  const acl = await resolveHseCompanyDocAcl(user);
  if (!acl.canLock) {
    return { ok: false as const, status: 403, error: HSE_COMPANY_DOC_LOCK_ERROR };
  }
  try {
    const written = await writeHseCompanyDocLock(
      leadBriefAdapter("hse"),
      { companyId: home, folderId, jobId: hseCompanyDocsJobId(home), companyDocs: true },
      input.locked === true,
      user.email,
    );
    return { ok: true as const, locked: written.locked, stored: written.stored, store: written.store };
  } catch (error) {
    const status = error instanceof DriveApiError ? error.status : 0;
    console.warn(`hse-vault: company-doc lock failed; ${status || "err"}`);
    return {
      ok: false as const,
      status: 503,
      error: hseVaultWriteUserError(error, hasBuildDesk(user)),
    };
  }
}

export async function readHseCompanyDocFile(
  _user: HseDocUser,
  docId: HseCompanyDocId,
  fileName: string,
  companyId?: string,
) {
  const home = hseCompanyDocHome(companyId);
  const wanted = hseCompanyDocFileName(fileName);
  if (!wanted || !isHseCompanyDocId(docId, home)) {
    return { file: null, store: "unconfigured" as const, stored: false as const };
  }
  const jobId = hseCompanyDocsJobId(home);
  const vault = await readHseVaultFile(
    leadBriefAdapter("hse"),
    { companyId: home, folderId: docId, jobId, companyDocs: true },
    wanted,
  );
  if (("error" in vault && vault.error) || hseCompanyDocGoogleNativeType(vault.file?.type)) {
    return {
      file: null,
      store: vault.store,
      stored: vault.stored,
      error: ("error" in vault && vault.error) || HSE_COMPANY_DOC_GOOGLE_NATIVE_ERROR,
    };
  }
  const fromVault = publicHseCompanyDocFile(vault.file);
  if (fromVault) {
    return { file: fromVault, store: vault.store, stored: vault.stored };
  }
  const briefs = await listStoredBriefs("hse", undefined, { jobId, folderId: docId, companyId: home });
  const mine = hseCompanyDocDropsFor(briefs, home, docId);
  for (const brief of mine) {
    const match = (brief.files ?? []).find((file) => hseCompanyDocFileName(file.name) === wanted);
    const fromBrief = publicHseCompanyDocFile(
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

export function hseCompanyDocRowId(who: string, companyId: string, docId: HseCompanyDocId) {
  return hseCompanyDocBriefId(who, companyId, docId);
}

export { hseDropLeaks };

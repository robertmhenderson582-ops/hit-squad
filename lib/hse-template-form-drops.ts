import { hasBuildDesk } from "./desk-role.ts";
import { DriveApiError } from "./drive-estimates.ts";
import {
  leadBriefAdapter,
  listStoredBriefs,
  removeFileFromStoredBriefs,
} from "./lead-brief-store.ts";
import type { LeadFile } from "./lead-briefs.ts";
import { isHseCompanyDocsJobId } from "./hse-company-docs.ts";
import { resolveHseCompanyDocAcl, type HseDocUser } from "./hse-company-doc-drops.ts";
import {
  parseHseDropFiles,
  saveHseFolderDrop,
  type HseDropUser,
} from "./hse-folder-drops.ts";
import { isHseFolderId, type HseFolderId } from "./hse-folders.ts";
import {
  listHsePackageShelf,
  resolveHsePackageShelfAcl,
  saveHsePackageShelfKit,
} from "./hse-package-shelf-drops.ts";
import {
  isHseReadyShelfJobId,
  newHsePackageId,
  parseHsePackageName,
  hseReadyShelfJobId,
} from "./hse-package-shelf.ts";
import {
  HSE_TEMPLATE_FILL_DEST_ERROR,
  HSE_TEMPLATE_FILL_EMPTY_ERROR,
  HSE_TEMPLATE_FILL_JOB_ERROR,
  HSE_TEMPLATE_FILL_PREPACKAGE_ERROR,
  HSE_TEMPLATE_FILL_TEMPLATE_ERROR,
  HSE_TEMPLATE_FILL_VIEW_ERROR,
  isHseFilledCopyName,
  hseFilledCopyCollidesWithTemplate,
  hseTemplateCanSave,
  hseTemplateFillAcl,
  hseTemplateFormFromLead,
  hseTemplateFormHasWork,
  type HseTemplateFillDest,
  type HseTemplateSourceKind,
} from "./hse-template-form.ts";
import {
  hseTemplateFillHomeFolder,
  hseTemplateFillReadFolders,
  hseTemplateFillRippleFolders,
  hseTemplateFillRipplePlan,
} from "./hse-template-form-ripple.ts";
import {
  readHseVaultFile,
  trashHseVaultFile,
  trashHseVaultNamedCopies,
  hseVaultWriteUserError,
} from "./hse-vault.ts";

export type HseTemplateFillUser = HseDropUser & HseDocUser;

export type HseTemplateFillSaveInput = {
  dest?: unknown;
  jobId?: unknown;
  folderId?: unknown;
  packageId?: unknown;
  packageName?: unknown;
  name?: unknown;
  companyId?: unknown;
  companyLabel?: unknown;
  siteLabel?: unknown;
  jobLabel?: unknown;
  source?: unknown;
  sourceFolder?: unknown;
  sourceName?: unknown;
  fileName?: unknown;
  file?: unknown;
  files?: unknown;
  replace?: unknown;
};

function destOf(value: unknown): HseTemplateFillDest | "" {
  if (value === "job" || value === "prepackage") return value;
  return "";
}

function sourceOf(value: unknown): HseTemplateSourceKind | "" {
  if (value === "company-docs" || value === "catalog") return value;
  return "";
}

async function resolveFillAcl(user: HseTemplateFillUser) {
  const [companyAcl, shelfAcl] = await Promise.all([
    resolveHseCompanyDocAcl(user),
    resolveHsePackageShelfAcl(user),
  ]);
  return hseTemplateFillAcl(companyAcl, shelfAcl);
}

function incomingFillFile(input: HseTemplateFillSaveInput): LeadFile | null {
  const files = parseHseDropFiles(
    Array.isArray(input.files) ? input.files : input.file ? [input.file] : [],
  );
  return files[0] ?? null;
}

export async function saveHseTemplateFill(user: HseTemplateFillUser, input: HseTemplateFillSaveInput) {
  const dest = destOf(input.dest);
  if (!dest) {
    return { ok: false as const, status: 400, error: HSE_TEMPLATE_FILL_DEST_ERROR };
  }
  const acl = await resolveFillAcl(user);
  if (!hseTemplateCanSave(acl, dest)) {
    return { ok: false as const, status: 403, error: HSE_TEMPLATE_FILL_VIEW_ERROR };
  }
  const incoming = incomingFillFile(input);
  if (!incoming) {
    return { ok: false as const, status: 400, error: HSE_TEMPLATE_FILL_EMPTY_ERROR };
  }
  const sourceName = typeof input.sourceName === "string" ? input.sourceName : "";
  if (hseFilledCopyCollidesWithTemplate(incoming.name, sourceName) || !isHseFilledCopyName(incoming.name)) {
    return { ok: false as const, status: 400, error: HSE_TEMPLATE_FILL_TEMPLATE_ERROR };
  }
  const parsed = hseTemplateFormFromLead(incoming);
  if (!parsed) {
    return { ok: false as const, status: 400, error: HSE_TEMPLATE_FILL_TEMPLATE_ERROR };
  }
  if (!hseTemplateFormHasWork({ fields: parsed.fields, rows: parsed.rows })) {
    return { ok: false as const, status: 400, error: HSE_TEMPLATE_FILL_EMPTY_ERROR };
  }
  const folderId = hseTemplateFillHomeFolder(dest, parsed.folderId, isHseFolderId(input.folderId) ? input.folderId : null);
  if (!isHseFolderId(folderId)) {
    return { ok: false as const, status: 400, error: "Pick a HSE folder." };
  }
  const companyId = typeof input.companyId === "string" ? input.companyId : undefined;
  const companyLabel = typeof input.companyLabel === "string" ? input.companyLabel : undefined;
  const ripple = hseTemplateFillRipplePlan(dest, folderId);

  if (dest === "job") {
    const jobId = typeof input.jobId === "string" ? input.jobId.trim() : "";
    if (!jobId || isHseCompanyDocsJobId(jobId) || isHseReadyShelfJobId(jobId)) {
      return { ok: false as const, status: 400, error: HSE_TEMPLATE_FILL_JOB_ERROR };
    }
    const folders = hseTemplateFillRippleFolders(dest, folderId);
    const written: typeof folders = [];
    let saved: Awaited<ReturnType<typeof saveHseFolderDrop>> | null = null;
    for (const rippleFolder of folders) {
      saved = await saveHseFolderDrop(user, {
        jobId,
        folderId: rippleFolder,
        files: [incoming],
        companyId,
        companyLabel,
        siteLabel: typeof input.siteLabel === "string" ? input.siteLabel : undefined,
        jobLabel: typeof input.jobLabel === "string" ? input.jobLabel : undefined,
      });
      if (!saved.ok) {
        await rollbackHseTemplateFillWrites({
          user,
          dest,
          jobId,
          companyId,
          companyLabel,
          siteLabel: typeof input.siteLabel === "string" ? input.siteLabel : undefined,
          jobLabel: typeof input.jobLabel === "string" ? input.jobLabel : undefined,
          folders: written,
          fileName: incoming.name,
        });
        return saved;
      }
      written.push(rippleFolder);
    }
    if (!saved || !saved.ok) {
      return { ok: false as const, status: 400, error: HSE_TEMPLATE_FILL_JOB_ERROR };
    }
    return {
      ...saved,
      dest: "job" as const,
      fileName: incoming.name,
      folderId,
      jobId,
      ripple,
    };
  }

  const existingId = typeof input.packageId === "string" ? input.packageId.trim() : "";
  const named = parseHsePackageName(
    typeof input.packageName === "string"
      ? input.packageName
      : typeof input.name === "string"
        ? input.name
        : "",
  );
  if (!existingId && "error" in named) {
    return { ok: false as const, status: 400, error: named.error || HSE_TEMPLATE_FILL_PREPACKAGE_ERROR };
  }
  const packageId = existingId || newHsePackageId("label" in named ? named.label : "kit");
  const saved = await saveHsePackageShelfKit(user, {
    packageId,
    name: "label" in named ? named.label : existingId,
    files: [incoming],
    companyId,
    companyLabel,
  });
  if (!saved.ok) return saved;
  return {
    ...saved,
    dest: "prepackage" as const,
    fileName: incoming.name,
    folderId: "packages" as HseFolderId,
    packageId,
    jobId: hseReadyShelfJobId(packageId),
    ripple,
  };
}

export async function readHseTemplateFill(
  user: HseTemplateFillUser,
  input: {
    dest?: unknown;
    jobId?: unknown;
    folderId?: unknown;
    packageId?: unknown;
    fileName?: unknown;
    companyId?: unknown;
    companyLabel?: unknown;
    siteLabel?: unknown;
    jobLabel?: unknown;
  },
) {
  const dest = destOf(input.dest) || (isHseReadyShelfJobId(typeof input.jobId === "string" ? input.jobId : "")
    ? "prepackage"
    : "job");
  const fileName = typeof input.fileName === "string" ? input.fileName.trim() : "";
  if (!fileName) {
    return { ok: false as const, status: 400, error: "Pick a filled copy." };
  }
  if (!isHseFilledCopyName(fileName)) {
    return { ok: false as const, status: 400, error: HSE_TEMPLATE_FILL_TEMPLATE_ERROR };
  }
  const companyId = typeof input.companyId === "string" && input.companyId.trim() ? input.companyId.trim() : undefined;
  const requestedFolder = dest === "prepackage"
    ? "packages"
    : isHseFolderId(input.folderId)
      ? input.folderId
      : "";
  const packageId = typeof input.packageId === "string" ? input.packageId.trim() : "";
  const jobId =
    dest === "prepackage"
      ? hseReadyShelfJobId(packageId || (typeof input.jobId === "string" ? input.jobId : ""))
      : typeof input.jobId === "string"
        ? input.jobId.trim()
        : "";
  if (!jobId || isHseCompanyDocsJobId(jobId) || !requestedFolder) {
    return { ok: false as const, status: 400, error: dest === "prepackage" ? HSE_TEMPLATE_FILL_PREPACKAGE_ERROR : HSE_TEMPLATE_FILL_JOB_ERROR };
  }
  const who = hasBuildDesk(user) ? undefined : user.email;
  const readFolders = hseTemplateFillReadFolders(dest, requestedFolder);
  const place = {
    companyId,
    companyLabel: typeof input.companyLabel === "string" ? input.companyLabel : undefined,
    siteLabel: typeof input.siteLabel === "string" ? input.siteLabel : undefined,
    jobId,
    jobLabel: typeof input.jobLabel === "string" ? input.jobLabel : undefined,
    shelf: dest === "prepackage",
    packageLabel: typeof input.jobLabel === "string" ? input.jobLabel : undefined,
    who,
  };
  for (const folderId of readFolders) {
    const vault = await readHseVaultFile(leadBriefAdapter("hse"), { ...place, folderId }, fileName, user);
    if (!vault.file?.data) continue;
    const parsed = hseTemplateFormFromLead(vault.file);
    if (!parsed) return { ok: false as const, status: 400, error: HSE_TEMPLATE_FILL_TEMPLATE_ERROR };
    return {
      ok: true as const,
      file: vault.file,
      form: parsed,
      dest,
      jobId,
      folderId: parsed.folderId || folderId,
      store: vault.store,
      stored: vault.stored,
    };
  }
  const briefs = await listStoredBriefs("hse", who, dest === "job" ? { jobId, companyId } : { jobId, folderId: "packages", companyId });
  const ranked = briefs
    .flatMap((row) => (row.files ?? []).map((file) => ({ file, folderId: row.folderId || requestedFolder })))
    .filter((row) => row.file.name === fileName && row.file.data)
    .sort((left, right) => {
      if (left.folderId === requestedFolder && right.folderId !== requestedFolder) return -1;
      if (right.folderId === requestedFolder && left.folderId !== requestedFolder) return 1;
      return 0;
    });
  const fromBrief = ranked[0];
  if (fromBrief?.file.data) {
    const parsed = hseTemplateFormFromLead(fromBrief.file);
    if (!parsed) return { ok: false as const, status: 400, error: HSE_TEMPLATE_FILL_TEMPLATE_ERROR };
    return {
      ok: true as const,
      file: fromBrief.file,
      form: parsed,
      dest,
      jobId,
      folderId: parsed.folderId || fromBrief.folderId,
      store: "drive" as const,
      stored: true as const,
    };
  }
  return { ok: false as const, status: 404, error: "Filled copy not found." };
}

async function rollbackHseTemplateFillWrites(input: {
  user: HseTemplateFillUser;
  dest: HseTemplateFillDest;
  jobId: string;
  companyId?: string;
  companyLabel?: string;
  siteLabel?: string;
  jobLabel?: string;
  folders: HseFolderId[];
  fileName: string;
}) {
  for (const folderId of input.folders) {
    try {
      await trashHseVaultFile(
        leadBriefAdapter("hse"),
        {
          companyId: input.companyId,
          companyLabel: input.companyLabel,
          siteLabel: input.siteLabel,
          jobId: input.jobId,
          jobLabel: input.jobLabel,
          folderId,
          shelf: input.dest === "prepackage",
          who: input.user.email.trim().toLowerCase(),
        },
        input.fileName,
      );
      await removeFileFromStoredBriefs("hse", input.fileName, {
        jobId: input.jobId,
        folderId,
        companyId: input.companyId,
      });
    } catch {
      // Keep rolling back the rest so a partial ripple does not stay listed.
    }
  }
  try {
    await trashHseVaultNamedCopies(leadBriefAdapter("hse"), input.fileName, input.companyId);
  } catch {
    // Named-copy sweep is best-effort after a failed second write.
  }
}

export async function removeHseTemplateFill(user: HseTemplateFillUser, input: HseTemplateFillSaveInput) {
  const dest = destOf(input.dest) || "job";
  const acl = await resolveFillAcl(user);
  if (!hseTemplateCanSave(acl, dest)) {
    return { ok: false as const, status: 403, error: HSE_TEMPLATE_FILL_VIEW_ERROR };
  }
  const fileName = typeof input.fileName === "string" ? input.fileName.trim() : "";
  if (!isHseFilledCopyName(fileName)) {
    return { ok: false as const, status: 400, error: HSE_TEMPLATE_FILL_TEMPLATE_ERROR };
  }
  const companyId = typeof input.companyId === "string" ? input.companyId : undefined;
  const requestedFolder = isHseFolderId(input.folderId)
    ? input.folderId
    : dest === "prepackage"
      ? "packages"
      : "";
  const packageId = typeof input.packageId === "string" ? input.packageId.trim() : "";
  const jobId =
    dest === "prepackage"
      ? hseReadyShelfJobId(packageId || (typeof input.jobId === "string" ? input.jobId : ""))
      : typeof input.jobId === "string"
        ? input.jobId.trim()
        : "";
  if (!jobId || isHseCompanyDocsJobId(jobId) || !requestedFolder) {
    return { ok: false as const, status: 400, error: HSE_TEMPLATE_FILL_DEST_ERROR };
  }
  const peek = await readHseTemplateFill(user, {
    dest,
    jobId,
    folderId: requestedFolder,
    packageId,
    fileName,
    companyId,
    companyLabel: input.companyLabel,
    siteLabel: input.siteLabel,
    jobLabel: input.jobLabel,
  });
  const folderId = peek.ok
    ? hseTemplateFillHomeFolder(dest, peek.form.folderId, requestedFolder)
    : requestedFolder;
  const ripple = hseTemplateFillRipplePlan(dest, folderId);
  const folders = dest === "job" ? hseTemplateFillRippleFolders(dest, folderId) : [requestedFolder];
  try {
    for (const rippleFolder of folders) {
      await trashHseVaultFile(
        leadBriefAdapter("hse"),
        {
          companyId,
          companyLabel: typeof input.companyLabel === "string" ? input.companyLabel : undefined,
          siteLabel: typeof input.siteLabel === "string" ? input.siteLabel : undefined,
          jobId,
          jobLabel: typeof input.jobLabel === "string" ? input.jobLabel : undefined,
          folderId: rippleFolder,
          shelf: dest === "prepackage",
          who: user.email.trim().toLowerCase(),
        },
        fileName,
      );
      await removeFileFromStoredBriefs("hse", fileName, { jobId, folderId: rippleFolder, companyId });
    }
    await trashHseVaultNamedCopies(leadBriefAdapter("hse"), fileName, companyId);
    return {
      ok: true as const,
      fileName,
      dest,
      jobId,
      folderId,
      stored: true as const,
      store: "drive" as const,
      ripple,
    };
  } catch (error) {
    return {
      ok: false as const,
      status: 503,
      error: hseVaultWriteUserError(error, hasBuildDesk(user)),
    };
  }
}

export async function listHseTemplateFillDestinations(user: HseTemplateFillUser, companyId?: string) {
  const acl = await resolveFillAcl(user);
  const shelf = acl.canSavePrepackage || acl.canSaveJob
    ? await listHsePackageShelf(user, companyId)
    : { kits: [], acl: { canBuild: false, canAttach: false, seat: "viewer" as const }, store: "drive" as const, stored: true };
  return { acl, kits: shelf.kits };
}

export { DriveApiError };

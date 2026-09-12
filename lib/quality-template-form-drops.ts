import { hasBuildDesk } from "./desk-role.ts";
import { DriveApiError } from "./drive-estimates.ts";
import {
  leadBriefAdapter,
  listStoredBriefs,
  removeFileFromStoredBriefs,
} from "./lead-brief-store.ts";
import type { LeadFile } from "./lead-briefs.ts";
import { isQualityCompanyDocsJobId } from "./quality-company-docs.ts";
import { resolveQualityCompanyDocAcl, type QualityDocUser } from "./quality-company-doc-drops.ts";
import {
  parseQualityDropFiles,
  saveQualityFolderDrop,
  type QualityDropUser,
} from "./quality-folder-drops.ts";
import { isQualityFolderId, type QualityFolderId } from "./quality-folders.ts";
import {
  listQualityPackageShelf,
  resolveQualityPackageShelfAcl,
  saveQualityPackageShelfKit,
} from "./quality-package-shelf-drops.ts";
import {
  isQualityReadyShelfJobId,
  newQualityPackageId,
  parseQualityPackageName,
  qualityReadyShelfJobId,
} from "./quality-package-shelf.ts";
import {
  QUALITY_TEMPLATE_FILL_DEST_ERROR,
  QUALITY_TEMPLATE_FILL_JOB_ERROR,
  QUALITY_TEMPLATE_FILL_PREPACKAGE_ERROR,
  QUALITY_TEMPLATE_FILL_TEMPLATE_ERROR,
  QUALITY_TEMPLATE_FILL_VIEW_ERROR,
  isQualityFilledCopyName,
  qualityFilledCopyCollidesWithTemplate,
  qualityTemplateCanSave,
  qualityTemplateFillAcl,
  qualityTemplateFormFromLead,
  type QualityTemplateFillDest,
  type QualityTemplateSourceKind,
} from "./quality-template-form.ts";
import {
  qualityTemplateFillHomeFolder,
  qualityTemplateFillRippleFolders,
  qualityTemplateFillRipplePlan,
} from "./quality-template-form-ripple.ts";
import {
  readQualityVaultFile,
  trashQualityVaultFile,
  trashQualityVaultNamedCopies,
  qualityVaultWriteUserError,
} from "./quality-vault.ts";

export type QualityTemplateFillUser = QualityDropUser & QualityDocUser;

export type QualityTemplateFillSaveInput = {
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

function destOf(value: unknown): QualityTemplateFillDest | "" {
  if (value === "job" || value === "prepackage") return value;
  return "";
}

function sourceOf(value: unknown): QualityTemplateSourceKind | "" {
  if (value === "company-docs" || value === "catalog") return value;
  return "";
}

async function resolveFillAcl(user: QualityTemplateFillUser) {
  const [companyAcl, shelfAcl] = await Promise.all([
    resolveQualityCompanyDocAcl(user),
    resolveQualityPackageShelfAcl(user),
  ]);
  return qualityTemplateFillAcl(companyAcl, shelfAcl);
}

function incomingFillFile(input: QualityTemplateFillSaveInput): LeadFile | null {
  const files = parseQualityDropFiles(
    Array.isArray(input.files) ? input.files : input.file ? [input.file] : [],
  );
  return files[0] ?? null;
}

export async function saveQualityTemplateFill(user: QualityTemplateFillUser, input: QualityTemplateFillSaveInput) {
  const dest = destOf(input.dest);
  if (!dest) {
    return { ok: false as const, status: 400, error: QUALITY_TEMPLATE_FILL_DEST_ERROR };
  }
  const acl = await resolveFillAcl(user);
  if (!qualityTemplateCanSave(acl, dest)) {
    return { ok: false as const, status: 403, error: QUALITY_TEMPLATE_FILL_VIEW_ERROR };
  }
  const incoming = incomingFillFile(input);
  if (!incoming) {
    return { ok: false as const, status: 400, error: "Fill the form before saving a copy." };
  }
  const sourceName = typeof input.sourceName === "string" ? input.sourceName : "";
  if (qualityFilledCopyCollidesWithTemplate(incoming.name, sourceName) || !isQualityFilledCopyName(incoming.name)) {
    return { ok: false as const, status: 400, error: QUALITY_TEMPLATE_FILL_TEMPLATE_ERROR };
  }
  const parsed = qualityTemplateFormFromLead(incoming);
  if (!parsed) {
    return { ok: false as const, status: 400, error: QUALITY_TEMPLATE_FILL_TEMPLATE_ERROR };
  }
  const folderId = qualityTemplateFillHomeFolder(dest, parsed.folderId, isQualityFolderId(input.folderId) ? input.folderId : null);
  if (!isQualityFolderId(folderId)) {
    return { ok: false as const, status: 400, error: "Pick a Quality folder." };
  }
  const companyId = typeof input.companyId === "string" ? input.companyId : undefined;
  const companyLabel = typeof input.companyLabel === "string" ? input.companyLabel : undefined;
  const ripple = qualityTemplateFillRipplePlan(dest, folderId);

  if (dest === "job") {
    const jobId = typeof input.jobId === "string" ? input.jobId.trim() : "";
    if (!jobId || isQualityCompanyDocsJobId(jobId) || isQualityReadyShelfJobId(jobId)) {
      return { ok: false as const, status: 400, error: QUALITY_TEMPLATE_FILL_JOB_ERROR };
    }
    const folders = qualityTemplateFillRippleFolders(dest, folderId);
    let saved: Awaited<ReturnType<typeof saveQualityFolderDrop>> | null = null;
    for (const rippleFolder of folders) {
      saved = await saveQualityFolderDrop(user, {
        jobId,
        folderId: rippleFolder,
        files: [incoming],
        companyId,
        companyLabel,
        siteLabel: typeof input.siteLabel === "string" ? input.siteLabel : undefined,
        jobLabel: typeof input.jobLabel === "string" ? input.jobLabel : undefined,
      });
      if (!saved.ok) return saved;
    }
    if (!saved || !saved.ok) {
      return { ok: false as const, status: 400, error: QUALITY_TEMPLATE_FILL_JOB_ERROR };
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
  const named = parseQualityPackageName(
    typeof input.packageName === "string"
      ? input.packageName
      : typeof input.name === "string"
        ? input.name
        : "",
  );
  if (!existingId && "error" in named) {
    return { ok: false as const, status: 400, error: named.error || QUALITY_TEMPLATE_FILL_PREPACKAGE_ERROR };
  }
  const packageId = existingId || newQualityPackageId("label" in named ? named.label : "kit");
  const saved = await saveQualityPackageShelfKit(user, {
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
    folderId: "packages" as QualityFolderId,
    packageId,
    jobId: qualityReadyShelfJobId(packageId),
    ripple,
  };
}

export async function readQualityTemplateFill(
  user: QualityTemplateFillUser,
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
  const dest = destOf(input.dest) || (isQualityReadyShelfJobId(typeof input.jobId === "string" ? input.jobId : "")
    ? "prepackage"
    : "job");
  const fileName = typeof input.fileName === "string" ? input.fileName.trim() : "";
  if (!fileName) {
    return { ok: false as const, status: 400, error: "Pick a filled copy." };
  }
  if (!isQualityFilledCopyName(fileName)) {
    return { ok: false as const, status: 400, error: QUALITY_TEMPLATE_FILL_TEMPLATE_ERROR };
  }
  const companyId = typeof input.companyId === "string" && input.companyId.trim() ? input.companyId.trim() : undefined;
  const folderId = isQualityFolderId(input.folderId)
    ? input.folderId
    : dest === "prepackage"
      ? "packages"
      : "";
  const packageId = typeof input.packageId === "string" ? input.packageId.trim() : "";
  const jobId =
    dest === "prepackage"
      ? qualityReadyShelfJobId(packageId || (typeof input.jobId === "string" ? input.jobId : ""))
      : typeof input.jobId === "string"
        ? input.jobId.trim()
        : "";
  if (!jobId || isQualityCompanyDocsJobId(jobId) || !folderId) {
    return { ok: false as const, status: 400, error: dest === "prepackage" ? QUALITY_TEMPLATE_FILL_PREPACKAGE_ERROR : QUALITY_TEMPLATE_FILL_JOB_ERROR };
  }
  const who = hasBuildDesk(user) ? undefined : user.email;
  const briefs = await listStoredBriefs("quality", who, { jobId, folderId, companyId });
  const fromBrief = briefs.flatMap((row) => row.files).find((file) => file.name === fileName && file.data);
  if (fromBrief?.data) {
    const parsed = qualityTemplateFormFromLead(fromBrief);
    if (!parsed) return { ok: false as const, status: 400, error: QUALITY_TEMPLATE_FILL_TEMPLATE_ERROR };
    return {
      ok: true as const,
      file: fromBrief,
      form: parsed,
      dest,
      jobId,
      folderId,
      store: "drive" as const,
      stored: true as const,
    };
  }
  const vault = await readQualityVaultFile(
    leadBriefAdapter("quality"),
    {
      companyId,
      companyLabel: typeof input.companyLabel === "string" ? input.companyLabel : undefined,
      siteLabel: typeof input.siteLabel === "string" ? input.siteLabel : undefined,
      jobId,
      jobLabel: typeof input.jobLabel === "string" ? input.jobLabel : undefined,
      folderId,
      shelf: dest === "prepackage",
      packageLabel: typeof input.jobLabel === "string" ? input.jobLabel : undefined,
      who,
    },
    fileName,
  );
  if (!vault.file?.data) {
    return { ok: false as const, status: 404, error: "Filled copy not found." };
  }
  const parsed = qualityTemplateFormFromLead(vault.file);
  if (!parsed) return { ok: false as const, status: 400, error: QUALITY_TEMPLATE_FILL_TEMPLATE_ERROR };
  return {
    ok: true as const,
    file: vault.file,
    form: parsed,
    dest,
    jobId,
    folderId,
    store: vault.store,
    stored: vault.stored,
  };
}

export async function removeQualityTemplateFill(user: QualityTemplateFillUser, input: QualityTemplateFillSaveInput) {
  const dest = destOf(input.dest) || "job";
  const acl = await resolveFillAcl(user);
  if (!qualityTemplateCanSave(acl, dest)) {
    return { ok: false as const, status: 403, error: QUALITY_TEMPLATE_FILL_VIEW_ERROR };
  }
  const fileName = typeof input.fileName === "string" ? input.fileName.trim() : "";
  if (!isQualityFilledCopyName(fileName)) {
    return { ok: false as const, status: 400, error: QUALITY_TEMPLATE_FILL_TEMPLATE_ERROR };
  }
  const companyId = typeof input.companyId === "string" ? input.companyId : undefined;
  const requestedFolder = isQualityFolderId(input.folderId)
    ? input.folderId
    : dest === "prepackage"
      ? "packages"
      : "";
  const packageId = typeof input.packageId === "string" ? input.packageId.trim() : "";
  const jobId =
    dest === "prepackage"
      ? qualityReadyShelfJobId(packageId || (typeof input.jobId === "string" ? input.jobId : ""))
      : typeof input.jobId === "string"
        ? input.jobId.trim()
        : "";
  if (!jobId || isQualityCompanyDocsJobId(jobId) || !requestedFolder) {
    return { ok: false as const, status: 400, error: QUALITY_TEMPLATE_FILL_DEST_ERROR };
  }
  const peek = await readQualityTemplateFill(user, {
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
    ? qualityTemplateFillHomeFolder(dest, peek.form.folderId, requestedFolder)
    : requestedFolder;
  const ripple = qualityTemplateFillRipplePlan(dest, folderId);
  const folders = dest === "job" ? qualityTemplateFillRippleFolders(dest, folderId) : [requestedFolder];
  try {
    for (const rippleFolder of folders) {
      await trashQualityVaultFile(
        leadBriefAdapter("quality"),
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
      await removeFileFromStoredBriefs("quality", fileName, { jobId, folderId: rippleFolder, companyId });
    }
    await trashQualityVaultNamedCopies(leadBriefAdapter("quality"), fileName, companyId);
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
      error: qualityVaultWriteUserError(error, hasBuildDesk(user)),
    };
  }
}

export async function listQualityTemplateFillDestinations(user: QualityTemplateFillUser, companyId?: string) {
  const acl = await resolveFillAcl(user);
  const shelf = acl.canSavePrepackage || acl.canSaveJob
    ? await listQualityPackageShelf(user, companyId)
    : { kits: [], acl: { canBuild: false, canAttach: false, seat: "viewer" as const }, store: "drive" as const, stored: true };
  return { acl, kits: shelf.kits };
}

export { DriveApiError };

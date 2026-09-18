import { hasBuildDesk } from "./desk-role.ts";
import { DriveApiError, driveFailureKind, isDriveQuotaError, isOauthInvalidGrant } from "./drive-estimates.ts";
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
  qualityReadyShelfPackageLabel,
} from "./quality-package-shelf.ts";
import {
  QUALITY_TEMPLATE_FILL_DEST_ERROR,
  QUALITY_TEMPLATE_FILL_EMPTY_ERROR,
  QUALITY_TEMPLATE_FILL_JOB_ERROR,
  QUALITY_TEMPLATE_FILL_MISSING_ERROR,
  QUALITY_TEMPLATE_FILL_PREPACKAGE_ERROR,
  QUALITY_TEMPLATE_FILL_RETRIEVE_ERROR,
  QUALITY_TEMPLATE_FILL_TEMPLATE_ERROR,
  QUALITY_TEMPLATE_FILL_VIEW_ERROR,
  isQualityFilledCopyName,
  qualityFilledCopyCollidesWithTemplate,
  qualityTemplateCanSave,
  qualityTemplateFillAcl,
  qualityTemplateFormFromLead,
  qualityTemplateFormHasWork,
  type QualityTemplateFillDest,
  type QualityTemplateSourceKind,
} from "./quality-template-form.ts";
import {
  qualityTemplateFillHomeFolder,
  qualityTemplateFillReadFolders,
  qualityTemplateFillRippleFolders,
  qualityTemplateFillRipplePlan,
} from "./quality-template-form-ripple.ts";
import {
  awaitQualityVaultDeadline,
  readQualityVaultFile,
  readQualityVaultNamedFile,
  rollbackQualityVaultPersist,
  trashQualityVaultFile,
  trashQualityVaultNamedCopies,
  qualityVaultWriteUserError,
  QUALITY_VAULT_OAUTH_ERROR,
  QUALITY_VAULT_QUOTA_ERROR,
} from "./quality-vault.ts";
import { sameDriveFileName } from "./drive-estimates.ts";

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

/**
 * Named job / Ready fills are shared vault copies. Retrieve must not hide
 * Owner or peer content behind the viewer's email. Write ACL stays separate.
 */
export function qualityTemplateFillSharedReadWho() {
  return undefined as string | undefined;
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
    return { ok: false as const, status: 400, error: QUALITY_TEMPLATE_FILL_EMPTY_ERROR };
  }
  const sourceName = typeof input.sourceName === "string" ? input.sourceName : "";
  if (qualityFilledCopyCollidesWithTemplate(incoming.name, sourceName) || !isQualityFilledCopyName(incoming.name)) {
    return { ok: false as const, status: 400, error: QUALITY_TEMPLATE_FILL_TEMPLATE_ERROR };
  }
  const parsed = qualityTemplateFormFromLead(incoming);
  if (!parsed) {
    return { ok: false as const, status: 400, error: QUALITY_TEMPLATE_FILL_TEMPLATE_ERROR };
  }
  if (!qualityTemplateFormHasWork({ fields: parsed.fields, rows: parsed.rows })) {
    return { ok: false as const, status: 400, error: QUALITY_TEMPLATE_FILL_EMPTY_ERROR };
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
    const written: typeof folders = [];
    let saved: Awaited<ReturnType<typeof saveQualityFolderDrop>> | null = null;
    for (const rippleFolder of folders) {
      try {
        saved = await awaitQualityVaultDeadline(
          saveQualityFolderDrop(user, {
            jobId,
            folderId: rippleFolder,
            files: [incoming],
            companyId,
            companyLabel,
            siteLabel: typeof input.siteLabel === "string" ? input.siteLabel : undefined,
            jobLabel: typeof input.jobLabel === "string" ? input.jobLabel : undefined,
          }),
        );
      } catch (error) {
        await rollbackQualityTemplateFillWrites({
          user,
          dest,
          jobId,
          companyId,
          companyLabel,
          siteLabel: typeof input.siteLabel === "string" ? input.siteLabel : undefined,
          jobLabel: typeof input.jobLabel === "string" ? input.jobLabel : undefined,
          folders: [...written, rippleFolder],
          fileName: incoming.name,
        });
        return {
          ok: false as const,
          status: 503,
          error: qualityVaultWriteUserError(error, hasBuildDesk(user)),
          rejected: [],
        };
      }
      if (!saved.ok) {
        await rollbackQualityTemplateFillWrites({
          user,
          dest,
          jobId,
          companyId,
          companyLabel,
          siteLabel: typeof input.siteLabel === "string" ? input.siteLabel : undefined,
          jobLabel: typeof input.jobLabel === "string" ? input.jobLabel : undefined,
          folders: [...written, rippleFolder],
          fileName: incoming.name,
        });
        return saved;
      }
      written.push(rippleFolder);
    }
    if (!saved || !saved.ok) {
      return { ok: false as const, status: 400, error: QUALITY_TEMPLATE_FILL_JOB_ERROR };
    }
    const verified = await verifyQualityTemplateFillRetrieve(user, {
      dest: "job",
      jobId,
      folderId,
      fileName: incoming.name,
      companyId,
      companyLabel,
      siteLabel: typeof input.siteLabel === "string" ? input.siteLabel : undefined,
      jobLabel: typeof input.jobLabel === "string" ? input.jobLabel : undefined,
      expected: parsed,
    });
    if (!verified.ok) {
      if (isQualityFillQuotaError(verified.error)) return verified;
      await rollbackQualityTemplateFillWrites({
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
      return verified;
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
  const kitJobId = qualityReadyShelfJobId(packageId);
  let saved: Awaited<ReturnType<typeof saveQualityPackageShelfKit>>;
  try {
    saved = await awaitQualityVaultDeadline(
      saveQualityPackageShelfKit(user, {
        packageId,
        name: "label" in named ? named.label : existingId,
        files: [incoming],
        companyId,
        companyLabel,
      }),
    );
  } catch (error) {
    await rollbackQualityTemplateFillWrites({
      user,
      dest: "prepackage",
      jobId: kitJobId,
      companyId,
      companyLabel,
      jobLabel: "label" in named ? named.label : undefined,
      folders: ["packages"],
      fileName: incoming.name,
    });
    await rollbackQualityVaultPersist(leadBriefAdapter("quality"), {
      place: {
        companyId,
        companyLabel,
        jobId: kitJobId,
        jobLabel: "label" in named ? named.label : undefined,
        folderId: "packages",
        shelf: true,
        packageLabel: "label" in named ? named.label : undefined,
        who: user.email.trim().toLowerCase(),
      },
      fileNames: [incoming.name],
    });
    return {
      ok: false as const,
      status: 503,
      error: qualityVaultWriteUserError(error, hasBuildDesk(user)),
    };
  }
  if (!saved.ok) {
    await rollbackQualityTemplateFillWrites({
      user,
      dest: "prepackage",
      jobId: kitJobId,
      companyId,
      companyLabel,
      jobLabel: "label" in named ? named.label : undefined,
      folders: ["packages"],
      fileName: incoming.name,
    });
    await rollbackQualityVaultPersist(leadBriefAdapter("quality"), {
      place: {
        companyId,
        companyLabel,
        jobId: kitJobId,
        jobLabel: "label" in named ? named.label : undefined,
        folderId: "packages",
        shelf: true,
        packageLabel: "label" in named ? named.label : undefined,
        who: user.email.trim().toLowerCase(),
      },
      fileNames: [incoming.name],
    });
    return saved;
  }
  const kitLabel = "label" in named ? named.label : existingId;
  const verified = await verifyQualityTemplateFillRetrieve(user, {
    dest: "prepackage",
    jobId: kitJobId,
    folderId: "packages",
    packageId,
    packageName: kitLabel,
    fileName: incoming.name,
    companyId,
    companyLabel,
    jobLabel: kitLabel,
    expected: parsed,
  });
  if (!verified.ok) {
    if (isQualityFillQuotaError(verified.error)) return verified;
    await rollbackQualityTemplateFillWrites({
      user,
      dest: "prepackage",
      jobId: kitJobId,
      companyId,
      companyLabel,
      jobLabel: kitLabel,
      folders: ["packages"],
      fileName: incoming.name,
    });
    await rollbackQualityVaultPersist(leadBriefAdapter("quality"), {
      place: {
        companyId,
        companyLabel,
        jobId: kitJobId,
        jobLabel: kitLabel,
        folderId: "packages",
        shelf: true,
        packageLabel: kitLabel,
        who: user.email.trim().toLowerCase(),
      },
      fileNames: [incoming.name],
    });
    return verified;
  }
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

function isQualityFillQuotaError(error?: string) {
  return error === QUALITY_VAULT_QUOTA_ERROR || error === QUALITY_VAULT_OAUTH_ERROR;
}

function qualityFillDriveUserError(error: unknown, user: QualityTemplateFillUser) {
  return qualityVaultWriteUserError(error, hasBuildDesk(user));
}

export async function readQualityTemplateFill(
  user: QualityTemplateFillUser,
  input: {
    dest?: unknown;
    jobId?: unknown;
    folderId?: unknown;
    packageId?: unknown;
    packageName?: unknown;
    fileName?: unknown;
    companyId?: unknown;
    companyLabel?: unknown;
    siteLabel?: unknown;
    jobLabel?: unknown;
    /** Open/reopen may walk shelf labels + named copies. Save-verify must not. */
    recover?: boolean;
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
  const requestedFolder = dest === "prepackage"
    ? "packages"
    : isQualityFolderId(input.folderId)
      ? input.folderId
      : "";
  const packageId = typeof input.packageId === "string" ? input.packageId.trim() : "";
  const jobId =
    dest === "prepackage"
      ? qualityReadyShelfJobId(packageId || (typeof input.jobId === "string" ? input.jobId : ""))
      : typeof input.jobId === "string"
        ? input.jobId.trim()
        : "";
  if (!jobId || isQualityCompanyDocsJobId(jobId) || !requestedFolder) {
    return { ok: false as const, status: 400, error: dest === "prepackage" ? QUALITY_TEMPLATE_FILL_PREPACKAGE_ERROR : QUALITY_TEMPLATE_FILL_JOB_ERROR };
  }
  const who = qualityTemplateFillSharedReadWho();
  const readFolders = qualityTemplateFillReadFolders(dest, requestedFolder);
  const jobLabel = typeof input.jobLabel === "string" ? input.jobLabel.trim() : "";
  const packageName = typeof input.packageName === "string" ? input.packageName.trim() : "";
  const packageLabels = [
    ...new Set(
      [
        dest === "prepackage" ? packageName || jobLabel : "",
        dest === "prepackage" ? qualityReadyShelfPackageLabel(jobId) : "",
      ].filter(Boolean),
    ),
  ];
  const place = {
    companyId,
    companyLabel: typeof input.companyLabel === "string" ? input.companyLabel : undefined,
    siteLabel: typeof input.siteLabel === "string" ? input.siteLabel : undefined,
    jobId,
    jobLabel: jobLabel || undefined,
    shelf: dest === "prepackage",
    who,
  };
  const jobLabelPasses =
    dest === "job"
      ? [...new Set([jobLabel, jobId].filter(Boolean))]
      : dest === "prepackage" && packageLabels.length
        ? packageLabels
        : [place.jobLabel];
  const labelPasses = jobLabelPasses.length ? jobLabelPasses : [undefined];
  const triedLabels = new Set(labelPasses.filter((label): label is string => Boolean(label)));
  let sawUnparseable = false;
  const recover = input.recover !== false;
  async function readFillAt(folderId: string, packageLabel?: string) {
    return readQualityVaultFile(
      leadBriefAdapter("quality"),
      {
        ...place,
        folderId,
        packageLabel: dest === "prepackage" ? packageLabel : undefined,
        jobLabel: dest === "prepackage" ? packageLabel || place.jobLabel : packageLabel || place.jobLabel,
      },
      fileName,
      user,
    );
  }
  function parsedFill(file: { name?: string; type?: string; data?: string }, folderId: string, store: "drive", stored: boolean) {
    const parsed = qualityTemplateFormFromLead({ ...file, name: file.name || fileName });
    if (!parsed) {
      sawUnparseable = true;
      return null;
    }
    return {
      ok: true as const,
      file,
      form: parsed,
      dest,
      jobId,
      folderId: parsed.folderId || folderId,
      store,
      stored,
    };
  }
  try {
    for (const packageLabel of labelPasses) {
      for (const folderId of readFolders) {
        const vault = await readFillAt(folderId, packageLabel);
        if (!vault.file?.data) continue;
        const hit = parsedFill(vault.file, folderId, "drive", vault.stored);
        if (hit) return hit;
      }
    }
    // Ready kit folder is the human package name. A slugged packageId alone
    // used to walk "Audit Temp Kit 2026…" and miss Owner's AUDIT-TEMP-KIT folder.
    if (recover && dest === "prepackage") {
      const shelf = await listQualityPackageShelf(user, companyId);
      const extraLabels = [
        ...new Set(
          shelf.kits
            .flatMap((kit) => [kit.name, qualityReadyShelfPackageLabel(kit.jobId)])
            .filter((label): label is string => Boolean(label) && !triedLabels.has(label)),
        ),
      ];
      for (const packageLabel of extraLabels) {
        const vault = await readFillAt("packages", packageLabel);
        if (!vault.file?.data) continue;
        const hit = parsedFill(vault.file, "packages", "drive", vault.stored);
        if (hit) return hit;
      }
    }
    const briefs = await listStoredBriefs("quality", who, dest === "job" ? { jobId, companyId } : { jobId, folderId: "packages", companyId });
    const ranked = briefs
      .flatMap((row) => (row.files ?? []).map((file) => ({ file, folderId: row.folderId || requestedFolder })))
      .filter((row) => sameDriveFileName(row.file.name, fileName) && row.file.data)
      .sort((left, right) => {
        if (left.folderId === requestedFolder && right.folderId !== requestedFolder) return -1;
        if (right.folderId === requestedFolder && left.folderId !== requestedFolder) return 1;
        return 0;
      });
    const fromBrief = ranked[0];
    if (fromBrief?.file.data) {
      const hit = parsedFill(fromBrief.file, fromBrief.folderId, "drive", true);
      if (hit) return hit;
    }
    if (recover) {
      const named = await readQualityVaultNamedFile(leadBriefAdapter("quality"), fileName, companyId, user);
      if (named.file?.data) {
        const hit = parsedFill(named.file, requestedFolder, "drive", named.stored);
        if (hit) return hit;
      }
    }
    if (sawUnparseable) return { ok: false as const, status: 400, error: QUALITY_TEMPLATE_FILL_TEMPLATE_ERROR };
    return { ok: false as const, status: 404, error: QUALITY_TEMPLATE_FILL_MISSING_ERROR };
  } catch (error) {
    if (isDriveQuotaError(error) || isOauthInvalidGrant(error)) {
      return { ok: false as const, status: 503, error: qualityFillDriveUserError(error, user) };
    }
    throw error;
  }
}

async function verifyQualityTemplateFillRetrieve(
  user: QualityTemplateFillUser,
  input: {
    dest: QualityTemplateFillDest;
    jobId: string;
    folderId: string;
    fileName: string;
    packageId?: string;
    packageName?: string;
    companyId?: string;
    companyLabel?: string;
    siteLabel?: string;
    jobLabel?: string;
    expected: { fields: Record<string, string>; rows: Array<{ cells: Record<string, string> }> };
  },
) {
  const opened = await readQualityTemplateFill(user, { ...input, recover: false });
  if (!opened.ok) {
    if (isQualityFillQuotaError(opened.error) || opened.status === 503) {
      return { ok: false as const, status: 503, error: opened.error };
    }
    return { ok: false as const, status: 503, error: QUALITY_TEMPLATE_FILL_RETRIEVE_ERROR };
  }
  if (!qualityTemplateFormHasWork({ fields: opened.form.fields, rows: opened.form.rows })) {
    return { ok: false as const, status: 503, error: QUALITY_TEMPLATE_FILL_RETRIEVE_ERROR };
  }
  const expectedFields = Object.entries(input.expected.fields).filter(([, value]) => value.trim());
  const missing = expectedFields.some(([key, value]) => (opened.form.fields[key] || "").trim() !== value.trim());
  const expectedCells = input.expected.rows.flatMap((row) => Object.entries(row.cells).filter(([, value]) => value.trim()));
  const missingCells = expectedCells.some(
    ([key, value]) => !opened.form.rows.some((row) => (row.cells[key] || "").trim() === value.trim()),
  );
  if (missing || missingCells) {
    return { ok: false as const, status: 503, error: QUALITY_TEMPLATE_FILL_RETRIEVE_ERROR };
  }
  return { ok: true as const };
}

async function rollbackQualityTemplateFillWrites(input: {
  user: QualityTemplateFillUser;
  dest: QualityTemplateFillDest;
  jobId: string;
  companyId?: string;
  companyLabel?: string;
  siteLabel?: string;
  jobLabel?: string;
  folders: QualityFolderId[];
  fileName: string;
}) {
  for (const folderId of input.folders) {
    try {
      await trashQualityVaultFile(
        leadBriefAdapter("quality"),
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
      await removeFileFromStoredBriefs("quality", input.fileName, {
        jobId: input.jobId,
        folderId,
        companyId: input.companyId,
      });
    } catch {
      // Keep rolling back the rest so a partial ripple does not stay listed.
    }
  }
  // Do not walk the Quality tree here. Exact-place trash covers job ripple and
  // Ready kits. A named-copy sweep after a failed Save multiplies query cost.
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
    const status = error instanceof DriveApiError ? error.status : 0;
    console.warn(`quality-vault: template write failed; ${status || "err"} ${driveFailureKind(error)}`);
    return {
      ok: false as const,
      status: 503,
      error: qualityVaultWriteUserError(error, hasBuildDesk(user)),
    };
  }
}

export async function listQualityTemplateFillDestinations(user: QualityTemplateFillUser, companyId?: string) {
  const acl = await resolveFillAcl(user);
  const shelf = await listQualityPackageShelf(user, companyId);
  return { acl, kits: shelf.kits };
}

export { DriveApiError };

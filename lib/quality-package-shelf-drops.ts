import { hasBuildDesk } from "./desk-role.ts";
import { DriveApiError } from "./drive-estimates.ts";
import { mergePositions } from "./org-positions.ts";
import { hydratePositionStore } from "./org-positions-store.ts";
import {
  hydrateLeadBriefStore,
  leadBriefAdapter,
  listStoredBriefs,
  publicBrief,
  saveStoredBrief,
} from "./lead-brief-store.ts";
import type { LeadFile, PublicLeadBrief } from "./lead-briefs.ts";
import {
  parseQualityDropFiles,
  saveQualityFolderDrop,
  type QualityDropUser,
} from "./quality-folder-drops.ts";
import { checkQualityDrop, mergeQualityFolderFiles } from "./quality-folders.ts";
import {
  QUALITY_PACKAGE_SHELF_ATTACH_ERROR,
  QUALITY_PACKAGE_SHELF_BUILD_ERROR,
  QUALITY_READY_SHELF_PREFIX,
  isQualityReadyShelfJobId,
  newQualityPackageId,
  parseQualityPackageName,
  qualityPackageShelfAcl,
  qualityReadyShelfJobId,
  type QualityPackageShelfAcl,
} from "./quality-package-shelf.ts";
import { persistQualityVaultFiles, qualityVaultWriteUserError } from "./quality-vault.ts";
import type { QualityListedFile } from "./quality-vault-shared.ts";

export type QualityPackageKit = {
  id: string;
  jobId: string;
  name: string;
  files: QualityListedFile[];
  savedAt: string;
  who: string;
};

export async function resolveQualityPackageShelfAcl(user: QualityDropUser): Promise<QualityPackageShelfAcl> {
  try {
    const data = await hydratePositionStore();
    return qualityPackageShelfAcl(user, {
      holds: data.holds,
      catalog: mergePositions(data.positions, data.removedIds),
    });
  } catch {
    return qualityPackageShelfAcl(user);
  }
}

export async function listQualityPackageShelf(
  user: QualityDropUser,
  companyId?: string,
): Promise<{ kits: QualityPackageKit[]; acl: QualityPackageShelfAcl; store: "drive" | "server-json-file"; stored: boolean }> {
  const acl = await resolveQualityPackageShelfAcl(user);
  if (!acl.canBuild && !acl.canAttach) {
    return { kits: [], acl, store: "drive" as const, stored: true };
  }
  const briefs = await hydrateLeadBriefStore("quality");
  const company = (companyId || "").trim();
  const kits = briefs
    .filter((row) => {
      if (!isQualityReadyShelfJobId(row.jobId)) return false;
      if (company && row.companyId && row.companyId !== company) return false;
      return true;
    })
    .map((row) => ({
      id: row.jobId?.slice(QUALITY_READY_SHELF_PREFIX.length + 1) || row.id,
      jobId: row.jobId || "",
      name: row.describe || "Ready package",
      files: (row.files ?? []).map((file) => ({ name: file.name, type: file.type, vaulted: true })),
      savedAt: row.savedAt,
      who: row.who,
    }))
    .sort((left, right) => right.savedAt.localeCompare(left.savedAt) || left.name.localeCompare(right.name));
  return {
    kits,
    acl,
    store: "drive",
    stored: true,
  };
}

export async function saveQualityPackageShelfKit(
  user: QualityDropUser,
  input: {
    name?: unknown;
    packageId?: unknown;
    files?: unknown;
    companyId?: unknown;
    companyLabel?: unknown;
  },
) {
  const acl = await resolveQualityPackageShelfAcl(user);
  if (!acl.canBuild) {
    return { ok: false as const, status: 403, error: QUALITY_PACKAGE_SHELF_BUILD_ERROR };
  }
  const named = parseQualityPackageName(typeof input.name === "string" ? input.name : "");
  const existingId = typeof input.packageId === "string" ? input.packageId.trim() : "";
  if (!existingId && "error" in named) {
    return { ok: false as const, status: 400, error: named.error };
  }
  const packageId = existingId || newQualityPackageId("label" in named ? named.label : "kit");
  const jobId = qualityReadyShelfJobId(packageId);
  const incoming = parseQualityDropFiles(input.files);
  if (incoming.length) {
    const saved = await saveQualityFolderDrop(user, {
      jobId,
      folderId: "packages",
      files: incoming,
      companyId: input.companyId,
      companyLabel: input.companyLabel,
      jobLabel: "label" in named ? named.label : undefined,
    });
    if (!saved.ok) return saved;
    return {
      ...saved,
      kit: {
        id: packageId,
        jobId,
        name: saved.brief.describe || ("label" in named ? named.label : "Ready package"),
      },
    };
  }
  const who = user.email.trim().toLowerCase();
  const brief = await saveStoredBrief({
    kind: "quality",
    who,
    whoName: user.name,
    describe: "label" in named ? named.label : "Ready package",
    files: [],
    jobId,
    folderId: "packages",
    companyId: typeof input.companyId === "string" ? input.companyId : undefined,
  });
  return {
    ok: true as const,
    brief: publicBrief(brief),
    stored: true as const,
    store: "drive" as const,
    kit: { id: packageId, jobId, name: brief.describe },
  };
}

export async function attachQualityPackageShelfKit(
  user: QualityDropUser,
  input: {
    packageId?: unknown;
    jobId?: unknown;
    companyId?: unknown;
    companyLabel?: unknown;
    siteLabel?: unknown;
    jobLabel?: unknown;
  },
) {
  const acl = await resolveQualityPackageShelfAcl(user);
  if (!acl.canAttach) {
    return { ok: false as const, status: 403, error: QUALITY_PACKAGE_SHELF_ATTACH_ERROR };
  }
  const packageId = typeof input.packageId === "string" ? input.packageId.trim() : "";
  const jobId = typeof input.jobId === "string" ? input.jobId.trim() : "";
  if (!packageId || !jobId || isQualityReadyShelfJobId(jobId)) {
    return { ok: false as const, status: 400, error: "Pick a Ready Quality package and a job." };
  }
  const shelfJobId = qualityReadyShelfJobId(packageId);
  const companyId = typeof input.companyId === "string" && input.companyId.trim() ? input.companyId.trim() : undefined;
  const briefs = await listStoredBriefs("quality", undefined, { jobId: shelfJobId, folderId: "packages", companyId });
  const source = briefs[0];
  const files = (source?.files ?? []).filter((file) => file.name && file.data) as LeadFile[];
  if (!files.length) {
    return { ok: false as const, status: 400, error: "That Ready Quality package has no vaulted files yet." };
  }
  const check = checkQualityDrop(files);
  if (!check.accepted.length) {
    return { ok: false as const, status: 400, error: check.rejected[0]?.error || "That package cannot attach." };
  }
  try {
    await persistQualityVaultFiles(
      leadBriefAdapter("quality"),
      {
        companyId,
        companyLabel: typeof input.companyLabel === "string" ? input.companyLabel : undefined,
        siteLabel: typeof input.siteLabel === "string" ? input.siteLabel : undefined,
        jobId,
        jobLabel: typeof input.jobLabel === "string" ? input.jobLabel : undefined,
        folderId: "packages",
        who: user.email.trim().toLowerCase(),
      },
      check.accepted as LeadFile[],
    );
    const existing = await listStoredBriefs("quality", user.email, { jobId, folderId: "packages", companyId });
    const merged = mergeQualityFolderFiles(existing[0]?.files ?? [], check.accepted as LeadFile[]);
    const brief = await saveStoredBrief({
      kind: "quality",
      who: user.email.trim().toLowerCase(),
      whoName: user.name,
      describe: source?.describe || "Packages",
      files: merged,
      jobId,
      folderId: "packages",
      companyId,
      mergeFiles: true,
    });
    return {
      ok: true as const,
      brief: publicBrief(brief),
      stored: true as const,
      store: "drive" as const,
      attached: merged.map((file) => file.name),
    };
  } catch (error) {
    const status = error instanceof DriveApiError ? error.status : 0;
    return {
      ok: false as const,
      status: 503,
      error: qualityVaultWriteUserError(error, hasBuildDesk(user)),
    };
  }
}

export type { PublicLeadBrief };

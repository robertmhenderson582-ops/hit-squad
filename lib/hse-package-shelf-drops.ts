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
  parseHseDropFiles,
  saveHseFolderDrop,
  type HseDropUser,
} from "./hse-folder-drops.ts";
import { checkHseDrop, mergeHseFolderFiles } from "./hse-folders.ts";
import {
  HSE_PACKAGE_SHELF_ATTACH_ERROR,
  HSE_PACKAGE_SHELF_BUILD_ERROR,
  HSE_READY_SHELF_PREFIX,
  isHseReadyShelfJobId,
  newHsePackageId,
  parseHsePackageName,
  hsePackageShelfAcl,
  hseReadyShelfJobId,
  type HsePackageShelfAcl,
} from "./hse-package-shelf.ts";
import { persistHseVaultFiles, hseVaultWriteUserError } from "./hse-vault.ts";
import type { HseListedFile } from "./hse-vault-shared.ts";

export type HsePackageKit = {
  id: string;
  jobId: string;
  name: string;
  files: HseListedFile[];
  savedAt: string;
  who: string;
};

export async function resolveHsePackageShelfAcl(user: HseDropUser): Promise<HsePackageShelfAcl> {
  try {
    const data = await hydratePositionStore();
    return hsePackageShelfAcl(user, {
      holds: data.holds,
      catalog: mergePositions(data.positions, data.removedIds),
    });
  } catch {
    return hsePackageShelfAcl(user);
  }
}

export async function listHsePackageShelf(
  user: HseDropUser,
  companyId?: string,
): Promise<{ kits: HsePackageKit[]; acl: HsePackageShelfAcl; store: "drive" | "server-json-file"; stored: boolean }> {
  const acl = await resolveHsePackageShelfAcl(user);
  if (!acl.canBuild && !acl.canAttach) {
    return { kits: [], acl, store: "drive" as const, stored: true };
  }
  const briefs = await hydrateLeadBriefStore("hse");
  const company = (companyId || "").trim();
  const kits = briefs
    .filter((row) => {
      if (!isHseReadyShelfJobId(row.jobId)) return false;
      if (company && row.companyId && row.companyId !== company) return false;
      return true;
    })
    .map((row) => ({
      id: row.jobId?.slice(HSE_READY_SHELF_PREFIX.length + 1) || row.id,
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

export async function saveHsePackageShelfKit(
  user: HseDropUser,
  input: {
    name?: unknown;
    packageId?: unknown;
    files?: unknown;
    companyId?: unknown;
    companyLabel?: unknown;
  },
) {
  const acl = await resolveHsePackageShelfAcl(user);
  if (!acl.canBuild) {
    return { ok: false as const, status: 403, error: HSE_PACKAGE_SHELF_BUILD_ERROR };
  }
  const named = parseHsePackageName(typeof input.name === "string" ? input.name : "");
  const existingId = typeof input.packageId === "string" ? input.packageId.trim() : "";
  if (!existingId && "error" in named) {
    return { ok: false as const, status: 400, error: named.error };
  }
  const packageId = existingId || newHsePackageId("label" in named ? named.label : "kit");
  const jobId = hseReadyShelfJobId(packageId);
  const incoming = parseHseDropFiles(input.files);
  if (incoming.length) {
    const saved = await saveHseFolderDrop(user, {
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
    kind: "hse",
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

export async function attachHsePackageShelfKit(
  user: HseDropUser,
  input: {
    packageId?: unknown;
    jobId?: unknown;
    companyId?: unknown;
    companyLabel?: unknown;
    siteLabel?: unknown;
    jobLabel?: unknown;
  },
) {
  const acl = await resolveHsePackageShelfAcl(user);
  if (!acl.canAttach) {
    return { ok: false as const, status: 403, error: HSE_PACKAGE_SHELF_ATTACH_ERROR };
  }
  const packageId = typeof input.packageId === "string" ? input.packageId.trim() : "";
  const jobId = typeof input.jobId === "string" ? input.jobId.trim() : "";
  if (!packageId || !jobId || isHseReadyShelfJobId(jobId)) {
    return { ok: false as const, status: 400, error: "Pick a Ready HSE package and a job." };
  }
  const shelfJobId = hseReadyShelfJobId(packageId);
  const companyId = typeof input.companyId === "string" && input.companyId.trim() ? input.companyId.trim() : undefined;
  const briefs = await listStoredBriefs("hse", undefined, { jobId: shelfJobId, folderId: "packages", companyId });
  const source = briefs[0];
  const files = (source?.files ?? []).filter((file) => file.name && file.data) as LeadFile[];
  if (!files.length) {
    return { ok: false as const, status: 400, error: "That Ready HSE package has no vaulted files yet." };
  }
  const check = checkHseDrop(files);
  if (!check.accepted.length) {
    return { ok: false as const, status: 400, error: check.rejected[0]?.error || "That package cannot attach." };
  }
  try {
    await persistHseVaultFiles(
      leadBriefAdapter("hse"),
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
    const existing = await listStoredBriefs("hse", user.email, { jobId, folderId: "packages", companyId });
    const merged = mergeHseFolderFiles(existing[0]?.files ?? [], check.accepted as LeadFile[]);
    const brief = await saveStoredBrief({
      kind: "hse",
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
      error: hseVaultWriteUserError(error, hasBuildDesk(user)),
    };
  }
}

export type { PublicLeadBrief };

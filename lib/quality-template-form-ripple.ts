import { isQualityFolderId, type QualityFolderId } from "./quality-folders.ts";
import type { QualityTemplateFillDest } from "./quality-template-form.ts";

/**
 * Standing ripple rule for always-displayed Quality templates (Robert 2026-09-12).
 * Open / save / edit is never a form-only silo. One filled copy updates every
 * relevant Quality surface: the job folder, the job Packages radio, the Ready
 * prepackage shelf, the owner vault listing, and the briefs index. The left-rail
 * blank template is not a surface.
 */
export const QUALITY_TEMPLATE_FILL_RIPPLE_RULE =
  "A filled Quality form is one vault copy. Save/edit/remove updates every listing that should show it. Never a form-only silo.";

export const QUALITY_TEMPLATE_FILL_RIPPLE_SURFACES = [
  "job-folder",
  "job-package",
  "prepackage-shelf",
  "vault-tree",
  "briefs-index",
] as const;

export type QualityTemplateFillRippleSurface = (typeof QUALITY_TEMPLATE_FILL_RIPPLE_SURFACES)[number];

export const QUALITY_TEMPLATE_FILL_RIPPLE_NEVER = ["company-rail"] as const;

export type QualityTemplateFillRipplePlan = {
  dest: QualityTemplateFillDest;
  folderId: QualityFolderId;
  folders: QualityFolderId[];
  surfaces: QualityTemplateFillRippleSurface[];
  never: readonly (typeof QUALITY_TEMPLATE_FILL_RIPPLE_NEVER)[number][];
};

export function isQualityTemplateFillRippleSurface(value: unknown): value is QualityTemplateFillRippleSurface {
  return QUALITY_TEMPLATE_FILL_RIPPLE_SURFACES.some((surface) => surface === value);
}

/** Job package listing is the Packages radio / folder on that job. */
export function qualityTemplateFillJobPackageFolder(): QualityFolderId {
  return "packages";
}

/**
 * Home folder for ripple. Prefer the form payload folder so a filled copy
 * opened from the Packages radio still writes the catalog folder + Packages.
 */
export function qualityTemplateFillHomeFolder(
  dest: QualityTemplateFillDest,
  parsedFolder?: string | null,
  requestedFolder?: string | null,
): QualityFolderId {
  if (dest === "prepackage") return qualityTemplateFillJobPackageFolder();
  if (isQualityFolderId(parsedFolder)) return parsedFolder;
  if (isQualityFolderId(requestedFolder)) return requestedFolder;
  return qualityTemplateFillJobPackageFolder();
}

/** Job vault folders to write/remove. Prepackage dest writes the Ready shelf, not a job folder. */
export function qualityTemplateFillRippleFolders(
  dest: QualityTemplateFillDest,
  folderId?: string | null,
): QualityFolderId[] {
  if (dest === "prepackage") return [];
  const folder = isQualityFolderId(folderId) ? folderId : qualityTemplateFillJobPackageFolder();
  if (folder === "packages") return ["packages"];
  return [folder, "packages"];
}

export function qualityTemplateFillRipplePlan(
  dest: QualityTemplateFillDest,
  folderId?: string | null,
): QualityTemplateFillRipplePlan {
  const folder = qualityTemplateFillHomeFolder(dest, folderId, folderId);
  const folders = qualityTemplateFillRippleFolders(dest, folder);
  const surfaces: QualityTemplateFillRippleSurface[] =
    dest === "prepackage"
      ? ["prepackage-shelf", "vault-tree", "briefs-index"]
      : ["job-folder", "job-package", "vault-tree", "briefs-index"];
  return {
    dest,
    folderId: folder,
    folders,
    surfaces,
    never: QUALITY_TEMPLATE_FILL_RIPPLE_NEVER,
  };
}

export function qualityTemplateFillRippleHit(
  plan: QualityTemplateFillRipplePlan,
  hits: Partial<Record<QualityTemplateFillRippleSurface | "company-rail", boolean>>,
) {
  const missing = plan.surfaces.filter((surface) => hits[surface] !== true);
  const leaked = plan.never.filter((surface) => hits[surface] === true);
  return {
    ok: missing.length === 0 && leaked.length === 0,
    missing,
    leaked,
    hits,
  };
}

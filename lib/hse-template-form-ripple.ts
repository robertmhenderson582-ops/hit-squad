import { isHseFolderId, type HseFolderId } from "./hse-folders.ts";
import type { HseTemplateFillDest } from "./hse-template-form.ts";

/**
 * Standing ripple rule for always-displayed HSE templates.
 * Open / save / edit is never a form-only silo. One filled copy updates every
 * relevant HSE surface: the job folder, the job Packages radio, the Ready
 * prepackage shelf, the owner vault listing, and the briefs index. The left-rail
 * blank template is not a surface.
 */
export const HSE_TEMPLATE_FILL_RIPPLE_RULE =
  "A filled HSE form is one vault copy. Save/edit/remove updates every listing that should show it. Never a form-only silo.";

export const HSE_TEMPLATE_FILL_RIPPLE_SURFACES = [
  "job-folder",
  "job-package",
  "prepackage-shelf",
  "vault-tree",
  "briefs-index",
] as const;

export type HseTemplateFillRippleSurface = (typeof HSE_TEMPLATE_FILL_RIPPLE_SURFACES)[number];

export const HSE_TEMPLATE_FILL_RIPPLE_NEVER = ["company-rail"] as const;

export type HseTemplateFillRipplePlan = {
  dest: HseTemplateFillDest;
  folderId: HseFolderId;
  folders: HseFolderId[];
  surfaces: HseTemplateFillRippleSurface[];
  never: readonly (typeof HSE_TEMPLATE_FILL_RIPPLE_NEVER)[number][];
};

export function isHseTemplateFillRippleSurface(value: unknown): value is HseTemplateFillRippleSurface {
  return HSE_TEMPLATE_FILL_RIPPLE_SURFACES.some((surface) => surface === value);
}

export function hseTemplateFillJobPackageFolder(): HseFolderId {
  return "packages";
}

export function hseTemplateFillHomeFolder(
  dest: HseTemplateFillDest,
  parsedFolder?: string | null,
  requestedFolder?: string | null,
): HseFolderId {
  if (dest === "prepackage") return hseTemplateFillJobPackageFolder();
  if (isHseFolderId(parsedFolder)) return parsedFolder;
  if (isHseFolderId(requestedFolder)) return requestedFolder;
  return hseTemplateFillJobPackageFolder();
}

export function hseTemplateFillReadFolders(
  dest: HseTemplateFillDest,
  folderId?: string | null,
): HseFolderId[] {
  if (dest === "prepackage") return [hseTemplateFillJobPackageFolder()];
  const folder = isHseFolderId(folderId) ? folderId : hseTemplateFillJobPackageFolder();
  if (folder === "packages") return ["packages"];
  return [folder, "packages"];
}

export function hseTemplateFillRippleFolders(
  dest: HseTemplateFillDest,
  folderId?: string | null,
): HseFolderId[] {
  if (dest === "prepackage") return [];
  const folder = isHseFolderId(folderId) ? folderId : hseTemplateFillJobPackageFolder();
  if (folder === "packages") return ["packages"];
  return [folder, "packages"];
}

export function hseTemplateFillRipplePlan(
  dest: HseTemplateFillDest,
  folderId?: string | null,
): HseTemplateFillRipplePlan {
  const folder = hseTemplateFillHomeFolder(dest, folderId, folderId);
  const folders = hseTemplateFillRippleFolders(dest, folder);
  const surfaces: HseTemplateFillRippleSurface[] =
    dest === "prepackage"
      ? ["prepackage-shelf", "vault-tree", "briefs-index"]
      : ["job-folder", "job-package", "vault-tree", "briefs-index"];
  return {
    dest,
    folderId: folder,
    folders,
    surfaces,
    never: HSE_TEMPLATE_FILL_RIPPLE_NEVER,
  };
}

export function hseTemplateFillRippleHit(
  plan: HseTemplateFillRipplePlan,
  hits: Partial<Record<HseTemplateFillRippleSurface | "company-rail", boolean>>,
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

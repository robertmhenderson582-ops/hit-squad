import { mergePositions } from "./org-positions.ts";
import { hydratePositionStore } from "./org-positions-store.ts";
import { qualityCompanyDocAcl, type QualityCompanyDocActor } from "./quality-company-doc-acl.ts";
import { qualityPackageShelfAcl } from "./quality-package-shelf.ts";
import { qualityTemplateFillAcl, type QualityTemplateFillAcl } from "./quality-template-form.ts";

export const QUALITY_FOLDER_VIEW_ERROR = "View only — this seat cannot add or remove files here.";

export async function resolveQualityFolderMutateAcl(
  user: QualityCompanyDocActor,
): Promise<QualityTemplateFillAcl> {
  try {
    const data = await hydratePositionStore();
    const positions = { holds: data.holds, catalog: mergePositions(data.positions, data.removedIds) };
    return qualityTemplateFillAcl(qualityCompanyDocAcl(user, positions), qualityPackageShelfAcl(user, positions));
  } catch {
    return qualityTemplateFillAcl(qualityCompanyDocAcl(user), qualityPackageShelfAcl(user));
  }
}

export async function qualityFolderWriteGate(user: QualityCompanyDocActor) {
  const acl = await resolveQualityFolderMutateAcl(user);
  if (acl.canSaveJob) return null;
  return { ok: false as const, status: 403, error: QUALITY_FOLDER_VIEW_ERROR, rejected: [] };
}

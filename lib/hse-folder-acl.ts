import { mergePositions } from "./org-positions.ts";
import { hydratePositionStore } from "./org-positions-store.ts";
import { hseCompanyDocAcl, type HseCompanyDocActor } from "./hse-company-doc-acl.ts";
import { hsePackageShelfAcl } from "./hse-package-shelf.ts";
import { hseTemplateFillAcl, type HseTemplateFillAcl } from "./hse-template-form.ts";

export const HSE_FOLDER_VIEW_ERROR = "View only — this seat cannot add or remove files here.";

export async function resolveHseFolderMutateAcl(user: HseCompanyDocActor): Promise<HseTemplateFillAcl> {
  try {
    const data = await hydratePositionStore();
    const positions = { holds: data.holds, catalog: mergePositions(data.positions, data.removedIds) };
    return hseTemplateFillAcl(hseCompanyDocAcl(user, positions), hsePackageShelfAcl(user, positions));
  } catch {
    return hseTemplateFillAcl(hseCompanyDocAcl(user), hsePackageShelfAcl(user));
  }
}

export async function hseFolderWriteGate(user: HseCompanyDocActor) {
  const acl = await resolveHseFolderMutateAcl(user);
  if (acl.canSaveJob) return null;
  return { ok: false as const, status: 403, error: HSE_FOLDER_VIEW_ERROR };
}
